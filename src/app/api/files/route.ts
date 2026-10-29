import { db } from "@/db";
import { files } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json } from "@/lib/http";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MAX = 8 * 1024 * 1024;
const AUDIO_MAX = 24 * 1024 * 1024;
const DOC_MAX = 8 * 1024 * 1024;

const DOC_MIMES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/xml",
  "application/xml",
  "text/html",
  "text/rtf",
  "application/rtf",
  "text/javascript",
  "application/javascript",
  "text/x-python",
  "application/x-yaml",
  "text/yaml",
]);

function kindOf(mime: string, name: string): "image" | "audio" | "video" | "doc" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "video/webm" || mime === "audio/mp4" || mime === "video/mp4") return "audio"; // recorded mic audio may arrive as mp4/webm
  if (DOC_MIMES.has(mime) || mime.startsWith("text/")) return "doc";
  // extension fallbacks
  if (/\.(txt|md|csv|json|xml|html?|rtf|log|ya?ml|py|js|ts|tsx|css)$/i.test(name)) return "doc";
  return null;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("Expected multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return err("No file provided.");

  const mime = file.type || "application/octet-stream";
  const kind = form.get("kind") === "generated" ? "generated" : kindOf(mime, file.name);
  if (!kind) return err(`Unsupported file type: ${mime}`, 415);

  const max = kind === "image" ? IMAGE_MAX : kind === "audio" ? AUDIO_MAX : DOC_MAX;
  if (file.size > max) return err(`File too large (max ${Math.round(max / 1024 / 1024)}MB for ${kind}).`, 413);

  const bytes = Buffer.from(await file.arrayBuffer());
  const [inserted] = await db
    .insert(files)
    .values({
      userId: user.id,
      name: file.name.slice(0, 240) || "file",
      mime,
      size: bytes.length,
      data: bytes.toString("base64"),
      kind: form.get("kind") === "generated" ? "generated" : "upload",
    })
    .returning({ id: files.id });

  return json({
    ok: true,
    file: {
      id: inserted.id,
      name: file.name,
      mime,
      kind,
      size: bytes.length,
      url: `/api/files/${inserted.id}`,
    },
  });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const rows = await db
    .select({ id: files.id, name: files.name, mime: files.mime, size: files.size, kind: files.kind, meta: files.meta, createdAt: files.createdAt })
    .from(files)
    .where(eq(files.userId, user.id))
    .orderBy(desc(files.createdAt))
    .limit(50);
  return json({ ok: true, files: rows.map((f) => ({ ...f, url: `/api/files/${f.id}` })) });
}
