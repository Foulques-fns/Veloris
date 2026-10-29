import { requireAdmin } from "@/lib/admin";
import { err, json, readJson } from "@/lib/http";
import { getDisabledModels, getFeatures, getQuotas, setSetting, type FeatureFlags, type PlanId, type QuotaConfig, type Quotas } from "@/lib/settings";
import { listFreeAudioModels, listFreeChatModels, listFreeImageModels, listFreeVideoModels } from "@/lib/models";
import { hasApiKey } from "@/lib/pollinations";
import { smtpConfigured } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  const [quotas, features, disabled, chat, image, audio, video] = await Promise.all([
    getQuotas(),
    getFeatures(),
    getDisabledModels(),
    listFreeChatModels(),
    listFreeImageModels(),
    listFreeAudioModels(),
    listFreeVideoModels(),
  ]);
  return json({
    ok: true,
    quotas,
    features,
    disabled,
    models: { chat, image, audio, video },
    provider: { keyConfigured: hasApiKey(), smtpConfigured: smtpConfigured() },
  });
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return err("Forbidden.", 403);
  const body = await readJson<{
    quotas?: Partial<Record<PlanId, Partial<QuotaConfig>>>;
    features?: Partial<FeatureFlags>;
    disabledModels?: { chat?: string[]; image?: string[]; audio?: string[]; video?: string[] };
  }>(req);
  if (!body) return err("Invalid body.");

  if (body.quotas) {
    const current = await getQuotas();
    const next: Quotas = structuredClone(current);
    for (const plan of ["free", "premium", "ultra"] as PlanId[]) {
      const patch = body.quotas[plan];
      if (!patch) continue;
      for (const key of ["chatPerDay", "imagesPerDay", "audioPerDay", "transcribePerDay", "videoPerDay"] as const) {
        const v = patch[key];
        if (v !== undefined) {
          const n = Math.round(Number(v));
          // -1 = unlimited, 0 = disabled, positive = daily cap
          if (!Number.isFinite(n) || n < -1 || n > 1_000_000) return err(`Invalid quota value for ${plan}.${key}. Use -1 for unlimited.`);
          next[plan][key] = n;
        }
      }
    }
    await setSetting("quotas", next);
  }

  if (body.features) {
    const current = await getFeatures();
    const next: FeatureFlags = { ...current };
    for (const key of ["chat", "images", "audio", "video", "registration"] as const) {
      if (typeof body.features[key] === "boolean") next[key] = body.features[key]!;
    }
    await setSetting("features", next);
  }

  if (body.disabledModels) {
    // Only allow toggling models that are verified FREE in the live catalog.
    const [chat, image, audio, video] = await Promise.all([listFreeChatModels(), listFreeImageModels(), listFreeAudioModels(), listFreeVideoModels()]);
    const allowed = {
      chat: new Set(chat.map((m) => m.id)),
      image: new Set(image.map((m) => m.id)),
      audio: new Set(audio.map((m) => m.id)),
      video: new Set(video.map((m) => m.id)),
    };
    const clean = {
      chat: (body.disabledModels.chat ?? []).filter((id) => allowed.chat.has(id)),
      image: (body.disabledModels.image ?? []).filter((id) => allowed.image.has(id)),
      audio: (body.disabledModels.audio ?? []).filter((id) => allowed.audio.has(id)),
      video: (body.disabledModels.video ?? []).filter((id) => allowed.video.has(id)),
    };
    await setSetting("disabledModels", clean);
  }

  return json({ ok: true });
}
