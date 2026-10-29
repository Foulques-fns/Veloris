import { db } from "@/db";
import { files } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { checkQuota, getDisabledModels, getFeatures, recordUsage, type PlanId } from "@/lib/settings";
import { listFreeAudioModels, DEFAULT_TTS_MODEL } from "@/lib/models";
import { hasApiKey, textToSpeech } from "@/lib/pollinations";
import { logApiError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const features = await getFeatures();
  if (!features.audio) return err("Audio features are disabled by the administrator.", 403);
  if (!hasApiKey()) return err("AI provider key missing. Add POLLINATIONS_API_KEY to .env and restart.", 503);

  const body = await readJson<{ text?: string; model?: string; voice?: string }>(req);
  const text = (body?.text ?? "").trim();
  if (!text) return err("Enter some text to speak.");
  const maxChars = (user.plan === "ultra" ? 4000 : user.plan === "premium" ? 2500 : 1200) as number;
  if (text.length > maxChars) return err(`Text too long for your plan (max ${maxChars} characters).`, 413);

  const catalog = await listFreeAudioModels();
  const disabled = new Set((await getDisabledModels()).audio);
  const ttsModels = catalog.filter((m) => m.kind === "tts" && !disabled.has(m.id));
  const model = ttsModels.find((m) => m.id === body?.model) ?? ttsModels.find((m) => m.id === DEFAULT_TTS_MODEL) ?? ttsModels[0];
  if (!model) return err("No free text-to-speech model is available.", 503);

  let voice = (body?.voice ?? "").trim();
  if (model.voices.length > 0) {
    if (!model.voices.includes(voice)) voice = model.voices[0];
  } else if (!voice) {
    voice = "alloy";
  }

  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "audio");
  if (!quota.ok) return err(`Daily audio limit reached (${quota.used}/${quota.limit}). Resets at 00:00 UTC.`, 429, { quota });

  try {
    const { bytes, mime } = await textToSpeech({ text, model: model.id, voice }, user.id);
    const name = `tts-${model.id.split("/").pop()}-${voice}.mp3`;
    const [saved] = await db
      .insert(files)
      .values({ userId: user.id, name, mime, size: bytes.length, data: bytes.toString("base64"), kind: "generated", meta: { text: text.slice(0, 500), model: model.id, voice, type: "tts" } })
      .returning({ id: files.id, createdAt: files.createdAt });
    await recordUsage(user.id, "audio", model.id, { chars: text.length, voice });
    return json({
      ok: true,
      audio: { id: saved.id, url: `/api/files/${saved.id}`, name, model: model.id, voice, createdAt: saved.createdAt },
      quota: { used: quota.used + 1, limit: quota.limit },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "TTS failed";
    await logApiError("/api/audio/tts", msg, user.id);
    return err(msg, 502);
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "audio");
  const rows = await db
    .select({ id: files.id, name: files.name, mime: files.mime, meta: files.meta, createdAt: files.createdAt })
    .from(files)
    .where(and(eq(files.userId, user.id), eq(files.kind, "generated")))
    .orderBy(desc(files.createdAt))
    .limit(60);
  return json({
    ok: true,
    quota: { used: quota.used, limit: quota.limit },
    audios: rows.filter((r) => r.mime.startsWith("audio/")).map((r) => ({ ...r, url: `/api/files/${r.id}` })),
  });
}
