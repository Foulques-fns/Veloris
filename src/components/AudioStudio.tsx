"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowDownToLine, AudioLines, Check, Copy, FileAudio, Loader2, Mic, Music4, Play,
  RefreshCw, Sparkles, Square, Upload, Volume2,
} from "lucide-react";
import { Badge, Spinner, toast, ActionButton } from "./ui";
import { Markdown } from "./Markdown";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/context/I18nContext";

type AudioModel = { id: string; title: string; kind: "tts" | "stt"; voices: string[]; health: string };
type AudioFile = { id: string; url: string; name: string; createdAt: string; meta?: { text?: string; model?: string; voice?: string } };
type Tab = "tts" | "stt" | "sfx";

export default function AudioStudio({ charLimit }: { charLimit: number }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("tts");
  const [models, setModels] = useState<AudioModel[]>([]);
  const [modelsError, setModelsError] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [audios, setAudios] = useState<AudioFile[]>([]);

  const [modelId, setModelId] = useState("");
  const [text, setText] = useState("");
  const [lang, setLang] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);

  const [sttModel, setSttModel] = useState("");
  const [sttBusy, setSttBusy] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [recording, setRecording] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const ttsModels = useMemo(() => models.filter((m) => m.kind === "tts"), [models]);
  const sttModels = useMemo(() => models.filter((m) => m.kind === "stt"), [models]);
  const model = ttsModels.find((m) => m.id === modelId) ?? ttsModels[0];

  /** Free music/SFX models (e.g. *music*, *sfx*, *sound*) if they ever become free. */
  const freeSfxModels = useMemo(
    () => models.filter((m) => /music|sfx|sound|song|melody/i.test(m.id) && m.kind === "tts"),
    [models],
  );

  /** Distinct locales available on the selected voice model (fr-FR, en-US…). */
  const languages = useMemo(() => {
    if (!model) return [];
    const set = new Set<string>();
    for (const v of model.voices) {
      const m = /^([a-z]{2,3}-[A-Z]{2})-/.exec(v);
      if (m) set.add(m[1]);
    }
    return [...set].sort();
  }, [model]);

  const voices = useMemo(() => {
    if (!model) return [];
    if (languages.length === 0) return model.voices;
    if (languages.length === 1) return model.voices;
    return lang ? model.voices.filter((v) => v.startsWith(`${lang}-`)) : model.voices;
  }, [model, lang, languages]);

  useEffect(() => { setLang(""); setVoice(""); }, [modelId]);
  useEffect(() => {
    if (model && model.voices.length && !voices.includes(voice)) setVoice(voices[0] ?? "");
  }, [voices, voice, model]);

  const load = useCallback(async () => {
    setModelsError(false);
    try {
      const [mRes, aRes] = await Promise.all([fetch("/api/models").then((r) => r.json()), fetch("/api/audio/tts").then((r) => r.json())]);
      if (mRes.ok && Array.isArray(mRes.audio)) {
        const ms: AudioModel[] = mRes.audio;
        setModels(ms);
        const tts = ms.filter((m) => m.kind === "tts");
        const stt = ms.filter((m) => m.kind === "stt");
        setModelId((cur) => (cur && tts.some((m) => m.id === cur) ? cur : (tts.find((m) => m.id === mRes.defaults.tts)?.id ?? tts[0]?.id ?? "")));
        setSttModel((cur) => (cur && stt.some((m) => m.id === cur) ? cur : (stt.find((m) => m.id === mRes.defaults.stt)?.id ?? stt[0]?.id ?? "")));
      } else {
        setModelsError(true);
      }
      if (aRes.ok) {
        setAudios(aRes.audios);
        setQuota(aRes.quota);
      }
    } catch {
      setModelsError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function speak(textOverride?: string) {
    const t = (textOverride ?? text).trim();
    if (!t || busy) return;
    if (!model) return toast("Aucun modèle vocal gratuit n'est disponible.", "bad");
    setBusy(true);
    try {
      const res = await fetch("/api/audio/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, model: model.id, voice }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Échec de la synthèse vocale.", "bad");
        if (data.quota) setQuota(data.quota);
      } else {
        toast("Voix générée.", "ok");
        setQuota(data.quota);
        setAudios((s) => [{ ...data.audio, meta: { text: t.slice(0, 500), model: data.audio.model, voice: data.audio.voice } }, ...s]);
      }
    } catch {
      toast("Erreur réseau pendant la synthèse.", "bad");
    } finally {
      setBusy(false);
    }
  }

  const transcribeFile = useCallback(
    async (f: File) => {
      setSttBusy(true);
      setTranscript("");
      const fd = new FormData();
      fd.append("file", f);
      if (sttModel) fd.append("model", sttModel);
      try {
        const res = await fetch("/api/audio/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        if (data.ok) setTranscript(data.text || "(aucune parole détectée)");
        else toast(data.error || "Échec de la transcription.", "bad");
      } catch {
        toast("Erreur réseau.", "bad");
      } finally {
        setSttBusy(false);
      }
    },
    [sttModel],
  );

  async function toggleRecord() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        transcribeFile(new File([blob], "recording.webm", { type: blob.type }));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast("Accès au microphone refusé.", "bad");
    }
  }

  const quotaLabel = quota ? (quota.limit === -1 ? `${quota.used} / ∞` : `${quota.used}/${quota.limit}`) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-6 mb-12">
        <div className="w-14 h-14 rounded-2xl grid place-items-center glass relative border-[var(--accent)]/20 shadow-2xl">
          <div className="absolute inset-0 gen-pulse opacity-10" />
          <AudioLines className="w-7 h-7 text-[var(--accent)]" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="font-bold tracking-tight text-3xl grad-text" style={{ fontFamily: 'Georgia, serif' }}>{t('nav.audio')}</h1>
          <p className="text-[13px] text-muted mt-1 uppercase tracking-widest font-semibold">{t('audio.tagline')}</p>
        </div>
        
        <div className="flex glass p-1 rounded-2xl border-white/5">
          {([["tts", "Synthèse"], ["stt", "Transcription"], ["sfx", "Effets"]] as [Tab, string][]).map(([t_key, label]) => (
            <button
              key={t_key}
              className={clsx(
                "relative px-6 py-2.5 text-[12px] font-bold uppercase tracking-widest transition-all rounded-xl",
                tab === t_key ? "text-white" : "text-muted hover:text-white"
              )}
              onClick={() => setTab(t_key)}
            >
              {label}
              {tab === t_key && (
                <motion.div layoutId="audio-tab" className="absolute inset-0 bg-[var(--accent)] rounded-xl -z-10 shadow-[0_0_15px_var(--accent)]" transition={{ type: "spring", stiffness: 300, damping: 25 }} />
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {modelsError && (
        <div className="mt-6 panel rounded-2xl p-5 flex items-center justify-between anim-fade-in">
          <p className="text-sm text-soft">Le catalogue Pollinations est injoignable pour l'instant.</p>
          <button className="btn" onClick={load}><RefreshCw className="w-4 h-4" /> Réessayer</button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {tab === "tts" && (
          <motion.div 
            key="tts"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid lg:grid-cols-[380px_1fr] gap-6 mt-7 items-start"
          >
            {/* controls */}
            <section className="panel rounded-2xl p-6 space-y-6 lg:sticky lg:top-24">
              <div>
                <label className="text-[10px] font-bold text-muted uppercase tracking-widest block mb-2">Texte à lire</label>
                <textarea
                  className="input min-h-[120px] resize-y glass border-white/5"
                  maxLength={charLimit}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Écrivez le texte à transformer en voix..."
                />
                <p className="text-[10px] text-muted mt-2 text-right font-mono tabular-nums">{text.length} / {charLimit}</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted uppercase tracking-widest block mb-2">Modèle vocal</label>
                <select className="select-native font-semibold" value={model?.id ?? ""} onChange={(e) => setModelId(e.target.value)}>
                  {ttsModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} · {m.voices.length} voix
                    </option>
                  ))}
                </select>
              </div>
              {languages.length > 1 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest block mb-2">Langue</label>
                  <select className="select-native" value={lang} onChange={(e) => setLang(e.target.value)}>
                    <option value="">Toutes les langues</option>
                    {languages.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                  </select>
                </motion.div>
              )}
              {model && model.voices.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <label className="text-[10px] font-bold text-muted uppercase tracking-widest block mb-2">Voix</label>
                  <select className="select-native" value={voice} onChange={(e) => setVoice(e.target.value)}>
                    {voices.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </motion.div>
              )}
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn btn-primary w-full !h-12 !rounded-2xl" 
                onClick={() => speak()} 
                disabled={busy || !text.trim()}
              >
                {busy ? (<><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</>) : (<><Play className="w-4 h-4" /> Générer la voix</>)}
              </motion.button>
            </section>

            {/* results */}
            <section className="space-y-4">
              <AnimatePresence>
                {busy && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="panel rounded-3xl p-6 relative overflow-hidden">
                    <div className="absolute inset-0 gen-pulse opacity-10" />
                    <div className="flex items-center gap-3 text-sm font-bold text-[var(--accent)]">
                      <Volume2 className="w-5 h-5 animate-bounce" /> Synthèse en cours...
                    </div>
                    <div className="skeleton h-10 mt-4 rounded-xl" />
                  </motion.div>
                )}
                {audios.length === 0 && !busy ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-[2rem] p-20 text-center border-white/5">
                    <Music4 className="w-12 h-12 text-muted mx-auto mb-4 opacity-20" />
                    <p className="text-muted font-medium italic">Vos chefs-d'œuvre sonores apparaîtront ici.</p>
                  </motion.div>
                ) : (
                  audios.map((a, idx) => (
                    <motion.div 
                      key={a.id} 
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="glass rounded-3xl p-5 border-white/5 hover:border-[var(--accent)]/20 transition-all shadow-xl group"
                    >
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <p className="text-[14px] font-bold text-soft truncate flex-1">« {a.meta?.text || a.name} »</p>
                        <div className="flex gap-1">
                          <motion.a whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} href={a.url} download={a.name} className="p-2 rounded-xl glass hover:text-[var(--accent)] transition-all">
                            <ArrowDownToLine className="w-4 h-4" />
                          </motion.a>
                          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="p-2 rounded-xl glass hover:text-[var(--accent)] transition-all" onClick={() => { navigator.clipboard.writeText(a.meta?.text ?? "").catch(() => {}); toast("Copié.", "ok"); }}>
                            <Copy className="w-4 h-4" />
                          </motion.button>
                        </div>
                      </div>
                      <audio controls src={a.url} className="w-full h-10 mb-4" preload="none" />
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                           <span className="chip !text-[10px] bg-white/5 border-none">{a.meta?.model?.split("/").pop()}</span>
                           <span className="chip !text-[10px] bg-white/5 border-none">{a.meta?.voice}</span>
                        </div>
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="btn !h-8 !px-3 !text-[11px] !rounded-lg border-[var(--accent)]/20 text-[var(--accent)]" 
                          onClick={() => speak(a.meta?.text)}
                        >
                          <RefreshCw className="w-3 h-3" /> Régénérer
                        </motion.button>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </section>
          </motion.div>
        )}

        {tab === "stt" && (
          <motion.div 
            key="stt"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid lg:grid-cols-2 gap-8 mt-7 items-start"
          >
            <section className="panel rounded-[2rem] p-8 space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">{t('audio.transcribe_model') || 'Modèle de transcription'}</label>
                <select className="select-native font-bold" value={sttModel} onChange={(e) => setSttModel(e.target.value)}>
                  {sttModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </select>
              </div>
              <motion.div
                whileHover={{ borderColor: "var(--accent)" }}
                className={clsx(
                  "rounded-[2rem] border-2 border-dashed p-12 text-center transition-all cursor-pointer relative overflow-hidden",
                  dragOver ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-white/10 bg-white/2"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) transcribeFile(f); }}
              >
                <Upload className="w-10 h-10 mx-auto text-muted mb-4 opacity-50" />
                <p className="text-sm font-bold mb-2">Glissez un fichier ici</p>
                <label className="btn btn-primary !h-9 !rounded-xl cursor-pointer">
                   Parcourir...
                  <input type="file" hidden accept="audio/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribeFile(f); e.target.value = ""; }} />
                </label>
              </motion.div>
              <button className={clsx("btn w-full !h-12 !rounded-2xl font-black uppercase tracking-widest", recording && "text-red-500 shadow-[0_0_20px_red]")} onClick={toggleRecord}>
                {recording ? <><Square className="w-4 h-4 fill-current" /> Stop</> : <><Mic className="w-4 h-4" /> Enregistrer</>}
              </button>
            </section>
            
            <section className="panel rounded-[2rem] p-8 min-h-[300px] flex flex-col">
               <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold flex items-center gap-3"><Sparkles className="w-5 h-5 text-[var(--accent)]" /> Résultat</h3>
                  {transcript && <ActionButton title="Copy" icon={Copy} onClick={() => { navigator.clipboard.writeText(transcript); toast("Copié."); }} />}
               </div>
               <div className="flex-1">
                 {sttBusy ? <div className="flex items-center gap-3 text-muted"><Spinner /> {t('audio.transcribing') || 'Analyse en cours...'}</div> : transcript ? <Markdown content={transcript} /> : <p className="text-muted italic opacity-40">En attente d'un fichier...</p>}
               </div>
            </section>
          </motion.div>
        )}

        {tab === "sfx" && (
          <motion.div 
            key="sfx"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mt-12 max-w-2xl mx-auto"
          >
            <div className="panel rounded-[3rem] p-16 text-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent)]/5 to-transparent pointer-events-none" />
               <div className="w-20 h-20 rounded-[2rem] mx-auto flex items-center justify-center bg-[var(--accent)]/10 border border-[var(--accent)]/20 mb-8">
                 <Music4 className="w-10 h-10 text-[var(--accent)]" />
               </div>
               <h2 className="text-3xl font-black mb-4" style={{ fontFamily: 'Georgia, serif' }}>Sons & SFX</h2>
               <p className="text-muted leading-relaxed mb-10">
                 La magie sonore arrive. Nous attendons l'arrivée de modèles gratuits d'excellence pour la musique et les effets. 
                 VELORIS garde un œil sur le catalogue Pollinations pour vous.
               </p>
               <div className="chip !px-6 !py-3 rounded-full border-[var(--accent)]/30 text-[var(--accent)] font-bold">
                 <RefreshCw className="w-4 h-4 animate-spin-slow" /> SURVEILLANCE DU CATALOGUE ACTIVE
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
