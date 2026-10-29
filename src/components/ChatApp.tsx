"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowDownToLine, ArrowUp, AudioLines, Clapperboard, Copy, FileText, Image as ImageIcon,
  LayoutDashboard, Loader2, LogOut, MessageSquarePlus, Mic, Pencil, RefreshCw, Search,
  Settings as SettingsIcon, SlidersHorizontal, Sparkles, Square, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { Logo, Modal, ThemeToggle, Toaster, toast } from "./ui";
import type { ChatMedia } from "@/lib/media-intent";

/* ───────────────────────────── types ───────────────────────────── */

type User = {
  id: string; email: string; name: string; role: "user" | "admin"; plan: string;
  emailVerified: boolean; customInstructions: string; personality: string;
};

type ChatModel = {
  id: string; title: string; vendor: string; vision: boolean; params: string[]; contextLength: number; health: string;
};

type Attachment = { fileId: string; name: string; mime: string; kind: "image" | "doc" | "audio"; url: string; uploading?: boolean };

type Msg = {
  id: string; role: "user" | "assistant"; content: string; model?: string | null;
  attachments?: Attachment[] | null; createdAt?: string;
  meta?: { media?: ChatMedia } | null;
};

type Conv = { id: string; title: string; model: string; updatedAt: string };

type Params = { temperature: number; topP: number; maxTokens: number; reasoningEffort: "low" | "medium" | "high" };

const DEFAULT_PARAMS: Params = { temperature: 0.8, topP: 0.95, maxTokens: 2048, reasoningEffort: "low" };

const SUGGESTIONS = [
  { title: "Générer une image", prompt: "Génère-moi une image d'un phare bleu électrique sous un ciel rouge néon, au-dessus d'un océan sombre, style cinématique" },
  { title: "Lire à voix haute", prompt: "Lis ce texte : Bienvenue sur Nova, l'assistant qui écrit, illustre et parle." },
  { title: "Expliquer simplement", prompt: "Explique le fonctionnement d'un modèle de langage comme si j'avais douze ans." },
  { title: "Écrire du code", prompt: "Écris une fonction TypeScript debounce, avec un exemple d'utilisation commenté." },
];

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " (image) ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>~|-]{1,4}/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/* ───────────────────────────── main app ───────────────────────────── */

