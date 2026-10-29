/**
 * Natural-language media-intent detection (French + English), fully local —
 * zero extra latency. When a chat message asks for an image / speech / video /
 * transcription, the chat API short-circuits the LLM and generates real media
 * via free Pollinations models, embedded inline in the conversation.
 */

export type MediaIntent =
  | { type: "image"; prompt: string }
  | { type: "video"; prompt: string }
  | { type: "tts"; text: string; lang: "fr" | "en" }
  | { type: "transcribe" };

export type ChatMedia = {
  kind: "image" | "audio" | "video";
  url: string;
  fileId: string;
  name: string;
  model: string;
  prompt?: string;
  text?: string;
  voice?: string;
};

const IMAGE_WORDS =
  "(?:images?|photos?|dessins?|illustrations?|pictures?|pics?\\b|artworks?|wallpapers?|fonds? d'[eéè]cran|logos?|posters?|affiches?)";
const VIDEO_WORDS = "(?:vid[eéè]os?|videos?|clips?|animations?)";
// Exact conjugated forms with \b on both sides (so « généralement » etc. never match).
const VERBS =
  "(?:g[eéè]n[eéè]res?|g[eéè]n[eéè]rez|g[eéè]n[eéè]rer|cr[eéè]es?|cr[eéè]ez|cr[eéè]er|dessines?|dessinez|dessiner|fais|faites|faire|fabriques?|fabriquez|produis(?:ez)?|imagines?|imaginez|imaginer|generate|creates?|makes?|made\\b|draws?|paints?|produces?|renders?)";
const FILLER = "(?:(?:-?(?:moi|nous|me|please|svp|stp|s'il te pla[îi]t)\\s+)|(?:une?|an|des|les|the|a|de la|de l'|d'une?|d'un|of an?|of the|some|du)\\s+)*";
const LINK =
  "(?:de|des|d'|du|de la|de l'|of|montrant|repr[eéè]sentant|showing|depicting|avec|with|pour|for|sur|on|about|qui|that)?\\s*:?\\s*";

const videoRe = new RegExp(`\\b${VERBS}\\b\\s*${FILLER}${VIDEO_WORDS}\\s*${LINK}(.+)$`, "is");
const imageRe = new RegExp(`\\b${VERBS}\\b\\s*${FILLER}${IMAGE_WORDS}\\s*${LINK}(.+)$`, "is");

// Questions ABOUT media are not generation commands.
const QUESTION_GUARD = /comment|how to|pourquoi|qu'?est-ce|explain|c'est quoi|peux-tu m'expliquer/i;

// TTS triggers fully consume the command prefix, e.g. "Read this aloud in French:" or "Lis-le-moi :"
const TTS_FR = /^(?:lis(?:ez)?(?:-le|-moi|-nous|-la|-les)?|lire|prononce[zr]?|récite[zr]?)\b(?:\s+-(?:moi|nous))?(?:\s+(?:ce|ça|cela|ceci|cet?|le|la)\s*(?:texte|message|paragraphe|poème)?)?\s*(?:en\s+fran[cç]ais)?\s*[:–—-]?\s*/i;
const TTS_EN = /^(?:read|say|speak|pronounce)\b(?:\s+(?:this|that|it|this text|the text|this message|this paragraph))?(?:\s+(?:aloud|out loud|loudly))?(?:\s+in\s+(?:french|english))?\s*[:–—-]?\s*/i;
const TTS_FILLER = /^(?:ce|ça|cela|cet?|le|la|this|that|the|it)\s+(?:texte|message|paragraphe|text|message|paragraph)\s*[:–—-]?\s*/i;

const TRANSCRIBE = /\btranscri\w*/i;

function cleanPrompt(raw: string): string {
  const p = raw
    .replace(/\s+/g, " ")
    .replace(/^(?:d[' ]|de la |de l'|des |de |du |of )+/i, "")
    .replace(/\s*(?:s'?il (?:te|vous) pla[îi]t|please|merci(?: beaucoup)?|stp|svp)[.!?\s]*$/i, "")
    .replace(/[\s,.;:!?]+$/, "")
    .trim();
  return p.length >= 3 ? p : "";
}

export function detectMediaIntent(text: string, attachmentKinds: string[]): MediaIntent | null {
  const t = text.trim();
  if (!t) return null;

  if (TRANSCRIBE.test(t) && attachmentKinds.includes("audio")) {
    return { type: "transcribe" };
  }

  // text-to-speech first (never gated by the question guard)
  const fr = TTS_FR.exec(t);
  const en = fr ? null : TTS_EN.exec(t);
  if (fr || en) {
    let payload = t.slice((fr ?? en)![0].length);
    payload = payload.replace(TTS_FILLER, "");
    payload = payload.replace(/^\s*(?:moi|nous|me)\s*[:–—-]\s*/i, ""); // leftover imperative pronoun
    const wantsFr = /fran[cç]ais|french/i.test(t);
    const wantsEn = /anglais|english/i.test(t);
    const lang: "fr" | "en" = wantsFr ? "fr" : wantsEn ? "en" : fr ? "fr" : "en";
    // strip trailing language directive
    payload = payload.replace(/\s+(?:en|in)\s+(?:fran[cç]ais|anglais|french|english)\s*$/i, "");
    payload = payload.replace(/^["«"']+|["»"']+$/g, "").trim();
    if (payload.length >= 2) return { type: "tts", text: payload, lang };
  }

  // Questions about media are not generation commands (image/video only).
  if (QUESTION_GUARD.test(t)) return null;

  // video first (a "video" request mentioning an image shouldn't become an image)
  const vm = videoRe.exec(t);
  if (vm) {
    const prompt = cleanPrompt(vm[1]);
    if (prompt) return { type: "video", prompt };
  }

  const im = imageRe.exec(t);
  if (im) {
    const prompt = cleanPrompt(im[1]);
    if (prompt) return { type: "image", prompt };
  }

  return null;
}
