import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { asc, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function owned(convId: string, userId: string) {
  const rows = await db.select().from(conversations).where(eq(conversations.id, convId)).limit(1);
  const c = rows[0];
  if (!c || c.userId !== userId) return null;
  return c;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  const conv = await owned(id, user.id);
  if (!conv) return err("Conversation not found.", 404);
  const msgs = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      model: messages.model,
      attachments: messages.attachments,
      meta: messages.meta,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt))
    .limit(400);
  return json({ ok: true, conversation: conv, messages: msgs });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  const conv = await owned(id, user.id);
  if (!conv) return err("Conversation not found.", 404);
  const body = await readJson<{ title?: string }>(req);
  const title = (body?.title ?? "").trim().slice(0, 200);
  if (!title) return err("Title cannot be empty.");
  await db.update(conversations).set({ title }).where(eq(conversations.id, conv.id));
  return json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  const conv = await owned(id, user.id);
  if (!conv) return err("Conversation not found.", 404);
  await db.delete(conversations).where(eq(conversations.id, conv.id));
  return json({ ok: true });
}
