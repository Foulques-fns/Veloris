"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, AudioLines, Code2, Copy, Image as ImageIcon,
  Loader2, Mic, Plus, RefreshCw, Send, Settings2,
  Sparkles, Volume2, VolumeX, X, ArrowDownToLine, Square,
  MessageSquareText, FileText, Pencil, Trash2, Search
} from "lucide-react";
import { Logo, VelorisWordmark, ThemeToggle, toast, Toaster } from "./ui";
import { Markdown } from "./Markdown";
import { useI18n } from "@/context/I18nContext";
import clsx from "clsx";
import type { ChatMedia } from "@/lib/media-intent";

type User = { id: string; email: string; name: string; role: string; plan: string };
type ChatModel = { id: string; title: string; vendor: string; vision: boolean; params: string[]; health: string };
type Attachment = { fileId: string; name: string; mime: string; kind: string; url: string; uploading?: boolean };
type Msg = {
  id: string; role: "user" | "assistant"; content: string; model?: string | null;
  attachments?: Attachment[] | null; meta?: { media?: ChatMedia } | null;
};
type Conv = { id: string; title: string; model: string; updatedAt: string };

const STARTERS = [
  { icon: ImageIcon, title: "Image", prompt: "Génère une image d'un phare dans la brume nocturne, style cinématique" },
  { icon: AudioLines, title: "Audio", prompt: "Lis ce texte : Bienvenue dans l'univers VELORIS, votre assistant premium." },
  { icon: Sparkles, title: "Question", prompt: "Explique-moi comment fonctionne un transformer en deep learning" },
  { icon: Code2, title: "Code", prompt: "Écris une fonction TypeScript de debounce avec types génériques" },
];

