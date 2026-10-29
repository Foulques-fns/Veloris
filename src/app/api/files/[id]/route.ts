import { db } from "@/db";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/session";
import { err } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;

  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const file = rows[0];
  if (!file) return err("File not found.", 404);
  if (file.userId !== user.id && user.role !== "admin") return err("Forbidden.", 403);

  const bytes = Buffer.from(file.data, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `${file.mime.startsWith("image/") || file.mime.startsWith("audio/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    },
  });
}
