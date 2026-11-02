"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, KeyRound, MailCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { Logo, VelorisWordmark, Spinner, Toaster, toast } from "./ui";

// ── Shell ────────────────────────────────────────────────────────────────────

export function AuthShell({
  children,
  title,
  sub,
}: {
  children: ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      <div className="aurora">
        <div className="a1" />
        <div className="a2" />
        <div className="a3" />
      </div>

      <div className="relative z-10 w-full max-w-md anim-fade-up">
        {/* Card */}
        <div
          className="panel rounded-3xl p-8 shadow-2xl"
          style={{
            borderColor: "rgba(201,162,39,0.22)",
            background: "linear-gradient(145deg, #08070a 0%, #050404 100%)",
            boxShadow: "0 32px 80px -20px rgba(0,0,0,0.96), 0 0 0 1px rgba(201,162,39,0.15), inset 0 1px 0 rgba(201,162,39,0.08)",
          }}
        >
          {/* Logo + wordmark */}
          <div className="flex items-center gap-3 mb-8">
            <div className="orbit-wrap">
              <Logo size={40} />
            </div>
            <div>
              <VelorisWordmark size="lg" />
              <div
                className="text-[10.5px] tracking-[0.12em] uppercase mt-0.5"
                style={{ color: "rgba(201,162,39,0.5)", fontFamily: "Georgia, serif" }}
              >
                Intelligence Premium
              </div>
            </div>
          </div>

          {/* Gold divider */}
          <div className="gold-line mb-7" />

          <h1 className="text-[18px] font-semibold tracking-tight mb-1" style={{ fontFamily: "Georgia, serif" }}>
            {title}
          </h1>
          {sub ? (
            <p className="text-sm text-muted mb-6 leading-relaxed">{sub}</p>
          ) : (
            <div className="mb-6" />
          )}

          {children}
        </div>

        <p className="text-center text-xs text-muted mt-5">
          <Link href="/" className="inline-flex items-center gap-1 hover:text-[var(--accent)] transition-colors">
            <ArrowLeft className="w-3 h-3" /> Retour à l'accueil
          </Link>
        </p>
      </div>
      <Toaster />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="block text-[12px] font-medium text-muted mb-1.5 tracking-[0.04em] uppercase">{label}</span>
      {children}
    </label>
  );
}

function ErrorBox({ msg, extra }: { msg: string; extra?: ReactNode }) {
  return (
    <div
      className="text-sm rounded-xl px-4 py-3 mb-4"
      style={{
        color: "var(--bad)",
        background: "color-mix(in srgb, var(--bad) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--bad) 28%, transparent)",
      }}
    >
      {msg}{extra}
    </div>
  );
}

// ── Login ────────────────────────────────────────────────────────────────────

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
    if (!res.ok || !data.ok)
      return setError({ msg: data.error || "Connexion échouée.", unknownEmail: !!data.unknownEmail });
    router.push("/chat");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {error && (
        <ErrorBox
          msg={error.msg}
          extra={
            error.unknownEmail ? (
              <>
                {" "}
                <Link href="/register" className="font-medium underline underline-offset-2">
                  Créer un compte
                </Link>
              </>
            ) : undefined
          }
        />
      )}
      <Field label="Adresse e-mail">
        <input name="email" type="email" required className="input" placeholder="vous@exemple.com" autoComplete="email" />
      </Field>
      <Field label="Mot de passe">
        <input name="password" type="password" required className="input" placeholder="••••••••" autoComplete="current-password" />
      </Field>
      <button className="btn btn-primary w-full !h-11 !text-[14px] mt-1" disabled={loading}>
        {loading && <Spinner />} Se connecter
      </button>
      <div className="flex items-center justify-between mt-4 text-sm">
        <Link href="/forgot" className="text-muted hover:text-[var(--accent)] transition-colors">
          Mot de passe oublié ?
        </Link>
        <Link href="/register" className="text-muted hover:text-[var(--accent)] transition-colors">
          Créer un compte
        </Link>
      </div>
    </form>
  );
}

