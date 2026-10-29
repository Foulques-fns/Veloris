import { db } from "@/db";
import { users, verificationCodes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { randomCode, sha256 } from "@/lib/password";
import { sendResetEmail, smtpConfigured } from "@/lib/email";
import { rateLimit } from "@/lib/ratelimit";
import { json, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJson<{ email?: string }>(req);
  const email = (body?.email ?? "").trim().toLowerCase();
  if (!email) return json({ ok: true });

  const rl = rateLimit(`forgot:${email}`, 3, 10 * 60_000);
  if (!rl.ok) return json({ ok: true }); // do not leak throttling for account probing

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (user) {
    const code = randomCode();
    await db.delete(verificationCodes).where(and(eq(verificationCodes.email, email), eq(verificationCodes.type, "reset")));
    await db.insert(verificationCodes).values({
      userId: user.id,
      email,
      type: "reset",
      codeHash: sha256(code + (process.env.SESSION_SECRET ?? "")),
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    try {
      await sendResetEmail(email, code);
    } catch (e) {
      console.error("SMTP send failed:", e);
    }
    // Dev convenience when SMTP is not configured.
    return json({ ok: true, devCode: smtpConfigured() ? undefined : code });
  }
  return json({ ok: true });
}
