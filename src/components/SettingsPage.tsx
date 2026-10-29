"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, LogOut, Save, User2, Wand2, XCircle } from "lucide-react";
import { Spinner, ThemeToggle, toast, Badge } from "./ui";

type User = { id: string; email: string; name: string; plan: string; role: string; personality: string; customInstructions: string };
type Usage = { images: { used: number; limit: number }; chat: { used: number; limit: number }; audio: { used: number; limit: number } };

const PERSONALITIES = [
  { id: "default", label: "Nova (default)", desc: "Balanced, friendly and helpful" },
  { id: "professional", label: "Professional", desc: "Formal, structured, factual" },
  { id: "friendly", label: "Friendly", desc: "Warm, casual and encouraging" },
  { id: "creative", label: "Creative", desc: "Imaginative, vivid, original" },
  { id: "concise", label: "Concise", desc: "Short and to the point" },
  { id: "coder", label: "Senior engineer", desc: "Production-quality code & rigor" },
  { id: "teacher", label: "Teacher", desc: "Patient, step-by-step explanations" },
];

export default function SettingsPage({ user, usage }: { user: User; usage: Usage }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [personality, setPersonality] = useState(user.personality);
  const [instructions, setInstructions] = useState(user.customInstructions);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, customInstructions: instructions, personality }),
    });
    const data = await res.json();
    setSavingProfile(false);
    if (data.ok) {
      toast("Settings saved.", "ok");
      router.refresh();
    } else toast(data.error || "Save failed.", "bad");
  }

  async function changePassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get("new") ?? "");
    if (newPassword !== fd.get("confirm")) return toast("New passwords do not match.", "bad");
    setPwBusy(true);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: fd.get("current"), newPassword }),
    });
    const data = await res.json();
    setPwBusy(false);
    if (data.ok) {
      toast("Password changed — please sign in again.", "ok");
      setTimeout(() => router.push("/login"), 800);
      setTimeout(() => router.refresh(), 900);
    } else toast(data.error || "Password change failed.", "bad");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <h1 className="text-xl font-semibold tracking-tight anim-fade-up">Settings</h1>

      {/* plan + usage */}
      <section className="panel rounded-3xl p-6 anim-fade-up">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Plan &amp; usage</h2>
              <Badge tone="accent">{user.plan.toUpperCase()}</Badge>
            </div>
            <p className="text-[12px] text-muted mt-1">Your daily quotas reset at 00:00 UTC.</p>
          </div>
          <a href="/pricing" className="btn">Compare plans <ArrowRight className="w-4 h-4" /></a>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-5">
          <Meter label="Images" used={usage.images.used} limit={usage.images.limit} />
          <Meter label="Chat messages" used={usage.chat.used} limit={usage.chat.limit} />
          <Meter label="Audio" used={usage.audio.used} limit={usage.audio.limit} />
        </div>
      </section>

      {/* assistant */}
      <form onSubmit={saveProfile} className="panel rounded-3xl p-6 space-y-5 anim-fade-up">
        <h2 className="font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4 text-[var(--accent)]" /> Assistant behavior</h2>
        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">Personality</label>
          <div className="grid sm:grid-cols-2 gap-2">
            {PERSONALITIES.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPersonality(p.id)}
                className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${personality === p.id ? "border-[color-mix(in_srgb,var(--accent)_60%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-[var(--border)] hover:border-[var(--border-strong)]"}`}
              >
                <div className="text-[13px] font-medium">{p.label}</div>
                <div className="text-[11px] text-muted">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">Custom instructions</label>
          <textarea
            className="input min-h-[90px] resize-y"
            maxLength={4000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Always answer in French. Prefer concise bullet points. I'm a designer, so use design vocabulary…"
          />
          <p className="text-[11px] text-muted mt-1">These are injected into every chat system prompt. {instructions.length}/4000</p>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">Display name</label>
          <div className="flex gap-2 items-center">
            <User2 className="w-4 h-4 text-muted" />
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
        </div>
        <button className="btn btn-primary" disabled={savingProfile}>{savingProfile ? <Spinner /> : <Save className="w-4 h-4" />} Save preferences</button>
      </form>

      {/* appearance */}
      <section className="panel rounded-3xl p-6 flex items-center justify-between anim-fade-up">
        <div>
          <h2 className="font-semibold">Appearance</h2>
          <p className="text-[12px] text-muted mt-1">Dark mode is the default. Switch anytime.</p>
        </div>
        <ThemeToggle />
      </section>

      {/* security */}
      <form onSubmit={changePassword} className="panel rounded-3xl p-6 space-y-4 anim-fade-up">
        <h2 className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4 text-[var(--accent)]" /> Security</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <input name="current" type="password" required placeholder="Current password" className="input" autoComplete="current-password" />
          <input name="new" type="password" required minLength={8} placeholder="New password" className="input" autoComplete="new-password" />
          <input name="confirm" type="password" required minLength={8} placeholder="Confirm new" className="input" autoComplete="new-password" />
        </div>
        <p className="text-[11px] text-muted">Changing your password signs out all sessions.</p>
        <button className="btn" disabled={pwBusy}>{pwBusy && <Spinner />} Change password</button>
      </form>

      {/* session */}
      <section className="panel rounded-3xl p-6 flex items-center justify-between anim-fade-up">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><XCircle className="w-4 h-4 text-[var(--bad)]" /> Session</h2>
          <p className="text-[12px] text-muted mt-1">Sign out on this device.</p>
        </div>
        <button className="btn btn-danger" onClick={logout}><LogOut className="w-4 h-4" /> Sign out</button>
      </section>
    </div>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const off = limit === 0;
  const pct = unlimited || off ? 100 : Math.min(100, (used / limit) * 100);
  return (
    <div className="rounded-xl border border-[var(--border)] p-4">
      <div className="flex justify-between text-[12px] mb-2">
        <span className="font-medium">{label}</span>
        <span className="text-muted">{unlimited ? `${used} / ∞` : off ? `${used} · désactivé` : `${used} / ${limit}`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--panel)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            opacity: unlimited ? 0.35 : off ? 0.15 : 1,
            background: "linear-gradient(90deg,var(--accent),var(--accent-3))",
          }}
        />
      </div>
    </div>
  );
}
