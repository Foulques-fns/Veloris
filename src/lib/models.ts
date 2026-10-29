/**
 * Live Pollinations model registry.
 *
 * Every list is fetched from the official gen.pollinations.ai catalog and
 * HARD-FILTERED to `paid_only === false`. Paid models can never be used,
 * regardless of admin configuration. If the catalog cannot be reached we fall
 * back to a verified snapshot (see FALLBACK_*).
 */

const BASE = "https://gen.pollinations.ai";

export type ChatModelInfo = {
  id: string;
  title: string;
  vendor: string;
  vision: boolean;
  params: string[];
  contextLength: number;
  health: string;
};

export type ImageModelInfo = {
  id: string;
  title: string;
  acceptsImages: boolean;
  maxReferenceImages: number;
  health: string;
};

export type AudioModelInfo = {
  id: string;
  title: string;
  kind: "tts" | "stt";
  voices: string[];
  health: string;
};

export type VideoModelInfo = {
  id: string;
  title: string;
  minDuration: number;
  maxDuration: number;
  defaultDuration: number;
  resolutions: string[];
  health: string;
};

// Verified free snapshot (fallback when the catalog is unreachable).
const FALLBACK_CHAT: ChatModelInfo[] = [
  { id: "openai/gpt-5.4-nano", title: "GPT-5.4 Nano", vendor: "OpenAI", vision: true, params: ["max_tokens", "max_completion_tokens", "stream", "reasoning_effort"], contextLength: 400000, health: "healthy" },
  { id: "openai/gpt-6.1-terra", title: "GPT-6.1 Terra", vendor: "OpenAI", vision: true, params: ["max_tokens", "max_completion_tokens", "stream", "reasoning_effort"], contextLength: 1050000, health: "healthy" },
  { id: "openai/gpt-6.1-sol", title: "GPT-6.1 Sol", vendor: "OpenAI", vision: true, params: ["max_tokens", "max_completion_tokens", "stream", "reasoning_effort"], contextLength: 1050000, health: "healthy" },
  { id: "deepseek/deepseek-v4.1-flash", title: "DeepSeek V4.1 Flash", vendor: "DeepSeek", vision: true, params: ["max_tokens", "stream", "temperature", "top_p", "stop"], contextLength: 1048576, health: "healthy" },
  { id: "z-ai/glm-5.3-flash", title: "GLM-5.3 Flash", vendor: "Z.ai", vision: true, params: ["max_tokens", "stream", "temperature", "top_p"], contextLength: 262144, health: "healthy" },
  { id: "mistralai/mistral-large-3", title: "Mistral Large 3", vendor: "Mistral", vision: true, params: ["max_tokens", "stream"], contextLength: 524288, health: "healthy" },
];

const FALLBACK_IMAGE: ImageModelInfo[] = [
  { id: "microsoft/mai-image-2.6", title: "MAI Image 2.6", acceptsImages: true, maxReferenceImages: 5, health: "healthy" },
  { id: "microsoft/mai-image-2.6-flash", title: "MAI Image 2.6 Flash", acceptsImages: true, maxReferenceImages: 5, health: "healthy" },
  { id: "black-forest-labs/flux.2-klein-4b", title: "FLUX.2 Klein 4B", acceptsImages: true, maxReferenceImages: 10, health: "healthy" },
  { id: "black-forest-labs/flux.1-kontext-pro", title: "FLUX.1 Kontext Pro", acceptsImages: true, maxReferenceImages: 1, health: "healthy" },
  { id: "black-forest-labs/flux.1.1-pro", title: "FLUX 1.1 Pro", acceptsImages: false, maxReferenceImages: 0, health: "healthy" },
  { id: "black-forest-labs/flux.1-schnell", title: "FLUX.1 Schnell", acceptsImages: false, maxReferenceImages: 0, health: "healthy" },
  { id: "tongyi-mai/z-image-turbo", title: "Z-Image Turbo", acceptsImages: false, maxReferenceImages: 0, health: "healthy" },
  { id: "lykon/dreamshaper-8-lcm", title: "DreamShaper 8 LCM", acceptsImages: false, maxReferenceImages: 0, health: "healthy" },
];

