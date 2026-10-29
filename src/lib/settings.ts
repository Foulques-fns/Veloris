import { db } from "@/db";
import { appSettings, usageEvents, users } from "@/db/schema";
import { and, eq, gte, count } from "drizzle-orm";

export type PlanId = "free" | "premium" | "ultra";

export type QuotaConfig = {
  chatPerDay: number;
  imagesPerDay: number;
  audioPerDay: number;
  transcribePerDay: number;
  videoPerDay: number;
};

export type Quotas = Record<PlanId, QuotaConfig>;

export const DEFAULT_QUOTAS: Quotas = {
  // Reasonable, honest defaults. FREE = exactly 5 images/day. Admin-configurable.
  free: { chatPerDay: 60, imagesPerDay: 5, audioPerDay: 10, transcribePerDay: 10, videoPerDay: 0 },
  premium: { chatPerDay: 300, imagesPerDay: 15, audioPerDay: 30, transcribePerDay: 25, videoPerDay: 0 },
  ultra: { chatPerDay: 1000, imagesPerDay: 40, audioPerDay: 80, transcribePerDay: 60, videoPerDay: 0 },
};

export type FeatureFlags = {
  chat: boolean;
  images: boolean;
  audio: boolean;
  video: boolean;
  registration: boolean;
};

export const DEFAULT_FEATURES: FeatureFlags = {
  chat: true,
  images: true,
  audio: true,
  video: true,
  registration: true,
};

export type DisabledModels = {
  chat: string[];
  image: string[];
  audio: string[];
  video: string[];
};

const DEFAULT_DISABLED: DisabledModels = { chat: [], image: [], audio: [], video: [] };

export const PLAN_LABELS: Record<PlanId, string> = {
  free: "Free",
  premium: "Premium",
  ultra: "Ultra",
};

// In-process cache to avoid hammering Postgres.
const cache = new Map<string, { value: unknown; at: number }>();
const TTL = 15_000;

async function readSetting<T>(key: string, fallback: T): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return c.value as T;
  try {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    const val = rows[0] ? (rows[0].value as T) : fallback;
    cache.set(key, { value: val, at: Date.now() });
    return val;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value });
  }
  cache.delete(key);
}

export async function getQuotas(): Promise<Quotas> {
  const stored = await readSetting<Partial<Record<PlanId, Partial<QuotaConfig>>>>("quotas", {});
  const out = structuredClone(DEFAULT_QUOTAS);
  for (const plan of ["free", "premium", "ultra"] as PlanId[]) {
    Object.assign(out[plan], stored[plan] ?? {});
  }
  return out;
}

export async function getFeatures(): Promise<FeatureFlags> {
  const stored = await readSetting<Partial<FeatureFlags>>("features", {});
  return { ...DEFAULT_FEATURES, ...stored };
}

export async function getDisabledModels(): Promise<DisabledModels> {
  const stored = await readSetting<Partial<DisabledModels>>("disabledModels", {});
  return { ...DEFAULT_DISABLED, ...stored };
}

/** UTC start-of-day for rolling daily quotas. */
export function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type UsageType = "chat" | "image" | "audio" | "transcribe" | "analyze" | "video";

export async function usageToday(userId: string, type: UsageType): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(usageEvents)
    .where(and(eq(usageEvents.userId, userId), eq(usageEvents.type, type), gte(usageEvents.createdAt, startOfToday())));
  return rows[0]?.value ?? 0;
}

export type QuotaCheck = { ok: boolean; used: number; limit: number; kind: string };

export async function checkQuota(
  user: { id: string; plan: PlanId },
  kind: "chat" | "image" | "audio" | "transcribe" | "video",
): Promise<QuotaCheck> {
  const quotas = await getQuotas();
  const q = quotas[user.plan] ?? quotas.free;
  let limit = q.chatPerDay;
  if (kind === "image") limit = q.imagesPerDay;
  if (kind === "audio") limit = q.audioPerDay;
  if (kind === "transcribe") limit = q.transcribePerDay;
  if (kind === "video") limit = q.videoPerDay;

  // Optional per-user overrides (set from the admin panel; -1 = unlimited).
  // Only the admin may change these — never the user themselves.
  if (kind === "image" || kind === "chat" || kind === "audio") {
    const u = await db
      .select({ i: users.imageQuotaOverride, c: users.chatQuotaOverride, a: users.audioQuotaOverride })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const ov = kind === "image" ? u[0]?.i : kind === "chat" ? u[0]?.c : u[0]?.a;
    if (ov != null) limit = ov;
  }

  const used = await usageToday(user.id, kind as UsageType);
  // -1 = unlimited (admin-settable), 0 = disabled, N = hard daily cap
  if (limit === -1) return { ok: true, used, limit: -1, kind };
  if (limit <= 0) return { ok: false, used, limit: 0, kind };
  return { ok: used < limit, used, limit, kind };
}

export async function recordUsage(userId: string, type: UsageType, model?: string, meta?: Record<string, unknown>) {
  try {
    await db.insert(usageEvents).values({ userId, type, model, meta });
  } catch {
    // never block the request on telemetry
  }
}
