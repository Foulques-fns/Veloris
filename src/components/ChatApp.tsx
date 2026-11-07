"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2, Copy, FileText, Image as ImageIcon, AudioLines,
  Loader2, Plus, Settings2, Sparkles,
  Trash2, Volume2, VolumeX, X, ArrowDownToLine, Square, Search,
} from "lucide-react";
import { toast, Toaster } from "./ui";
import { Markdown } from "./Markdown";
import { TypewriterText } from "./TypewriterText";
import MatrixBg from "./MatrixBg";
import { useI18n } from "@/context/I18nContext";
import { useTheme } from "@/context/ThemeContext";
import clsx from "clsx";
import type { ChatMedia } from "@/lib/media-intent";

type User = { id: string; name: string; role: string; plan: string };
type ChatModel = { id: string; title: string; vendor: string; vision: boolean; params: string[] };
type ImgModel = { id: string; title: string; health: string };
type AudioModel = { id: string; title: string; kind: "tts" | "stt"; voices: string[]; health: string };
type Attachment = { fileId: string; name: string; mime: string; kind: string; url: string; uploading?: boolean };
type GeneratedFileInfo = { id: string; name: string; url: string; mime: string; fileType: string; size?: number; prompt?: string };
type Msg = {
  id: string; role: "user" | "assistant"; content: string; model?: string | null;
  attachments?: Attachment[] | null; meta?: { media?: ChatMedia; generatedFile?: GeneratedFileInfo } | null;
  streaming?: boolean;
};
type Conv = { id: string; title: string; updatedAt: string };

const STARTERS = [
  { icon: ImageIcon, label: "Image", prompt: "Génère une image d'une ville cyberpunk sous la pluie, style cinématique" },
  { icon: AudioLines, label: "Voix", prompt: "Lis ce texte : Système VELORIS initialisé. Toutes les capacités sont opérationnelles." },
  { icon: Code2, label: "Code", prompt: "Écris un algorithme de tri rapide en TypeScript avec explication" },
  { icon: Sparkles, label: "Question", prompt: "Quelle est la différence entre un LLM et un modèle de diffusion ?" },
];

