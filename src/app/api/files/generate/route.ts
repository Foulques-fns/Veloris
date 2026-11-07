/**
 * POST /api/files/generate
 * Uses AI to generate real, downloadable files from a user prompt.
 * Returns the file as a base64 attachment that the frontend stores and displays.
 */
import { db } from "@/db";
import { files } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { chatCompletion, hasApiKey } from "@/lib/pollinations";
import { logApiError } from "@/lib/log";
import {
  generateDocx,
  generateXlsx,
  generateCsv,
  generatePptx,
  generatePdf,
  generateTxt,
  generateJson,
  generateXml,
  generateCode,
  generateZip,
  generateRobloxScript,
  generateRbxlx,
  generateObj,
  generateGltf,
  generateStl,
  generateSql,
  generateMarkdown,
  type DocxSpec,
  type XlsxSpec,
  type PptxSlide,
} from "@/lib/file-generators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT_MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  xml: "application/xml",
  sql: "application/sql",
  py: "text/x-python",
  js: "text/javascript",
  ts: "text/typescript",
  html: "text/html",
  css: "text/css",
  java: "text/x-java",
  cpp: "text/x-c++src",
  php: "application/x-php",
  lua: "text/plain",
  zip: "application/zip",
  rbxlx: "application/xml",
  obj: "model/obj",
  gltf: "model/gltf+json",
  stl: "model/stl",
};

export async function POST(req: Request) {
  // Support internal calls from the chat route
  const internalUserId = req.headers.get("x-internal-user-id");
  let user: { id: string; plan: string; role: string } | null = null;

  if (internalUserId) {
    // Internal call: look up the user directly
    const { db: dbClient } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await dbClient.select({ id: users.id, plan: users.plan, role: users.role })
      .from(users).where(eq(users.id, internalUserId)).limit(1);
    if (!rows[0]) return err("User not found.", 404);
    user = rows[0];
  } else {
    user = await getSessionUser();
  }

  if (!user) return err("Not authenticated.", 401);
  if (!hasApiKey()) return err("AI provider key missing.", 503);

  const body = await readJson<{
    prompt: string;
    fileType: string; // "docx" | "xlsx" | "pdf" | "pptx" | "csv" | "txt" | "json" | "py" | etc.
    filename?: string;
    conversationContext?: string;
  }>(req);

  if (!body?.prompt) return err("Prompt required.");
  if (!body?.fileType) return err("fileType required.");

  const fileType = body.fileType.toLowerCase().replace(/^\./, "");
  const baseName = (body.filename || "veloris-file").replace(/\.[^.]+$/, "");

  try {
    let result: Awaited<ReturnType<typeof generateDocx>> | null = null;

    // ── Route by file type ───────────────────────────────────────────────────

    if (fileType === "docx") {
      const spec = await aiGenerateDocxSpec(body.prompt, body.conversationContext, user.id);
      result = await generateDocx(spec, baseName);

    } else if (fileType === "xlsx") {
      const spec = await aiGenerateXlsxSpec(body.prompt, body.conversationContext, user.id);
      result = generateXlsx(spec, baseName);

    } else if (fileType === "csv") {
      const { headers, rows } = await aiGenerateCsvSpec(body.prompt, body.conversationContext, user.id);
      result = generateCsv(headers, rows, baseName);

    } else if (fileType === "pptx") {
      const { title, slides } = await aiGeneratePptxSpec(body.prompt, body.conversationContext, user.id);
      result = await generatePptx(slides, title, baseName);

    } else if (fileType === "pdf") {
      const spec = await aiGenerateDocxSpec(body.prompt, body.conversationContext, user.id); // same structure
      result = await generatePdf(spec, baseName);

    } else if (fileType === "txt") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "plain text");
      result = generateTxt(content, baseName);

    } else if (fileType === "md") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "Markdown");
      result = generateMarkdown(content, baseName);

    } else if (fileType === "json") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "JSON");
      result = generateJson(content, baseName);

    } else if (fileType === "xml") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "XML");
      result = generateXml(content, baseName);

    } else if (fileType === "sql") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "SQL with CREATE TABLE and INSERT statements");
      result = generateSql(content, baseName);

    } else if (fileType === "lua" || fileType === "rbxlx") {
      if (fileType === "rbxlx") {
        const { placeName, scripts } = await aiGenerateRoblox(body.prompt, body.conversationContext, user.id);
        result = generateRbxlx(placeName, scripts, baseName);
      } else {
        const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "Luau script for Roblox");
        result = generateRobloxScript(baseName, content, baseName);
      }

    } else if (["py", "js", "ts", "html", "css", "java", "cpp", "php", "rs", "go", "rb", "kt", "swift", "dart", "sh"].includes(fileType)) {
      const langNames: Record<string, string> = {
        py: "Python", js: "JavaScript", ts: "TypeScript", html: "HTML",
        css: "CSS", java: "Java", cpp: "C++", php: "PHP", rs: "Rust",
        go: "Go", rb: "Ruby", kt: "Kotlin", swift: "Swift", dart: "Dart", sh: "Bash shell script",
      };
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, langNames[fileType] || fileType);
      result = generateCode(content, fileType, baseName);

    } else if (fileType === "obj") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "Wavefront OBJ 3D model (ASCII format with v, vt, vn, f directives)");
      result = generateObj(baseName, content, baseName);

    } else if (fileType === "gltf") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "valid glTF 2.0 JSON");
      result = generateGltf(JSON.parse(content), baseName);

    } else if (fileType === "stl") {
      const content = await aiGeneratePlainText(body.prompt, body.conversationContext, user.id, "ASCII STL 3D model");
      result = generateStl(content, baseName);

    } else if (fileType === "zip") {
      const files_map = await aiGenerateMultipleFiles(body.prompt, body.conversationContext, user.id);
      result = await generateZip(files_map, baseName);

    } else {
      return err(`File type '${fileType}' is not supported yet.`, 400);
    }

    if (!result) return err("Generation produced no output.", 500);

    // Store in DB
    const [saved] = await db
      .insert(files)
      .values({
        userId: user.id,
        name: result.filename,
        mime: result.mime,
        size: result.buffer.length,
        data: result.buffer.toString("base64"),
        kind: "generated",
        meta: { prompt: body.prompt.slice(0, 500), type: "file", fileType },
      })
      .returning({ id: files.id, createdAt: files.createdAt });

    return json({
      ok: true,
      file: {
        id: saved.id,
        name: result.filename,
        mime: result.mime,
        size: result.buffer.length,
        url: `/api/files/${saved.id}`,
        fileType,
        prompt: body.prompt.slice(0, 200),
      },
    });

  } catch (e) {
    await logApiError("/api/files/generate", e, user.id);
    const msg = e instanceof Error ? e.message : "Generation failed";
    return err(msg, 500);
  }
}

