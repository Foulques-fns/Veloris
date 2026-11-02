"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, LogOut, Save, User2, Wand2, XCircle, Globe, Palette } from "lucide-react";
import { Spinner, ThemeToggle, toast, Badge } from "./ui";
import { useI18n, type Language } from "@/context/I18nContext";
import { useTheme } from "@/context/ThemeContext";
import { motion } from "framer-motion";
import Link from "next/link";
import clsx from "clsx";

type User = { id: string; email: string; name: string; plan: string; role: string; personality: string; customInstructions: string };
type Usage = { images: { used: number; limit: number }; chat: { used: number; limit: number }; audio: { used: number; limit: number } };

const PERSONALITIES = [
  { id: "default", label: "VELORIS (default)", desc: "Balanced, friendly and helpful" },
  { id: "professional", label: "Professional", desc: "Formal, structured, factual" },
  { id: "friendly", label: "Friendly", desc: "Warm, casual and encouraging" },
  { id: "creative", label: "Creative", desc: "Imaginative, vivid, original" },
  { id: "concise", label: "Concise", desc: "Short and to the point" },
  { id: "coder", label: "Senior engineer", desc: "Production-quality code & rigor" },
  { id: "teacher", label: "Teacher", desc: "Patient, step-by-step explanations" },
];

