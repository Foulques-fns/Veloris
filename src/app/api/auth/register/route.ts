import { db } from "@/db";
import { users, verificationCodes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword, randomCode, sha256 } from "@/lib/password";
import { sendVerificationEmail, smtpConfigured } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { err, json, readJson } from "@/lib/http";
import { getFeatures } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const features = await getFeatures();
  if (!features.registration) return err("Registration is temporarily disabled.", 403);

  const rl = rateLimit(`register:${clientIp(req)}`, 10, 60 * 60_000);
  if (!rl.ok) return err("Too many attempts. Try again later.", 429);

  const body = await readJson<{ name?: string; email?: string; password?: string }>(req);
  const name = (body?.name ?? "").trim();
  const email = (body?.email ?? "").trim().toLowerCase();
  const password = body?.password ?? "";

  if (!name || name.length > 120) return err("Please enter your name.");
  if (!EMAIL_RE.test(email)) return err("Please enter a valid email address.");
  if (password.length < 8) return err("Password must be at least 8 characters.");
  if (password.length > 200) return err("Password is too long.");

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return err("An account with this email already exists.", 409);

  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash: hashPassword(password) })
    .returning({ id: users.id });

  const code = randomCode();
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  // Invalidate previous codes for this email, then insert fresh one.
  await db.delete(verificationCodes).where(and(eq(verificationCodes.email, email), eq(verificationCodes.type, "verify")));
  await db.insert(verificationCodes).values({
    userId: user.id,
    email,
    type: "verify",
    codeHash: sha256(code + (process.env.SESSION_SECRET ?? "")),
    expiresAt,
  });

  let sent = false;
  try {
    sent = await sendVerificationEmail(email, code, name);
  } catch (e) {
    console.error("SMTP send failed:", e);
  }

  return json({
    ok: true,
    needsVerification: true,
    email,
    emailSent: sent,
    // Surface the code only when SMTP is not configured (local dev / self-host convenience).
    devCode: process.env.NODE_ENV === "development" && !smtpConfigured() ? code : undefined,
  });
}