export default function ChatApp({ user }: { user: User }) {
  const { t, lang } = useI18n();

  // Models
  const [models, setModels] = useState<ChatModel[]>([]);
  const [modelId, setModelId] = useState("openai/gpt-5.4-nano");

  // Conversations
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Messages
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [mediaJob, setMediaJob] = useState<string | null>(null);

  // UI
  const [search, setSearch] = useState("");
  const [ttsPlaying, setTtsPlaying] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Init
  useEffect(() => {
    fetch("/api/models").then(r => r.json()).then(d => {
      if (d.ok) { setModels(d.chat); if (d.defaults?.chat) setModelId(d.defaults.chat); }
    }).catch(() => {});
    refreshConvs();
  }, []);

  // Scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText]);

  async function refreshConvs(q?: string) {
    const res = await fetch(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(r => r.json()).catch(() => null);
    if (res?.ok) setConvs(res.conversations);
  }

  useEffect(() => { const t = setTimeout(() => refreshConvs(search), 200); return () => clearTimeout(t); }, [search]);

  async function openConv(id: string) {
    abortRef.current?.abort();
    setIsStreaming(false); setStreamText(""); setActiveId(id);
    const res = await fetch(`/api/conversations/${id}`).then(r => r.json()).catch(() => null);
    if (res?.ok) setMessages(res.messages);
  }

  function newChat() {
    abortRef.current?.abort();
    setIsStreaming(false); setStreamText(""); setActiveId(null); setMessages([]); setAttachments([]);
    textareaRef.current?.focus();
  }

  async function deleteConv(id: string) {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConvs(s => s.filter(c => c.id !== id));
    if (activeId === id) newChat();
  }

  // File upload
  async function onPickFiles(list: FileList | null) {
    if (!list) return;
    for (const f of Array.from(list).slice(0, 4)) {
      const tmp: Attachment = { fileId: `tmp-${Date.now()}`, name: f.name, mime: f.type, kind: "doc", url: "", uploading: true };
      setAttachments(s => [...s, tmp]);
      const fd = new FormData(); fd.append("file", f);
      const res = await fetch("/api/files", { method: "POST", body: fd }).then(r => r.json()).catch(() => null);
      setAttachments(s => s.map(a => a.fileId === tmp.fileId ? (res?.ok ? { ...res.file, uploading: false } : null) : a).filter(Boolean) as Attachment[]);
    }
  }

  // Send
  async function send() {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    const text = input.trim();
    const atts = attachments.filter(a => !a.uploading);

    const optimistic: Msg = { id: `u-${Date.now()}`, role: "user", content: text, attachments: atts.length ? atts : null };
    setMessages(s => [...s, optimistic]);
    setInput(""); setAttachments([]); setIsStreaming(true); setStreamText(""); setMediaJob(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-language": lang },
        body: JSON.stringify({
          mode: "send", conversationId: activeId ?? undefined,
          message: text, attachmentIds: atts.map(a => a.fileId),
          model: modelId, params: { reasoningEffort: "low", maxTokens: 2048 },
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Échec");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "", buffer = "";
      let meta: { conversationId?: string; messageId?: string; media?: ChatMedia | null } = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const p = line.slice(5).trim();
            if (!p || p === "[DONE]") continue;
            try {
              const j = JSON.parse(p);
              if (j.nova) {
                if (j.nova.phase === "generating") setMediaJob(j.nova.media ?? "image");
                else {
                  meta = { ...meta, ...j.nova };
                  setMediaJob(null);
                  if (j.nova.degraded) {
                    toast("Mode dégradé : réponse fournie par le fallback gratuit Pollinations.", "info");
                  }
                }
              } else {
                const d = j.choices?.[0]?.delta?.content;
                if (typeof d === "string") { full += d; setStreamText(full); }
              }
            } catch {}
          }
        }
      }

      // Finalize
      if (!activeId && meta.conversationId) { setActiveId(meta.conversationId); refreshConvs(); }
      setMessages(s => [
        ...s.filter(m => m.id !== optimistic.id), optimistic,
        { id: meta.messageId || `a-${Date.now()}`, role: "assistant", content: full || "(pas de réponse)", model: modelId, meta: meta.media ? { media: meta.media } : null },
      ]);
      setStreamText("");
      if (meta.conversationId || activeId) {
        const cid = meta.conversationId || activeId;
        const r = await fetch(`/api/conversations/${cid}`).then(r => r.json()).catch(() => null);
        if (r?.ok) setMessages(r.messages);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast((e as Error).message || "Erreur", "bad");
      setMessages(s => s.filter(m => m.id !== optimistic.id));
      setInput(text); setAttachments(atts);
    } finally {
      setIsStreaming(false); setStreamText(""); setMediaJob(null); abortRef.current = null;
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // TTS read aloud
  async function readAloud(m: Msg) {
    if (ttsPlaying) { audioRef.current?.pause(); setTtsPlaying(null); return; }
    setTtsPlaying(m.id);
    try {
      const res = await fetch("/api/audio/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: m.content.replace(/```[\s\S]*?```/g, "").replace(/[#*_>~|`]/g, "").slice(0, 1200), model: "openai/tts-1", voice: "alloy" }),
      }).then(r => r.json());
      if (res.ok) { const a = new Audio(res.audio.url); audioRef.current = a; a.onended = () => setTtsPlaying(null); a.play(); }
      else { toast(res.error || "TTS échoué", "bad"); setTtsPlaying(null); }
    } catch { setTtsPlaying(null); }
  }

  const currentModel = models.find(m => m.id === modelId);

  return (
    <div className="h-dvh bg-[var(--bg)] text-[var(--text)] overflow-hidden flex">
      <Toaster />

      {/* ── Sidebar ── */}
      <aside className="w-72 border-r border-[var(--border)] bg-[var(--bg-elev)] flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3 mb-6">
            <Logo size={30} /> <VelorisWordmark size="sm" />
          </div>
          <button onClick={newChat} className="w-full btn btn-primary !h-11 !rounded-2xl gap-2">
            <Plus className="w-4 h-4" /> Nouvelle conversation
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="input !pl-9 !py-2 !text-sm" />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto px-3 space-y-0.5">
          {convs.map(c => (
            <div key={c.id} className={clsx("group flex items-center rounded-xl px-3 py-2.5 cursor-pointer transition-all", activeId === c.id ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "hover:bg-[var(--panel)]")} onClick={() => openConv(c.id)}>
              <span className="flex-1 text-sm truncate">{c.title}</span>
              <button onClick={e => { e.stopPropagation(); deleteConv(c.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-[var(--bad)] transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>

        {/* Nav links */}
        <div className="border-t border-[var(--border)] p-3 space-y-1">
          <SideLink href="/builder" icon={Code2} label="Code Studio" />
          <SideLink href="/settings" icon={Settings2} label="Réglages" />
          {user.role === "admin" && <SideLink href="/admin" icon={Sparkles} label="Admin" />}
        </div>

        {/* Model selector */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted font-bold mb-2">Modèle</div>
          <select value={modelId} onChange={e => setModelId(e.target.value)} className="select-native !h-9 !text-xs">
            {models.map(m => <option key={m.id} value={m.id}>{m.title} · {m.vendor}</option>)}
          </select>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute inset-0 bg-grid opacity-10 pointer-events-none" />
        <div className="aurora opacity-30 pointer-events-none" />
        
        {/* Header */}
        <header className="relative z-20 h-16 border-b border-white/5 bg-black/40 backdrop-blur-2xl flex items-center justify-between px-6">
          <div className="flex items-center gap-3 min-w-0">
             {!sidebarOpen && (
               <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-white/10 rounded-lg text-muted transition-colors">
                  <MessageSquareText className="w-5 h-5" />
               </button>
             )}
             <div className="flex flex-col">
               <span className="text-[13px] font-bold tracking-tight text-white flex items-center gap-2">
                  {currentModel?.title || "VELORIS"}
                  {currentModel?.vision && <span className="chip !text-[9px] !bg-white/5 !border-none !py-0.5">vision</span>}
               </span>
               <span className="text-[10px] text-muted uppercase tracking-widest">{currentModel?.vendor || "AI Intelligence"}</span>
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/builder" className="btn !h-10 !rounded-xl !px-4 gap-2 border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all font-bold uppercase tracking-widest text-[11px]">
              <Code2 className="w-4 h-4" /> Code Studio
            </Link>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scroll-smooth">
          <div className="max-w-4xl mx-auto px-6 py-14 space-y-12">
            {/* Empty state */}
            {messages.length === 0 && !isStreaming && (
              <div className="min-h-[60vh] flex flex-col items-center justify-center text-center">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="orbit-wrap mb-10"
                >
                  <Logo size={80} />
                  <span className="orbit-ring" style={{ inset: -15, borderWidth: 2 }} />
                </motion.div>
                <motion.h1 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-5xl md:text-6xl font-black tracking-tighter mb-4 leading-tight" 
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {t('chat.welcome').replace('{name}', user.name.split(" ")[0])}
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-muted text-xl mb-12 max-w-2xl font-light"
                >
                  Génération d'images, synthèse vocale, transcription et intelligence avancée. Demandez, VELORIS exécute.
                </motion.p>
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="grid sm:grid-cols-2 gap-4 max-w-3xl w-full"
                >
                  {STARTERS.map((s, i) => (
                    <button key={s.title}
                      onClick={() => setInput(s.prompt)} 
                      className="glass rounded-3xl p-6 text-left border-white/5 hover:border-[var(--accent)]/30 hover:bg-white/5 transition-all group"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                           <s.icon className="w-5 h-5" />
                        </div>
                        <span className="text-base font-bold">{s.title}</span>
                      </div>
                      <p className="text-sm text-muted line-clamp-2 leading-relaxed">{s.prompt}</p>
                    </button>
                  ))}
                </motion.div>
              </div>
            )}

            {/* Messages */}
            <AnimatePresence initial={false}>
              {messages.map(m => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="group w-full">
                  {m.role === "user" ? (
                    <div className="flex flex-col items-end gap-2 max-w-full">
                      {m.attachments && m.attachments.length > 0 && (
                         <div className="flex flex-wrap justify-end gap-2 max-w-[85%] mb-1">
                           {m.attachments.map(a => (
                             <div key={a.fileId}>
                               {a.kind === "image" ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={a.url} alt={a.name} className="max-w-[240px] rounded-2xl border border-white/10 shadow-lg object-cover" />
                               ) : (
                                  <span className="chip !py-2 !px-3 glass !border-white/10">
                                    {a.kind === "audio" ? <AudioLines className="w-3.5 h-3.5 text-[var(--accent)]" /> : <FileText className="w-3.5 h-3.5 text-[var(--accent)]" />} {a.name}
                                  </span>
                               )}
                             </div>
                           ))}
                         </div>
                      )}
                      {m.content && (
                        <div className="max-w-[85%] rounded-3xl rounded-tr-sm px-6 py-4 text-[16px] leading-relaxed border border-[var(--accent)]/20 shadow-2xl"
                          style={{ background: "linear-gradient(135deg, rgba(201,162,39,0.1) 0%, rgba(10,10,15,0.9) 100%)", backdropFilter: "blur(10px)" }}>
                          {m.content}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-5 max-w-full">
                      <div className="shrink-0 mt-1"><Logo size={34} animated={false} /></div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="glass rounded-3xl rounded-tl-sm px-6 py-5 border-white/5 shadow-xl">
                          <div className="text-[17px] leading-relaxed font-light text-white/90">
                             <Markdown content={m.content} />
                          </div>
                          {m.meta?.media && <MediaInline media={m.meta.media} />}
                        </div>
                        <div className="flex gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity px-2 transform translate-y-1 group-hover:translate-y-0">
                          <MiniBtn icon={Copy} onClick={() => { navigator.clipboard.writeText(m.content); toast("Copié", "ok"); }} />
                          <MiniBtn icon={ttsPlaying === m.id ? VolumeX : Volume2} onClick={() => readAloud(m)} />
                          {m.model && <span className="text-[10px] text-muted font-bold tracking-widest uppercase ml-2 opacity-50">{m.model.split("/").pop()}</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Streaming */}
            {isStreaming && !streamText && !mediaJob && (
              <div className="flex items-center gap-5">
                <Logo size={34} animated={false} className="gen-pulse" />
                <div className="flex gap-1.5">
                   {[0,1,2].map(i => <motion.span key={i} animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: i*0.2 }} className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />)}
                </div>
              </div>
            )}
            
            {mediaJob && (
              <div className="flex gap-5">
                <Logo size={34} animated={false} className="gen-pulse shrink-0" />
                <div className="glass rounded-3xl p-6 border-white/5 shadow-xl w-full max-w-md">
                  <div className="flex items-center gap-3 text-sm font-bold tracking-widest uppercase text-[var(--accent)] mb-4">
                     <Sparkles className="w-4 h-4 animate-pulse" /> 
                     {mediaJob === "image" ? "Création Visuelle..." : mediaJob === "tts" ? "Synthèse Vocale..." : "Génération..."}
                  </div>
                  <div className="w-full h-40 bg-white/5 rounded-2xl relative overflow-hidden">
                     <motion.div 
                        initial={{ x: "-100%" }}
                        animate={{ x: "100%" }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-1/2"
                     />
                  </div>
                </div>
              </div>
            )}
            
            {streamText && (
              <div className="flex gap-5">
                <Logo size={34} animated={false} className="gen-pulse shrink-0 mt-1" />
                <div className="flex-1 min-w-0 glass rounded-3xl rounded-tl-sm p-6 border-white/5 shadow-xl text-[17px] leading-relaxed font-light text-white/90">
                   <Markdown content={streamText} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Attachments bar */}
        {attachments.length > 0 && (
          <div className="relative z-20 px-6">
            <div className="max-w-4xl mx-auto flex flex-wrap gap-2 pb-3">
              {attachments.map(a => (
                <div key={a.fileId} className="chip gap-2 !px-3 !py-2 bg-white/5 border-white/10">
                  {a.uploading ? <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" /> : a.kind === "image" ? <ImageIcon className="w-3 h-3 text-[var(--accent)]" /> : <FileText className="w-3 h-3 text-[var(--accent)]" />}
                  <span className="max-w-32 truncate text-[11px] font-semibold">{a.name}</span>
                  <button onClick={() => setAttachments(s => s.filter(x => x.fileId !== a.fileId))} className="hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="relative z-20 px-6 pb-8">
          <div className="max-w-4xl mx-auto relative group">
             <div className="absolute inset-0 bg-[var(--accent)] opacity-0 blur-3xl group-focus-within:opacity-10 transition-opacity duration-700" />
             <div className="relative glass rounded-[3rem] p-3 flex items-end gap-3 border-white/10 bg-black/60 backdrop-blur-3xl focus-within:border-[var(--accent)]/50 transition-all duration-500 shadow-2xl">
                <button onClick={() => fileRef.current?.click()} className="p-4 rounded-full hover:bg-white/5 text-muted transition-colors mb-1">
                   <Plus className="w-5 h-5" />
                </button>
                <input ref={fileRef} type="file" multiple hidden accept="image/*,audio/*,.txt,.md,.csv,.json,.py,.js,.ts" onChange={e => { onPickFiles(e.target.files); e.target.value = ""; }} />
                
                <textarea 
                  ref={textareaRef} 
                  value={input}
                  onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 240) + "px"; }}
                  onKeyDown={handleKeyDown}
                  rows={1} 
                  placeholder="Architectured instructions..."
                  className="flex-1 bg-transparent border-none outline-none resize-none py-4 text-lg text-white placeholder:text-muted/40 font-light"
                />
                
                {isStreaming ? (
                  <motion.button 
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     onClick={() => abortRef.current?.abort()} 
                     className="p-4 rounded-full bg-red-500/20 text-red-500 shadow-[0_0_30px_rgba(255,0,0,0.2)] mb-1"
                  >
                     <Square className="w-5 h-5 fill-current" />
                  </motion.button>
                ) : (
                  <motion.button 
                     whileHover={{ scale: 1.05 }}
                     whileTap={{ scale: 0.95 }}
                     onClick={send} 
                     disabled={!input.trim() && attachments.length === 0} 
                     className="p-4 rounded-full bg-[var(--accent)] text-black disabled:opacity-40 transition-all shadow-[0_0_30px_rgba(201,162,39,0.3)] mb-1"
                  >
                     <Send className="w-5 h-5" />
                  </motion.button>
                )}
             </div>
             <p className="text-center text-[10px] uppercase tracking-[0.2em] text-muted mt-4 font-black opacity-50">
               Intelligence Premium · {currentModel?.title || "AI Core"}
             </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function SideLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted hover:text-[var(--text)] hover:bg-[var(--panel)] transition-all">
      <Icon className="w-4 h-4" /> {label}
    </Link>
  );
}

function MiniBtn({ icon: Icon, onClick }: { icon: React.ComponentType<{ className?: string }>; onClick: () => void }) {
  return <button onClick={onClick} className="p-1.5 rounded-lg text-muted hover:text-[var(--accent)] hover:bg-[var(--panel)] transition-all"><Icon className="w-3.5 h-3.5" /></button>;
}

function MediaInline({ media }: { media: ChatMedia }) {
  return (
    <div className="mt-3">
      {media.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt={media.prompt || ""} className="rounded-xl max-w-full border border-[var(--border)]" />
      )}
      {media.kind === "audio" && (
        <audio controls src={media.url} className="w-full h-10" preload="none" />
      )}
      <div className="flex gap-2 mt-2">
        <a href={media.url} download={media.name} className="btn !h-8 !px-3 !text-xs"><ArrowDownToLine className="w-3 h-3" /> Télécharger</a>
        {media.prompt && <button className="btn !h-8 !px-3 !text-xs" onClick={() => { navigator.clipboard.writeText(media.prompt!); toast("Prompt copié", "ok"); }}><Copy className="w-3 h-3" /> Prompt</button>}
        <span className="chip !text-[9px] ml-auto">{media.model.split("/").pop()}</span>
      </div>
    </div>
  );
}
