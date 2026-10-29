import { db } from "@/db";
import { conversations } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { and, desc, eq, ilike } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  const cond = q ? and(eq(conversations.userId, user.id), ilike(conversations.title, `%${q.slice(0, 80)}%`)) : eq(conversations.userId, user.id);
  const rows = await db
    .select({ id: conversations.id, title: conversations.title, model: conversations.model, createdAt: conversations.createdAt, updatedAt: conversations.updatedAt })
    .from(conversations)
    .where(cond)
    .orderBy(desc(conversations.updatedAt))
    .limit(200);
  return json({ ok: true, conversations: rows });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const body = await readJson<{ title?: string; model?: string }>(req);
  const title = (body?.title ?? "New chat").slice(0, 200);
  const model = body?.model ?? "openai/gpt-5.4-nano";
  const [c] = await db
    .insert(conversations)
    .values({ userId: user.id, title, model })
    .returning();
  return json({ ok: true, conversation: c });
}
