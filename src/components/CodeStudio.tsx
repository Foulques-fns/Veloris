"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2, Eye, Download, RefreshCw,
  Plus, Trash2, FileCode, Sparkles, Loader2, Save,
  X, Monitor, Smartphone, Maximize2,
  CheckCircle, Circle, Folder, MessageSquare
} from "lucide-react";
import { toast, Logo, VelorisWordmark } from "./ui";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import clsx from "clsx";
import Link from "next/link";
import { highlight, languages } from "prismjs";
import Editor from "react-simple-code-editor";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/themes/prism-tomorrow.css";

type Project = { id: string; name: string; files: Record<string, string> };
type Message = { role: "user" | "assistant"; content: string; timestamp: number };
type ViewMode = "split" | "preview" | "code";
type DeviceMode = "desktop" | "mobile";

/** Extracts files from AI output using the <<<FILE:path>>> ... <<<END>>> format */
function extractFiles(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match complete blocks
  const regex = /<<<FILE:([^>]+)>>>\n([\s\S]*?)<<<END>>>/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const path = m[1].trim();
    const content = m[2];
    if (path) result[path] = content;
  }
  return result;
}

/** Extracts assistant explanation text (everything after the last <<<END>>>) */
function extractExplanation(text: string): string {
  const lastEnd = text.lastIndexOf("<<<END>>>");
  if (lastEnd === -1) return "";
  return text.slice(lastEnd + 9).trim();
}

/** Build a safe srcdoc from project files */
function buildSrcdoc(files: Record<string, string>): string {
  const html = files["index.html"];
  if (!html) {
    return `<!DOCTYPE html><html><body style="background:#000;color:gold;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem"><h2>No index.html yet</h2><p style="color:#888">Describe your app below and VELORIS will build it.</p></body></html>`;
  }

  let doc = html;

  // Inject CSS files
  const cssInjections = Object.entries(files)
    .filter(([p]) => p.endsWith(".css") && p !== "index.html")
    .map(([p, c]) => `<style data-src="${p}">${c}</style>`)
    .join("\n");

  // Inject JS files
  const jsInjections = Object.entries(files)
    .filter(([p]) => (p.endsWith(".js") || p.endsWith(".mjs")) && p !== "index.html")
    .map(([p, c]) => `<script data-src="${p}">\n${c}\n</script>`)
    .join("\n");

  if (cssInjections) {
    doc = doc.includes("</head>")
      ? doc.replace("</head>", `${cssInjections}\n</head>`)
      : cssInjections + doc;
  }

  if (jsInjections) {
    doc = doc.includes("</body>")
      ? doc.replace("</body>", `${jsInjections}\n</body>`)
      : doc + jsInjections;
  }

  return doc;
}