export default function ChatApp({ user }: { user: User }) {
  const { lang } = useI18n();
  const { colors } = useTheme();

  // All models
  const [chatModels, setChatModels] = useState<ChatModel[]>([]);
  const [imgModels, setImgModels] = useState<ImgModel[]>([]);
  const [audioModels, setAudioModels] = useState<AudioModel[]>([]);
  const [chatModelId, setChatModelId] = useState("openai/gpt-5.4-nano");
  const [imgModelId, setImgModelId] = useState("");
  const [ttsModelId, setTtsModelId] = useState("");
  const [ttsVoice, setTtsVoice] = useState("alloy");

  // Conversations
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [mediaJob, setMediaJob] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ttsPlaying, setTtsPlaying] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/models").then(r => r.json()).then(d => {
      if (d.ok) {
        setChatModels(d.chat || []);
        setImgModels(d.image || []);
        setAudioModels(d.audio || []);
        if (d.defaults?.chat) setChatModelId(d.defaults.chat);
        if (d.defaults?.image) setImgModelId(d.defaults.image);
        if (d.defaults?.tts) setTtsModelId(d.defaults.tts);
      }
    }).catch(() => {});
    refreshConvs();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function refreshConvs(q?: string) {
    const r = await fetch(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(r => r.json()).catch(() => null);
    if (r?.ok) setConvs(r.conversations);
  }
  useEffect(() => { const t = setTimeout(() => refreshConvs(search), 250); return () => clearTimeout(t); }, [search]);

  async function openConv(id: string) {
    abortRef.current?.abort(); setIsStreaming(false); setActiveId(id);
    const r = await fetch(`/api/conversations/${id}`).then(r => r.json()).catch(() => null);
    if (r?.ok) setMessages(r.messages.map((m: Msg) => ({ ...m, streaming: false })));
  }
  function newChat() { abortRef.current?.abort(); setIsStreaming(false); setActiveId(null); setMessages([]); setAttachments([]); }
  async function deleteConv(id: string) { await fetch(`/api/conversations/${id}`, { method: "DELETE" }); setConvs(s => s.filter(c => c.id !== id)); if (activeId === id) newChat(); }

  async function onPickFiles(list: FileList | null) {
    if (!list) return;
    for (const f of Array.from(list).slice(0, 4)) {
      const tmp: Attachment = { fileId: `tmp-${Date.now()}`, name: f.name, mime: f.type, kind: "doc", url: "", uploading: true };
      setAttachments(s => [...s, tmp]);
      const fd = new FormData(); fd.append("file", f);
      const res = await fetch("/api/files", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
      setAttachments(s => s.map(a => a.fileId === tmp.fileId ? (res?.ok ? { ...res.file } : null) : a).filter(Boolean) as Attachment[]);
    }
  }

  async function send() {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    const text = input.trim(); const atts = attachments.filter(a => !a.uploading);
    const uId = `u-${Date.now()}`; const aId = `a-${Date.now()}`;
    setMessages(s => [...s, { id: uId, role: "user", content: text, attachments: atts.length ? atts : null }]);
    setInput(""); setAttachments([]); setIsStreaming(true); setMediaJob(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const ctrl = new AbortController(); abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-language": lang },
        body: JSON.stringify({ mode: "send", conversationId: activeId ?? undefined, message: text, attachmentIds: atts.map(a => a.fileId), model: chatModelId, params: { maxTokens: 2048 } }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) { const d = await res.json().catch(() => null); throw new Error(d?.error || "Erreur"); }

      const reader = res.body.getReader(); const decoder = new TextDecoder();
      let full = "", buf = ""; let meta: { conversationId?: string; messageId?: string; media?: ChatMedia | null; generatedFile?: GeneratedFileInfo | null } = {};
      setMessages(s => [...s, { id: aId, role: "assistant", content: "", model: chatModelId, streaming: true }]);

      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true }); let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue; const p = line.slice(5).trim();
            if (!p || p === "[DONE]") continue;
              try { const j = JSON.parse(p);
              if (j.nova) {
                if (j.nova.phase === "generating") {
                  setMediaJob(j.nova.fileType ? "file" : (j.nova.media ?? "image"));
                } else {
                  meta = { ...meta, ...j.nova }; setMediaJob(null);
                }
              } else { const d = j.choices?.[0]?.delta?.content; if (typeof d === "string") { full += d; setMessages(s => s.map(m => m.id === aId ? { ...m, content: full } : m)); } }
            } catch {}
          }
        }
      }
      setMessages(s => s.map(m => m.id === aId ? {
        ...m, content: full, streaming: false,
        meta: meta.media ? { media: meta.media } : meta.generatedFile ? { generatedFile: meta.generatedFile } : null
      } : m));
      if (!activeId && meta.conversationId) { setActiveId(meta.conversationId); refreshConvs(); }
      const cid = meta.conversationId || activeId;
      if (cid) { const r = await fetch(`/api/conversations/${cid}`).then(r => r.json()).catch(() => null); if (r?.ok) setMessages(r.messages.map((m: Msg) => ({ ...m, streaming: false }))); }
    } catch (e) {
      if ((e as Error).name !== "AbortError") { toast((e as Error).message || "Erreur", "bad"); setMessages(s => s.filter(m => m.id !== uId && m.id !== aId)); setInput(text); setAttachments(atts); }
    } finally { setIsStreaming(false); setMediaJob(null); abortRef.current = null; }
  }

  async function readAloud(m: Msg) {
    if (ttsPlaying) { audioRef.current?.pause(); setTtsPlaying(null); return; }
    setTtsPlaying(m.id);
    try {
      const res = await fetch("/api/audio/tts", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: m.content.replace(/```[\s\S]*?```/g, "").replace(/[#*_>~|`]/g, "").slice(0, 1200), model: ttsModelId || "openai/tts-1", voice: ttsVoice }),
      }).then(r => r.json());
      if (res.ok) { const a = new Audio(res.audio.url); audioRef.current = a; a.onended = () => setTtsPlaying(null); a.play(); }
      else { toast(res.error || "TTS échoué", "bad"); setTtsPlaying(null); }
    } catch { setTtsPlaying(null); }
  }

  // Derive dynamic accent from theme
  const ac = colors.matrixColor || colors.primary || "#00ff41";

  return (
    <div className="h-dvh overflow-hidden flex relative bg-black font-mono" style={{ color: ac }}>
      <Toaster />
      <MatrixBg />

      {/* Sidebar — uses CSS var for colour */}
      <aside className="relative z-10 w-64 shrink-0 flex flex-col bg-black/85 backdrop-blur-xl" style={{ borderRight: `1px solid ${ac}30` }}>
        <div className="p-4" style={{ borderBottom: `1px solid ${ac}30` }}>
          <div className="flex items-center gap-2 mb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/veloris-logo.png" alt="V" className="w-7 h-7 rounded-lg" />
            <span className="text-[11px] font-black tracking-[0.3em] uppercase" style={{ color: ac }}>VELORIS</span>
          </div>
          <button onClick={newChat} className="w-full flex items-center justify-center gap-2 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all" style={{ border: `1px solid ${ac}60`, color: ac, background: "transparent" }} onMouseEnter={e => (e.currentTarget.style.background = `${ac}15`)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <Plus className="w-3.5 h-3.5" /> NEW
          </button>
        </div>

        <div className="px-3 py-2" style={{ borderBottom: `1px solid ${ac}15` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="SEARCH..." className="w-full bg-transparent text-[11px] font-mono py-2 px-3 rounded-lg outline-none transition-all" style={{ border: `1px solid ${ac}25`, color: ac + "cc" }} />
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {convs.map(c => (
            <div key={c.id} onClick={() => openConv(c.id)} className={clsx("group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-all text-[11px]")} style={{ background: activeId === c.id ? `${ac}15` : "transparent", border: activeId === c.id ? `1px solid ${ac}40` : "1px solid transparent", color: activeId === c.id ? ac : `${ac}80` }}>
              <span style={{ opacity: 0.4 }}>&gt;</span>
              <span className="flex-1 truncate">{c.title}</span>
              <button onClick={e => { e.stopPropagation(); deleteConv(c.id); }} className="opacity-0 group-hover:opacity-100 transition-all hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>

        {/* Nav */}
        <div className="p-3 space-y-1" style={{ borderTop: `1px solid ${ac}20` }}>
          <Link href="/builder" className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] uppercase tracking-widest transition-all" style={{ color: `${ac}80` }} onMouseEnter={e => { e.currentTarget.style.color = ac; e.currentTarget.style.background = `${ac}10`; }} onMouseLeave={e => { e.currentTarget.style.color = `${ac}80`; e.currentTarget.style.background = "transparent"; }}>
            <Code2 className="w-3.5 h-3.5" /> CODE STUDIO
          </Link>
          <Link href="/settings" className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] uppercase tracking-widest transition-all" style={{ color: `${ac}80` }} onMouseEnter={e => { e.currentTarget.style.color = ac; e.currentTarget.style.background = `${ac}10`; }} onMouseLeave={e => { e.currentTarget.style.color = `${ac}80`; e.currentTarget.style.background = "transparent"; }}>
            <Settings2 className="w-3.5 h-3.5" /> SETTINGS
          </Link>
        </div>

        {/* Model selectors */}
        <div className="p-3 space-y-3" style={{ borderTop: `1px solid ${ac}20` }}>
          <ModelSelect label="CHAT" value={chatModelId} onChange={setChatModelId} options={chatModels.map(m => ({ v: m.id, l: m.title }))} ac={ac} />
          <ModelSelect label="IMAGE" value={imgModelId} onChange={setImgModelId} options={imgModels.map(m => ({ v: m.id, l: m.title }))} ac={ac} />
          <ModelSelect label="AUDIO" value={ttsModelId} onChange={setTtsModelId} options={audioModels.filter(m => m.kind === "tts").map(m => ({ v: m.id, l: m.title }))} ac={ac} />
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col min-w-0">
        <header className="h-12 shrink-0 flex items-center justify-between px-6 bg-black/70 backdrop-blur-xl" style={{ borderBottom: `1px solid ${ac}20` }}>
          <div className="flex items-center gap-3">
            <span style={{ color: `${ac}60` }} className="text-xs">//</span>
            <span style={{ color: ac }} className="font-black text-sm uppercase tracking-widest">{chatModels.find(m => m.id === chatModelId)?.title || "VELORIS"}</span>
          </div>
          {isStreaming && <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: ac }}><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ac }} /> PROCESSING</div>}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
            {messages.length === 0 && !isStreaming && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="mb-8">
                  <div style={{ color: `${ac}60` }} className="text-xs mb-2">$ veloris --init</div>
                  <h1 className="text-4xl font-black uppercase tracking-tight mb-2" style={{ color: ac, textShadow: `0 0 30px ${ac}66` }}>SYSTEM ONLINE</h1>
                  <p style={{ color: `${ac}80` }} className="text-sm">// Bonjour {user.name}. Chat · Images · Audio · Code.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 max-w-2xl">
                  {STARTERS.map((s, i) => (
                    <motion.button key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} onClick={() => setInput(s.prompt)}
                      className="p-4 rounded-xl text-left transition-all group" style={{ border: `1px solid ${ac}20`, color: `${ac}90` }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = `${ac}60`; e.currentTarget.style.background = `${ac}08`; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = `${ac}20`; e.currentTarget.style.background = "transparent"; }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <s.icon className="w-4 h-4" style={{ color: ac }} />
                        <span className="text-[11px] font-black uppercase tracking-widest">{s.label}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: `${ac}60` }}>{s.prompt}</p>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {messages.map(m => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="group">
                  {m.role === "user" ? (
                    <div className="flex flex-col items-end gap-2">
                      {m.attachments?.map(a => <span key={a.fileId} className="text-[10px] px-2 py-1 rounded font-mono flex items-center gap-1.5" style={{ border: `1px solid ${ac}30`, color: `${ac}80` }}>{a.kind === "image" ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />} {a.name}</span>)}
                      {m.content && <div className="max-w-[80%] rounded-xl rounded-tr-sm px-5 py-3 text-sm leading-relaxed" style={{ border: `1px solid ${ac}30`, background: `${ac}08`, color: `${ac}dd` }}><span style={{ color: `${ac}50`, marginRight: 8 }}>&gt;</span>{m.content}</div>}
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-1" style={{ background: `${ac}15`, border: `1px solid ${ac}30` }}><span className="text-[9px] font-black" style={{ color: ac }}>AI</span></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm leading-loose" style={{ color: `${ac}dd` }}>
                          {m.streaming ? <TypewriterText text={m.content} speed={4} /> : <Markdown content={m.content} />}
                        </div>
                        {m.meta?.media && <MediaInline media={m.meta.media} ac={ac} />}
                        {m.meta?.generatedFile && <FileInline file={m.meta.generatedFile} ac={ac} />}
                        <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Btn icon={Copy} label="COPY" ac={ac} onClick={() => { navigator.clipboard.writeText(m.content); toast("Copié", "ok"); }} />
                          <Btn icon={ttsPlaying === m.id ? VolumeX : Volume2} label="SPEAK" ac={ac} onClick={() => readAloud(m)} />
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {mediaJob && (
              <div className="flex gap-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${ac}15`, border: `1px solid ${ac}30` }}><Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: ac }} /></div>
                <div className="rounded-xl px-5 py-4 flex-1 max-w-sm" style={{ border: `1px solid ${ac}30`, background: `${ac}05` }}>
                  <div className="text-[10px] uppercase tracking-widest font-black flex items-center gap-2 mb-3" style={{ color: ac }}><Sparkles className="w-3 h-3 animate-pulse" /> {mediaJob === "file" ? "GENERATING FILE..." : mediaJob === "image" ? "RENDERING..." : "SYNTHESIZING..."}</div>
                  {[0, 1, 2].map(i => (<div key={i} className="h-1 rounded-full overflow-hidden mb-1" style={{ background: `${ac}20` }}><motion.div className="h-full rounded-full" style={{ background: `${ac}80` }} initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 1.5 + i * 0.3, repeat: Infinity, ease: "linear" }} /></div>))}
                </div>
              </div>
            )}
          </div>
        </div>

        {attachments.length > 0 && (
          <div className="px-6 py-2" style={{ borderTop: `1px solid ${ac}10`, background: "rgba(0,0,0,0.5)" }}>
            <div className="max-w-4xl mx-auto flex flex-wrap gap-2">
              {attachments.map(a => (<div key={a.fileId} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px]" style={{ border: `1px solid ${ac}30`, color: `${ac}80` }}>{a.uploading ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: ac }} /> : <FileText className="w-3 h-3" />}<span>{a.name}</span><button onClick={() => setAttachments(s => s.filter(x => x.fileId !== a.fileId))} className="hover:text-red-400"><X className="w-3 h-3" /></button></div>))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-6 py-5 bg-black/70 backdrop-blur-xl" style={{ borderTop: `1px solid ${ac}20` }}>
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl transition-all duration-300" style={{ border: `1px solid ${ac}30`, background: "rgba(0,0,0,0.6)" }}
              onFocus={e => { (e.currentTarget as HTMLDivElement).style.borderColor = ac; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 25px ${ac}20`; }}
              onBlur={e => { (e.currentTarget as HTMLDivElement).style.borderColor = `${ac}30`; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>
              <div className="flex items-center px-4 pt-3 pb-1">
                <span style={{ color: `${ac}50` }} className="text-sm mr-3 select-none shrink-0">&gt;_</span>
                <textarea ref={textareaRef} value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Enter command..." rows={1}
                  className="flex-1 bg-transparent border-none outline-none resize-none text-sm leading-relaxed"
                  style={{ color: `${ac}cc`, caretColor: ac }}
                />
              </div>
              <div className="flex items-center justify-between px-4 pb-3 pt-1">
                <button onClick={() => fileRef.current?.click()} className="text-[10px] uppercase tracking-widest flex items-center gap-1 transition-colors" style={{ color: `${ac}50` }}
                  onMouseEnter={e => (e.currentTarget.style.color = ac)} onMouseLeave={e => (e.currentTarget.style.color = `${ac}50`)}
                ><span>+</span> ATTACH</button>
                <input ref={fileRef} type="file" multiple hidden accept="image/*,audio/*,.txt,.md,.csv,.json,.py,.js,.ts" onChange={e => { onPickFiles(e.target.files); e.target.value = ""; }} />
                {isStreaming ? (
                  <button onClick={() => abortRef.current?.abort()} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all" style={{ border: `1px solid rgba(255,50,50,0.4)`, color: "#ff4444" }}><Square className="w-3.5 h-3.5 fill-current" /></button>
                ) : (
                  <button onClick={send} disabled={!input.trim() && attachments.length === 0} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all disabled:opacity-30" style={{ border: `1px solid ${ac}40`, color: ac }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ModelSelect({ label, value, onChange, options, ac }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[]; ac: string }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-[0.3em] mb-1" style={{ color: `${ac}50` }}>// {label}</div>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full bg-black/60 text-[10px] font-mono py-2 px-3 rounded-lg outline-none transition-all appearance-none" style={{ border: `1px solid ${ac}25`, color: `${ac}cc` }}>
        {options.map(o => <option key={o.v} value={o.v} className="bg-black">{o.l}</option>)}
      </select>
    </div>
  );
}

function Btn({ icon: Icon, label, ac, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; ac: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest transition-colors px-2 py-1 rounded" style={{ color: `${ac}40`, border: "1px solid transparent" }}
      onMouseEnter={e => { e.currentTarget.style.color = ac; e.currentTarget.style.borderColor = `${ac}20`; }}
      onMouseLeave={e => { e.currentTarget.style.color = `${ac}40`; e.currentTarget.style.borderColor = "transparent"; }}
    ><Icon className="w-3 h-3" /> {label}</button>
  );
}

function MediaInline({ media, ac }: { media: ChatMedia; ac: string }) {
  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ border: `1px solid ${ac}20` }}>
      {media.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt={media.prompt || ""} className="w-full max-w-lg" />
      )}
      {media.kind === "audio" && <audio controls src={media.url} className="w-full h-10" preload="none" />}
      <div className="flex gap-2 p-3" style={{ background: `${ac}08` }}>
        <a href={media.url} download={media.name} className="text-[10px] px-3 py-1.5 rounded font-mono uppercase tracking-widest flex items-center gap-1.5 transition-colors" style={{ border: `1px solid ${ac}30`, color: `${ac}80` }}><ArrowDownToLine className="w-3 h-3" /> DL</a>
        {media.prompt && <button className="text-[10px] px-3 py-1.5 rounded font-mono uppercase tracking-widest flex items-center gap-1.5 transition-colors" style={{ border: `1px solid ${ac}30`, color: `${ac}80` }} onClick={() => { navigator.clipboard.writeText(media.prompt!); toast("Copié", "ok"); }}><Copy className="w-3 h-3" /> PROMPT</button>}
        <span className="ml-auto text-[9px] font-mono self-center" style={{ color: `${ac}40` }}>{media.model?.split("/").pop()}</span>
      </div>
    </div>
  );
}

const FILE_ICONS: Record<string, string> = {
  docx: "📄", pdf: "📕", pptx: "📊", xlsx: "📈", csv: "📋",
  txt: "📝", md: "📝", json: "🗂️", xml: "🗂️", sql: "🗄️",
  py: "🐍", js: "⚡", ts: "⚡", html: "🌐", css: "🎨",
  lua: "🌙", java: "☕", cpp: "⚙️", php: "🐘",
  zip: "🗜️", rbxlx: "🎮", obj: "📐", gltf: "🔮", stl: "🖨️",
};

function FileInline({ file, ac }: { file: GeneratedFileInfo; ac: string }) {
  const [downloading, setDownloading] = useState(false);
  const icon = FILE_ICONS[file.fileType] || "📁";
  const sizeKb = file.size ? `${(file.size / 1024).toFixed(1)} Ko` : "";

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast("Erreur de téléchargement", "bad");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${ac}30` }}>
      <div className="px-4 py-4 flex items-center gap-4" style={{ background: `${ac}08` }}>
        <span className="text-3xl select-none">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate mb-0.5" style={{ color: ac }}>{file.name}</div>
          <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color: `${ac}50` }}>
            {file.fileType.toUpperCase()} · AI generated {sizeKb ? `· ${sizeKb}` : ""}
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-50 shrink-0"
          style={{ border: `1px solid ${ac}60`, color: ac, background: `${ac}15` }}
          onMouseEnter={e => { if (!downloading) e.currentTarget.style.background = `${ac}30`; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${ac}15`; }}
        >
          {downloading
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…</>
            : <><ArrowDownToLine className="w-3.5 h-3.5" /> Télécharger</>}
        </button>
      </div>
    </div>
  );
}
