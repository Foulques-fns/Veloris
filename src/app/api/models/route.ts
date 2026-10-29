import { getSessionUser } from "@/lib/session";
import { err, json } from "@/lib/http";
import { listFreeAudioModels, listFreeChatModels, listFreeImageModels, listFreeVideoModels, DEFAULT_CHAT_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_TTS_MODEL, DEFAULT_STT_MODEL } from "@/lib/models";
import { getDisabledModels, getFeatures } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public catalog for the UI — only free models, minus admin-disabled ones. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);

  const [chat, image, audio, video, disabled, features] = await Promise.all([
    listFreeChatModels(),
    listFreeImageModels(),
    listFreeAudioModels(),
    listFreeVideoModels(),
    getDisabledModels(),
    getFeatures(),
  ]);

  const off = {
    chat: new Set(disabled.chat),
    image: new Set(disabled.image),
    audio: new Set(disabled.audio),
    video: new Set(disabled.video),
  };

  return json({
    ok: true,
    features,
    defaults: { chat: DEFAULT_CHAT_MODEL, image: DEFAULT_IMAGE_MODEL, tts: DEFAULT_TTS_MODEL, stt: DEFAULT_STT_MODEL },
    chat: chat.filter((m) => !off.chat.has(m.id)),
    image: image.filter((m) => !off.image.has(m.id)),
    audio: audio.filter((m) => !off.audio.has(m.id)),
    video: video.filter((m) => !off.video.has(m.id)),
  });
}
