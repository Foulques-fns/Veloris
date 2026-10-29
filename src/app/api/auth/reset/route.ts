import { db } from "@/db";
import { users, verificationCodes, sessions } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hashPassword, sha256 } from "@/lib/password";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { err, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(`reset:${clientIp(req)}`, 10, 15 * 60_000);
  if (!rl.ok) return err("Too many attempts. Try again later.", 429);

  const body = await readJson<{ email?: string; code?: string; password?: string }>(req);
  const email = (body?.email ?? "").trim().toLowerCase();
  const code = (body?.code ?? "").trim();
  const password = body?.password ?? "";
  if (!email || !code) return err("Email and code are required.");
  if (password.length < 8) return err("Password must be at least 8 characters.");

  const rows = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.type, "reset"),
        isNull(verificationCodes.consumedAt),
        gt(verificationCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const record = rows[0];
  if (!record) return err("Reset code expired or not found.", 410);
  if (record.attempts >= 8) return err("Too many wrong attempts. Request a new code.", 429);

  const candidate = sha256(code + (process.env.SESSION_SECRET ?? ""));
  if (candidate !== record.codeHash) {
    await db.update(verificationCodes).set({ attempts: record.attempts + 1 }).where(eq(verificationCodes.id, record.id));
    return err("Incorrect code.");
  }

  await db.update(verificationCodes).set({ consumedAt: new Date() }).where(eq(verificationCodes.id, record.id));
  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.email, email));
  // Force re-authentication everywhere.
  const u = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (u[0]) await db.delete(sessions).where(eq(sessions.userId, u[0].id));

  return json({ ok: true });
}
