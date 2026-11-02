/**
 * Email service — uses Resend when RESEND_API_KEY is configured,
 * falls back to Nodemailer (SMTP_HOST) for self-hosted setups,
 * and console-logs in dev if neither is available.
 * The API key is NEVER exposed to the frontend.
 */

import nodemailer from "nodemailer";

// ── Resend ──────────────────────────────────────────────────────────────────

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM_EMAIL || "VELORIS <no-reply@veloris.ai>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

// ── Nodemailer (fallback) ───────────────────────────────────────────────────

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

async function sendViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const from = process.env.SMTP_FROM || "VELORIS <no-reply@localhost>";
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
        : undefined,
  });
  await transporter.sendMail({ from, to, subject, html });
  return true;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Returns true if any email provider is configured (Resend or SMTP). */
export function emailConfigured(): boolean {
  return resendConfigured() || smtpConfigured();
}

/** @deprecated kept for backward-compatibility — call emailConfigured() instead */
export function smtpIsConfigured(): boolean {
  return emailConfigured();
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (resendConfigured()) {
    return sendViaResend(to, subject, html);
  }
  if (smtpConfigured()) {
    return sendViaSmtp(to, subject, html);
  }
  // Dev fallback — print to server console (code shown in UI separately).
  console.log(`\n[email:dev] To: ${to}\n[email:dev] Subject: ${subject}\n${html.replace(/<[^>]+>/g, " ").trim()}\n`);
  return false;
}

// ── Templates ───────────────────────────────────────────────────────────────

function emailShell(title: string, body: string): string {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#000000;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#0c0c0c;border:1px solid #2a2010;border-radius:18px;padding:40px;color:#e8e4d0;">

    <!-- Logo + wordmark -->
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:32px;">
      <div style="width:44px;height:44px;background:linear-gradient(135deg,#c9a227,#f5d96e,#a07810);border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <span style="font-size:22px;font-weight:900;color:#000;font-family:Georgia,serif;line-height:1;">V</span>
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;letter-spacing:0.12em;background:linear-gradient(90deg,#c9a227,#f5d96e);-webkit-background-clip:text;background-clip:text;color:transparent;font-family:Georgia,'Times New Roman',serif;">VELORIS</div>
        <div style="font-size:11px;color:#7a6a40;letter-spacing:0.06em;text-transform:uppercase;margin-top:2px;">Intelligence Premium</div>
      </div>
    </div>

    <!-- Divider -->
    <div style="height:1px;background:linear-gradient(90deg,transparent,#c9a22760,transparent);margin-bottom:28px;"></div>

    <h1 style="font-size:20px;font-weight:700;margin:0 0 12px;color:#f0ead6;letter-spacing:-0.01em;">${title}</h1>
    ${body}

    <!-- Footer -->
    <div style="height:1px;background:linear-gradient(90deg,transparent,#c9a22740,transparent);margin:28px 0 20px;"></div>
    <p style="color:#4a4030;font-size:12px;margin:0;line-height:1.6;">
      Si vous n'avez pas effectué cette demande, ignorez cet e-mail en toute sécurité.<br/>
      © VELORIS — Intelligence Artificielle Premium
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

export async function sendVerificationEmail(to: string, code: string, name: string): Promise<boolean> {
  const body = `
    <p style="color:#b8a870;font-size:14px;line-height:1.7;margin:0 0 20px;">
      Bienvenue, ${escapeHtml(name)}. Pour activer votre compte VELORIS, entrez le code de vérification ci-dessous.
      Ce code est valable <strong style="color:#f0ead6;">5 minutes</strong> et ne peut être utilisé qu'une seule fois.
    </p>
    <div style="background:#08080a;border:1px solid #3a2c10;border-radius:14px;padding:28px 20px;text-align:center;margin:0 0 20px;">
      <div style="font-size:42px;font-weight:900;letter-spacing:14px;color:#c9a227;font-family:'Courier New',monospace;text-shadow:0 0 30px rgba(201,162,39,0.4);">${code}</div>
      <div style="font-size:12px;color:#6a5a30;margin-top:10px;letter-spacing:0.05em;">CODE DE VÉRIFICATION</div>
    </div>
    <p style="color:#7a6a40;font-size:13px;line-height:1.6;margin:0;">
      Ne partagez jamais ce code. L'équipe VELORIS ne vous le demandera jamais.
    </p>`;
  return sendMail(to, "Votre code de vérification VELORIS", emailShell("Vérifiez votre e-mail", body));
}

export async function sendResetEmail(to: string, code: string): Promise<boolean> {
  const body = `
    <p style="color:#b8a870;font-size:14px;line-height:1.7;margin:0 0 20px;">
      Vous avez demandé la réinitialisation de votre mot de passe VELORIS. Utilisez le code ci-dessous.
      Il expire dans <strong style="color:#f0ead6;">5 minutes</strong> et ne peut être utilisé qu'une seule fois.
    </p>
    <div style="background:#08080a;border:1px solid #3a2c10;border-radius:14px;padding:28px 20px;text-align:center;margin:0 0 20px;">
      <div style="font-size:42px;font-weight:900;letter-spacing:14px;color:#c9a227;font-family:'Courier New',monospace;text-shadow:0 0 30px rgba(201,162,39,0.4);">${code}</div>
      <div style="font-size:12px;color:#6a5a30;margin-top:10px;letter-spacing:0.05em;">CODE DE RÉINITIALISATION</div>
    </div>
    <p style="color:#7a6a40;font-size:13px;line-height:1.6;margin:0;">
      Si vous n'avez pas demandé cette réinitialisation, ignorez cet e-mail.
    </p>`;
  return sendMail(to, "Réinitialisation de votre mot de passe VELORIS", emailShell("Réinitialisation du mot de passe", body));
}
