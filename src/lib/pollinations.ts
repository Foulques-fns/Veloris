/**
 * Server-side Pollinations API client (https://gen.pollinations.ai).
 * Auth: Authorization: Bearer <POLLINATIONS_API_KEY>  — never leaves the server.
 */

import { logApiError } from "./log";

const BASE = "https://gen.pollinations.ai";

export class PollinationsError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function hasApiKey(): boolean {
  return Boolean(process.env.POLLINATIONS_API_KEY && process.env.POLLINATIONS_API_KEY.trim());
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const key = process.env.POLLINATIONS_API_KEY;
  if (!key) throw new PollinationsError(503, "POLLINATIONS_API_KEY is not configured. Add it to your .env and restart.");
  return { Authorization: `Bearer ${key.trim()}`, ...extra };
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
};

export type ChatCompletionBody = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  seed?: number;
  stop?: string[];
  reasoning_effort?: "low" | "medium" | "high";
  frequency_penalty?: number;
  presence_penalty?: number;
};

/** OpenAI-compatible streaming chat completion. Returns the raw upstream Response. */
export async function chatCompletionStream(body: ChatCompletionBody, userId?: string): Promise<Response> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logApiError("/v1/chat/completions", `upstream ${res.status}: ${text.slice(0, 2000)}`, userId, res.status);
    throw new PollinationsError(res.status, upstreamMessage(res.status, text));
  }
  return res;
}

/** Non-streaming chat completion (used for titles, image analysis, etc.). */
export async function chatCompletion(
  body: ChatCompletionBody,
  userId?: string,
): Promise<{ content: string; raw: unknown }> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ...body, stream: false }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logApiError("/v1/chat/completions", `upstream ${res.status}: ${text.slice(0, 2000)}`, userId, res.status);
    throw new PollinationsError(res.status, upstreamMessage(res.status, text));
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return { content: json.choices?.[0]?.message?.content ?? "", raw: json };
}

export type ImageGenResult = { bytes: Buffer; mime: string; seed?: number };

async function extractImage(json: unknown): Promise<ImageGenResult> {
  // OpenAI-style: { data: [{ b64_json? | url? }] }
  const data = (json as { data?: { b64_json?: string; url?: string }[] })?.data ?? [];
  const first = data[0];
  if (first?.b64_json) {
    return { bytes: Buffer.from(first.b64_json, "base64"), mime: "image/png" };
  }
  if (first?.url) {
    const img = await fetch(first.url, { signal: AbortSignal.timeout(60_000) });
    if (!img.ok) throw new PollinationsError(502, "Could not fetch generated image asset");
    const mime = img.headers.get("content-type") || "image/png";
    return { bytes: Buffer.from(await img.arrayBuffer()), mime: mime.split(";")[0] };
  }
  throw new PollinationsError(502, "Image provider returned an empty result");
}

export type ImageGenInput = {
  prompt: string;
  model: string;
  width?: number;
  height?: number;
  seed?: number;
  quality?: "low" | "medium" | "high" | "standard" | "hd";
};

/** Text-to-image via POST /v1/images/generations (verified against the OpenAPI schema). */
export async function generateImage(input: ImageGenInput, userId?: string): Promise<ImageGenResult> {
  const res = await fetch(`${BASE}/v1/images/generations`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      prompt: input.prompt,
      model: input.model,
      n: 1,
      size: `${input.width ?? 1024}x${input.height ?? 1024}`,
      quality: input.quality ?? "medium",
      seed: input.seed,
      response_format: "b64_json",
      safe: true,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logApiError("/v1/images/generations", `upstream ${res.status}: ${text.slice(0, 2000)}`, userId, res.status);
    throw new PollinationsError(res.status, upstreamMessage(res.status, text));
  }
  return extractImage(await res.json());
}

export type ImageEditInput = ImageGenInput & {
  references: { name: string; mime: string; bytes: Buffer }[];
};

/** Image-to-image / edit via multipart POST /v1/images/edits. */
export async function editImage(input: ImageEditInput, userId?: string): Promise<ImageGenResult> {
  const form = new FormData();
  form.append("prompt", input.prompt);
  form.append("model", input.model);
  form.append("n", "1");
  form.append("size", `${input.width ?? 1024}x${input.height ?? 1024}`);
  form.append("response_format", "b64_json");
  if (input.seed != null) form.append("seed", String(input.seed));
  for (const ref of input.references) {
    form.append("image", new Blob([new Uint8Array(ref.bytes)], { type: ref.mime }), ref.name);
  }
  const res = await fetch(`${BASE}/v1/images/edits`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logApiError("/v1/images/edits", `upstream ${res.status}: ${text.slice(0, 2000)}`, userId, res.status);
    throw new PollinationsError(res.status, upstreamMessage(res.status, text));
  }
  return extractImage(await res.json());
}

export type SpeechInput = { text: string; model: string; voice: string };

/** Text-to-speech via POST /v1/audio/speech. Returns audio bytes (mp3). */
export async function textToSpeech(input: SpeechInput, userId?: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await fetch(`${BASE}/v1/audio/speech`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ model: input.model, input: input.text, voice: input.voice, response_format: "mp3" }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logApiError("/v1/audio/speech", `upstream ${res.status}: ${text.slice(0, 2000)}`, userId, res.status);
    throw new PollinationsError(res.status, upstreamMessage(res.status, text));
  }
  const mime = res.headers.get("content-type") || "audio/mpeg";
  return { bytes: Buffer.from(await res.arrayBuffer()), mime: mime.split(";")[0] };
}

/** Speech-to-text via multipart POST /v1/audio/transcriptions. */
export async function transcribeAudio(
  file: { name: string; mime: string; bytes: Buffer },
  model: string,
  userId?: string,
): Promise<string> {
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.mime }), file.name);
  const res = await fetch(`${BASE}/v1/audio/transcriptions`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logApiError("/v1/audio/transcriptions", `upstream ${res.status}: ${text.slice(0, 2000)}`, userId, res.status);
    throw new PollinationsError(res.status, upstreamMessage(res.status, text));
  }
  const json = (await res.json().catch(() => ({}))) as { text?: string };
  return json.text ?? "";
}

function upstreamMessage(status: number, body: string): string {
  if (status === 402) return "Pollinations rate limit reached or payment required. Try again later.";
  if (status === 401 || status === 403) return "Invalid or unauthorized Pollinations API key.";
  if (status === 429) return "Pollinations is rate-limiting requests. Slow down and retry.";
  if (status >= 500) return "Pollinations is temporarily unavailable. Please retry.";
  let msg = `AI provider error (${status})`;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const m = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message;
    if (m) msg = String(m).slice(0, 300);
  } catch {
    if (body && status < 500) msg = body.slice(0, 300);
  }
  return msg;
}
