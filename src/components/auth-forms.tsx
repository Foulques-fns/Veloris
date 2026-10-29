"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, KeyRound, MailCheck } from "lucide-react";
import { Logo, Spinner, Toaster, toast } from "./ui";

export function AuthShell({ children, title, sub }: { children: ReactNode; title: string; sub?: string }) {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <div className="aurora"><div className="a1" /><div className="a2" /><div className="a3" /></div>
      <div className="relative z-10 w-full max-w-md anim-fade-up">
        <div className="panel rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-2.5 mb-7">
            <Logo size={34} />
            <div>
              <div className="font-semibold tracking-tight leading-none">VELORIS</div>
              <div className="text-[11px] text-muted mt-1">free &amp; open intelligence</div>
            </div>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {sub && <p className="text-sm text-muted mt-1.5 mb-6 leading-relaxed">{sub}</p>}
          {!sub && <div className="mb-6" />}
          {children}
        </div>
        <p className="text-center text-xs text-muted mt-5">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-[var(--accent)]"><ArrowLeft className="w-3 h-3" /> Back to home</Link>
        </p>
      </div>
      <Toaster />
    </div>
  );
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] font-medium text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ msg: string; unknownEmail?: boolean } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { res, data } = await post("/api/auth/login", { email: fd.get("email"), password: fd.get("password") });
    setLoading(false);
    if (data.needsVerification) {
      router.push(`/verify?email=${encodeURIComponent(data.email)}`);
      return;
    }
    if (!res.ok || !data.ok) return setError({ msg: data.error || "Login failed.", unknownEmail: !!data.unknownEmail });
    router.push("/chat");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error && (
        <p className="text-sm text-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] border border-[color-mix(in_srgb,var(--bad)_30%,transparent)] rounded-lg px-3 py-2 mb-4">
          {error.msg}
          {error.unknownEmail && <> <Link href="/register" className="font-medium underline underline-offset-2">Create account</Link></>}
        </p>
      )}
      <Field label="Email"><input name="email" type="email" required className="input" placeholder="you@example.com" autoComplete="email" /></Field>
      <Field label="Password"><input name="password" type="password" required className="input" placeholder="••••••••" autoComplete="current-password" /></Field>
      <button className="btn btn-primary w-full !py-2.5" disabled={loading}>{loading && <Spinner />} Sign in</button>
      <div className="flex items-center justify-between mt-4 text-sm">
        <Link href="/forgot" className="text-muted hover:text-[var(--accent)]">Forgot password?</Link>
        <Link href="/register" className="text-muted hover:text-[var(--accent)]">Create account</Link>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    if (password !== fd.get("confirm")) {
      setLoading(false);
      return setError("Passwords do not match.");
    }
    const { res, data } = await post("/api/auth/register", { name: fd.get("name"), email: fd.get("email"), password });
    setLoading(false);
    if (!res.ok || !data.ok) return setError(data.error || "Registration failed.");
    const dev = data.devCode ? `&dev=${data.devCode}` : "";
    router.push(`/verify?email=${encodeURIComponent(data.email)}${dev}`);
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <p className="text-sm text-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] border border-[color-mix(in_srgb,var(--bad)_30%,transparent)] rounded-lg px-3 py-2 mb-4">{error}</p>}
      <Field label="Name"><input name="name" required maxLength={120} className="input" placeholder="Your name" autoComplete="name" /></Field>
      <Field label="Email"><input name="email" type="email" required className="input" placeholder="you@example.com" autoComplete="email" /></Field>
      <Field label="Password"><input name="password" type="password" required minLength={8} className="input" placeholder="At least 8 characters" autoComplete="new-password" /></Field>
      <Field label="Confirm password"><input name="confirm" type="password" required minLength={8} className="input" placeholder="Repeat your password" autoComplete="new-password" /></Field>
      <button className="btn btn-primary w-full !py-2.5" disabled={loading}>{loading && <Spinner />} Create account</button>
      <p className="text-sm mt-4 text-muted">Already registered? <Link href="/login" className="hover:text-[var(--accent)]">Sign in</Link></p>
    </form>
  );
}

