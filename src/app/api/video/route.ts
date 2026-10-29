import { db } from "@/db";
import { files } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { checkQuota, getDisabledModels, getFeatures, recordUsage, type PlanId } from "@/lib/settings";
import { listFreeVideoModels } from "@/lib/models";
import { hasApiKey } from "@/lib/pollinations";
import { logApiError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Video generation is availability-aware: it activates automatically when a
 * model with `paid_only === false` exists in the official Pollinations video
 * catalog. Paid video models are NEVER used, even as a fallback.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const features = await getFeatures();
  const catalog = (await listFreeVideoModels()).filter((m) => true);
  const disabled = new Set((await getDisabledModels()).video);
  const available = catalog.filter((m) => !disabled.has(m.id));
  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "video");
  const rows = await db
    .select({ id: files.id, name: files.name, mime: files.mime, meta: files.meta, createdAt: files.createdAt })
    .from(files)
    .where(and(eq(files.userId, user.id), eq(files.kind, "generated")))
    .orderBy(desc(files.createdAt))
    .limit(40);
  return json({
    ok: true,
    enabled: features.video,
    available,
    hasFreeModel: available.length > 0,
    quota: { used: quota.used, limit: quota.limit },
    videos: rows.filter((r) => r.mime.startsWith("video/")).map((r) => ({ ...r, url: `/api/files/${r.id}` })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const features = await getFeatures();
  if (!features.video) return err("Video generation is disabled by the administrator.", 403);
  if (!hasApiKey()) return err("AI provider key missing. Add POLLINATIONS_API_KEY to .env and restart.", 503);

  const catalog = await listFreeVideoModels();
  const disabled = new Set((await getDisabledModels()).video);
  const available = catalog.filter((m) => !disabled.has(m.id));
  if (available.length === 0) {
    return err("No free video model is currently available from Pollinations. Video models are paid-only right now, and paid models are never used as fallback.", 503, { code: "NO_FREE_VIDEO_MODEL" });
  }

  const body = await readJson<{ prompt?: string; model?: string; duration?: number; aspectRatio?: string }>(req);
  const prompt = (body?.prompt ?? "").trim();
  if (!prompt || prompt.length > 4000) return err("Prompt must be 1–4000 characters.");
  const model = available.find((m) => m.id === body?.model) ?? available[0];
  const duration = Math.max(model.minDuration, Math.min(model.maxDuration, Math.round(body?.duration ?? model.defaultDuration)));

  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "video");
  if (!quota.ok) return err(`Daily video limit reached (${quota.used}/${quota.limit}).`, 429, { quota });

  try {
    const url = new URL(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}`);
    url.searchParams.set("model", model.id);
    url.searchParams.set("duration", String(duration));
    if (body?.aspectRatio) url.searchParams.set("aspectRatio", body.aspectRatio);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY!.trim()}` },
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await logApiError("/video", `upstream ${res.status}: ${text.slice(0, 1000)}`, user.id, res.status);
      return err(res.status === 402 ? "Video quota/rate limit reached upstream." : `Video provider error (${res.status})`, 502);
    }
    const mime = (res.headers.get("content-type") || "video/mp4").split(";")[0];
    if (!mime.startsWith("video/")) return err("Provider did not return a video.", 502);
    const bytes = Buffer.from(await res.arrayBuffer());
    const [saved] = await db
      .insert(files)
      .values({ userId: user.id, name: `video-${duration}s.mp4`, mime, size: bytes.length, data: bytes.toString("base64"), kind: "generated", meta: { prompt: prompt.slice(0, 500), model: model.id, duration, type: "video" } })
      .returning({ id: files.id, createdAt: files.createdAt });
    await recordUsage(user.id, "video", model.id, { duration });
    return json({ ok: true, video: { id: saved.id, url: `/api/files/${saved.id}`, model: model.id, duration, createdAt: saved.createdAt }, quota: { used: quota.used + 1, limit: quota.limit } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Video generation failed";
    await logApiError("/api/video", msg, user.id);
    return err(msg, 502);
  }
}
