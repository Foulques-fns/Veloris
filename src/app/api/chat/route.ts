import { db } from "@/db";
import { conversations, files, messages, users } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { asc, eq } from "drizzle-orm";
import type { MessageAttachment } from "@/db/schema";
import { checkQuota, getFeatures, recordUsage, type PlanId } from "@/lib/settings";
import {
  resolveChatModel,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TTS_MODEL,
  DEFAULT_STT_MODEL,
  listFreeImageModels,
  listFreeAudioModels,
  listFreeVideoModels,
} from "@/lib/models";
import {
  chatCompletionStream,
  hasApiKey,
  generateImage,
  textToSpeech,
  transcribeAudio,
  type ChatCompletionBody,
  type ChatMessage,
} from "@/lib/pollinations";
import { logApiError } from "@/lib/log";
import { detectMediaIntent, type ChatMedia, type MediaIntent } from "@/lib/media-intent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONALITIES: Record<string, string> = {
  default: "You are VELORIS, a helpful, friendly and knowledgeable AI assistant.",
  professional: "You are VELORIS, a precise, formal and professional assistant. Be structured and factual.",
  friendly: "You are VELORIS, a warm, casual and encouraging assistant. Use a friendly conversational tone.",
  creative: "You are VELORIS, a highly creative assistant. Offer imaginative, original ideas and vivid language.",
  concise: "You are VELORIS, an ultra-concise assistant. Answer in as few words as possible without losing meaning.",
  coder: "You are VELORIS, an expert senior software engineer. Provide production-quality code with clear explanations.",
  teacher: "You are VELORIS, a patient teacher. Explain concepts step-by-step and check understanding with examples.",
};

type ChatParams = {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  seed?: number;
};

type SendBody = {
  mode?: "send" | "continue" | "media";
  conversationId?: string;
  message?: string;
  attachmentIds?: string[];
  model?: string;
  voice?: string;
  mediaType?: "image" | "audio" | "video" | "tts";
  personality?: string;
  customInstructions?: string;
  params?: ChatParams;
};

