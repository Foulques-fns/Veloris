"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  ArrowDownToLine, Dices, ImagePlus, Loader2, Maximize2, RefreshCw, ScanSearch, Sparkles, Wand2, X, Copy,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { Badge, Modal, Spinner, toast } from "./ui";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/context/I18nContext";
import confetti from "canvas-confetti";

type ImgModel = { id: string; title: string; acceptsImages: boolean; maxReferenceImages: number; health: string };

type Generated = {
  id: string; url: string; name: string; createdAt: string;
  meta?: { prompt?: string; model?: string; width?: number; height?: number; seed?: number | null; mode?: string };
};

const ASPECTS = [
  { label: "1:1", w: 1024, h: 1024 },
  { label: "16:9", w: 1344, h: 768 },
  { label: "9:16", w: 768, h: 1344 },
  { label: "4:3", w: 1152, h: 864 },
  { label: "3:4", w: 864, h: 1152 },
];

export default function ImageStudio() {
  const { t } = useI18n();
  const [models, setModels] = useState<ImgModel[]>([]);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState(ASPECTS[0]);
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [seed, setSeed] = useState<string>("");
  const [refs, setRefs] = useState<{ id: string; url: string; name: string; uploading?: boolean }[]>([]);
  const [variants, setVariants] = useState(1);
  const [busy, setBusy] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [images, setImages] = useState<Generated[]>([]);
  const [view, setView] = useState<Generated | null>(null);
  const [analysis, setAnalysis] = useState<{ forId: string; text: string; loading: boolean; model?: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const active = models.find((m) => m.id === model) ?? models[0];

  const load = useCallback(async () => {
    const [mRes, iRes] = await Promise.all([fetch("/api/models").then((r) => r.json()), fetch("/api/images").then((r) => r.json())]);
    if (mRes.ok) {
      setModels(mRes.image);
      if (!mRes.image.some((m: ImgModel) => m.id === model)) setModel(mRes.defaults.image || mRes.image[0]?.id || "");
    }
    if (iRes.ok) {
      setImages(iRes.images);
      setQuota(iRes.quota);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function pickReference(list: FileList | null) {
    if (!list) return;
    const f = list[0];
    setRefs((s) => [...s, { id: `tmp-${Date.now()}`, url: "", name: f.name, uploading: true }]);
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch("/api/files", { method: "POST", body: fd });
    const data = await res.json();
    if (data.ok) {
      setRefs((s) => s.map((r) => (r.uploading ? { id: data.file.id, url: data.file.url, name: f.name } : r)));
    } else {
      setRefs((s) => s.filter((r) => !r.uploading));
      toast(data.error || "Upload failed.", "bad");
    }
  }

  async function generate(override?: { prompt?: string; model?: string; w?: number; h?: number; seed?: number; refIds?: string[] }) {
    if (busy) return;
    const p = (override?.prompt ?? prompt).trim();
    if (!p) return toast("Décrivez l'image souhaitée.", "bad");
    const refIds = override?.refIds ?? refs.map((r) => r.id);
    if (refIds.length > 0 && !active?.acceptsImages) {
      return toast("Ce modèle n'accepte pas d'image — choisissez MAI Image, FLUX Klein ou Kontext.", "bad");
    }
    setBusy(true);
    const count = override ? 1 : variants;
    let produced = 0;
    try {
      for (let i = 0; i < count; i++) {
        const res = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p,
            model: override?.model ?? model,
            width: override?.w ?? aspect.w,
            height: override?.h ?? aspect.h,
            seed: override?.seed ?? (seed ? Number(seed) + i : undefined),
            quality,
            mode: refIds.length ? "edit" : "generate",
            referenceIds: refIds,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast(data.error || "Échec de la génération.", "bad");
          if (data.quota) setQuota(data.quota);
          break;
        }
        produced++;
        setQuota(data.quota);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#C9A227', '#F5D96E', '#A07810']
        });
      }
      if (produced > 0) {
        toast(produced > 1 ? `${produced} images générées.` : "Image générée.", "ok");
        setRefs([]);
        if (!override) setPrompt("");
        await load();
      }
    } catch {
      toast("Erreur réseau pendant la génération.", "bad");
    } finally {
      setBusy(false);
    }
  }

  async function analyze(img: Generated) {
    setAnalysis({ forId: img.id, text: "", loading: true });
    const res = await fetch("/api/images/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: img.id, question: "Analyze this image in detail — subjects, style, composition, colors, and text if any." }),
    });
    const data = await res.json();
    if (data.ok) setAnalysis({ forId: img.id, text: data.analysis, loading: false, model: data.model });
    else {
      setAnalysis(null);
      toast(data.error || "Analysis failed.", "bad");
    }
  }

  const remaining = quota ? Math.max(0, quota.limit - quota.used) : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-[360px_1fr] gap-6 items-start">
      {/* ── controls ── */}
      <section className="panel rounded-3xl p-5 space-y-5 lg:sticky lg:top-20 anim-fade-up">
        <div className="flex items-center justify-between">
          <h1 className="font-semibold tracking-tight flex items-center gap-2"><Wand2 className="w-4 h-4 text-[var(--accent)]" /> Image studio</h1>
          {quota && (
            <Badge tone={remaining === 0 ? "bad" : remaining <= 1 ? "warn" : "accent"}>
              {quota.used}/{quota.limit} today
            </Badge>
          )}
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">Prompt</label>
          <textarea
            className="input min-h-[100px] resize-y"
            placeholder="A luminous lighthouse on a cliff at dusk, waves dramatically crashing, cinematic lighting…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={8000}
          />
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">Model</label>
          <select className="select-native" value={active?.id ?? ""} onChange={(e) => setModel(e.target.value)} aria-label="Modèle d'image">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} · {m.id.split("/")[0]}{m.acceptsImages ? " · édition/i2i" : " · texte→image"}
              </option>
            ))}
          </select>
          {active && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={clsx("w-1.5 h-1.5 rounded-full", active.health === "healthy" ? "bg-[var(--ok)]" : "bg-[var(--warn)]")} />
              <span className="text-[10.5px] text-muted font-mono">{active.id}</span>
            </div>
          )}
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">Variantes</label>
          <div className="flex gap-1.5">
            {[1, 2].map((n) => (
              <button
                key={n}
                className={clsx("btn !px-3.5 !py-1.5 !text-[12px]", variants === n && "!border-[var(--accent)] !bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]")}
                onClick={() => setVariants(n)}
              >
                {n} image{n > 1 ? "s" : ""}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-1">Chaque variante consomme 1 quota image.</p>
        </div>

        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">Aspect ratio</label>
          <div className="flex flex-wrap gap-1.5">
            {ASPECTS.map((a) => (
              <button
                key={a.label}
                className={clsx("btn !px-3 !py-1.5 !text-[12px]", aspect.label === a.label && "!border-[color-mix(in_srgb,var(--accent)_60%,transparent)] !bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]")}
                onClick={() => setAspect(a)}
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-1.5">{aspect.w} × {aspect.h}px</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-medium text-muted block mb-1.5">Quality</label>
            <select className="input !py-2" value={quality} onChange={(e) => setQuality(e.target.value as typeof quality)}>
              <option value="low">Low · fast</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted block mb-1.5">Seed</label>
            <div className="flex gap-1">
              <input className="input !py-2" placeholder="random" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^\d]/g, "").slice(0, 10))} />
              <button className="btn !px-2.5" onClick={() => setSeed(String(Math.floor(Math.random() * 999999)))} aria-label="Random seed">
                <Dices className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* references */}
        <div>
          <label className="text-[12px] font-medium text-muted block mb-1.5">
            Reference images {active && !active.acceptsImages && <span className="text-[var(--warn)]">(not supported by {active.title})</span>}
          </label>
          <div className="flex flex-wrap gap-2">
            {refs.map((r) => (
              <div key={r.id} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url || undefined} alt={r.name} className="w-full h-full object-cover" />
                {r.uploading && <div className="absolute inset-0 grid place-items-center bg-black/50"><Spinner className="w-4 h-4 text-white" /></div>}
                <button className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white" onClick={() => setRefs((s) => s.filter((x) => x.id !== r.id))}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {(!active || active.acceptsImages) && refs.length < (active?.maxReferenceImages || 1) && (
              <label className="w-16 h-16 rounded-xl border border-dashed border-[var(--border-strong)] grid place-items-center cursor-pointer hover:border-[var(--accent)] transition-colors">
                <ImagePlus className="w-5 h-5 text-muted" />
                <input type="file" accept="image/*" hidden onChange={(e) => { pickReference(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
          <p className="text-[11px] text-muted mt-1.5">Attach an image to edit or transform it (image-to-image).</p>
        </div>

        <button className="btn btn-primary w-full !py-3 !rounded-xl !text-[15px]" onClick={() => generate()} disabled={busy || remaining === 0}>
          {busy ? (<><Loader2 className="w-4 h-4 animate-spin" /> Generating… {elapsed}s</>) : (<><Sparkles className="w-4 h-4" /> {refs.length ? "Edit / transform" : "Generate image"}</>)}
        </button>
        {remaining === 0 && <p className="text-[11px] text-[var(--warn)]">Daily limit reached — resets at 00:00 UTC. Plans on the admin panel can raise it.</p>}
      </section>

      {/* ── gallery ── */}
      <section className="space-y-4">
        {images.length === 0 && !busy ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-3xl p-20 text-center border-white/5 relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/5 to-transparent pointer-events-none" />
            <ImagePlus className="w-12 h-12 text-[var(--accent)] mx-auto mb-4" />
            <h2 className="font-bold text-xl mb-2" style={{ fontFamily: 'Georgia, serif' }}>{t('images.no_generations')}</h2>
            <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed">{t('images.no_generations_desc')}</p>
          </motion.div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
            <AnimatePresence>
              {busy && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="panel rounded-3xl overflow-hidden aspect-square grid place-items-center relative border-[var(--accent)]/20"
                >
                   <div className="absolute inset-0 gen-pulse opacity-20" />
                   <div className="text-center z-10">
                      <div className="orbit-wrap mb-4">
                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-[var(--accent)] animate-spin" />
                        <Sparkles className="w-6 h-6 text-[var(--accent)] absolute inset-0 m-auto animate-pulse" />
                      </div>
                      <p className="text-sm font-bold tracking-widest text-[var(--accent)] uppercase">{t('images.painting')}</p>
                   </div>
                </motion.div>
              )}
              {images.map((img, idx) => (
                <motion.figure 
                  key={img.id} 
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group relative glass rounded-3xl overflow-hidden border-white/5 hover:border-[var(--accent)]/30 transition-all shadow-xl"
                >
                  <button className="block w-full aspect-square overflow-hidden bg-black/40" onClick={() => setView(img)}>
                    <motion.img 
                      whileHover={{ scale: 1.05 }}
                      src={img.url} 
                      alt={img.meta?.prompt ?? img.name} 
                      loading="lazy" 
                      className="w-full h-full object-cover transition-all duration-700" 
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                       <div className="flex gap-2 justify-center">
                          <button onClick={(e) => { e.stopPropagation(); setView(img); }} className="w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-[var(--accent)] transition-all">
                             <Maximize2 className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); generate({ prompt: img.meta?.prompt, model: img.meta?.model, w: img.meta?.width, h: img.meta?.height }); }} className="w-10 h-10 rounded-full glass flex items-center justify-center text-white hover:bg-[var(--accent)] transition-all">
                             <RefreshCw className="w-4 h-4" />
                          </button>
                       </div>
                    </div>
                  </button>
                  <figcaption className="p-4 bg-black/20 backdrop-blur-md">
                    <p className="text-[12px] text-soft line-clamp-1 leading-snug font-medium mb-2">{img.meta?.prompt || img.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="chip !text-[10px] bg-white/5 border-none opacity-60">{img.meta?.model?.split("/").pop()}</span>
                      <div className="flex gap-1">
                        <IconBtn title="Analyze" onClick={() => { setView(img); analyze(img); }}><ScanSearch className="w-4 h-4" /></IconBtn>
                        <a href={img.url} download={img.name} className="p-1.5 rounded-md hover:bg-white/10 text-muted transition-all" title="Download">
                          <ArrowDownToLine className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </figcaption>
                </motion.figure>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ── lightbox / analysis modal ── */}
      <Modal open={!!view} onClose={() => { setView(null); setAnalysis(null); }} title={view?.meta?.mode === "edit" ? "Edited image" : "Image"} wide>
        {view && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.url} alt={view.meta?.prompt ?? view.name} className="w-full rounded-2xl border border-[var(--border)]" />
            <p className="text-sm text-muted mt-3 leading-relaxed">{view.meta?.prompt}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <a href={view.url} download={view.name} className="btn"><ArrowDownToLine className="w-4 h-4" /> Download</a>
              <button className="btn" onClick={() => { setPrompt(view.meta?.prompt ?? ""); setView(null); toast("Prompt loaded into the studio."); }}>
                <RefreshCw className="w-4 h-4" /> Reuse prompt
              </button>
              {!analysis && (
                <button className="btn btn-primary" onClick={() => analyze(view)}><ScanSearch className="w-4 h-4" /> Analyze image</button>
              )}
            </div>
            {analysis && (
              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="text-[12px] font-medium text-muted mb-2 flex items-center gap-2">
                  <ScanSearch className="w-3.5 h-3.5" /> Vision analysis {analysis.model ? `· ${analysis.model.split("/").pop()}` : ""}
                </div>
                {analysis.loading ? (
                  <div className="flex items-center gap-2.5 text-muted text-sm py-6"><Spinner /> Analyzing image…</div>
                ) : (
                  <Markdown content={analysis.text} />
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} className="p-1.5 rounded-md hover:bg-[var(--panel)] text-muted hover:text-[var(--text)] transition-colors">
      {children}
    </button>
  );
}
