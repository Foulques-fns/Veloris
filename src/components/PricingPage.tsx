"use client";

import { useEffect, useState } from "react";
import { Check, Eye, MessageSquareText, Mic2, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Badge, toast } from "./ui";

type QuotaConfig = { chatPerDay: number; imagesPerDay: number; audioPerDay: number; transcribePerDay: number; videoPerDay: number };
type Quotas = Record<"free" | "premium" | "ultra", QuotaConfig>;

const FALLBACK: Quotas = {
  free: { chatPerDay: 60, imagesPerDay: 5, audioPerDay: 10, transcribePerDay: 10, videoPerDay: 0 },
  premium: { chatPerDay: 300, imagesPerDay: 30, audioPerDay: 60, transcribePerDay: 40, videoPerDay: 0 },
  ultra: { chatPerDay: 1500, imagesPerDay: 120, audioPerDay: 240, transcribePerDay: 120, videoPerDay: 0 },
};

const TTS_CHARS = { free: 1200, premium: 2500, ultra: 4000 };

const fmt = (n: number) => (n === -1 ? "Illimités" : String(n));

export default function PricingPage({ currentPlan, isAdmin }: { currentPlan: string | null; isAdmin: boolean }) {
  const [quotas, setQuotas] = useState<Quotas>(FALLBACK);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.ok && d.quotas) setQuotas(d.quotas); }).catch(() => {});
  }, []);

  const plans = [
    {
      id: "free" as const, name: "Free", tagline: "Tout pour démarrer", price: "0 €",
      features: (q: QuotaConfig) => [
        `Chat IA — streaming, fichiers & vision (${fmt(q.chatPerDay)} msg·jour)`,
        `${fmt(q.imagesPerDay)} images générées par jour`,
        "Analyse d'images illimitée (ne consomme pas le quota images)",
        `${fmt(q.audioPerDay)} voix générées par jour · ${TTS_CHARS.free} caractères`,
        `${fmt(q.transcribePerDay)} transcriptions par jour · saisie vocale`,
        "Tous les modèles gratuits vérifiés (FLUX, MAI, Z-Image…)",
      ],
    },
    {
      id: "premium" as const, name: "Premium", tagline: "Pour les créateurs quotidiens", price: "Upgrade",
      features: (q: QuotaConfig) => [
        `Tout Free, en plus grand : ${fmt(q.chatPerDay)} msg·jour`,
        `${fmt(q.imagesPerDay)} images générées par jour`,
        `${fmt(q.audioPerDay)} voix par jour · ${TTS_CHARS.premium} caractères`,
        `${fmt(q.transcribePerDay)} transcriptions par jour`,
        "Paramètres avancés de génération débloqués",
        "Option illimité (∞) activable depuis le panneau admin",
      ],
    },
    {
      id: "ultra" as const, name: "Ultra", tagline: "Capacité maximale", price: "Upgrade",
      features: (q: QuotaConfig) => [
        `Tout Premium, au maximum : ${fmt(q.chatPerDay)} msg·jour`,
        `${fmt(q.imagesPerDay)} images par jour`,
        `${fmt(q.audioPerDay)} voix par jour · ${TTS_CHARS.ultra} caractères`,
        `${fmt(q.transcribePerDay)} transcriptions par jour`,
        "Accès prioritaire aux modèles vidéo gratuits dès leur sortie",
        "Plafonds personnalisés par l'administrateur",
      ],
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="text-center max-w-xl mx-auto anim-fade-up">
        <Badge tone="accent"><Sparkles className="w-3 h-3" /> Transparent, honest plans</Badge>
        <h1 className="text-3xl font-bold tracking-tighter mt-4">Pick your <span className="grad-text">headroom</span></h1>
        <p className="text-muted text-sm mt-3 leading-relaxed">
          Every plan uses exclusively free-verified models. We never substitute paid models. Upgrades on a self-hosted deployment are granted by the administrator (no payment processor is wired in by default).
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5 mt-10">
        {plans.map((p, i) => {
          const q = quotas[p.id];
          const isCurrent = currentPlan === p.id;
          return (
            <div key={p.id} className={clsx("panel rounded-3xl p-7 flex flex-col card-hover anim-fade-up relative", p.id === "premium" && "border-[color-mix(in_srgb,var(--accent)_45%,transparent)]")} style={{ animationDelay: `${i * 70}ms` }}>
              {p.id === "premium" && <span className="absolute -top-3 left-1/2 -translate-x-1/2 chip !text-[10px] !bg-[linear-gradient(120deg,var(--accent),var(--accent-2))] !text-white !border-transparent font-semibold">MOST POPULAR</span>}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                {isCurrent && <Badge tone="ok"><Check className="w-3 h-3" /> Current</Badge>}
              </div>
              <p className="text-[12.5px] text-muted mt-1">{p.tagline}</p>
              <div className="text-3xl font-bold tracking-tight mt-4 grad-text">{p.price}</div>
              <ul className="mt-6 space-y-2.5 flex-1">
                {p.features(q).map((f) => (
                  <li key={f} className="flex gap-2.5 text-[13px] text-soft leading-snug">
                    <Check className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                {isCurrent ? (
                  <button className="btn w-full" disabled>Your plan</button>
                ) : isAdmin ? (
                  <button className="btn btn-primary w-full" onClick={() => toast("Open the Admin console → Users to assign this plan.", "info")}>Assign via admin</button>
                ) : (
                  <button className="btn w-full" onClick={() => toast("Ask your administrator to upgrade your plan.")}>Request upgrade</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mt-10">
        <Note icon={Eye} title="Vision included">Image analysis & chat-vision never count against your image generation quota.</Note>
        <Note icon={Mic2} title="Real voice">100+ neural voices across 23 languages, plus transcription for uploads and voice notes.</Note>
        <Note icon={MessageSquareText} title="Open models">Live registry of free models — GPT, Mistral, GLM, DeepSeek, FLUX, MAI and more.</Note>
      </div>
    </div>
  );
}

function Note({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5 anim-fade-up">
      <Icon className="w-5 h-5 text-[var(--accent)]" />
      <h3 className="text-sm font-semibold mt-2.5">{title}</h3>
      <p className="text-[12.5px] text-muted mt-1 leading-relaxed">{children}</p>
    </div>
  );
}
