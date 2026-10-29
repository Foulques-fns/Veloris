import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, resetOpenUserCache } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { err, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return err("Not authenticated.", 401);
  const body = await readJson<{
    name?: string;
    customInstructions?: string;
    personality?: string;
    currentPassword?: string;
    newPassword?: string;
  }>(req);

  const patch: Partial<typeof users.$inferInsert> = {};
  if (body?.name !== undefined) {
    const name = body.name.trim();
    if (!name || name.length > 120) return err("Name must be 1–120 characters.");
    patch.name = name;
  }
  if (body?.customInstructions !== undefined) {
    if (body.customInstructions.length > 4000) return err("Custom instructions too long (max 4000 chars).");
    patch.customInstructions = body.customInstructions;
  }
  if (body?.personality !== undefined) {
    const allowed = new Set(["default", "professional", "friendly", "creative", "concise", "coder", "teacher"]);
    if (!allowed.has(body.personality)) return err("Invalid personality.");
    patch.personality = body.personality;
  }

  if (body?.newPassword !== undefined) {
    const row = (await db.select().from(users).where(eq(users.id, user.id)).limit(1))[0];
    if (!row) return err("Account not found.", 404);
    if (!verifyPassword(body.currentPassword ?? "", row.passwordHash)) return err("Current password is incorrect.", 401);
    if (body.newPassword.length < 8) return err("New password must be at least 8 characters.");
    patch.passwordHash = hashPassword(body.newPassword);
  }

  if (Object.keys(patch).length === 0) return err("Nothing to update.");
  await db.update(users).set(patch).where(eq(users.id, user.id));
  resetOpenUserCache();

  // On password change, invalidate other sessions (the current one is refreshed implicitly).
  if (patch.passwordHash) {
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    return json({ ok: true, relogin: true });
  }
  return json({ ok: true });
}