const VISION_MAX_BYTES = 4 * 1024 * 1024;
const DOC_MAX_CHARS = 12000;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);

  const features = await getFeatures();
  if (!features.chat) return err("Chat is temporarily disabled by the administrator.", 403);

  if (!hasApiKey()) return err("AI provider key missing. Add POLLINATIONS_API_KEY to .env and restart.", 503);

  const body = await readJson<SendBody>(req);
  if (!body) return err("Invalid request body.");
  const mode = body.mode === "continue" ? "continue" : body.mode === "media" ? "media" : "send";

  // ── quota ──────────────────────────────────────────────────────────────
  const quota = await checkQuota({ id: user.id, plan: user.plan as PlanId }, "chat");
  if (!quota.ok) {
    return err(`Daily chat limit reached (${quota.limit} messages on your plan). Resets at 00:00 UTC.`, 429, {
      quota,
    });
  }

  // ── model (free-only, live registry) ───────────────────────────────────
  const requested = body.model || DEFAULT_CHAT_MODEL;
  const model = await resolveChatModel(requested);
  if (!model) return err("This model is unavailable on the free tier.", 400);

  // ── conversation ───────────────────────────────────────────────────────
  let convId = body.conversationId;
  if (convId) {
    const c = (await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1))[0];
    if (!c || c.userId !== user.id) return err("Conversation not found.", 404);
  }

  const freshUser = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];

  if (mode === "send") {
    const text = (body.message ?? "").trim();
    const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.slice(0, 4) : [];
    if (!text && attachmentIds.length === 0) return err("Message cannot be empty.");
    if (text.length > 16000) return err("Message too long (max 16000 chars).");

    if (!convId) {
      const title = (text || "New chat").split("\n")[0].slice(0, 80);
      const [c] = await db
        .insert(conversations)
        .values({ userId: user.id, title: title || "New chat", model: model.id })
        .returning({ id: conversations.id });
      convId = c.id;
    }

    let attachments: MessageAttachment[] | undefined;
    if (attachmentIds.length) {
      attachments = [];
      for (const fid of attachmentIds) {
        const f = (await db.select().from(files).where(eq(files.id, fid)).limit(1))[0];
        if (!f || f.userId !== user.id) continue;
        const kind = f.mime.startsWith("image/") ? "image" : f.mime.startsWith("audio/") || f.mime === "video/mp4" || f.mime === "video/webm" ? "audio" : "doc";
        attachments.push({ fileId: f.id, name: f.name, mime: f.mime, kind, url: `/api/files/${f.id}` });
      }
    }

    await db.insert(messages).values({
      conversationId: convId,
      role: "user",
      content: text,
      model: model.id,
      attachments: attachments?.length ? attachments : undefined,
      meta: { params: body.params ?? {}, personality: body.personality ?? "default" },
    });
  }

  if (!convId) return err("conversationId is required for this mode.", 400);

  // ── build provider messages ────────────────────────────────────────────
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(asc(messages.createdAt))
    .limit(60);

  if (mode !== "media" && (history.length === 0 || history[history.length - 1].role !== "user")) {
    return err("Nothing to answer — add a user message first.", 400);
  }

  // ── media intent? (image / audio / video / transcription, FR + EN) ─────
  const lastUserMsg = history[history.length - 1];
  const lastAttachments = lastUserMsg?.role === "user" ? ((lastUserMsg.attachments ?? []) as MessageAttachment[]) : [];
  let intent: MediaIntent | null = null;
  if (mode === "media") {
    const raw = (body.message ?? "").trim().slice(0, 8000);
    const mt = body.mediaType === "video" ? "video" : body.mediaType === "audio" || body.mediaType === "tts" ? "tts" : "image";
    if (raw) {
      intent =
        mt === "tts"
          ? { type: "tts", text: raw, lang: body.voice?.startsWith("fr-") ? "fr" : "en" }
          : { type: mt, prompt: raw };
    }
  } else if (lastUserMsg?.role === "user") {
    intent = detectMediaIntent(lastUserMsg.content, lastAttachments.map((a) => a.kind));
  }
  if (intent) {
    return respondWithMedia({
      intent,
      user,
      convId,
      attachments: lastAttachments,
      requestedModel: body.model,
      requestedVoice: body.voice,
    });
  }

  const personality = body.personality || freshUser?.personality || "default";
  const custom = (body.customInstructions ?? freshUser?.customInstructions ?? "").trim().slice(0, 4000);
  let system = PERSONALITIES[personality] ?? PERSONALITIES.default;
  system += " You reply in Markdown: use headings, lists, fenced code blocks with the language after the backticks, and tables when helpful.";
  if (custom) system += `\n\nUser's custom instructions:\n${custom}`;

  const providerMessages: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of history.slice(-30)) {
    if (m.role === "assistant") {
      providerMessages.push({ role: "assistant", content: m.content });
      continue;
    }
    const parts: Array<Record<string, unknown>> = [];
    let text = m.content;
    const atts = (m.attachments as MessageAttachment[] | null) ?? [];
    for (const a of atts) {
      const f = (await db.select().from(files).where(eq(files.id, a.fileId)).limit(1))[0];
      if (!f) continue;
      if (a.kind === "image" && model.vision && f.size <= VISION_MAX_BYTES) {
        parts.push({ type: "image_url", image_url: { url: `data:${f.mime};base64,${f.data}` } });
      } else if (a.kind === "image" && model.vision) {
        text += `\n\n[A photo \"${a.name}\" was attached but is too large to analyze.]`;
      } else if (a.kind === "doc") {
        const content = Buffer.from(f.data, "base64").toString("utf8").slice(0, DOC_MAX_CHARS);
        text += `\n\n--- Content of file "${a.name}" ---\n${content}\n--- End of file ---`;
      } else if (a.kind === "audio") {
        text += `\n\n[Audio file attached: ${a.name}]`;
      }
    }
    if (parts.length) {
      parts.unshift({ type: "text", text: text || "(see attached image)" });
      providerMessages.push({ role: "user", content: parts });
    } else {
      providerMessages.push({ role: "user", content: text || "…" });
    }
  }

  // ── per-model parameter filtering (only send what the model supports) ──
  const p = body.params ?? {};
  const supported = new Set(model.params);
  const completion: ChatCompletionBody = { model: model.id, messages: providerMessages, stream: true };
  if (supported.has("max_tokens") && typeof p.maxTokens === "number" && p.maxTokens > 0) completion.max_tokens = Math.min(Math.round(p.maxTokens), 32000);
  if (supported.has("temperature") && typeof p.temperature === "number") completion.temperature = Math.max(0, Math.min(2, p.temperature));
  if (supported.has("top_p") && typeof p.topP === "number") completion.top_p = Math.max(0, Math.min(1, p.topP));
  if (supported.has("seed") && typeof p.seed === "number") completion.seed = Math.round(p.seed);
  if (supported.has("reasoning_effort") && p.reasoningEffort) completion.reasoning_effort = p.reasoningEffort;

  // ── stream ─────────────────────────────────────────────────────────────
  let upstream: Response;
  try {
    upstream = await chatCompletionStream(completion, user.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI provider error";
    await logApiError("/api/chat", msg, user.id);
    return err(msg, 502);
  }
  if (!upstream.body) return err("AI provider returned no stream.", 502);

  const conversationId = convId;
  const modelId = model.id;
  const usageUserId = user.id;

  let full = "";
  let sseBuffer = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const bridge = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true });
      sseBuffer += text;
      let idx: number;
      while ((idx = sseBuffer.indexOf("\n\n")) !== -1) {
        const frame = sseBuffer.slice(0, idx);
        sseBuffer = sseBuffer.slice(idx + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string") full += delta;
          } catch {
            /* partial JSON frame, ignore */
          }
        }
      }
      controller.enqueue(chunk);
    },
    async flush(controller) {
      // persist assistant message + telemetry, then tell the client the ids
      let messageId = "";
      try {
        const clean = full.trim() || "(no response)";
        const [saved] = await db
          .insert(messages)
          .values({ conversationId, role: "assistant", content: clean, model: modelId })
          .returning({ id: messages.id });
        messageId = saved.id;
        await db.update(conversations).set({ updatedAt: new Date(), model: modelId }).where(eq(conversations.id, conversationId));
        await recordUsage(usageUserId, "chat", modelId);
      } catch (e) {
        await logApiError("/api/chat:persist", e, usageUserId);
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ nova: { conversationId, messageId, model: modelId } })}\n\ndata: [DONE]\n\n`),
      );
      controller.terminate();
    },
  });

  const stream = upstream.body.pipeThrough(bridge);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Simple title suggestion (non-streaming) — used to rename long-running chats. */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const body = await readJson<{ conversationId?: string }>(req);
  if (!body?.conversationId) return err("conversationId required.");
  const c = (await db.select().from(conversations).where(eq(conversations.id, body.conversationId)).limit(1))[0];
  if (!c || c.userId !== user.id) return err("Conversation not found.", 404);
  return json({ ok: true, title: c.title });
}

/* ──────────────────────── media generation inside chat ──────────────────── */

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

type MediaCtx = {
  intent: MediaIntent;
  user: { id: string; plan: PlanId };
  convId: string;
  attachments: MessageAttachment[];
  requestedModel?: string;
  requestedVoice?: string;
};

async function respondWithMedia(ctx: MediaCtx): Promise<Response> {
  const encoder = new TextEncoder();
  const { intent, user, convId } = ctx;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      // tell the client immediately what is being produced → loading card
      send({ nova: { phase: "generating", media: intent.type, conversationId: convId } });

      let text = "";
      let media: ChatMedia | null = null;
      let usedModel: string | null = null;

      try {
        if (intent.type === "image") {
          const quota = await checkQuota({ id: user.id, plan: user.plan }, "image");
          if (!quota.ok) throw new Error(`daily image limit reached (${quota.used}/${quota.limit}) — resets at 00:00 UTC.`);
          const catalog = await listFreeImageModels();
          if (catalog.length === 0) throw new Error("no free image model is currently available in the Pollinations catalog.");
          // Free-model fallback chain: try the preferred model first, then other
          // VERIFIED-FREE models (never paid). Max 3 attempts for latency.
          const preferred = [
            ctx.requestedModel,
            DEFAULT_IMAGE_MODEL,
            "microsoft/mai-image-2.6-flash",
            "lykon/dreamshaper-8-lcm",
            "black-forest-labs/flux.1-schnell",
            ...catalog.map((m) => m.id),
          ].filter(Boolean) as string[];
          const tried: string[] = [];
          let mdl: (typeof catalog)[number] | null = null;
          let result: Awaited<ReturnType<typeof generateImage>> | null = null;
          let lastErr = "";
          for (const id of preferred) {
            const candidate = catalog.find((m) => m.id === id);
            if (!candidate || tried.includes(candidate.id)) continue;
            tried.push(candidate.id);
            try {
              result = await generateImage({ prompt: intent.prompt, model: candidate.id, width: 1024, height: 1024, quality: "medium" }, user.id);
              mdl = candidate;
              break;
            } catch (e) {
              lastErr = e instanceof Error ? e.message : String(e);
              if (tried.length >= 3) break;
            }
          }
          if (!result || !mdl) throw new Error(`all free image models failed (${tried.join(", ")}): ${lastErr}`);
          const name = `${intent.prompt.slice(0, 44).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "image"}.png`;
          const [saved] = await db
            .insert(files)
            .values({
              userId: user.id,
              name,
              mime: result.mime,
              size: result.bytes.length,
              data: result.bytes.toString("base64"),
              kind: "generated",
              meta: { prompt: intent.prompt, model: mdl.id, source: "chat" },
            })
            .returning({ id: files.id });
          await recordUsage(user.id, "image", mdl.id, { via: "chat" });
          media = { kind: "image", url: `/api/files/${saved.id}`, fileId: saved.id, name, model: mdl.id, prompt: intent.prompt };
          usedModel = mdl.id;
          text = `Voici votre image, générée avec le modèle gratuit **${mdl.title}** :\n> ${intent.prompt}`;
        } else if (intent.type === "tts") {
          const quota = await checkQuota({ id: user.id, plan: user.plan }, "audio");
          if (!quota.ok) throw new Error(`daily audio limit reached (${quota.used}/${quota.limit}) — resets at 00:00 UTC.`);
          const maxChars = user.plan === "ultra" ? 4000 : user.plan === "premium" ? 2500 : 1200;
          const say = intent.text.slice(0, maxChars);
          const ttsModels = (await listFreeAudioModels()).filter((m) => m.kind === "tts");
          let mdl = ttsModels.find((m) => m.id === ctx.requestedModel);
          let voice = ctx.requestedVoice ?? "";
          if (!mdl) {
            if (intent.lang === "fr") {
              mdl = ttsModels.find((m) => m.id === "microsoft/mai-voice-2.1-flash") ?? ttsModels.find((m) => m.id === DEFAULT_TTS_MODEL) ?? ttsModels[0];
              voice = "fr-FR-Grant";
            } else {
              mdl = ttsModels.find((m) => m.id === DEFAULT_TTS_MODEL) ?? ttsModels[0];
              voice = "alloy";
            }
          }
          if (!mdl) throw new Error("no free speech model is currently available.");
          if (mdl.voices.length > 0 && !mdl.voices.includes(voice)) voice = mdl.voices[0];
          const { bytes, mime } = await textToSpeech({ text: say, model: mdl.id, voice }, user.id);
          const name = `nova-voice-${intent.lang}.mp3`;
          const [saved] = await db
            .insert(files)
            .values({
              userId: user.id,
              name,
              mime,
              size: bytes.length,
              data: bytes.toString("base64"),
              kind: "generated",
              meta: { text: say, model: mdl.id, voice, source: "chat", type: "tts" },
            })
            .returning({ id: files.id });
          await recordUsage(user.id, "audio", mdl.id, { via: "chat", chars: say.length });
          media = { kind: "audio", url: `/api/files/${saved.id}`, fileId: saved.id, name, model: mdl.id, voice, text: say };
          usedModel = mdl.id;
          text = `Voici la lecture audio (modèle gratuit **${mdl.title}**, voix \`${voice}\`) :`;
        } else if (intent.type === "video") {
          const freeVideos = await listFreeVideoModels();
          if (freeVideos.length === 0) {
            text =
              "La génération vidéo n'est pas encore disponible gratuitement : tous les modèles vidéo actuels du catalogue officiel Pollinations sont payants, et Nova n'utilise **jamais** de modèle payant en remplacement.\n\n" +
              `Dès qu'un modèle vidéo gratuit sortira, cette commande (« ${intent.prompt.slice(0, 120)} ») fonctionnera automatiquement — le studio vidéo vérifie le catalogue en direct.`;
          } else {
            text = "La génération vidéo gratuite est disponible — lancez-la depuis le studio vidéo (menu) pour choisir la durée et le format.";
          }
        } else {
          // transcribe
          const audioAtt = ctx.attachments.find((a) => a.kind === "audio");
          if (!audioAtt) throw new Error("aucun fichier audio joint — joignez un fichier audio puis demandez « transcris cet audio ».");
          const quota = await checkQuota({ id: user.id, plan: user.plan }, "transcribe");
          if (!quota.ok) throw new Error("daily transcription limit reached.");
          const sttModels = (await listFreeAudioModels()).filter((m) => m.kind === "stt");
          const mdl = sttModels.find((m) => m.id === ctx.requestedModel) ?? sttModels.find((m) => m.id === DEFAULT_STT_MODEL) ?? sttModels[0];
          if (!mdl) throw new Error("no free transcription model is currently available.");
          const f = (await db.select().from(files).where(eq(files.id, audioAtt.fileId)).limit(1))[0];
          if (!f) throw new Error("audio file not found.");
          const transcript = await transcribeAudio({ name: f.name, mime: f.mime, bytes: Buffer.from(f.data, "base64") }, mdl.id, user.id);
          await recordUsage(user.id, "transcribe", mdl.id, { via: "chat" });
          usedModel = mdl.id;
          text = `**Transcription** (modèle gratuit *${mdl.title}*) :\n\n${transcript || "(no speech detected)"}`;
        }
      } catch (e) {
        await logApiError("/api/chat:media", e, user.id);
        const msg = e instanceof Error ? e.message : "unknown error";
        text = `La génération a échoué : ${msg}\n\nRéessayez, ou choisissez un autre modèle gratuit dans le studio.`;
      }

      let messageId = "";
      try {
        const [saved] = await db
          .insert(messages)
          .values({
            conversationId: convId,
            role: "assistant",
            content: text,
            model: usedModel,
            meta: media ? ({ media } as Record<string, unknown>) : undefined,
          })
          .returning({ id: messages.id });
        messageId = saved.id;
        await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, convId));
      } catch (e) {
        await logApiError("/api/chat:media:persist", e, user.id);
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`));
      send({ nova: { conversationId: convId, messageId, media } });
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
