import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { getSessionUser } from "@/lib/session";
import { err, json, readJson } from "@/lib/http";
import { and, eq, gt } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function ownedMessage(id: string, userId: string) {
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  const msg = rows[0];
  if (!msg) return null;
  const conv = (await db.select().from(conversations).where(eq(conversations.id, msg.conversationId)).limit(1))[0];
  if (!conv || conv.userId !== userId) return null;
  return { msg, conv };
}

/** Edit a message: updates content and removes everything after it in the conversation. */
export async function PATCH(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  const found = await ownedMessage(id, user.id);
  if (!found) return err("Message not found.", 404);
  const body = await readJson<{ content?: string }>(req);
  const content = (body?.content ?? "").trim();
  if (!content || content.length > 16000) return err("Message must be 1–16000 characters.");

  await db
    .delete(messages)
    .where(and(eq(messages.conversationId, found.msg.conversationId), gt(messages.createdAt, found.msg.createdAt)));
  await db.update(messages).set({ content }).where(eq(messages.id, found.msg.id));
  return json({ ok: true, conversationId: found.msg.conversationId });
}

/** Delete a message; `onlySelf=false` (default) also deletes everything after it. */
export async function DELETE(req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const { id } = await ctx.params;
  const found = await ownedMessage(id, user.id);
  if (!found) return err("Message not found.", 404);

  const onlySelf = new URL(req.url).searchParams.get("onlySelf") === "1";
  if (!onlySelf) {
    await db
      .delete(messages)
      .where(and(eq(messages.conversationId, found.msg.conversationId), gt(messages.createdAt, found.msg.createdAt)));
  }
  await db.delete(messages).where(eq(messages.id, found.msg.id));
  return json({ ok: true, conversationId: found.msg.conversationId });
}