const FALLBACK_AUDIO: AudioModelInfo[] = [
  { id: "openai/tts-1", title: "OpenAI TTS-1", kind: "tts", voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"], health: "healthy" },
  { id: "openai/tts-1-hd", title: "OpenAI TTS-1 HD", kind: "tts", voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"], health: "healthy" },
  { id: "microsoft/mai-voice-2.1", title: "MAI Voice 2.1", kind: "tts", voices: [], health: "healthy" },
  { id: "microsoft/mai-voice-2.1-flash", title: "MAI Voice 2.1 Flash", kind: "tts", voices: [], health: "healthy" },
  { id: "microsoft/mai-transcribe-2", title: "MAI Transcribe 2", kind: "stt", voices: [], health: "healthy" },
  { id: "openai/whisper-large-v3", title: "Whisper Large v3", kind: "stt", voices: [], health: "healthy" },
];

type CacheEntry<T> = { data: T; at: number };
const CACHE_TTL = 5 * 60_000;
const cache = new Map<string, CacheEntry<unknown>>();

async function cached<T>(key: string, fetcher: () => Promise<T | null>, fallback: T): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  try {
    const data = await fetcher();
    if (data) {
      cache.set(key, { data, at: Date.now() });
      return data;
    }
  } catch {
    /* fall through to fallback */
  }
  return hit?.data ?? fallback;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`catalog ${res.status}`);
  return res.json();
}

type RawTextModel = {
  id: string;
  title?: string;
  owned_by?: string;
  paid_only?: boolean;
  category?: string;
  input_modalities?: string[];
  supported_parameters?: string[];
  context_length?: number;
  health?: { status?: string };
};

export async function listFreeChatModels(): Promise<ChatModelInfo[]> {
  return cached("chat", async () => {
    const json = (await getJson(`${BASE}/v1/models`)) as { data?: RawTextModel[] };
    const all = json.data ?? [];
    const out: ChatModelInfo[] = [];
    for (const m of all) {
      if (m.paid_only !== false) continue;
      if (m.category !== "text") continue;
      if (m.id.startsWith("community/")) continue;
      out.push({
        id: m.id,
        title: m.title || m.id.split("/").pop() || m.id,
        vendor: m.owned_by || m.id.split("/")[0] || "",
        vision: (m.input_modalities ?? []).includes("image"),
        params: m.supported_parameters ?? ["max_tokens", "stream"],
        contextLength: m.context_length ?? 128000,
        health: m.health?.status ?? "unknown",
      });
    }
    out.sort((a, b) => scoreChat(a) - scoreChat(b));
    return out.length ? out : null;
  }, FALLBACK_CHAT);
}

function scoreChat(m: ChatModelInfo): number {
  const featured = [
    "openai/gpt-5.4-nano",
    "openai/gpt-6.1-terra",
    "openai/gpt-6.1-sol",
    "openai/gpt-5.5",
    "mistralai/mistral-large-3",
    "deepseek/deepseek-v4.1-flash",
    "z-ai/glm-5.3-flash",
  ];
  const i = featured.indexOf(m.id);
  return i === -1 ? 100 : i;
}

type RawImageModel = {
  name: string;
  title?: string;
  paid_only?: boolean;
  input_modalities?: string[];
  max_reference_images?: number | null;
  health?: { status?: string };
};

export async function listFreeImageModels(): Promise<ImageModelInfo[]> {
  return cached("image", async () => {
    const json = (await getJson(`${BASE}/image/models`)) as RawImageModel[];
    const out: ImageModelInfo[] = (json ?? [])
      .filter((m) => m.paid_only === false && !m.name.startsWith("community/"))
      .map((m) => ({
        id: m.name,
        title: m.title || m.name.split("/").pop() || m.name,
        acceptsImages: (m.input_modalities ?? []).includes("image"),
        maxReferenceImages: m.max_reference_images ?? 0,
        health: m.health?.status ?? "unknown",
      }));
    out.sort((a, b) => scoreImage(a) - scoreImage(b));
    return out.length ? out : null;
  }, FALLBACK_IMAGE);
}