// ── Register ─────────────────────────────────────────────────────────────────

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
      return setError("Les mots de passe ne correspondent pas.");
    }
    const { res, data } = await post("/api/auth/register", { name: fd.get("name"), email: fd.get("email"), password });
    setLoading(false);
    if (!res.ok || !data.ok) return setError(data.error || "Inscription échouée.");
    const dev = data.devCode ? `&dev=${data.devCode}` : "";
    router.push(`/verify?email=${encodeURIComponent(data.email)}${dev}`);
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <ErrorBox msg={error} />}
      <Field label="Prénom / Nom">
        <input name="name" required maxLength={120} className="input" placeholder="Votre nom" autoComplete="name" />
      </Field>
      <Field label="Adresse e-mail">
        <input name="email" type="email" required className="input" placeholder="vous@exemple.com" autoComplete="email" />
      </Field>
      <Field label="Mot de passe">
        <input name="password" type="password" required minLength={8} className="input" placeholder="8 caractères minimum" autoComplete="new-password" />
      </Field>
      <Field label="Confirmer le mot de passe">
        <input name="confirm" type="password" required minLength={8} className="input" placeholder="Répétez le mot de passe" autoComplete="new-password" />
      </Field>
      <button className="btn btn-primary w-full !h-11 !text-[14px] mt-1" disabled={loading}>
        {loading && <Spinner />} Créer mon compte
      </button>
      <p className="text-sm mt-4 text-muted text-center">
        Déjà inscrit ?{" "}
        <Link href="/login" className="text-[var(--accent)] hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

// ── Verify (with countdown + OTP slots) ──────────────────────────────────────

const CODE_LENGTH = 6;
const EXPIRE_SECONDS = 300; // 5 minutes

export function VerifyForm({ email, devCode }: { email: string; devCode?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [secondsLeft, setSecondsLeft] = useState(EXPIRE_SECONDS);
  const [expired, setExpired] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");

  // Countdown
  useEffect(() => {
    if (devCode) return; // dev mode — no real expiry pressure
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [devCode]);

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const secs = String(secondsLeft % 60).padStart(2, "0");

  // SVG ring progress (r=45 → circumference ≈ 282)
  const circumference = 2 * Math.PI * 45;
  const progress = secondsLeft / EXPIRE_SECONDS;
  const dashOffset = circumference * (1 - progress);

  function handleDigit(index: number, value: string) {
    const char = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (char && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (pasted.length > 0) {
      e.preventDefault();
      const next = Array(CODE_LENGTH).fill("");
      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
      setDigits(next);
      inputRefs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { res, data } = await post("/api/auth/verify", { email, code });
    setLoading(false);
    if (!res.ok || !data.ok) return setError(data.error || "Vérification échouée.");
    toast("Bienvenue sur VELORIS !", "ok");
    router.push(data.user?.role === "admin" ? "/admin" : "/chat");
    router.refresh();
  }

  async function resend() {
    setResending(true);
    const { res, data } = await post("/api/auth/resend", { email });
    setResending(false);
    if (!res.ok || !data.ok) return toast(data.error || "Impossible de renvoyer le code.", "bad");
    toast(data.emailSent ? "Nouveau code envoyé par e-mail." : "Nouveau code généré.", "ok");
    setDigits(Array(CODE_LENGTH).fill(""));
    setSecondsLeft(EXPIRE_SECONDS);
    setExpired(false);
    inputRefs.current[0]?.focus();
  }

  return (
    <form onSubmit={onSubmit}>
      {devCode && (
        <div
          className="text-xs rounded-xl px-4 py-3 mb-5"
          style={{
            color: "var(--warn)",
            background: "color-mix(in srgb, var(--warn) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
          }}
        >
          ⚠️ Mode développement (aucun e-mail configuré). Code :{" "}
          <b className="font-mono tracking-widest text-[var(--text)]">{devCode}</b>
        </div>
      )}
      {error && <ErrorBox msg={error} />}

      {/* Email info */}
      <div className="flex items-center gap-2.5 text-sm text-muted mb-5 p-3 rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 6%, transparent)", border: "1px solid rgba(201,162,39,0.18)" }}>
        <MailCheck className="w-4 h-4 text-[var(--accent)] shrink-0" />
        <span>Code envoyé à <b className="text-[var(--text)]">{email}</b></span>
      </div>

      {/* Countdown ring + timer */}
      {!devCode && (
        <div className="flex justify-center mb-6">
          <div className="relative w-20 h-20">
            <svg className="countdown-ring w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(201,162,39,0.1)" strokeWidth="4" />
              <circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke={expired ? "var(--bad)" : "var(--accent)"}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[18px] font-mono font-bold" style={{ color: expired ? "var(--bad)" : "var(--accent)" }}>
                {expired ? "!" : `${minutes}:${secs}`}
              </span>
              <span className="text-[9px] text-muted tracking-wide uppercase">
                {expired ? "Expiré" : "restant"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* OTP digit slots */}
      <div className="flex gap-2 justify-center mb-6" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            autoFocus={i === 0}
            className="w-11 h-14 text-center text-2xl font-bold font-mono rounded-xl border outline-none transition-all"
            style={{
              background: d ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "color-mix(in srgb, var(--bg) 50%, var(--panel))",
              borderColor: d ? "rgba(201,162,39,0.6)" : "var(--border)",
              color: d ? "var(--accent)" : "var(--text)",
              boxShadow: d ? "0 0 14px -4px rgba(201,162,39,0.4)" : "none",
            }}
          />
        ))}
      </div>

      {expired ? (
        <button
          type="button"
          className="btn btn-primary w-full !h-11"
          onClick={resend}
          disabled={resending}
        >
          {resending && <Spinner />} <RefreshCw className="w-4 h-4" /> Renvoyer un nouveau code
        </button>
      ) : (
        <button
          className="btn btn-primary w-full !h-11 !text-[14px]"
          disabled={loading || code.length !== CODE_LENGTH}
        >
          {loading ? <Spinner /> : <ShieldCheck className="w-4 h-4" />}
          Vérifier et continuer
        </button>
      )}

      {!expired && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className="text-muted hover:text-[var(--accent)] inline-flex items-center gap-1.5 transition-colors"
          >
            {resending && <Spinner className="w-3.5 h-3.5" />}
            Renvoyer le code
          </button>
          <Link href="/login" className="text-muted hover:text-[var(--accent)] transition-colors">
            Retour à la connexion
          </Link>
        </div>
      )}
    </form>
  );
}