// ── AI helper functions ──────────────────────────────────────────────────────

async function aiGeneratePlainText(prompt: string, context: string | undefined, userId: string, format: string): Promise<string> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      { role: "system", content: `You are an expert file generator. Generate ONLY the raw ${format} content requested. No explanations, no markdown code fences, no commentary. Output the file content directly.${context ? `\n\nConversation context:\n${context}` : ""}` },
      { role: "user", content: prompt },
    ],
    max_tokens: 16000,
  }, userId);
  // Strip any accidental code fences
  return content.replace(/^```[\w]*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
}

async function aiGenerateDocxSpec(prompt: string, context: string | undefined, userId: string): Promise<DocxSpec> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      {
        role: "system",
        content: `You generate document specifications. Respond ONLY with valid JSON matching this schema:
{
  "title": "string",
  "sections": [
    {
      "heading": "optional string",
      "level": 1 | 2 | 3,
      "paragraphs": ["paragraph text", ...]
    }
  ]
}
Make the content professional, detailed, and comprehensive. No code fences in response.${context ? `\n\nConversation context:\n${context}` : ""}`,
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 8000,
  }, userId);
  try {
    const clean = content.replace(/^```json?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(clean) as DocxSpec;
  } catch {
    return { title: prompt.slice(0, 60), sections: [{ paragraphs: [content] }] };
  }
}

async function aiGenerateXlsxSpec(prompt: string, context: string | undefined, userId: string): Promise<XlsxSpec> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      {
        role: "system",
        content: `You generate spreadsheet specifications. Respond ONLY with valid JSON matching this schema:
{
  "sheets": [
    {
      "name": "Sheet name",
      "headers": ["Col1", "Col2", ...],
      "rows": [[val1, val2, ...], ...]
    }
  ]
}
Include realistic, relevant data. At least 10 rows of data per sheet.${context ? `\n\nConversation context:\n${context}` : ""}`,
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 8000,
  }, userId);
  try {
    const clean = content.replace(/^```json?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(clean) as XlsxSpec;
  } catch {
    return { sheets: [{ name: "Data", headers: ["Item", "Value"], rows: [["Generated", content.slice(0, 100)]] }] };
  }
}

async function aiGenerateCsvSpec(prompt: string, context: string | undefined, userId: string): Promise<{ headers: string[]; rows: (string | number | null)[][] }> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      {
        role: "system",
        content: `Generate CSV data as valid JSON: {"headers": ["Col1","Col2",...], "rows": [[val1,val2,...], ...]}. Include at least 15 realistic rows.${context ? `\n\nContext:\n${context}` : ""}`,
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 6000,
  }, userId);
  try {
    const clean = content.replace(/^```json?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(clean);
  } catch {
    return { headers: ["Data"], rows: [[content.slice(0, 100)]] };
  }
}

async function aiGeneratePptxSpec(prompt: string, context: string | undefined, userId: string): Promise<{ title: string; slides: PptxSlide[] }> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      {
        role: "system",
        content: `Generate a presentation as JSON: {"title":"Presentation Title","slides":[{"title":"Slide Title","bullets":["point 1","point 2"],"notes":"speaker notes"},...]}. Create 8-12 professional slides.${context ? `\n\nContext:\n${context}` : ""}`,
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 8000,
  }, userId);
  try {
    const clean = content.replace(/^```json?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(clean);
  } catch {
    return { title: prompt.slice(0, 60), slides: [{ title: "Slide 1", content: content.slice(0, 500) }] };
  }
}

async function aiGenerateRoblox(prompt: string, context: string | undefined, userId: string): Promise<{ placeName: string; scripts: Record<string, string> }> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      {
        role: "system",
        content: `Generate a Roblox game project as JSON: {"placeName":"My Game","scripts":{"ScriptName":"luau code here",...}}. Create multiple Luau scripts for a functional game.${context ? `\n\nContext:\n${context}` : ""}`,
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 12000,
  }, userId);
  try {
    const clean = content.replace(/^```json?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(clean);
  } catch {
    return { placeName: "VELORIS Game", scripts: { "MainScript": content } };
  }
}

async function aiGenerateMultipleFiles(prompt: string, context: string | undefined, userId: string): Promise<Record<string, string>> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      {
        role: "system",
        content: `Generate a ZIP project as JSON: {"filename.ext":"file content","path/file.ext":"content",...}. Create a complete, functional project.${context ? `\n\nContext:\n${context}` : ""}`,
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 16000,
  }, userId);
  try {
    const clean = content.replace(/^```json?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(clean);
  } catch {
    return { "README.md": content };
  }
}