export default function CodeStudio() {
  const [projects, setProjects] = useState<Omit<Project, "files">[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [activeFile, setActiveFile] = useState("index.html");
  const [view, setView] = useState<ViewMode>("split");
  const [device, setDevice] = useState<DeviceMode>("desktop");
  const [previewKey, setPreviewKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // AI conversation
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isBuilding, setIsBuilding] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { loadProjects(); }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  async function loadProjects() {
    const r = await fetch("/api/builder/projects").then(r => r.json()).catch(() => null);
    if (r?.ok) setProjects(r.projects);
  }

  async function loadProject(id: string) {
    const r = await fetch(`/api/builder/projects/${id}`).then(r => r.json()).catch(() => null);
    if (r?.ok) {
      setProject(r.project);
      const keys = Object.keys(r.project.files);
      setActiveFile(keys.includes("index.html") ? "index.html" : keys[0] || "index.html");
      setMessages([]);
      setPreviewKey(k => k + 1);
    }
  }

  async function createProject(name = "Nouveau projet") {
    const r = await fetch("/api/builder/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, files: {} }),
    }).then(r => r.json()).catch(() => null);
    if (r?.ok) {
      setProject(r.project);
      setMessages([]);
      await loadProjects();
    }
    return r?.project ?? null;
  }

  async function saveProject() {
    if (!project) return;
    await fetch(`/api/builder/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: project.files }),
    });
    toast("Projet sauvegardé", "ok");
  }

  async function deleteProject(id: string) {
    await fetch(`/api/builder/projects/${id}`, { method: "DELETE" });
    if (project?.id === id) { setProject(null); setMessages([]); }
    loadProjects();
  }

  async function downloadProject() {
    if (!project) return;
    const zip = new JSZip();
    Object.entries(project.files).forEach(([p, c]) => zip.file(p, c));
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${project.name}.zip`);
  }

  async function send() {
    const prompt = userInput.trim();
    if (!prompt || isBuilding) return;

    setUserInput("");
    setIsBuilding(true);
    setStreamingText("");
    setGeneratedFiles([]);

    // Ensure we have a project
    let currentProject = project;
    if (!currentProject) {
      currentProject = await createProject("Projet IA");
    }
    if (!currentProject) {
      toast("Impossible de créer le projet", "bad");
      setIsBuilding(false);
      return;
    }

    const userMsg: Message = { role: "user", content: prompt, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    const historyForApi = messages.map(m => ({ role: m.role, content: m.content }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          projectFiles: currentProject.files,
          conversationHistory: historyForApi,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Génération échouée");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";   // full accumulated text from AI
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        // Parse SSE frames
        let idx: number;
        while ((idx = sseBuffer.indexOf("\n\n")) !== -1) {
          const frame = sseBuffer.slice(0, idx);
          sseBuffer = sseBuffer.slice(idx + 2);

          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.choices?.[0]?.delta?.content;
              if (typeof delta === "string") {
                raw += delta;
                setStreamingText(raw);

                // Live-extract files as they stream
                const liveFiles = extractFiles(raw);
                if (Object.keys(liveFiles).length > 0) {
                  setGeneratedFiles(Object.keys(liveFiles));
                  const liveUpdatedFiles: Record<string, string> = { ...currentProject!.files, ...liveFiles };
                  currentProject = { ...currentProject!, files: liveUpdatedFiles };
                  setProject({ ...currentProject! });
                }
              }
            } catch {
              // partial frame, ignore
            }
          }
        }
      }

      // Final extraction
      const finalFiles = extractFiles(raw);
      const explanation = extractExplanation(raw);
      const content = explanation || `${Object.keys(finalFiles).length} fichier(s) générés : ${Object.keys(finalFiles).join(", ")}`;

      if (Object.keys(finalFiles).length > 0) {
        const merged = { ...currentProject!.files, ...finalFiles };
        const updatedProject: Project = { ...currentProject!, files: merged };
        setProject(updatedProject);
        // Auto-save
        await fetch(`/api/builder/projects/${updatedProject.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: merged }),
        });
        setPreviewKey(k => k + 1);
        // Switch to preview
        if (view === "code") setView("split");
      }

      const assistantMsg: Message = { role: "assistant", content, timestamp: Date.now() };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = (e as Error).message || "Erreur inconnue";
      toast(msg, "bad");
      setMessages(prev => [...prev, { role: "assistant", content: `❌ ${msg}`, timestamp: Date.now() }]);
    } finally {
      setIsBuilding(false);
      setStreamingText("");
      setGeneratedFiles([]);
      abortRef.current = null;
    }
  }

  const srcDoc = project ? buildSrcdoc(project.files) : buildSrcdoc({});

  const editorLang = activeFile.endsWith(".css")
    ? languages.css
    : activeFile.endsWith(".js") ? languages.javascript
    : languages.markup;

  return (
    <div className="h-dvh bg-[#0a0a0a] text-white flex overflow-hidden">
      {/* ── Left sidebar: projects + chat ── */}
      <div className="w-80 border-r border-white/5 flex flex-col bg-[#050505]">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={28} animated={false} />
            <VelorisWordmark size="sm" />
          </div>
          <div className="flex items-center gap-1">
            <Link href="/chat" className="p-2 hover:bg-white/5 rounded-lg text-muted transition-colors" title="Retour au chat">
              <MessageSquare className="w-4 h-4" />
            </Link>
            <button onClick={() => createProject()} className="p-2 hover:bg-white/5 rounded-lg text-muted transition-colors" title="Nouveau projet">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Projects list */}
        <div className="border-b border-white/5">
          <div className="px-4 py-2 text-[9px] uppercase tracking-[0.25em] text-muted font-black">Projets</div>
          <div className="max-h-44 overflow-y-auto px-2 pb-2 space-y-0.5">
            {projects.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted text-center">Aucun projet. Décrivez votre app ci-dessous.</p>
            )}
            {projects.map(p => (
              <div key={p.id} className={clsx("group flex items-center rounded-lg px-3 py-2 cursor-pointer transition-all", project?.id === p.id ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "hover:bg-white/5 text-muted")} onClick={() => loadProject(p.id)}>
                <Folder className="w-3.5 h-3.5 shrink-0 mr-2" />
                <span className="text-[12px] font-medium truncate flex-1">{p.name}</span>
                <button onClick={e => { e.stopPropagation(); deleteProject(p.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* AI Chat */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && !isBuilding && (
            <div className="pt-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-center mx-auto mb-3">
                <Code2 className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <p className="text-[13px] font-bold text-white mb-1.5">AI App Builder</p>
              <p className="text-[11px] text-muted leading-relaxed">
                Décrivez l'application que vous souhaitez créer ou modifier.
              </p>
              {/* Quick starters */}
              <div className="mt-4 space-y-1.5">
                {[
                  "Dashboard analytique premium",
                  "Landing page e-commerce luxe",
                  "App de gestion de tâches",
                  "Calculatrice scientifique",
                ].map(s => (
                  <button key={s} onClick={() => setUserInput(s)} className="w-full text-left px-3 py-2 rounded-lg text-[11px] text-muted hover:text-white hover:bg-white/5 transition-all border border-transparent hover:border-white/5">
                    → {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={clsx("flex gap-2", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
              {m.role === "assistant" && <Logo size={22} animated={false} className="shrink-0 mt-0.5" />}
              <div className={clsx(
                "text-[12px] leading-relaxed px-3 py-2 rounded-xl max-w-[90%]",
                m.role === "user"
                  ? "bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-white ml-auto"
                  : "bg-white/5 border border-white/5 text-white/80"
              )}>
                {m.content}
              </div>
            </div>
          ))}

          {isBuilding && (
            <div className="flex gap-2">
              <Logo size={22} animated={false} className="shrink-0 mt-0.5 gen-pulse" />
              <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 flex-1">
                {generatedFiles.length > 0 ? (
                  <div className="space-y-1">
                    <div className="text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest mb-2 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Génération en cours…
                    </div>
                    {generatedFiles.map(f => (
                      <div key={f} className="text-[11px] text-muted flex items-center gap-1.5">
                        <CheckCircle className="w-3 h-3 text-green-400" /> {f}
                      </div>
                    ))}
                    {streamingText.includes("<<<FILE:") && !generatedFiles.includes("...") && (
                      <div className="text-[11px] text-muted flex items-center gap-1.5">
                        <Circle className="w-3 h-3 animate-pulse text-[var(--accent)]" /> …
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[11px] text-muted">
                    <Loader2 className="w-3 h-3 animate-spin text-[var(--accent)]" /> Architecture en cours…
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-white/5">
          <div className={clsx("glass rounded-2xl border-white/10 focus-within:border-[var(--accent)]/40 transition-all", isBuilding && "opacity-60")}>
            <textarea
              ref={textareaRef}
              value={userInput}
              onChange={e => { setUserInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Décrivez votre app…"
              rows={2}
              disabled={isBuilding}
              className="w-full bg-transparent border-none outline-none resize-none px-4 py-3 text-[13px] text-white placeholder:text-muted/50"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <span className="text-[9px] text-muted uppercase tracking-widest">↵ pour envoyer · ⇧↵ nouvelle ligne</span>
              {isBuilding ? (
                <button onClick={() => abortRef.current?.abort()} className="p-2 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500/30 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={send} disabled={!userInput.trim()} className="p-2 bg-[var(--accent)] text-black rounded-full disabled:opacity-40 hover:scale-105 transition-all shadow-[0_0_20px_rgba(201,162,39,0.3)]">
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: editor + preview ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="h-12 border-b border-white/5 bg-black/60 backdrop-blur-xl flex items-center px-4 gap-3">
          {/* File tabs */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0">
            {project && Object.keys(project.files).map(f => (
              <button key={f} onClick={() => setActiveFile(f)} className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono whitespace-nowrap transition-all shrink-0",
                activeFile === f && (view !== "preview")
                  ? "bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30"
                  : "text-muted hover:text-white hover:bg-white/5"
              )}>
                <FileCode className="w-3 h-3" />
                {f}
              </button>
            ))}
          </div>

          {/* View controls */}
          <div className="flex items-center bg-white/5 rounded-xl p-1 gap-0.5 border border-white/5">
            <ToolBtn icon={Code2} label="Code" active={view === "code"} onClick={() => setView("code")} />
            <ToolBtn icon={Monitor} label="Split" active={view === "split"} onClick={() => setView("split")} />
            <ToolBtn icon={Eye} label="Preview" active={view === "preview"} onClick={() => setView("preview")} />
          </div>

          {/* Device + actions */}
          <div className="flex items-center gap-1.5">
            {(view === "preview" || view === "split") && (
              <>
                <button onClick={() => setDevice("desktop")} className={clsx("p-1.5 rounded-lg transition-colors", device === "desktop" ? "text-[var(--accent)]" : "text-muted hover:text-white")}><Monitor className="w-4 h-4" /></button>
                <button onClick={() => setDevice("mobile")} className={clsx("p-1.5 rounded-lg transition-colors", device === "mobile" ? "text-[var(--accent)]" : "text-muted hover:text-white")}><Smartphone className="w-4 h-4" /></button>
                <button onClick={() => setPreviewKey(k => k + 1)} className="p-1.5 rounded-lg text-muted hover:text-white transition-colors"><RefreshCw className="w-4 h-4" /></button>
                <button onClick={() => setFullscreen(true)} className="p-1.5 rounded-lg text-muted hover:text-white transition-colors"><Maximize2 className="w-4 h-4" /></button>
              </>
            )}
            <div className="w-px h-5 bg-white/10" />
            <button onClick={downloadProject} className="p-1.5 rounded-lg text-muted hover:text-white transition-colors"><Download className="w-4 h-4" /></button>
            <button onClick={saveProject} className="btn btn-primary !h-8 !px-4 !rounded-lg !text-[11px] font-bold">
              <Save className="w-3.5 h-3.5" /> Sauvegarder
            </button>
          </div>
        </div>

        {/* Editor + Preview area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Code Editor */}
          {(view === "code" || view === "split") && (
            <div className={clsx("flex flex-col min-w-0 border-r border-white/5", view === "split" ? "flex-1" : "flex-1")}>
              <div className="flex-1 overflow-auto bg-[#0d0d0d] custom-editor">
                {project && project.files[activeFile] !== undefined ? (
                  <Editor
                    value={project.files[activeFile] || ""}
                    onValueChange={code => {
                      setProject(prev => prev ? { ...prev, files: { ...prev.files, [activeFile]: code } } : null);
                    }}
                    highlight={code => {
                      try { return highlight(code, editorLang, activeFile); }
                      catch { return code; }
                    }}
                    padding={20}
                    className="min-h-full outline-none font-mono"
                    style={{ fontSize: 13, lineHeight: 1.7 }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted text-sm">
                    {project ? "Sélectionnez un fichier" : "Créez ou chargez un projet"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {(view === "preview" || view === "split") && (
            <div className={clsx("flex flex-col bg-zinc-100", view === "split" ? "flex-1" : "flex-1")}>
              {/* Browser chrome */}
              <div className="h-10 bg-zinc-200 border-b border-zinc-300 flex items-center px-4 gap-3 shrink-0">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 bg-white rounded-md h-6 flex items-center px-3 text-[11px] text-zinc-500 border border-zinc-300">
                  <span className="w-2 h-2 rounded-full bg-green-400 mr-2" />
                  veloris-preview.local
                </div>
                <button onClick={() => setPreviewKey(k => k + 1)} className="p-1 hover:bg-zinc-300 rounded transition-colors">
                  <RefreshCw className="w-3.5 h-3.5 text-zinc-600" />
                </button>
              </div>

              {/* Preview frame */}
              <div className="flex-1 overflow-auto bg-zinc-100 flex items-start justify-center">
                <motion.div
                  layout
                  animate={{
                    width: device === "mobile" ? 390 : "100%",
                    height: device === "mobile" ? 844 : "100%",
                    borderRadius: device === "mobile" ? 24 : 0,
                    boxShadow: device === "mobile" ? "0 20px 60px -15px rgba(0,0,0,0.4)" : "none",
                    marginTop: device === "mobile" ? 20 : 0,
                  }}
                  className="bg-white overflow-hidden relative"
                  style={{ minHeight: "100%" }}
                >
                  {isBuilding && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                      <div className="text-center space-y-3">
                        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mx-auto" />
                        <p className="text-sm text-white font-medium">Construction en cours…</p>
                        {generatedFiles.length > 0 && (
                          <p className="text-[11px] text-white/60">{generatedFiles.length} fichier(s) générés</p>
                        )}
                      </div>
                    </div>
                  )}
                  <iframe
                    key={previewKey}
                    srcDoc={srcDoc}
                    className="w-full h-full border-none"
                    sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
                    style={{ minHeight: device === "mobile" ? 844 : "100%", display: "block" }}
                  />
                </motion.div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen preview */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] bg-white flex flex-col">
            <div className="h-12 bg-zinc-900 flex items-center justify-between px-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Logo size={24} animated={false} />
                <span className="text-sm text-white font-medium">{project?.name}</span>
              </div>
              <button onClick={() => setFullscreen(false)} className="p-2 hover:bg-white/10 rounded-lg text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <iframe key={previewKey + 1000} srcDoc={srcDoc} className="flex-1 w-full border-none" sandbox="allow-scripts allow-modals allow-forms allow-same-origin" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolBtn({ icon: Icon, label, active, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all", active ? "bg-[var(--accent)] text-black shadow-sm" : "text-muted hover:text-white")}>
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Send({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className={className}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>;
}
