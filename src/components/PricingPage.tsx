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

import { useI18n } from "@/context/I18nContext";
import { motion } from "framer-motion";

export default function PricingPage({ currentPlan, isAdmin }: { currentPlan: string | null; isAdmin: boolean }) {
  const { t } = useI18n();
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
    <div className="max-w-6xl mx-auto px-4 py-24">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-2xl mx-auto mb-16"
      >
        <Badge tone="accent"><Sparkles className="w-3 h-3" /> {t('plans.tagline')}</Badge>
        <h1 className="text-5xl font-bold tracking-tight mt-6" style={{ fontFamily: 'Georgia, serif' }}>
          Découvrez la puissance de <span className="grad-text">VELORIS</span>
        </h1>
        <p className="text-muted text-lg mt-6 leading-relaxed">
          Accédez à l'élite de l'intelligence artificielle gratuitement. Des plans transparents conçus pour sublimer votre créativité.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-8">
        {plans.map((p, i) => {
          const q = quotas[p.id];
          const isCurrent = currentPlan === p.id;
          return (
            <motion.div 
              key={p.id} 
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={clsx(
                "panel rounded-[2rem] p-10 flex flex-col relative transition-all duration-500",
                p.id === "premium" ? "border-[var(--accent)]/40 shadow-[0_0_40px_-10px_var(--accent)]" : "border-white/5 shadow-2xl"
              )}
            >
              {p.id === "premium" && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 chip !text-[10px] btn-primary !border-none px-4 py-2 font-black uppercase tracking-[0.2em]">
                  Recommandé
                </span>
              )}
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'Georgia, serif' }}>{p.name}</h2>
                {isCurrent && <Badge tone="ok"><Check className="w-3 h-3" /> {t('plans.current')}</Badge>}
              </div>
              <p className="text-sm text-muted mb-6">{p.tagline}</p>
              <div className="text-5xl font-black tracking-tight grad-text mb-8">{p.price}</div>
              
              <div className="gold-line opacity-20 mb-8" />

              <ul className="space-y-5 flex-1">
                {p.features(q).map((f) => (
                  <li key={f} className="flex gap-4 text-[14px] font-medium text-soft leading-tight">
                    <div className="w-5 h-5 rounded-full bg-[var(--accent)]/10 flex items-center justify-center shrink-0 mt-0.5">
                       <Check className="w-3 h-3 text-[var(--accent)]" />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-12">
                {isCurrent ? (
                  <button className="btn w-full !h-12 !rounded-2xl !bg-white/5 !border-white/10 !text-muted" disabled>{t('plans.your_plan')}</button>
                ) : isAdmin ? (
                  <button className="btn btn-primary w-full !h-12 !rounded-2xl" onClick={() => toast("Assignez ce plan depuis la console admin.", "info")}>Assigner via Admin</button>
                ) : (
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="btn w-full !h-12 !rounded-2xl border-[var(--accent)]/30 hover:border-[var(--accent)]/60" 
                    onClick={() => toast("Demandez à votre administrateur pour passer au niveau supérieur.")}
                  >
                    Demander l'accès
                  </motion.button>
                )}
              </div>
            </motion.div>
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
