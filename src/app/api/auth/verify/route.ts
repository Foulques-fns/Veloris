import { db } from "@/db";
import { users, verificationCodes } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { sha256 } from "@/lib/password";
import { createSession } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { err, json, readJson, ADMIN_EMAIL } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = rateLimit(`verify:${clientIp(req)}`, 15, 15 * 60_000);
  if (!rl.ok) return err(`Too many attempts. Retry in ${rl.retryAfter}s.`, 429);

  const body = await readJson<{ email?: string; code?: string }>(req);
  const email = (body?.email ?? "").trim().toLowerCase();
  const code = (body?.code ?? "").trim();
  if (!email || !code) return err("Email and code are required.");

  const rows = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.type, "verify"),
        isNull(verificationCodes.consumedAt),
        gt(verificationCodes.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const record = rows[0];
  if (!record) return err("Code expired or not found. Request a new one.", 410);
  if (record.attempts >= 8) return err("Too many wrong attempts. Request a new code.", 429);

  const candidate = sha256(code + (process.env.SESSION_SECRET ?? ""));
  if (candidate !== record.codeHash) {
    await db.update(verificationCodes).set({ attempts: record.attempts + 1 }).where(eq(verificationCodes.id, record.id));
    return err("Incorrect code.");
  }

  await db.update(verificationCodes).set({ consumedAt: new Date() }).where(eq(verificationCodes.id, record.id));

  const ures = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = ures[0];
  if (!user) return err("Account not found.", 404);

  const isBootstrapAdmin = email === ADMIN_EMAIL;
  await db
    .update(users)
    .set({
      emailVerified: true,
      // Backend-enforced: only the verified bootstrap address can receive ADMIN.
      ...(isBootstrapAdmin ? { role: "admin" } : {}),
    })
    .where(eq(users.id, user.id));

  await createSession(user.id, req.headers.get("user-agent") ?? undefined);

  return json({
    ok: true,
    user: {
      id: user.id,
      email,
      name: user.name,
      role: isBootstrapAdmin ? "admin" : user.role,
      plan: user.plan,
    },
  });
}