export default function ChatApp({ user }: { user: User }) {
  const router = useRouter();
  const [models, setModels] = useState<ChatModel[]>([]);
  const [modelsError, setModelsError] = useState(false);
  const [defaults, setDefaults] = useState<{ chat: string; tts: string }>({ chat: "", tts: "openai/tts-1" });
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [pendingStart, setPendingStart] = useState(false);
  const [modelId, setModelId] = useState<string>("");
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<Conv | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editMsg, setEditMsg] = useState<Msg | null>(null);
  const [editValue, setEditValue] = useState("");
  const [ttsLoading, setTtsLoading] = useState<string | null>(null);
  const [paramsOpen, setParamsOpen] = useState(false);
  const [mediaJob, setMediaJob] = useState<"image" | "audio" | "video" | "transcribe" | null>(null);
  const [recording, setRecording] = useState(false);
  const [usage, setUsage] = useState<{ images: { used: number; limit: number }; chat: { used: number; limit: number } } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickBottom = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeModel = useMemo(() => models.find((m) => m.id === modelId) ?? models[0], [models, modelId]);

  /** Loads the live free-model catalog; retryable, repairs stale selections. */
  const loadModels = useCallback(async () => {
    setModelsError(false);
    try {
      const mRes = await fetch("/api/models").then((r) => r.json());
      if (mRes.ok && Array.isArray(mRes.chat) && mRes.chat.length > 0) {
        setModels(mRes.chat);
        setDefaults(mRes.defaults);
        setModelId((cur) => (cur && mRes.chat.some((m: ChatModel) => m.id === cur) ? cur : (mRes.defaults.chat as string) || mRes.chat[0].id));
      } else {
        setModelsError(true);
      }
    } catch {
      setModelsError(true);
    }
  }, []);

  /* ── init ── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nova-chat-params");
      if (saved) setParams({ ...DEFAULT_PARAMS, ...JSON.parse(saved) });
      const savedModel = localStorage.getItem("nova-chat-model");
      if (savedModel) setModelId(savedModel);
    } catch { /* ignore */ }

    loadModels();
    (async () => {
      const [cRes, meRes] = await Promise.all([
        fetch("/api/conversations").then((r) => r.json()),
        fetch("/api/auth/me").then((r) => r.json()),
      ]);
      if (cRes.ok) setConvs(cRes.conversations);
      if (meRes.ok) setUsage(meRes.usage);

      const c = new URLSearchParams(window.location.search).get("c");
      if (c) openConversation(c);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("nova-chat-params", JSON.stringify(params));
    } catch { /* ignore */ }
  }, [params]);

  useEffect(() => {
    if (modelId) try { localStorage.setItem("nova-chat-model", modelId); } catch { /* ignore */ }
  }, [modelId]);

  /* auto-scroll */
  const scrollToBottom = useCallback(() => {
    if (stickBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(scrollToBottom, [messages, streamText, scrollToBottom]);

  /* ── conversations ── */
  const openConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setStreaming(false);
    setStreamText("");
    setActiveId(id);
    history.replaceState(null, "", `/chat?c=${id}`);
    const res = await fetch(`/api/conversations/${id}`);
    const data = await res.json();
    if (data.ok) {
      setMessages(data.messages.map((m: Msg) => ({ ...m, attachments: m.attachments ?? null })));
      if (data.conversation.model && models.some((m) => m.id === data.conversation.model)) {
        setModelId(data.conversation.model);
      }
      stickBottom.current = true;
    }
    if (window.innerWidth < 900) setSidebarOpen(false);
  }, [models]);

  async function refreshConvs(q?: string) {
    const res = await fetch(`/api/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    if (data.ok) setConvs(data.conversations);
  }

  useEffect(() => {
    const t = setTimeout(() => refreshConvs(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  function newChat() {
    abortRef.current?.abort();
    setStreaming(false);
    setStreamText("");
    setActiveId(null);
    setMessages([]);
    setAttachments([]);
    history.replaceState(null, "", "/chat");
    textareaRef.current?.focus();
    if (window.innerWidth < 900) setSidebarOpen(false);
  }

  async function deleteConversation(id: string) {
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not delete conversation.", "bad");
    setConvs((s) => s.filter((c) => c.id !== id));
    if (activeId === id) newChat();
    toast("Conversation deleted.");
  }

  async function submitRename() {
    if (!renameTarget) return;
    const title = renameValue.trim();
    if (!title) return;
    const res = await fetch(`/api/conversations/${renameTarget.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
    });
    if (!res.ok) return toast("Rename failed.", "bad");
    setConvs((s) => s.map((c) => (c.id === renameTarget.id ? { ...c, title } : c)));
    setRenameTarget(null);
  }

  /* ── attachments ── */
  async function onPickFiles(list: FileList | null) {
    if (!list) return;
    for (const f of Array.from(list).slice(0, 4)) {
      const placeholder: Attachment = { fileId: `tmp-${Date.now()}`, name: f.name, mime: f.type, kind: "doc", url: "", uploading: true };
      setAttachments((s) => [...s, placeholder]);
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = await res.json();
      setAttachments((s) =>
        s.map((a) =>
          a.fileId === placeholder.fileId
            ? data.ok ? { fileId: data.file.id, name: data.file.name, mime: data.file.mime, kind: data.file.kind, url: data.file.url } : null
            : a,
        ).filter(Boolean) as Attachment[],
      );
      if (!data.ok) toast(data.error || `Could not upload ${f.name}`, "bad");
    }
  }

  /* ── streaming send ── */
  const runStream = useCallback(async (body: Record<string, unknown>) => {
    setStreaming(true);
    setPendingStart(true);
    setStreamText("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        toast(data?.error || "Chat request failed.", "bad");
        setStreaming(false);
        setPendingStart(false);
        return null;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let meta: { conversationId?: string; messageId?: string; media?: ChatMedia | null } = {};
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.nova) {
                if (parsed.nova.phase === "generating") {
                  setMediaJob(parsed.nova.media ?? "image");
                  setPendingStart(true);
                } else {
                  meta = { ...meta, ...parsed.nova };
                  setMediaJob(null);
                }
              } else {
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === "string") {
                  acc += delta;
                  setPendingStart(false);
                  setStreamText(acc);
                }
              }
            } catch { /* ignore partial frames */ }
          }
        }
      }
      return { text: acc, meta };
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("Connection interrupted.", "bad");
      return null;
    } finally {
      setStreaming(false);
      setPendingStart(false);
      setMediaJob(null);
      abortRef.current = null;
    }
  }, []);

  async function send() {
    const text = input.trim();
    const ready = attachments.filter((a) => !a.uploading);
    if ((!text && ready.length === 0) || streaming) return;
    const atts = ready;
    setInput("");
    setAttachments([]);
    const optimistic: Msg = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      attachments: atts.length ? atts : null,
      createdAt: new Date().toISOString(),
    };
    setMessages((s) => [...s, optimistic]);
    stickBottom.current = true;

    const result = await runStream({
      mode: "send",
      conversationId: activeId ?? undefined,
      message: text,
      attachmentIds: atts.map((a) => a.fileId),
      model: modelId,
      params,
    });

    if (result) {
      const convId = result.meta.conversationId ?? activeId;
      if (!activeId && result.meta.conversationId) {
        setActiveId(result.meta.conversationId);
        history.replaceState(null, "", `/chat?c=${result.meta.conversationId}`);
        refreshConvs(search);
      }
      const finalText = result.text;
      setMessages((s) => [
        ...s.filter((m) => m.id !== optimistic.id),
        optimistic,
        {
          id: result.meta.messageId || `a-${Date.now()}`,
          role: "assistant",
          content: finalText || "(no response)",
          model: modelId,
          meta: result.meta.media ? { media: result.meta.media } : null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreamText("");
      if (convId) {
        // reload to get canonical ids for messages
        const res = await fetch(`/api/conversations/${convId}`);
        const data = await res.json();
        if (data.ok) setMessages(data.messages);
      }
      fetch("/api/auth/me").then((r) => r.json()).then((d) => d.ok && setUsage(d.usage)).catch(() => {});
    } else {
      setMessages((s) => s.filter((m) => m.id !== optimistic.id));
      setInput(text);
      setAttachments(atts);
    }
  }

  async function regenerate() {
    if (streaming || !activeId) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    await fetch(`/api/messages/${lastAssistant.id}?onlySelf=1`, { method: "DELETE" });
    setMessages((s) => s.filter((m) => m.id !== lastAssistant.id));
    stickBottom.current = true;
    const result = await runStream({ mode: "continue", conversationId: activeId, model: modelId, params });
    if (result) {
      setMessages((s) => [...s, { id: result.meta.messageId || `a-${Date.now()}`, role: "assistant", content: result.text || "(no response)", model: modelId, createdAt: new Date().toISOString() }]);
      setStreamText("");
    }
  }

  /** Regenerate a media asset (image / audio) as a new message in this chat. */
  async function regenerateMedia(media: ChatMedia) {
    if (streaming || !activeId) return;
    stickBottom.current = true;
    const result = await runStream({
      mode: "media",
      mediaType: media.kind === "audio" ? "tts" : media.kind,
      message: media.prompt || media.text || "",
      model: media.model,
      voice: media.voice,
      conversationId: activeId,
    });
    if (result) {
      setMessages((s) => [
        ...s,
        {
          id: result.meta.messageId || `a-${Date.now()}`,
          role: "assistant",
          content: result.text || "(no response)",
          model: media.model,
          meta: result.meta.media ? { media: result.meta.media } : null,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreamText("");
      fetch("/api/auth/me").then((r) => r.json()).then((d) => d.ok && setUsage(d.usage)).catch(() => {});
    }
  }

  async function saveEdit() {
    if (!editMsg) return;
    const content = editValue.trim();
    if (!content) return;
    const target = editMsg;
    setEditMsg(null);
    const res = await fetch(`/api/messages/${target.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
    });
    if (!res.ok) return toast("Could not edit message.", "bad");
    setMessages((s) => {
      const i = s.findIndex((m) => m.id === target.id);
      const next = s.slice(0, i);
      return [...next, { ...target, content }];
    });
    stickBottom.current = true;
    const result = await runStream({ mode: "continue", conversationId: activeId!, model: modelId, params });
    if (result) {
      setMessages((s) => [...s, { id: result.meta.messageId || `a-${Date.now()}`, role: "assistant", content: result.text || "(no response)", model: modelId, createdAt: new Date().toISOString() }]);
      setStreamText("");
    }
  }

  /* ── read aloud (TTS) ── */
  async function readAloud(m: Msg) {
    if (ttsLoading) {
      audioRef.current?.pause();
      setTtsLoading(null);
      return;
    }
    setTtsLoading(m.id);
    try {
      const text = stripMarkdown(m.content).slice(0, 1200);
      const res = await fetch("/api/audio/tts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, model: defaults.tts, voice: "alloy" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Read aloud failed.", "bad");
        setTtsLoading(null);
        return;
      }
      audioRef.current?.pause();
      const audio = new Audio(data.audio.url);
      audioRef.current = audio;
      audio.onended = () => setTtsLoading(null);
      audio.play();
    } catch {
      setTtsLoading(null);
      toast("Read aloud failed.", "bad");
    }
  }

  /* ── voice input ── */
  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const fd = new FormData();
        fd.append("file", new File([blob], "voice-note.webm", { type: blob.type }));
        toast("Transcribing voice input…");
        const res = await fetch("/api/audio/transcribe", { method: "POST", body: fd });
        const data = await res.json();
        if (data.ok && data.text) {
          setInput((s) => (s ? `${s} ${data.text}` : data.text));
          toast("Voice input added.", "ok");
        } else {
          toast(data.error || "Transcription failed.", "bad");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast("Microphone access denied.", "bad");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const planBadge = user.plan === "free" ? "FREE" : user.plan === "premium" ? "PREMIUM" : "ULTRA";

  /* ───────────────────────── render ───────────────────────── */

  return (
    <div className="h-dvh flex overflow-hidden relative">
      <Toaster />

      {/* ── Sidebar ── */}
      <aside
        className={clsx(
          "absolute md:static z-40 h-full w-[300px] shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--bg-elev)] transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:w-0 md:border-r-0 md:overflow-hidden",
        )}
      >
        <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-semibold tracking-tight">VELORIS</span>
          <button className="btn btn-ghost !p-1.5 rounded-lg ml-auto md:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 pb-2">
          <button onClick={newChat} className="btn btn-primary w-full !rounded-xl">
            <MessageSquarePlus className="w-4 h-4" /> New chat
          </button>
        </div>
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats…"
              className="input !pl-8 !py-2 !text-[13px]"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {convs.length === 0 && <p className="text-xs text-muted px-3 py-6 text-center">No conversations yet.<br />Start a new chat above.</p>}
          {convs.map((c) => (
            <div
              key={c.id}
              className={clsx(
                "group relative rounded-lg px-3 py-2.5 cursor-pointer transition-colors",
                activeId === c.id ? "conv-active" : "hover:bg-[var(--panel)]",
              )}
              onClick={() => openConversation(c.id)}
            >
              <div className={clsx("text-[13px] truncate pr-12", activeId === c.id && "font-medium")}>{c.title}</div>
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5">
                <button
                  className="p-1.5 rounded-md hover:bg-[var(--border)] text-muted"
                  onClick={(e) => { e.stopPropagation(); setRenameTarget(c); setRenameValue(c.title); }}
                  aria-label="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  className="p-1.5 rounded-md hover:bg-[color-mix(in_srgb,var(--bad)_18%,transparent)] text-muted hover:text-[var(--bad)]"
                  onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                  aria-label="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <SidebarFooter user={user} planBadge={planBadge} usage={usage} onLogout={logout} />
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <div className="aurora opacity-60"><div className="a2" /></div>

        {/* header */}
        <header className="relative z-10 flex items-center gap-2 px-3 sm:px-5 py-2.5 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elev)_75%,transparent)] backdrop-blur-xl">
          {!sidebarOpen && (
            <button className="btn btn-ghost !p-2 rounded-lg" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <MessageSquarePlus className="w-4 h-4" />
            </button>
          )}
          <ModelPicker
            models={models}
            error={modelsError}
            onRetry={loadModels}
            value={modelId}
            onChange={(id) => {
              setModelId(id);
              const m = models.find((x) => x.id === id);
              if (m) toast(`Modèle actif : ${m.title}`, "ok");
            }}
          />
          <div className="ml-auto flex items-center gap-1.5">
            <button className={clsx("btn btn-ghost !p-2 rounded-lg", paramsOpen && "bg-[var(--panel)]")} onClick={() => setParamsOpen((s) => !s)} aria-label="Model settings">
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <ThemeToggle />
          </div>
        </header>

        <ParamsBar open={paramsOpen} params={params} setParams={setParams} model={activeModel} plan={user.plan} />

        {/* messages */}
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
        >
          {messages.length === 0 && !streaming ? (
            <EmptyState onPick={(p) => { setInput(p); textareaRef.current?.focus(); }} userName={user.name} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-7">
              {messages.map((m) => (
                <MessageRow
                  key={m.id}
                  m={m}
                  isLastAssistant={m.role === "assistant" && messages[messages.length - 1]?.id === m.id}
                  streaming={streaming}
                  ttsLoading={ttsLoading === m.id}
                  onEdit={() => { setEditMsg(m); setEditValue(m.content); }}
                  onRegenerate={regenerate}
                  onReadAloud={() => readAloud(m)}
                  onRegenerateMedia={regenerateMedia}
                />
              ))}
              {pendingStart && !streamText && (
                mediaJob ? (
                  <MediaJobCard kind={mediaJob} />
                ) : (
                  <div className="flex items-center gap-3 anim-fade-in">
                    <Logo size={26} />
                    <div className="flex gap-1.5 py-2">
                      <span className="typing-dot" /><span className="typing-dot" style={{ animationDelay: "0.15s" }} /><span className="typing-dot" style={{ animationDelay: "0.3s" }} />
                    </div>
                  </div>
                )
              )}
              {streamText && (
                <div className="flex gap-3">
                  <div className="mt-0.5 shrink-0"><Logo size={26} /></div>
                  <div className="min-w-0 flex-1">
                    <Markdown content={streamText} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="relative z-10 px-3 sm:px-5 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((a) => (
                  <div key={a.fileId} className="glass rounded-xl pl-1.5 pr-2 py-1.5 flex items-center gap-2 text-xs">
                    {a.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url || undefined} alt={a.name} className="w-9 h-9 rounded-lg object-cover border border-[var(--border)]" />
                    ) : a.kind === "audio" ? (
                      <AudioLines className="w-4 h-4 text-[var(--accent)]" />
                    ) : (
                      <FileText className="w-4 h-4 text-[var(--accent)]" />
                    )}
                    <span className="max-w-[130px] truncate">{a.name}</span>
                    {a.uploading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />}
                    <button className="text-muted hover:text-[var(--bad)]" onClick={() => setAttachments((s) => s.filter((x) => x.fileId !== a.fileId))}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="glass rounded-3xl shadow-xl backdrop-blur-2xl focus-within:shadow-[var(--glow)] transition-shadow">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={activeModel?.vision ? "Ask anything — attach images or docs…" : "Ask anything…"}
                rows={1}
                className="w-full bg-transparent resize-none outline-none px-5 pt-4 pb-1 text-[15px] max-h-[200px]"
              />
              <div className="flex items-center gap-1.5 px-3 pb-3">
                <button className="btn btn-ghost !p-2 rounded-xl" onClick={() => fileInputRef.current?.click()} aria-label="Attach file">
                  <ImageIcon className="w-4.5 h-4.5" />
                </button>
                <input ref={fileInputRef} type="file" multiple hidden accept="image/*,audio/*,.txt,.md,.csv,.json,.xml,.html,.log,.py,.js,.ts,.yaml,.yml" onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }} />
                <button
                  className={clsx("btn btn-ghost !p-2 rounded-xl", recording && "!bg-[color-mix(in_srgb,var(--bad)_18%,transparent)] !text-[var(--bad)] animate-pulse")}
                  onClick={toggleRecording}
                  aria-label="Voice input"
                >
                  <Mic className="w-4.5 h-4.5" />
                </button>
                {recording && <span className="text-xs text-[var(--bad)]">Recording… tap to stop</span>}
                <div className="flex-1" />
                {activeModel?.vision && <span className="chip hidden sm:inline-flex"><Sparkles className="w-3 h-3" /> vision</span>}
                {streaming ? (
                  <button className="btn !rounded-xl !p-2.5" onClick={() => abortRef.current?.abort()} aria-label="Stop">
                    <Square className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    className="btn btn-primary !rounded-xl !p-2.5 disabled:opacity-40"
                    onClick={send}
                    disabled={!input.trim() && attachments.filter((a) => !a.uploading).length === 0}
                    aria-label="Send"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted text-center mt-2">
              VELORIS peut se tromper · modèles gratuits via Pollinations
              {usage && ` · Images : ${usage.images.used}/${usage.images.limit === -1 ? "∞" : usage.images.limit} · Chat : ${usage.chat.used}/${usage.chat.limit === -1 ? "∞" : usage.chat.limit} aujourd'hui`}
            </p>
          </div>
        </div>
      </main>

      {/* rename modal */}
      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename conversation">
        <input
          className="input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          maxLength={120}
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && submitRename()}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn" onClick={() => setRenameTarget(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={submitRename}>Save</button>
        </div>
      </Modal>

      {/* edit modal */}
      <Modal open={!!editMsg} onClose={() => setEditMsg(null)} title="Edit message" wide>
        <textarea
          className="input min-h-[140px] resize-y"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          autoFocus
        />
        <p className="text-xs text-muted mt-2">Saving will resend the conversation from this point.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn" onClick={() => setEditMsg(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveEdit}>Save &amp; resend</button>
        </div>
      </Modal>
    </div>
  );
}

/* ───────────────────────── sub-components ───────────────────────── */

function SidebarFooter({ user, planBadge, usage, onLogout }: { user: User; planBadge: string; usage: { images: { used: number; limit: number }; chat: { used: number; limit: number } } | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[var(--border)] p-2.5 relative">
      {usage && (
        <div className="px-2 pb-2">
          <div className="flex justify-between text-[10.5px] text-muted mb-1">
            <span>Images aujourd'hui</span>
            <span>{usage.images.limit === -1 ? `${usage.images.used} / ∞` : `${usage.images.used}/${usage.images.limit}`}</span>
          </div>
          <div className="h-1 rounded-full bg-[var(--panel)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: usage.images.limit === -1 ? "100%" : `${Math.min(100, (usage.images.used / Math.max(1, usage.images.limit)) * 100)}%`,
                opacity: usage.images.limit === -1 ? 0.35 : 1,
                background: "linear-gradient(90deg,var(--accent),var(--accent-3))",
              }}
            />
          </div>
        </div>
      )}
      {open && (
        <div className="absolute bottom-full left-2 right-2 mb-1 panel rounded-xl shadow-2xl py-1.5 anim-fade-up z-50">
          <MenuLink href="/images" icon={ImageIcon} label="Image studio" />
          <MenuLink href="/audio" icon={Volume2} label="Audio studio" />
          <MenuLink href="/video" icon={Clapperboard} label="Video studio" />
          <MenuLink href="/pricing" icon={Sparkles} label="Plans & pricing" />
          <MenuLink href="/settings" icon={SettingsIcon} label="Settings" />
          {user.role === "admin" && <MenuLink href="/admin" icon={LayoutDashboard} label="Admin console" />}
          <div className="border-t border-[var(--border)] my-1" />
          <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[var(--panel)] text-[var(--bad)]" onClick={onLogout}>
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
      <button className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-[var(--panel)] transition-colors" onClick={() => setOpen((s) => !s)}>
        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[13px] font-semibold" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-3))" }}>
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex-1 min-w-0 text-left">
          <span className="block text-[13px] font-medium truncate">{user.name}</span>
          <span className="block text-[10.5px] text-muted truncate">{user.email}</span>
        </span>
        <span className={clsx("chip !text-[9.5px] font-semibold", user.plan !== "free" && "!text-[var(--accent)] !border-[color-mix(in_srgb,var(--accent)_45%,transparent)]")}>{planBadge}</span>
      </button>
    </div>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[var(--panel)] transition-colors">
      <Icon className="w-4 h-4 text-muted" /> {label}
    </Link>
  );
}

function ModelPicker({ models, value, onChange, error, onRetry }: { models: ChatModel[]; value: string; onChange: (id: string) => void; error?: boolean; onRetry?: () => void }) {
  const current = models.find((m) => m.id === value) ?? models[0];

  if (error) {
    return (
      <button className="btn btn-danger !rounded-lg" onClick={onRetry}>
        <RefreshCw className="w-3.5 h-3.5" /> Catalogue indisponible — réessayer
      </button>
    );
  }
  if (!models.length) return <div className="skeleton h-9 w-44" />;

  // Native <select> — selectable everywhere, fully keyboard/touch accessible,
  // honestly changes the backend model (sent with every /api/chat call).
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative min-w-0 flex-1 sm:flex-initial sm:w-[300px]">
        <Sparkles className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--accent)] pointer-events-none z-10" />
        <select
          id="chat-model-select"
          aria-label="Modèle de conversation"
          className="select-native !pl-8 font-medium"
          value={current?.id ?? ""}
          onChange={(e) => onChange(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title} · {m.vendor}{m.vision ? " · vision" : ""}
            </option>
          ))}
        </select>
      </div>
      {current && (
        <div className="hidden md:flex items-center gap-1.5 shrink-0" title={`Modèle actif : ${current.id}`}>
          <span className={clsx("w-1.5 h-1.5 rounded-full", current.health === "healthy" ? "bg-[var(--ok)]" : "bg-[var(--warn)]")} />
          <span className="text-[10.5px] text-muted font-mono">{current.id.split("/").pop()}</span>
          {current.vision && <span className="chip !text-[9.5px]">vision</span>}
          {current.params.includes("temperature") && <span className="chip !text-[9.5px]">réglable</span>}
        </div>
      )}
    </div>
  );
}

