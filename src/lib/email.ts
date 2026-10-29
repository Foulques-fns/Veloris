import nodemailer from "nodemailer";

type SmtpConfig = { host: string; port: number; user: string; pass: string; secure: boolean; from: string };

// Resend is the preferred mail provider. SMTP remains as a backwards-compatible fallback.
export function smtpConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

function getSmtpConfig(): SmtpConfig | null {
  if (!process.env.SMTP_HOST) return null;
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    secure: process.env.SMTP_SECURE === "true",
    from: process.env.SMTP_FROM || "VELORIS <no-reply@localhost>",
  };
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) throw new Error("RESEND_FROM_EMAIL must be configured when RESEND_API_KEY is set.");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend email request failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    return true;
  }
  const cfg = getSmtpConfig();
  if (!cfg) {
    // Local development fallback only; no email provider configured.
    console.log(`[email:dev] No mail provider configured. Email to ${to} was not sent.`);
    return false;
  }
  const transporter = nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transporter.sendMail({ from: cfg.from, to, subject, html });
  return true;
}

function emailShell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#050505;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#101010;border:1px solid #332817;border-radius:16px;padding:36px;color:#f1eadc;">
    <div style="font-size:20px;font-weight:700;letter-spacing:0.22em;color:#d8b56d;">VELORIS</div>
    <h1 style="font-size:18px;font-weight:600;margin:24px 0 8px;color:#f5ead3;">${title}</h1>
    ${body}
    <p style="color:#888173;font-size:12px;margin-top:32px;">If you didn't request this, you can safely ignore this email.</p>
  </div></body></html>`;
}

export async function sendVerificationEmail(to: string, code: string, name: string): Promise<boolean> {
  const body = `<p style="color:#b9b1a2;font-size:14px;line-height:1.6;">Hi ${'${escapeHtml(name)}'}, welcome to VELORIS. Enter this verification code to activate your account. It expires in 5 minutes.</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;padding:24px;background:#080706;border:1px solid #574322;border-radius:12px;margin:20px 0;color:#e5c17b;">${'${code}'}</div>`;
  return sendMail(to, "Your VELORIS verification code", emailShell("Verify your email", body));
}

export async function sendResetEmail(to: string, code: string): Promise<boolean> {
  const body = `<p style="color:#b9b1a2;font-size:14px;line-height:1.6;">Use this code to reset your password. It expires in 5 minutes and can only be used once.</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;padding:24px;background:#080706;border:1px solid #574322;border-radius:12px;margin:20px 0;color:#e5c17b;">${'${code}'}</div>`;
  return sendMail(to, "Reset your VELORIS password", emailShell("Password reset", body));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] ?? c);
}
