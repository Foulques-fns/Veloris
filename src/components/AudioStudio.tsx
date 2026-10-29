"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  ArrowDownToLine, AudioLines, Check, Copy, FileAudio, Loader2, Mic, Music4, Play,
  RefreshCw, Sparkles, Square, Upload,
} from "lucide-react";
import { Badge, Spinner, toast } from "./ui";
import { Markdown } from "./Markdown";

type AudioModel = { id: string; title: string; kind: "tts" | "stt"; voices: string[]; health: string };
type AudioFile = { id: string; url: string; name: string; createdAt: string; meta?: { text?: string; model?: string; voice?: string } };
type Tab = "tts" | "stt" | "sfx";

export default function AudioStudio({ charLimit }: { charLimit: number }) {
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 anim-fade-up">
        <div className="w-11 h-11 rounded-xl grid place-items-center border border-[var(--border)]" style={{ background: "color-mix(in srgb,var(--accent) 10%, transparent)" }}>
          <AudioLines className="w-5 h-5 text-[var(--accent)]" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="font-semibold tracking-tight text-lg">Studio audio</h1>
          <p className="text-[12px] text-muted">Voix, langues & transcription — modèles gratuits vérifiés en direct</p>
        </div>
        {quotaLabel && (
          <Badge tone={quota && quota.limit !== -1 && quota.used >= quota.limit ? "bad" : "accent"}>{quotaLabel} · voix/jour</Badge>
        )}
        <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
          {([["tts", "Texte → Voix"], ["stt", "Transcription"], ["sfx", "Sons & SFX"]] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              className={clsx(
                "px-3.5 py-2 text-[12.5px] font-medium transition-colors",
                tab === t ? "bg-[var(--accent)] text-white" : "text-muted hover:text-[var(--text)] hover:bg-[var(--panel)]",
              )}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {modelsError && (
        <div className="mt-6 panel rounded-2xl p-5 flex items-center justify-between anim-fade-in">
          <p className="text-sm text-soft">Le catalogue Pollinations est injoignable pour l'instant.</p>
          <button className="btn" onClick={load}><RefreshCw className="w-4 h-4" /> Réessayer</button>
        </div>
      )}

      {tab === "tts" && (
        <div className="grid lg:grid-cols-[380px_1fr] gap-6 mt-7 items-start">
          {/* controls */}
          <section className="panel rounded-2xl p-5 space-y-5 lg:sticky lg:top-20 anim-fade-up">
            <div>
              <label className="text-[12px] font-medium text-muted block mb-1.5">Texte à lire</label>
              <textarea
                className="input min-h-[110px] resize-y"
                maxLength={charLimit}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Écrivez le texte à transformer en voix — français, anglais, et plus selon le modèle…"
              />
              <p className="text-[11px] text-muted mt-1 text-right tabular-nums">{text.length}/{charLimit}</p>
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted block mb-1.5">Modèle vocal (gratuits uniquement)</label>
              <select className="select-native" value={model?.id ?? ""} onChange={(e) => setModelId(e.target.value)}>
                {ttsModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {m.voices.length} voix{m.health === "healthy" ? " · en ligne" : ""}
                  </option>
                ))}
              </select>
            </div>
            {languages.length > 1 && (
              <div>
                <label className="text-[12px] font-medium text-muted block mb-1.5">Langue ({languages.length})</label>
                <select className="select-native" value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="">Toutes les langues</option>
                  {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            {model && model.voices.length > 0 && (
              <div>
                <label className="text-[12px] font-medium text-muted block mb-1.5">Voix ({voices.length})</label>
                <select className="select-native" value={voice} onChange={(e) => setVoice(e.target.value)}>
                  {voices.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
            <button className="btn btn-primary w-full !h-10 !rounded-lg" onClick={() => speak()} disabled={busy || !text.trim()}>
              {busy ? (<><Loader2 className="w-4 h-4 animate-spin" /> Synthèse en cours…</>) : (<><Play className="w-4 h-4" /> Générer la voix</>)}
            </button>
            <p className="text-[11px] text-muted leading-relaxed">
              Les voix localisées (fr-FR-*, en-US-*) viennent des modèles MAI Voice — 23 langues, 97 voix.
            </p>
          </section>

          {/* results */}
          <section className="space-y-3">
            {busy && (
              <div className="panel rounded-2xl p-5 anim-fade-in">
                <div className="flex items-center gap-2.5 text-[13px] font-medium">
                  <span className="gen-pulse rounded-full"><AudioLines className="w-4 h-4 text-[var(--accent)]" /></span>
                  Synthèse vocale…
                </div>
                <div className="skeleton h-10 mt-3 rounded-xl" />
              </div>
            )}
            {audios.length === 0 && !busy ? (
              <div className="glass rounded-2xl p-12 text-center anim-fade-up">
                <Music4 className="w-8 h-8 text-muted mx-auto" />
                <p className="text-sm text-muted mt-3">Vos générations audio apparaîtront ici — avec écoute et téléchargement.</p>
              </div>
            ) : (
              audios.map((a) => (
                <div key={a.id} className="panel rounded-2xl p-4 anim-fade-up card-hover">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-soft truncate">« {a.meta?.text || a.name} »</p>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <a href={a.url} download={a.name} className="p-1.5 rounded-md hover:bg-[var(--panel)] text-muted hover:text-[var(--text)]" title="Télécharger">
                        <ArrowDownToLine className="w-4 h-4" />
                      </a>
                      <button className="p-1.5 rounded-md hover:bg-[var(--panel)] text-muted hover:text-[var(--text)]" title="Copier le texte" onClick={() => { navigator.clipboard.writeText(a.meta?.text ?? "").catch(() => {}); toast("Texte copié.", "ok"); }}>
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <audio controls src={a.url} className="w-full mt-3 h-9" preload="none" />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[10.5px] text-muted font-mono">{a.meta?.model?.split("/").pop()} · {a.meta?.voice}</p>
                    <button className="btn !py-1 !px-2.5 !text-[11px]" onClick={() => speak(a.meta?.text)} title="Régénérer à l'identique">
                      <RefreshCw className="w-3 h-3" /> Régénérer
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}

      {tab === "stt" && (
        <div className="grid lg:grid-cols-2 gap-6 mt-7 items-start">
          <section className="panel rounded-2xl p-5 space-y-4 anim-fade-up">
            <div>
              <label className="text-[12px] font-medium text-muted block mb-1.5">Modèle de transcription (gratuits uniquement)</label>
              <select className="select-native" value={sttModel} onChange={(e) => setSttModel(e.target.value)}>
                {sttModels.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}{m.health === "healthy" ? " · en ligne" : ""}</option>
                ))}
              </select>
            </div>
            <div
              className={clsx(
                "rounded-2xl border-2 border-dashed p-9 text-center transition-colors",
                dragOver ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" : "border-[var(--border-strong)]",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) transcribeFile(f); }}
            >
              <Upload className="w-6 h-6 mx-auto text-muted" />
              <p className="text-sm mt-3">Déposez un fichier audio ici, ou</p>
              <label className="btn mt-3 cursor-pointer inline-flex">
                <FileAudio className="w-4 h-4" /> Parcourir
                <input type="file" hidden accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac" onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribeFile(f); e.target.value = ""; }} />
              </label>
              <p className="text-[11px] text-muted mt-3">MP3, WAV, M4A, OGG, WEBM · jusqu'à 24 Mo</p>
            </div>
            <button className={clsx("btn w-full !h-10 !rounded-lg", recording && "text-[var(--bad)] animate-pulse")} onClick={toggleRecord} disabled={sttBusy}>
              {recording ? <><Square className="w-4 h-4" /> Arrêter l'enregistrement</> : <><Mic className="w-4 h-4" /> Enregistrer une note vocale</>}
            </button>
            {sttBusy && <div className="flex items-center gap-2 text-sm text-muted justify-center"><Spinner /> Transcription en cours…</div>}
          </section>
          <section className="panel rounded-2xl p-5 anim-fade-up min-h-[220px]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-medium flex items-center gap-2"><Sparkles className="w-4 h-4 text-[var(--accent)]" /> Transcription</h3>
              {transcript && (
                <button className="btn !py-1.5 !px-3 !text-[12px]" onClick={() => { navigator.clipboard.writeText(transcript).catch(() => {}); toast("Copié.", "ok"); }}>
                  <Copy className="w-3.5 h-3.5" /> Copier
                </button>
              )}
            </div>
            {transcript ? <Markdown content={transcript} /> : <p className="text-sm text-muted">Chargez ou enregistrez un audio — la transcription s'affichera ici.</p>}
          </section>
        </div>
      )}

      {tab === "sfx" && (
        <div className="mt-7 max-w-2xl mx-auto anim-fade-up">
          {freeSfxModels.length === 0 ? (
            <div className="panel rounded-2xl p-10 text-center">
              <div className="w-12 h-12 rounded-xl mx-auto grid place-items-center border border-[var(--border)]" style={{ background: "color-mix(in srgb,var(--accent) 10%,transparent)" }}>
                <Music4 className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <h2 className="font-semibold mt-4">Musique &amp; effets sonores</h2>
              <p className="text-sm text-muted mt-2 leading-relaxed max-w-md mx-auto">
                La génération de sons à partir de prompts (« pluie sur une fenêtre », « ambiance forestière »…) nécessite un modèle dédié.
                À ce jour, <b>tous</b> les modèles musique/SFX du catalogue officiel Pollinations (Sonilo, Stable Audio, ElevenLabs…) sont <b>payants</b> — et Nova n'utilise jamais de modèle payant en remplacement.
              </p>
              <p className="text-sm text-muted mt-3 leading-relaxed max-w-md mx-auto">
                Cette section surveille le catalogue en continu : dès qu'un modèle SFX/musique <b>gratuit</b> sortira, il apparaîtra ici automatiquement et deviendra utilisable.
              </p>
              <div className="chip !px-3 !py-1.5 mt-4 inline-flex"><Check className="w-3 h-3 text-[var(--ok)]" /> Surveillance du catalogue activée</div>
            </div>
          ) : (
            <div className="panel rounded-2xl p-6">
              <h2 className="font-semibold mb-3">Modèles gratuits Sons/SFX détectés</h2>
              <ul className="space-y-2">
                {freeSfxModels.map((m) => (
                  <li key={m.id} className="chip !text-[12px] !py-2 !px-3">{m.title} <span className="font-mono text-muted">{m.id}</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