function ParamsBar({ open, params, setParams, model, plan }: { open: boolean; params: Params; setParams: (p: Params) => void; model?: ChatModel; plan: string }) {
  if (!open) return null;
  const supports = (p: string) => !!model?.params.includes(p);
  // Advanced sampling params are a Premium/Ultra perk; max_tokens stays free.
  const planGate = (p: string) => plan === "free" && p !== "max_tokens";
  const hint = (p: string, value: string) =>
    planGate(p) ? "Premium" : supports(p) ? value : "non supporté";
  return (
    <div className="relative z-10 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elev)_85%,transparent)] backdrop-blur-xl anim-fade-in">
      <div className="max-w-3xl mx-auto px-4 py-4 grid sm:grid-cols-4 gap-5">
        <Slider label="Température" hint={hint("temperature", params.temperature.toFixed(2))} disabled={!supports("temperature") || planGate("temperature")} min={0} max={2} step={0.05} value={params.temperature} onChange={(v) => setParams({ ...params, temperature: v })} />
        <Slider label="Top-p" hint={hint("top_p", params.topP.toFixed(2))} disabled={!supports("top_p") || planGate("top_p")} min={0} max={1} step={0.01} value={params.topP} onChange={(v) => setParams({ ...params, topP: v })} />
        <Slider label="Max tokens" hint={supports("max_tokens") ? String(params.maxTokens) : "non supporté"} disabled={!supports("max_tokens")} min={256} max={8192} step={256} value={params.maxTokens} onChange={(v) => setParams({ ...params, maxTokens: Math.round(v) })} />
        <div className={planGate("reasoning_effort") || !supports("reasoning_effort") ? "opacity-40" : ""}>
          <div className="flex justify-between text-[12px] mb-1.5">
            <span className="font-medium text-soft">Effort de raisonnement</span>
            <span className="text-muted">{hint("reasoning_effort", params.reasoningEffort)}</span>
          </div>
          <select
            className="input !py-1.5 !text-[13px]"
            disabled={!supports("reasoning_effort") || planGate("reasoning_effort")}
            value={params.reasoningEffort}
            onChange={(e) => setParams({ ...params, reasoningEffort: e.target.value as Params["reasoningEffort"] })}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, hint, disabled, min, max, step, value, onChange }: { label: string; hint: string; disabled?: boolean; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className={disabled ? "opacity-40" : ""}>
      <div className="flex justify-between text-[12px] mb-1.5">
        <span className="font-medium text-soft">{label}</span>
        <span className="text-muted">{hint}</span>
      </div>
      <input type="range" className="w-full" disabled={disabled} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function MessageRow({
  m, isLastAssistant, streaming, ttsLoading, onEdit, onRegenerate, onReadAloud, onRegenerateMedia,
}: {
  m: Msg; isLastAssistant: boolean; streaming: boolean; ttsLoading: boolean;
  onEdit: () => void; onRegenerate: () => void; onReadAloud: () => void;
  onRegenerateMedia: (media: ChatMedia) => void;
}) {
  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5 anim-fade-up">
        {m.attachments && m.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 max-w-[85%]">
            {m.attachments.map((a) =>
              a.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.fileId} src={a.url} alt={a.name} className="max-w-[220px] max-h-[220px] rounded-2xl border border-[var(--border)] object-cover" />
              ) : (
                <span key={a.fileId} className="chip !py-2 !px-3 !text-[12px]">
                  {a.kind === "audio" ? <AudioLines className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />} {a.name}
                </span>
              ),
            )}
          </div>
        )}
        {m.content && (
          <div className="max-w-[85%] rounded-2xl rounded-tr-md px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap border border-[var(--border)]"
            style={{ background: "color-mix(in srgb, var(--panel-strong) 80%, var(--accent) 7%)" }}>
            {m.content}
          </div>
        )}
        <div className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity">
          <ActionButton title="Edit & resend" onClick={onEdit} icon={Pencil} />
          <ActionButton title="Copy" onClick={() => { navigator.clipboard.writeText(m.content).catch(() => {}); toast("Copied.", "ok"); }} icon={Copy} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 anim-fade-up group">
      <div className="mt-0.5 shrink-0"><Logo size={26} /></div>
      <div className="min-w-0 flex-1">
        <Markdown content={m.content} />
        {m.meta?.media && (
          <MediaCard media={m.meta.media} onRegenerate={() => onRegenerateMedia(m.meta!.media!)} disabled={streaming} />
        )}
        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionButton title="Copy" icon={Copy} onClick={() => { navigator.clipboard.writeText(m.content).catch(() => {}); toast("Copied.", "ok"); }} />
          <ActionButton title={ttsLoading ? "Stop audio" : "Read aloud"} icon={ttsLoading ? VolumeX : Volume2} onClick={onReadAloud} />
          {isLastAssistant && <ActionButton title="Regenerate" icon={RefreshCw} onClick={onRegenerate} disabled={streaming} />}
          {m.model && <span className="text-[10.5px] text-muted ml-1 font-mono">{m.model.split("/").pop()}</span>}
        </div>
      </div>
    </div>
  );
}