// ── Forgot ────────────────────────────────────────────────────────────────────

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
    toast("Si ce compte existe, un code de réinitialisation a été envoyé.", "ok");
    const dev = data.devCode ? `&dev=${data.devCode}` : "";
    router.push(`/reset?email=${encodeURIComponent(email)}${dev}`);
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Adresse e-mail">
        <input name="email" type="email" required className="input" placeholder="vous@exemple.com" autoComplete="email" />
      </Field>
      <button className="btn btn-primary w-full !h-11 !text-[14px]" disabled={loading}>
        {loading && <Spinner />} Envoyer le code de réinitialisation
      </button>
      <p className="text-sm mt-4 text-muted text-center">
        Vous vous en souvenez ?{" "}
        <Link href="/login" className="text-[var(--accent)] hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

// ── Reset ─────────────────────────────────────────────────────────────────────

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
    if (pw !== fd.get("confirm")) return setError("Les mots de passe ne correspondent pas.");
    setLoading(true);
    const { res, data } = await post("/api/auth/reset", { email, code, password: pw });
    setLoading(false);
    if (!res.ok || !data.ok) return setError(data.error || "Réinitialisation échouée.");
    toast("Mot de passe mis à jour — connectez-vous avec votre nouveau mot de passe.", "ok");
    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit}>
      {devCode && (
        <div
          className="text-xs rounded-xl px-4 py-3 mb-4"
          style={{
            color: "var(--warn)",
            background: "color-mix(in srgb, var(--warn) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
          }}
        >
          Mode dev — code : <b className="font-mono tracking-widest">{devCode}</b>
        </div>
      )}
      {error && <ErrorBox msg={error} />}
      <div className="flex items-center gap-2 text-sm text-muted mb-4 p-3 rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 6%, transparent)", border: "1px solid rgba(201,162,39,0.18)" }}>
        <KeyRound className="w-4 h-4 text-[var(--accent)] shrink-0" />
        Code envoyé à <b className="text-[var(--text)]">{email}</b>
      </div>
      <Field label="Code de réinitialisation">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="input text-center !text-xl font-semibold font-mono !tracking-[0.5em]"
          placeholder="••••••"
          inputMode="numeric"
          required
        />
      </Field>
      <Field label="Nouveau mot de passe">
        <input name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </Field>
      <Field label="Confirmer le nouveau mot de passe">
        <input name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </Field>
      <button className="btn btn-primary w-full !h-11 !text-[14px]" disabled={loading || code.length !== 6}>
        {loading && <Spinner />} Réinitialiser le mot de passe
      </button>
    </form>
  );
}
