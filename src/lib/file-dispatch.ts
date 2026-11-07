/**
 * Direct file generation dispatcher.
 * Called from the chat route — no HTTP round-trip, no localhost dependency.
 */

import { db } from "@/db";
import { files } from "@/db/schema";
import { chatCompletion } from "./pollinations";
import {
  generateDocx, generateXlsx, generateCsv, generatePptx,
  generatePdf, generateTxt, generateJson, generateXml,
  generateCode, generateZip, generateRobloxScript, generateRbxlx,
  generateObj, generateGltf, generateStl, generateSql, generateMarkdown,
  type DocxSpec, type XlsxSpec, type PptxSlide,
} from "./file-generators";

type FileResult = {
  id: string; name: string; url: string; mime: string; fileType: string; size: number; prompt: string;
};

type GenInput = {
  prompt: string;
  fileType: string;
  baseName: string;
  userId: string;
  context?: string;
};

async function aiText(prompt: string, context: string | undefined, userId: string, format: string): Promise<string> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      { role: "system", content: `You are an expert file generator. Generate ONLY the raw ${format} content. No explanations, no markdown code fences.${context ? `\n\nConversation context:\n${context}` : ""}` },
      { role: "user", content: prompt },
    ],
    max_tokens: 16000,
  }, userId);
  return content.replace(/^```[\w]*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
}

async function aiJson<T>(prompt: string, context: string | undefined, userId: string, schema: string, fallback: T): Promise<T> {
  const { content } = await chatCompletion({
    model: "openai/gpt-6.1-terra",
    messages: [
      { role: "system", content: `Generate data as valid JSON only: ${schema}${context ? `\n\nContext:\n${context}` : ""}` },
      { role: "user", content: prompt },
    ],
    max_tokens: 8000,
  }, userId);
  try {
    const clean = content.replace(/^```json?\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

export async function generateFileDirectly(input: GenInput): Promise<FileResult> {
  const { prompt, fileType: rawType, baseName, userId, context } = input;
  const fileType = rawType.toLowerCase().replace(/^\./, "");

  let buffer: Buffer;
  let mime: string;
  let filename: string;

  if (fileType === "docx" || fileType === "pdf") {
    const spec = await aiJson<DocxSpec>(prompt, context, userId,
      `{"title":"string","sections":[{"heading":"string","level":1,"paragraphs":["..."]}]}`,
      { title: baseName, sections: [{ paragraphs: [prompt] }] }
    );
    if (fileType === "pdf") {
      const r = await generatePdf(spec, baseName);
      ({ buffer, mime, filename } = r);
    } else {
      const r = await generateDocx(spec, baseName);
      ({ buffer, mime, filename } = r);
    }
  } else if (fileType === "xlsx") {
    const spec = await aiJson<XlsxSpec>(prompt, context, userId,
      `{"sheets":[{"name":"Sheet","headers":["Col1"],"rows":[["value"]]}]}`,
      { sheets: [{ name: "Data", headers: ["Item"], rows: [["Generated"]] }] }
    );
    const r = generateXlsx(spec, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "csv") {
    const spec = await aiJson<{ headers: string[]; rows: (string | number | null)[][] }>(prompt, context, userId,
      `{"headers":["Col1"],"rows":[["value"]]}`,
      { headers: ["Data"], rows: [["Generated"]] }
    );
    const r = generateCsv(spec.headers, spec.rows, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "pptx") {
    const spec = await aiJson<{ title: string; slides: PptxSlide[] }>(prompt, context, userId,
      `{"title":"Presentation","slides":[{"title":"Slide","bullets":["Point 1"]}]}`,
      { title: baseName, slides: [{ title: "Introduction", bullets: [prompt] }] }
    );
    const r = await generatePptx(spec.slides, spec.title, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "txt") {
    const content = await aiText(prompt, context, userId, "plain text");
    const r = generateTxt(content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "md") {
    const content = await aiText(prompt, context, userId, "Markdown");
    const r = generateMarkdown(content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "json") {
    const content = await aiText(prompt, context, userId, "JSON");
    const r = generateJson(content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "xml") {
    const content = await aiText(prompt, context, userId, "XML");
    const r = generateXml(content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "sql") {
    const content = await aiText(prompt, context, userId, "SQL");
    const r = generateSql(content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "lua") {
    const content = await aiText(prompt, context, userId, "Luau (Roblox) script");
    const r = generateRobloxScript(baseName, content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "rbxlx") {
    const spec = await aiJson<{ placeName: string; scripts: Record<string, string> }>(prompt, context, userId,
      `{"placeName":"Game","scripts":{"MainScript":"luau code"}}`,
      { placeName: baseName, scripts: { MainScript: prompt } }
    );
    const r = generateRbxlx(spec.placeName, spec.scripts, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "obj") {
    const content = await aiText(prompt, context, userId, "Wavefront OBJ 3D model");
    const r = generateObj(baseName, content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "gltf") {
    const content = await aiText(prompt, context, userId, "valid glTF 2.0 JSON");
    try {
      const r = generateGltf(JSON.parse(content), baseName);
      ({ buffer, mime, filename } = r);
    } catch {
      const r = generateTxt(content, baseName);
      ({ buffer, mime } = r); filename = `${baseName}.gltf`;
    }
  } else if (fileType === "stl") {
    const content = await aiText(prompt, context, userId, "ASCII STL 3D model");
    const r = generateStl(content, baseName);
    ({ buffer, mime, filename } = r);
  } else if (fileType === "zip") {
    const spec = await aiJson<Record<string, string>>(prompt, context, userId,
      `{"filename.ext":"file content"}`,
      { "README.md": prompt }
    );
    const r = await generateZip(spec, baseName);
    ({ buffer, mime, filename } = r);
  } else {
    // Generic code file
    const langMap: Record<string, string> = {
      py: "Python", js: "JavaScript", ts: "TypeScript", html: "HTML",
      css: "CSS", java: "Java", cpp: "C++", php: "PHP", rs: "Rust",
      go: "Go", rb: "Ruby", kt: "Kotlin", swift: "Swift", sh: "Bash",
    };
    const content = await aiText(prompt, context, userId, langMap[fileType] || fileType);
    const r = generateCode(content, fileType, baseName);
    ({ buffer, mime, filename } = r);
  }

  // Persist to DB
  const [saved] = await db
    .insert(files)
    .values({
      userId,
      name: filename,
      mime,
      size: buffer.length,
      data: buffer.toString("base64"),
      kind: "generated",
      meta: { prompt: prompt.slice(0, 500), type: "file", fileType },
    })
    .returning({ id: files.id });

  return {
    id: saved.id,
    name: filename,
    url: `/api/files/${saved.id}`,
    mime,
    fileType,
    size: buffer.length,
    prompt: prompt.slice(0, 200),
  };
}
