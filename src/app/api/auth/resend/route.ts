import { db } from "@/db";
import { users, verificationCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode, sha256 } from "@/lib/password";
import { sendVerificationEmail, smtpConfigured } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";
import { err, json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson<{ email?: string }>(req);
  const email = (body?.email ?? "").trim().toLowerCase();
  if (!email) return err("Email is required.");

  const rl = rateLimit(`resend:${email}`, 3, 10 * 60_000);
  if (!rl.ok) return err(`Please wait ${rl.retryAfter}s before requesting another code.`, 429);

  const ures = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = ures[0];
  if (!user) return err("Account not found.", 404);
  if (user.emailVerified) return err("This account is already verified.", 409);

  const code = randomCode();
  await db.delete(verificationCodes).where(and(eq(verificationCodes.email, email), eq(verificationCodes.type, "verify")));
  await db.insert(verificationCodes).values({
    userId: user.id,
    email,
    type: "verify",
    codeHash: sha256(code + (process.env.SESSION_SECRET ?? "")),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });

  let sent = false;
  try {
    sent = await sendVerificationEmail(email, code, user.name);
  } catch (e) {
    console.error("SMTP send failed:", e);
  }
  return json({ ok: true, emailSent: sent, devCode: smtpConfigured() ? undefined : code });
}
