import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { err, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";
  if (!email || !password) return err("Email and password are required.");

  const rl = rateLimit(`login:${clientIp(req)}:${email}`, 10, 15 * 60_000);
  if (!rl.ok) return err(`Too many login attempts. Retry in ${rl.retryAfter}s.`, 429);

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) {
    return err("No account exists with this email — create one below.", 401, { unknownEmail: true });
  }
  if (!verifyPassword(password, user.passwordHash)) {
    return err("Incorrect password.", 401);
  }
  if (!user.emailVerified) {
    return json({ ok: false, needsVerification: true, email }, 403);
  }

  await createSession(user.id, req.headers.get("user-agent") ?? undefined);
  return json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan },
  });
}