export function VerifyForm({ email, devCode }: { email: string; devCode?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [resendWait, setResendWait] = useState(60);

  useEffect(() => {
    if (resendWait <= 0) return;
    const timer = window.setTimeout(() => setResendWait((v) => Math.max(0, v - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendWait]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { res, data } = await post("/api/auth/verify", { email, code });
    setLoading(false);
    if (!res.ok || !data.ok) return setError(data.error || "Verification failed.");
    toast("Welcome to VELORIS", "ok");
    router.push(data.user?.role === "admin" ? "/admin" : "/chat");
    router.refresh();
  }

  async function resend() {
    setResending(true);
    const { res, data } = await post("/api/auth/resend", { email });
    setResending(false);
    if (!res.ok || !data.ok) return toast(data.error || "Could not resend code.", "bad");
    setResendWait(60);
    toast(data.emailSent ? "A new code was sent to your email." : "New code generated.", "ok");
  }

  return (
    <form onSubmit={onSubmit}>
      {devCode && (
        <p className="text-xs text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] rounded-lg px-3 py-2 mb-4">
          SMTP is not configured, so here is your development verification code: <b className="font-mono tracking-widest">{devCode}</b>
        </p>
      )}
      {error && <p className="text-sm text-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] border border-[color-mix(in_srgb,var(--bad)_30%,transparent)] rounded-lg px-3 py-2 mb-4">{error}</p>}
      <div className="flex items-center gap-2 text-sm text-muted mb-4"><MailCheck className="w-4 h-4 text-[var(--accent)]" /> We sent a 6-digit code to <b className="text-[var(--text)]">{email}</b></div>
      <Field label="Verification code">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input text-center !text-2xl font-semibold font-mono !tracking-[0.55em] !py-3"
          placeholder="••••••"
          inputMode="numeric"
          autoFocus
          required
        />
      </Field>
      <button className="btn btn-primary w-full !py-2.5" disabled={loading || code.length !== 6}>{loading && <Spinner />} Verify &amp; continue</button>
      <div className="flex items-center justify-between mt-4 text-sm">
        <button type="button" onClick={resend} disabled={resending || resendWait > 0} className="text-muted hover:text-[var(--accent)] inline-flex items-center gap-1.5">{resending && <Spinner className="w-3.5 h-3.5" />} {resendWait > 0 ? `Resend code in ${resendWait}s` : "Resend code"}</button>
        <Link href="/login" className="text-muted hover:text-[var(--accent)]">Back to sign in</Link>
      </div>
    </form>
  );
}

export function ForgotForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const { data } = await post("/api/auth/forgot", { email });
    setLoading(false);
    toast("If that account exists, a reset code was sent.", "ok");
    const dev = data.devCode ? `&dev=${data.devCode}` : "";
    router.push(`/reset?email=${encodeURIComponent(email)}${dev}`);
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Email"><input name="email" type="email" required className="input" placeholder="you@example.com" autoComplete="email" /></Field>
      <button className="btn btn-primary w-full !py-2.5" disabled={loading}>{loading && <Spinner />} Send reset code</button>
      <p className="text-sm mt-4 text-muted">Remembered it? <Link href="/login" className="hover:text-[var(--accent)]">Sign in</Link></p>
    </form>
  );
}

export function ResetForm({ email, devCode }: { email: string; devCode?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get("password") ?? "");
    if (pw !== fd.get("confirm")) return setError("Passwords do not match.");
    setLoading(true);
    const { res, data } = await post("/api/auth/reset", { email, code, password: pw });
    setLoading(false);
    if (!res.ok || !data.ok) return setError(data.error || "Reset failed.");
    toast("Password updated — sign in with your new password.", "ok");
    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit}>
      {devCode && (
        <p className="text-xs text-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] rounded-lg px-3 py-2 mb-4">
          SMTP is not configured, so here is your development reset code: <b className="font-mono tracking-widest">{devCode}</b>
        </p>
      )}
      {error && <p className="text-sm text-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] border border-[color-mix(in_srgb,var(--bad)_30%,transparent)] rounded-lg px-3 py-2 mb-4">{error}</p>}
      <div className="flex items-center gap-2 text-sm text-muted mb-4"><KeyRound className="w-4 h-4 text-[var(--accent)]" /> Reset code sent to <b className="text-[var(--text)]">{email}</b></div>
      <Field label="Reset code">
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="input text-center !text-xl font-semibold font-mono !tracking-[0.5em]" placeholder="••••••" inputMode="numeric" required />
      </Field>
      <Field label="New password"><input name="password" type="password" required minLength={8} className="input" autoComplete="new-password" /></Field>
      <Field label="Confirm new password"><input name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" /></Field>
      <button className="btn btn-primary w-full !py-2.5" disabled={loading || code.length !== 6}>{loading && <Spinner />} Reset password</button>
    </form>
  );
}