export default function SettingsPage({ user, usage }: { user: User; usage: Usage }) {
  const router = useRouter();
  const { lang, setLang, t } = useI18n();
  const { colors, setColors, themes, activeTheme, setActiveTheme, resetTheme } = useTheme();

  const [name, setName] = useState(user.name);
  const [personality, setPersonality] = useState(user.personality);
  const [instructions, setInstructions] = useState(user.customInstructions);
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1, 
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

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
    } else toast(data.error || "Password change failed.", "bad");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="max-w-2xl mx-auto px-6 py-20 space-y-12 pb-32"
    >
      <div className="text-center">
         <motion.h1 variants={itemVariants} className="text-5xl font-black tracking-tighter mb-4" style={{ fontFamily: 'Georgia, serif' }}>
           SYSTEM <span className="grad-text">CALIBRATION</span>
         </motion.h1>
         <p className="text-muted font-light text-lg">Adjust the core parameters of your VELORIS experience.</p>
      </div>

      {/* Language Section */}
      <motion.section variants={itemVariants} className="panel rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--accent)]" />
          {t('settings.language')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { id: 'en', label: 'English' },
            { id: 'fr', label: 'Français' },
            { id: 'es', label: 'Español' },
            { id: 'de', label: 'Deutsch' },
            { id: 'it', label: 'Italiano' },
            { id: 'pt', label: 'Português' },
            { id: 'ja', label: '日本語' },
            { id: 'zh', label: '中文' },
            { id: 'ar', label: 'العربية' },
          ].map((l) => (
            <button
              key={l.id}
              onClick={() => setLang(l.id as Language)}
              className={clsx(
                "btn !h-10 transition-all",
                lang === l.id ? "btn-primary" : "btn-ghost border-[var(--border)]"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </motion.section>

      {/* Customization Section */}
      <motion.section variants={itemVariants} className="panel rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Palette className="w-4 h-4 text-[var(--accent)]" />
            {t('settings.customization')}
          </h2>
          <button onClick={resetTheme} className="text-[10px] uppercase tracking-widest text-muted hover:text-[var(--accent)] transition-colors">
            Réinitialiser
          </button>
        </div>
        
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Thèmes Prédéfinis</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(themes).map(([name, themeColors]) => (
              <button
                key={name}
                onClick={() => setActiveTheme(name)}
                className={clsx(
                  "p-3 rounded-xl border-2 transition-all flex flex-col items-center gap-2 group",
                  activeTheme === name ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-transparent bg-[var(--panel)] hover:border-[var(--border)]"
                )}
              >
                <div className="flex -space-x-1">
                  <div className="w-5 h-5 rounded-full border border-white/10" style={{ backgroundColor: themeColors.primary }} />
                  <div className="w-5 h-5 rounded-full border border-white/10" style={{ backgroundColor: themeColors.background }} />
                </div>
                <span className="text-[11px] font-semibold capitalize">{name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Couleurs sur Mesure</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ColorPicker label="Accent" value={colors.primary} onChange={(v) => setColors({...colors, primary: v, secondary: v, glow: v.replace(')', ', 0.5)').replace('rgb', 'rgba')})} />
            <ColorPicker label="Fond" value={colors.background} onChange={(v) => setColors({...colors, background: v})} />
            <ColorPicker label="Panneaux" value={colors.panel} onChange={(v) => setColors({...colors, panel: v})} />
            <ColorPicker label="Texte" value={colors.text} onChange={(v) => setColors({...colors, text: v})} />
          </div>
        </div>
      </motion.section>

      {/* plan + usage */}
      <motion.section variants={itemVariants} className="panel rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Abonnement & Usage</h2>
              <Badge tone="accent">{user.plan.toUpperCase()}</Badge>
            </div>
            <p className="text-[12px] text-muted mt-1">Réinitialisation quotidienne à 00:00 UTC.</p>
          </div>
          <Link href="/pricing" className="btn !h-9">
            Comparer les offres <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          <Meter label="Images" used={usage.images.used} limit={usage.images.limit} />
          <Meter label="Messages" used={usage.chat.used} limit={usage.chat.limit} />
          <Meter label="Audio" used={usage.audio.used} limit={usage.audio.limit} />
        </div>
      </motion.section>

      {/* Assistant */}
      <motion.form variants={itemVariants} onSubmit={saveProfile} className="panel rounded-2xl p-6 space-y-6">
        <h2 className="font-semibold flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-[var(--accent)]" /> 
          Assistant & Profil
        </h2>
        
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Personnalité</label>
          <div className="grid sm:grid-cols-2 gap-2">
            {PERSONALITIES.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPersonality(p.id)}
                className={clsx(
                  "text-left rounded-xl border p-4 transition-all",
                  personality === p.id 
                    ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] shadow-[0_0_15px_-5px_var(--accent)]" 
                    : "border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--panel)]"
                )}
              >
                <div className="text-[13px] font-bold">{p.label}</div>
                <div className="text-[11px] text-muted mt-1 leading-relaxed">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Instructions Personnalisées</label>
          <textarea
            className="input min-h-[120px] resize-y"
            maxLength={4000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Ex: Répondez toujours en français. Soyez concis..."
          />
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold text-muted uppercase tracking-widest">Nom d'Affichage</label>
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
               <User2 className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
               <input className="input !pl-10" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
          </div>
        </div>

        <button className="btn btn-primary !h-11 w-full" disabled={savingProfile}>
          {savingProfile ? <Spinner /> : <Save className="w-4 h-4" />} Enregistrer les Préférences
        </button>
      </motion.form>

      {/* security */}
      <motion.form variants={itemVariants} onSubmit={changePassword} className="panel rounded-2xl p-6 space-y-5">
        <h2 className="font-semibold flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[var(--accent)]" /> Sécurité
        </h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <input name="current" type="password" required placeholder="Actuel" className="input" />
          <input name="new" type="password" required minLength={8} placeholder="Nouveau" className="input" />
          <input name="confirm" type="password" required minLength={8} placeholder="Confirmer" className="input" />
        </div>
        <button className="btn !h-10" disabled={pwBusy}>{pwBusy && <Spinner />} Mettre à jour le mot de passe</button>
      </motion.form>

      {/* session */}
      <motion.section variants={itemVariants} className="panel rounded-2xl p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] flex items-center justify-center">
            <XCircle className="w-5 h-5 text-[var(--bad)]" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">Session active</h2>
            <p className="text-[11px] text-muted">Déconnectez-vous pour fermer l'accès.</p>
          </div>
        </div>
        <button className="btn btn-danger !h-10" onClick={logout}>
          <LogOut className="w-4 h-4" /> Se déconnecter
        </button>
      </motion.section>
    </motion.div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between p-3 glass rounded-xl border-[var(--border)]">
      <span className="text-[12px] font-semibold text-muted uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-mono text-muted tabular-nums opacity-60">{value}</span>
        <div className="relative w-7 h-7">
          <input 
            type="color" 
            value={value.startsWith('#') ? value : '#000000'} 
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
          />
          <div className="w-full h-full rounded-full border border-white/20 shadow-inner" style={{ backgroundColor: value }} />
        </div>
      </div>
    </div>
  );
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit === -1;
  const off = limit === 0;
  const pct = unlimited || off ? 100 : Math.min(100, (used / limit) * 100);
  return (
    <div className="rounded-xl border border-[var(--border)] p-4 glass">
      <div className="flex justify-between text-[11px] mb-2.5">
        <span className="font-bold uppercase tracking-widest text-muted">{label}</span>
        <span className="font-mono text-[var(--accent)]">{unlimited ? `${used} / ∞` : off ? `Désactivé` : `${used} / ${limit}`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full"
          style={{
            opacity: unlimited ? 0.3 : off ? 0.1 : 1,
            background: "linear-gradient(90deg, var(--accent-3), var(--accent))",
            boxShadow: "0 0 10px var(--accent)",
          }}
        />
      </div>
    </div>
  );
}
