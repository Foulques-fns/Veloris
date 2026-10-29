import { db } from "@/db";
import { files } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json } from "@/lib/http";
import { checkQuota, getDisabledModels, getFeatures, recordUsage, type PlanId } from "@/lib/settings";
import { listFreeAudioModels, DEFAULT_STT_MODEL } from "@/lib/models";
import { hasApiKey, transcribeAudio } from "@/lib/pollinations";
import { logApiError } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const features = await getFeatures();
  if (!features.audio) return err("Audio features are disabled by the administrator.", 403);
  if (!hasApiKey()) return err("AI provider key missing. Add POLLINATIONS_API_KEY to .env and restart.", 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("Expected multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return err("No audio file provided.");
  const requestedModel = String(form.get("model") ?? "");

  const catalog = await listFreeAudioModels();
  const disabled = new Set((await getDisabledModels()).audio);
  const sttModels = catalog.filter((m) => m.kind === "stt" && !disabled.has(m.id));
  const model = sttModels.find((m) => m.id === requestedModel) ?? sttModels.find((m) => m.id === DEFAULT_STT_MODEL) ?? sttModels[0];
  if (!model) return err("No free transcription model is available.", 503);

  const mime = file.type || "audio/mpeg";
  if (!(mime.startsWith("audio/") || mime === "video/mp4" || mime === "video/webm" || mime === "video/ogg")) {
    return err("Please upload an audio file.", 415);
  }
  if (file.size > 24 * 1024 * 1024) return err("Audio exceeds 24MB.", 413);

  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "transcribe");
  if (!quota.ok) return err(`Daily transcription limit reached (${quota.used}/${quota.limit}).`, 429, { quota });

  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const text = await transcribeAudio({ name: file.name || "audio.webm", mime, bytes }, model.id, user.id);
    const [saved] = await db
      .insert(files)
      .values({ userId: user.id, name: file.name || "recording", mime, size: bytes.length, data: bytes.toString("base64"), kind: "upload", meta: { type: "transcription", model: model.id, transcript: text.slice(0, 1000) } })
      .returning({ id: files.id });
    await recordUsage(user.id, "transcribe", model.id, { secondsEstimate: Math.round(bytes.length / 16000) });
    return json({ ok: true, text, model: model.id, fileId: saved.id, url: `/api/files/${saved.id}`, quota: { used: quota.used + 1, limit: quota.limit } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transcription failed";
    await logApiError("/api/audio/transcribe", msg, user.id);
    return err(msg, 502);
  }
}