function ActionButton({ title, onClick, icon: Icon, disabled }: { title: string; onClick: () => void; icon: React.ComponentType<{ className?: string }>; disabled?: boolean }) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="p-1.5 rounded-md text-muted hover:text-[var(--text)] hover:bg-[var(--panel)] transition-colors disabled:opacity-40"
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

function EmptyState({ onPick, userName }: { onPick: (p: string) => void; userName: string }) {
  return (
      <div className="h-full flex flex-col items-center justify-center px-4 text-center">
      <div className="anim-fade-up orbit-wrap">
        <Logo size={60} />
        <span className="orbit-ring" />
        <span className="orbit-ring slow" />
      </div>
      <h2 className="text-2xl font-semibold tracking-tight mt-6 anim-fade-up" style={{ animationDelay: "60ms" }}>
        Hi {userName.split(" ")[0]}. <span className="grad-text">What shall we create?</span>
      </h2>
      <p className="text-muted text-sm mt-2 max-w-sm anim-fade-up" style={{ animationDelay: "110ms" }}>
        Ask anything — I can chat, <b className="text-soft">generate images</b>, <b className="text-soft">speak aloud</b> and <b className="text-soft">transcribe audio</b>, right inside this conversation.
      </p>
      <div className="grid sm:grid-cols-2 gap-2.5 mt-8 w-full max-w-lg anim-fade-up" style={{ animationDelay: "160ms" }}>
        {SUGGESTIONS.map((s) => (
          <button key={s.title} className="glass rounded-2xl px-4 py-3.5 text-left card-hover" onClick={() => onPick(s.prompt)}>
            <div className="text-[13.5px] font-medium">{s.title}</div>
            <div className="text-[12px] text-muted mt-1 line-clamp-2">{s.prompt}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── inline generated media ─────────────────────────────────────────────── */

const MEDIA_JOB_LABELS: Record<string, string> = {
  image: "Création de votre image…",
  audio: "Synthèse vocale en cours…",
  tts: "Synthèse vocale en cours…",
  video: "Génération vidéo…",
  transcribe: "Transcription de l'audio…",
};

function MediaJobCard({ kind }: { kind: string }) {
  const Icon = kind === "audio" || kind === "tts" ? AudioLines : kind === "video" ? Clapperboard : kind === "transcribe" ? FileText : ImageIcon;
  return (
    <div className="flex gap-3 anim-fade-in">
      <div className="mt-0.5 shrink-0 gen-pulse rounded-full"><Logo size={26} /></div>
      <div className="flex-1 max-w-md">
        <div className="glass rounded-2xl rounded-tl-md p-4">
          <div className="flex items-center gap-2.5 text-[13px] font-medium">
            <Icon className="w-4 h-4 text-[var(--accent)]" />
            {MEDIA_JOB_LABELS[kind] ?? "Génération en cours…"}
          </div>
          <div className="skeleton h-44 mt-3 rounded-xl" />
          <div className="flex items-center gap-1.5 mt-3 text-[11px] text-muted">
            <span className="typing-dot" style={{ width: 5, height: 5 }} />
            Modèle gratuit Pollinations · cela peut prendre 30–60 s
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaCard({ media, onRegenerate, disabled }: { media: ChatMedia; onRegenerate: () => void; disabled?: boolean }) {
  return (
    <div className="mt-3 max-w-md">
      {media.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={media.prompt ?? media.name}
          className="w-full rounded-2xl border border-[var(--border)] shadow-xl"
          loading="lazy"
        />
      )}
      {media.kind === "audio" && (
        <div className="glass rounded-2xl p-4">
          <audio controls src={media.url} className="w-full h-10" preload="metadata" />
          {media.text && <p className="text-[12px] text-muted mt-2 line-clamp-2">« {media.text} »</p>}
        </div>
      )}
      {media.kind === "video" && (
        <video controls src={media.url} className="w-full rounded-2xl border border-[var(--border)] bg-black" preload="metadata" />
      )}
      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <a href={media.url} download={media.name} className="btn !py-1.5 !px-3 !text-[12px]">
          <ArrowDownToLine className="w-3.5 h-3.5" /> Télécharger
        </a>
        {media.prompt && (
          <button
            className="btn !py-1.5 !px-3 !text-[12px]"
            onClick={() => { navigator.clipboard.writeText(media.prompt ?? "").catch(() => {}); toast("Prompt copié.", "ok"); }}
          >
            <Copy className="w-3.5 h-3.5" /> Copier le prompt
          </button>
        )}
        {(media.kind === "image" || media.kind === "audio") && (
          <button className="btn !py-1.5 !px-3 !text-[12px]" onClick={onRegenerate} disabled={disabled}>
            <RefreshCw className={clsx("w-3.5 h-3.5", disabled && "animate-spin")} /> Régénérer
          </button>
        )}
        <span className="chip !text-[9.5px] font-mono ml-auto">{media.model.split("/").pop()}{media.voice ? ` · ${media.voice}` : ""}</span>
      </div>
    </div>
  );
}
