"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Code, Eye, Play, Plus, Trash2, ChevronRight, FileCode, Folder, 
  Send, RefreshCw, Maximize2, Download, Copy, Layout, 
  ChevronLeft, Sparkles, Loader2, Save, X, Edit3
} from "lucide-react";
import { toast, Spinner, Logo } from "./ui";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useI18n } from "@/context/I18nContext";
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/themes/prism-tomorrow.css";
import clsx from "clsx";

type ProjectFile = {
  path: string;
  content: string;
};

type Project = {
  id: string;
  name: string;
  files: Record<string, string>;
};

export default function CodeStudio() {
  const { t } = useI18n();
  const [projects, setConvs] = useState<any[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [activeFile, setActiveFile] = useState<string>("index.html");
  const [viewMode, setViewMode] = useState<"code" | "preview" | "split">("split");
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [previewSize, setPreviewSize] = useState<"mobile" | "desktop">("desktop");
  const [previewKey, setPreviewKey] = useState(0);

  const previewRef = useRef<HTMLIFrameElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Load projects
  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/builder/projects");
      const data = await res.json();
      if (data.ok) setConvs(data.projects);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadProject(id: string) {
    try {
      const res = await fetch(`/api/builder/projects/${id}`);
      const data = await res.json();
      if (data.ok) {
        setActiveProject(data.project);
        const files = data.project.files;
        if (!files[activeFile]) {
          setActiveFile(Object.keys(files)[0] || "index.html");
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function createNewProject() {
    try {
      const res = await fetch("/api/builder/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: "New Project", 
          files: { "index.html": "<!DOCTYPE html><html><body style='background: #000; color: gold; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh;'><h1>Build something premium.</h1></body></html>" } 
        })
      });
      const data = await res.json();
      if (data.ok) {
        setActiveProject(data.project);
        setActiveFile("index.html");
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function saveProject() {
    if (!activeProject) return;
    try {
      const res = await fetch(`/api/builder/projects/${activeProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: activeProject.files, name: activeProject.name })
      });
      if (res.ok) toast("Project saved", "ok");
    } catch (e) {
      console.error(e);
    }
  }

  const downloadProject = async () => {
    if (!activeProject) return;
    const zip = new JSZip();
    Object.entries(activeProject.files).forEach(([path, content]) => {
      zip.file(path, content);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${activeProject.name.replace(/\s+/g, "_")}.zip`);
    toast("Download started", "ok");
  };

  const handlePromptSubmit = async () => {
    if (!userPrompt.trim() || isGenerating) return;
    
    setIsGenerating(true);
    let currentProject = activeProject;
    
    // If no active project, create one implicitly
    if (!currentProject) {
       await createNewProject();
       // Re-fetch to get the new project
       const res = await fetch("/api/builder/projects");
       const data = await res.json();
       if (data.ok && data.projects[0]) {
         const pRes = await fetch(`/api/builder/projects/${data.projects[0].id}`);
         const pData = await pRes.json();
         if (pData.ok) {
            currentProject = pData.project;
            setActiveProject(pData.project);
         }
       }
    }
    
    if (!currentProject) {
        setIsGenerating(false);
        return;
    }

    try {
      const res = await fetch("/api/builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          projectFiles: currentProject.files,
          context: `Building ${currentProject.name}`
        })
      });

      if (!res.ok || !res.body) throw new Error("Failed to start generation");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let newFiles: Record<string, string> = { ...currentProject.files };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        
        // Parse buffers for file blocks
        const blocks = buffer.split("---FILE:");
        if (blocks.length > 1) {
            for (let i = 1; i < blocks.length - 1; i++) {
                const parts = blocks[i].split("---");
                if (parts.length >= 2) {
                    const filePath = parts[0].split("---")[0];
                    const contentEnd = blocks[i].indexOf("---END---");
                    if (contentEnd !== -1) {
                        const content = blocks[i].substring(filePath.length + 3, contentEnd);
                        newFiles[filePath] = content;
                    }
                }
            }
        }
      }

      // Final pass
      const finalBlocks = buffer.split("---FILE:");
      finalBlocks.forEach((block, idx) => {
          if (idx === 0) return;
          const endIdx = block.indexOf("---END---");
          if (endIdx !== -1) {
              const filePath = block.substring(0, block.indexOf("---"));
              const content = block.substring(filePath.length + 3, endIdx);
              newFiles[filePath.trim()] = content.trim();
          }
      });

      setActiveProject({ ...currentProject, files: newFiles });
      setUserPrompt("");
      setPreviewKey(k => k + 1);
      toast("Project updated", "ok");
    } catch (e) {
      console.error(e);
      toast("Generation failed", "bad");
    } finally {
      setIsGenerating(false);
    }
  };

  const getCombinedSrcDoc = () => {
    if (!activeProject) return "";
    const files = activeProject.files;
    let html = files["index.html"] || "<!DOCTYPE html><html><body><div id='root'></div><script type='module' src='app.js'></script></body></html>";
    
    // Check if we need React/Babel
    const hasJSX = Object.keys(files).some(p => p.endsWith(".jsx")) || Object.values(files).some(c => c.includes("<React") || c.includes("JSX"));
    
    let head = "";
    let body = html;

    // Extract existing head if any
    if (html.includes("<head>")) {
       head = html.substring(html.indexOf("<head>") + 6, html.indexOf("</head>"));
       body = html.substring(html.indexOf("</body>") === -1 ? html.indexOf("</head>") + 7 : 0);
       if (html.indexOf("<body>") !== -1) {
          body = html.substring(html.indexOf("<body>") + 6, html.indexOf("</body>"));
       }
    }

    const scripts: string[] = [];
    const styles: string[] = [];

    Object.entries(files).forEach(([path, content]) => {
      if (path === "index.html") return;
      if (path.endsWith(".css")) {
        styles.push(`<style data-file="${path}">${content}</style>`);
      } else if (path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".ts") || path.endsWith(".tsx")) {
        // Use type="text/babel" for automatic transformation if has JSX
        const type = hasJSX ? "text/babel" : "module";
        scripts.push(`<script type="${type}" data-file="${path}">${content}</script>`);
      }
    });

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script src="https://cdn.tailwindcss.com"></script>
          ${hasJSX ? '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>' : ''}
          <script src="https://unpkg.com/lucide@latest"></script>
          ${head}
          ${styles.join("\n")}
        </head>
        <body class="bg-white">
          ${body}
          ${scripts.join("\n")}
          <script>
            // Initialize Lucide icons
            if (window.lucide) {
              window.lucide.createIcons();
              // Periodic check for dynamic content
              setInterval(() => window.lucide.createIcons(), 1000);
            }
          </script>
        </body>
      </html>
    `;
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-black text-white relative">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ width: 0, x: -300 }}
            animate={{ width: 280, x: 0 }}
            exit={{ width: 0, x: -300 }}
            className="border-r border-white/5 bg-black/40 backdrop-blur-xl flex flex-col z-30"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="font-bold text-sm uppercase tracking-widest text-[var(--accent)]">{t('builder.projects') || "Projects"}</h2>
              <button onClick={createNewProject} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {projects.map(p => (
                <div key={p.id} className="group relative">
                  <button
                    onClick={() => loadProject(p.id)}
                    className={clsx(
                      "w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 group",
                      activeProject?.id === p.id ? "bg-[var(--accent)]/10 border border-[var(--accent)]/20" : "hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <Folder className={clsx("w-4 h-4", activeProject?.id === p.id ? "text-[var(--accent)]" : "text-muted")} />
                    <span className="text-sm truncate flex-1">{p.name}</span>
                  </button>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                     <button 
                        onClick={(e) => {
                           e.stopPropagation();
                           const newName = window.prompt("Rename project to:", p.name);
                           if (newName) {
                              fetch(`/api/builder/projects/${p.id}`, {
                                 method: "PATCH",
                                 headers: { "Content-Type": "application/json" },
                                 body: JSON.stringify({ name: newName })
                              }).then(() => fetchProjects());
                           }
                        }}
                        className="p-1 hover:text-[var(--accent)] text-muted"
                     >
                        <Edit3 className="w-3 h-3" />
                     </button>
                     <button 
                        onClick={(e) => {
                           e.stopPropagation();
                           if (confirm(`Delete ${p.name}?`)) {
                              fetch(`/api/builder/projects/${p.id}`, { method: "DELETE" }).then(() => {
                                 if (activeProject?.id === p.id) setActiveProject(null);
                                 fetchProjects();
                              });
                           }
                        }}
                        className="p-1 hover:text-red-500 text-muted"
                     >
                        <Trash2 className="w-3 h-3" />
                     </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top bar */}
        <header className="h-12 border-b border-white/5 bg-black/40 flex items-center px-4 justify-between">
          <div className="flex items-center gap-4 min-w-0">
             <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
               <Layout className="w-4 h-4 text-muted" />
             </button>
             {activeProject && (
                <div className="flex items-center gap-2 min-w-0">
                   <h1 className="text-sm font-bold truncate">{activeProject.name}</h1>
                   <div className="flex items-center gap-1 bg-white/5 rounded-md px-1.5 py-0.5 border border-white/5">
                      <FileCode className="w-3 h-3 text-[var(--accent)]" />
                      <span className="text-[10px] font-mono text-muted">{activeFile}</span>
                   </div>
                </div>
             )}
          </div>

          <div className="flex items-center gap-2">
             <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                <button 
                  onClick={() => setViewMode("code")} 
                  className={clsx("p-1.5 rounded-lg transition-all", viewMode === "code" ? "bg-[var(--accent)] text-black shadow-lg" : "text-muted hover:text-white")}
                >
                  <Code className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setViewMode("split")} 
                  className={clsx("p-1.5 rounded-lg transition-all", viewMode === "split" ? "bg-[var(--accent)] text-black shadow-lg" : "text-muted hover:text-white")}
                >
                  <Maximize2 className="w-4 h-4 rotate-45" />
                </button>
                <button 
                  onClick={() => setViewMode("preview")} 
                  className={clsx("p-1.5 rounded-lg transition-all", viewMode === "preview" ? "bg-[var(--accent)] text-black shadow-lg" : "text-muted hover:text-white")}
                >
                  <Eye className="w-4 h-4" />
                </button>
             </div>
             <div className="w-px h-6 bg-white/10 mx-2" />
             <button onClick={downloadProject} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-muted" title="Download ZIP">
                <Download className="w-4 h-4" />
             </button>
             <button onClick={saveProject} className="btn !h-8 !px-3 !rounded-lg border-[var(--accent)]/20 text-[var(--accent)]">
                <Save className="w-3.5 h-3.5" /> <span>{t('builder.save') || "Save"}</span>
             </button>
          </div>
        </header>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Explorer & Editor */}
          <AnimatePresence>
            {(viewMode === "code" || viewMode === "split") && (
              <motion.div 
                initial={{ flex: 0 }}
                animate={{ flex: viewMode === "code" ? 1 : 0.5 }}
                className="flex min-w-0 border-r border-white/5"
              >
                {/* Micro Explorer */}
                <div className="w-48 bg-black/20 border-r border-white/5 flex flex-col">
                  <div className="p-3 text-[10px] uppercase font-bold tracking-widest text-muted">Explorer</div>
                  <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                     {activeProject && Object.keys(activeProject.files).map(path => (
                       <button
                         key={path}
                         onClick={() => setActiveFile(path)}
                         className={clsx(
                           "w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-all",
                           activeFile === path ? "bg-white/10 text-[var(--accent)]" : "text-muted hover:bg-white/5"
                         )}
                       >
                         <FileCode className="w-3.5 h-3.5" />
                         <span className="truncate">{path}</span>
                       </button>
                     ))}
                  </div>
                </div>
                {/* Editor */}
                <div className="flex-1 bg-[#0d0d0d] overflow-y-auto p-4 font-mono text-sm custom-editor relative">
                  {activeProject && (
                    <Editor
                      value={activeProject.files[activeFile] || ""}
                      onValueChange={code => {
                        const nextFiles = { ...activeProject.files, [activeFile]: code };
                        setActiveProject({ ...activeProject, files: nextFiles });
                      }}
                      highlight={code => highlight(code, languages.markup, "markup")}
                      padding={10}
                      className="min-h-full outline-none"
                      style={{
                        fontFamily: '"Fira code", "Fira Mono", monospace',
                        fontSize: 14,
                      }}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Preview */}
          <AnimatePresence>
            {(viewMode === "preview" || viewMode === "split") && (
              <motion.div 
                initial={{ flex: 0 }}
                animate={{ flex: viewMode === "preview" ? 1 : 0.5 }}
                className="bg-[#f5f5f7] flex flex-col min-w-0 preview-container"
              >
                <div className="h-10 bg-[#f0f0f0] border-b flex items-center px-4 justify-between">
                   <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-white rounded-md px-3 py-1 border text-[10px] text-black font-medium min-w-[120px] truncate shadow-sm">
                         <span className="w-2 h-2 rounded-full bg-emerald-500" />
                         localhost:3000
                      </div>
                      <div className="flex bg-black/5 p-0.5 rounded-lg border border-black/5">
                         <button 
                            onClick={() => setPreviewSize("desktop")} 
                            className={clsx("p-1 rounded-md transition-all", previewSize === "desktop" ? "bg-white shadow-sm text-black" : "text-muted hover:text-black")}
                         >
                            <Layout className="w-3 h-3" />
                         </button>
                         <button 
                            onClick={() => setPreviewSize("mobile")} 
                            className={clsx("p-1 rounded-md transition-all", previewSize === "mobile" ? "bg-white shadow-sm text-black" : "text-muted hover:text-black")}
                         >
                            <Plus className="w-3 h-3 rotate-45 scale-75" /> {/* Phone shape sim */}
                         </button>
                      </div>
                   </div>
                   <div className="flex items-center gap-2">
                      <button onClick={() => setPreviewKey(k => k+1)} className="p-1.5 hover:bg-black/5 rounded-md text-black transition-colors" title="Refresh">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setFullscreenPreview(true)} className="p-1.5 hover:bg-black/5 rounded-md text-black transition-colors" title="Fullscreen">
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                   </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-hidden">
                   <motion.div 
                      layout
                      initial={false}
                      animate={{ 
                         width: previewSize === "mobile" ? 375 : "100%",
                         height: previewSize === "mobile" ? 667 : "100%",
                         borderRadius: previewSize === "mobile" ? 32 : 0,
                         boxShadow: previewSize === "mobile" ? "0 40px 100px -20px rgba(0,0,0,0.3)" : "none"
                      }}
                      className="bg-white overflow-hidden relative border border-black/5"
                   >
                      <iframe 
                        key={previewKey}
                        ref={previewRef}
                        srcDoc={getCombinedSrcDoc()}
                        className="w-full h-full border-none"
                        sandbox="allow-scripts allow-modals allow-forms"
                      />
                   </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Prompt Panel */}
        <div className="p-4 border-t border-white/5 bg-black/60 backdrop-blur-2xl">
          <div className="max-w-4xl mx-auto relative">
             <div className="glass rounded-[2rem] p-2 flex items-center gap-2 focus-within:shadow-[0_0_20px_var(--accent)] transition-all">
                <div className="p-2 shrink-0">
                   <Logo size={32} animated={false} />
                </div>
                <textarea
                  ref={promptRef}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  placeholder="Describe your app (e.g. 'Build a modern crypto dashboard with gold theme')..."
                  className="flex-1 bg-transparent border-none outline-none py-3 text-sm resize-none max-h-32 text-white"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handlePromptSubmit();
                    }
                  }}
                />
                <button 
                  onClick={handlePromptSubmit}
                  disabled={isGenerating || !userPrompt.trim()}
                  className="p-3 bg-[var(--accent)] text-black rounded-full hover:scale-105 active:scale-95 disabled:opacity-50 transition-all shadow-[0_0_15px_var(--accent)]"
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
             </div>
             {isGenerating && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/80 rounded-full border border-[var(--accent)]/30 text-[10px] uppercase tracking-widest font-black text-[var(--accent)]">
                   <Sparkles className="w-3 h-3 animate-pulse" />
                   {t('builder.generating') || "Architecting your vision..."}
                </div>
             )}
          </div>
        </div>
      </div>

      {/* Fullscreen Preview Modal */}
      <AnimatePresence>
        {fullscreenPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col"
          >
            <div className="h-14 border-b border-white/5 flex items-center px-6 justify-between bg-black/80 backdrop-blur-xl">
               <div className="flex items-center gap-3">
                  <Logo size={32} />
                  <span className="font-bold tracking-tight uppercase text-xs tracking-widest text-muted">Preview Mode</span>
               </div>
               <button onClick={() => setFullscreenPreview(false)} className="btn btn-ghost !p-2 rounded-xl">
                  <X className="w-5 h-5" />
               </button>
            </div>
            <iframe 
               srcDoc={getCombinedSrcDoc()}
               className="flex-1 w-full h-full border-none bg-white"
               sandbox="allow-scripts allow-modals allow-forms"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