function scoreImage(m: ImageModelInfo): number {
  const featured = [
    "microsoft/mai-image-2.6",
    "microsoft/mai-image-2.6-flash",
    "black-forest-labs/flux.2-klein-4b",
    "black-forest-labs/flux.1-kontext-pro",
    "black-forest-labs/flux.1.1-pro",
    "black-forest-labs/flux.1-schnell",
    "tongyi-mai/z-image-turbo",
    "lykon/dreamshaper-8-lcm",
  ];
  const i = featured.indexOf(m.id);
  return i === -1 ? 100 : i;
}

type RawAudioModel = {
  name: string;
  title?: string;
  paid_only?: boolean;
  input_modalities?: string[];
  output_modalities?: string[];
  voices?: string[];
  health?: { status?: string };
};

export async function listFreeAudioModels(): Promise<AudioModelInfo[]> {
  return cached("audio", async () => {
    const json = (await getJson(`${BASE}/audio/models`)) as RawAudioModel[];
    const out: AudioModelInfo[] = (json ?? [])
      .filter((m) => m.paid_only === false && !m.name.startsWith("community/"))
      .map((m) => ({
        id: m.name,
        title: m.title || m.name.split("/").pop() || m.name,
        kind: (m.output_modalities ?? []).includes("audio") ? ("tts" as const) : ("stt" as const),
        voices: m.voices ?? [],
        health: m.health?.status ?? "unknown",
      }));
    const order = ["openai/tts-1", "openai/tts-1-hd", "microsoft/mai-voice-2.1-flash", "microsoft/mai-voice-2.1", "microsoft/mai-transcribe-2", "openai/whisper-large-v3", "openai/gpt-transcribe"];
    out.sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      return (ia === -1 ? 100 : ia) - (ib === -1 ? 100 : ib);
    });
    return out.length ? out : null;
  }, FALLBACK_AUDIO);
}

type RawVideoModel = {
  name: string;
  title?: string;
  paid_only?: boolean;
  min_duration?: number;
  max_duration?: number;
  default_duration?: number;
  resolutions?: string[];
  health?: { status?: string };
};

export async function listFreeVideoModels(): Promise<VideoModelInfo[]> {
  return cached("video", async () => {
    const json = (await getJson(`${BASE}/video/models`)) as RawVideoModel[];
    const out: VideoModelInfo[] = (json ?? [])
      .filter((m) => m.paid_only === false && !m.name.startsWith("community/"))
      .map((m) => ({
        id: m.name,
        title: m.title || m.name.split("/").pop() || m.name,
        minDuration: m.min_duration ?? 4,
        maxDuration: m.max_duration ?? 10,
        defaultDuration: m.default_duration ?? 5,
        resolutions: m.resolutions ?? [],
        health: m.health?.status ?? "unknown",
      }));
    return out;
  }, []);
}

/** Resolve any known alias to the canonical free model id (chat). */
export async function resolveChatModel(requested: string): Promise<ChatModelInfo | null> {
  const list = await listFreeChatModels();
  if (requested === "openai") requested = "openai/gpt-5.4-nano";
  const hit = list.find((m) => m.id === requested || m.id.endsWith(`/${requested}`));
  return hit ?? null;
}

export const DEFAULT_CHAT_MODEL = "openai/gpt-5.4-nano";
export const DEFAULT_IMAGE_MODEL = "tongyi-mai/z-image-turbo";
export const DEFAULT_TTS_MODEL = "openai/tts-1";
export const DEFAULT_STT_MODEL = "microsoft/mai-transcribe-2";
