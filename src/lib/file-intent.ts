/**
 * Detects when a user is asking the AI to create/generate a downloadable file.
 * Returns the target file type or null if it's a regular chat message.
 */

export type FileIntent = {
  fileType: string;
  baseName: string;
  prompt: string;
};

const FILE_PATTERNS: Array<{ pattern: RegExp; fileType: string; name: string }> = [
  // Documents
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?|produis|r[ée]dige?)\b.{0,60}\b(doc(?:ument)?|word|docx)\b/i, fileType: "docx", name: "document" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,60}\b(pdf|rapport pdf|fichier pdf)\b/i, fileType: "pdf", name: "rapport" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,60}\b(pr[ée]sentation|powerpoint|diaporama|pptx|slides?)\b/i, fileType: "pptx", name: "presentation" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?)\b.{0,60}\b(tableur|excel|xlsx|spreadsheet)\b/i, fileType: "xlsx", name: "tableur" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?|exporte?)\b.{0,60}\b(csv|comma.separated)\b/i, fileType: "csv", name: "data" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,60}\b(markdown|fichier md|\.md)\b/i, fileType: "md", name: "document" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,60}\b(fichier (texte|txt)|text file)\b/i, fileType: "txt", name: "fichier" },

  // Code files
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?|code[sz]?)\b.{0,80}\b(script python|fichier\.py|code python|\.py\b)/i, fileType: "py", name: "script" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,80}\b(script javascript|fichier\.js|\.js\b)/i, fileType: "js", name: "script" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,80}\b(script typescript|fichier\.ts|\.ts\b)/i, fileType: "ts", name: "script" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,80}\b(page html|fichier\.html|\.html\b)/i, fileType: "html", name: "page" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,80}\b(script sql|base de donn[eé]es|\.sql\b)/i, fileType: "sql", name: "database" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,80}\b(script lua|code lua|\.lua\b)/i, fileType: "lua", name: "script" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,80}\b(json|\.json\b)/i, fileType: "json", name: "data" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?)\b.{0,80}\b(xml|\.xml\b)/i, fileType: "xml", name: "data" },

  // Data
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?|code[sz]?)\b.{0,80}\b(code (java|c\+\+|php)|fichier\.(java|cpp|php))\b/i, fileType: "java", name: "code" },

  // Roblox & 3D
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?)\b.{0,80}\b(jeu roblox|roblox game|place roblox|\.rbxlx|script roblox)\b/i, fileType: "rbxlx", name: "roblox-game" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?)\b.{0,80}\b(mod[eè]le 3d|objet 3d|fichier obj|\.obj\b)\b/i, fileType: "obj", name: "model" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?)\b.{0,80}\b(gltf|glb|sc[eè]ne 3d)\b/i, fileType: "gltf", name: "scene" },
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?)\b.{0,80}\b(stl|mod[eè]le impression 3d)\b/i, fileType: "stl", name: "model" },

  // ZIP project
  { pattern: /\b(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?|t[eé]l[eé]charge)\b.{0,80}\b(projet complet|zip|archive|package)\b/i, fileType: "zip", name: "project" },
];

// Also match explicit "create a .xxx file" format
const EXTENSION_PATTERN = /\b(?:cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|fai[st]?|[eé]cri(?:s|re?)?)\b.{0,60}\.([a-z]{2,6})\b/i;

const SUPPORTED_EXTS = new Set([
  "docx", "pdf", "pptx", "xlsx", "csv", "txt", "md",
  "py", "js", "ts", "html", "css", "sql", "lua", "json", "xml",
  "java", "cpp", "php", "rs", "go", "rb", "kt",
  "rbxlx", "obj", "gltf", "stl", "zip",
]);

/** Suggests a good base filename from the prompt. */
function extractBaseName(prompt: string): string {
  // Strip verbs and filler at the start
  let s = prompt
    .replace(/^(cr[ée]{1,2}[ea]?|g[ée]n[eè]re?|[eé]cri(?:s|re?)?|fai[st]?|produis|r[eé]dige?)\s*(-\s*moi\s*|-\s*nous\s*)?\s*(un[e]?\s+|le\s+|la\s+|mon\s+|des\s+)?/i, "")
    .trim();
  // Strip file type words at start
  s = s.replace(/^(document|fichier|tableur|pr[eé]sentation|script|page|rapport|archive|projet|code|base de donn[eé]es)\s+(word|excel|pdf|powerpoint|python|java|html|css|sql|lua|json|xml|csv|markdown|roblox|zip)?\s*/i, "").trim();
  s = s.replace(/^(word|excel|pdf|powerpoint|python|java|html|css|sql|lua|json|xml|csv|markdown|roblox|zip)\s+/i, "").trim();
  // Take first meaningful chunk (stop at "avec", "sur", "pour", "qui")
  s = s.replace(/\s+(pour|avec|qui|sur|dans|et|ou|afin|permettant)\b.*/i, "").trim();
  // Sanitize for filename
  const cleaned = s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-zA-Z0-9\s\-_]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .toLowerCase()
    .replace(/-+$/, "") // remove trailing hyphens
    || "veloris-file";
  return cleaned;
}

export function detectFileIntent(text: string): FileIntent | null {
  const t = text.trim();
  if (!t || t.length < 5) return null;

  // Check extension pattern first
  const extMatch = EXTENSION_PATTERN.exec(t);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    if (SUPPORTED_EXTS.has(ext)) {
      return { fileType: ext, baseName: extractBaseName(t), prompt: t };
    }
  }

  // Check semantic patterns
  for (const { pattern, fileType, name } of FILE_PATTERNS) {
    if (pattern.test(t)) {
      return { fileType, baseName: extractBaseName(t) || name, prompt: t };
    }
  }

  return null;
}
