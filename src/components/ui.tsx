"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, Moon, Sun, X } from "lucide-react";
import clsx from "clsx";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin", className ?? "w-4 h-4")} />;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" aria-label={label ?? "toggle"} className="switch" data-on={on} onClick={() => onChange(!on)} />
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "bad" | "accent" }) {
  const tones: Record<string, string> = {
    default: "text-muted",
    ok: "text-[var(--ok)] border-[color-mix(in_srgb,var(--ok)_40%,transparent)]",
    warn: "text-[var(--warn)] border-[color-mix(in_srgb,var(--warn)_40%,transparent)]",
    bad: "text-[var(--bad)] border-[color-mix(in_srgb,var(--bad)_40%,transparent)]",
    accent: "text-[var(--accent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
  };
  return <span className={clsx("chip", tones[tone])}>{children}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 anim-fade-in" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          "relative panel rounded-2xl shadow-2xl anim-menu max-h-[88vh] overflow-y-auto w-full",
          wide ? "max-w-3xl" : "max-w-md",
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--panel-strong)] z-10">
            <h3 className="font-semibold text-[15px]">{title}</h3>
            <button className="btn-ghost btn !p-1.5 rounded-lg" onClick={onClose} aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.classList.contains("light")), []);
  return (
    <button
      className="btn btn-ghost !p-2 rounded-lg"
      aria-label="Toggle theme"
      onClick={() => {
        const next = !light;
        setLight(next);
        document.documentElement.classList.toggle("light", next);
        try {
          localStorage.setItem("nova-theme", next ? "light" : "dark");
        } catch { /* ignore */ }
      }}
    >
      {light ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={clsx("inline-flex items-center gap-1 text-[11px] px-1.5 py-1 rounded-md hover:bg-white/10 transition-colors text-[#9d9db4]", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ── Tiny toast system ─────────────────────────────────────────────────────── */
type Toast = { id: number; msg: string; kind: "info" | "ok" | "bad" };

export function toast(msg: string, kind: Toast["kind"] = "info") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nova-toast", { detail: { msg, kind } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const fn = (e: Event) => {
      const d = (e as CustomEvent).detail as { msg: string; kind: Toast["kind"] };
      const id = Date.now() + Math.random();
      setItems((s) => [...s.slice(-3), { id, msg: d.msg, kind: d.kind }]);
      setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3800);
    };
    window.addEventListener("nova-toast", fn);
    return () => window.removeEventListener("nova-toast", fn);
  }, []);
  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "panel rounded-xl px-4 py-3 text-sm shadow-2xl anim-menu border",
            t.kind === "ok" && "border-[color-mix(in_srgb,var(--ok)_45%,transparent)]",
            t.kind === "bad" && "border-[color-mix(in_srgb,var(--bad)_45%,transparent)]",
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

import { motion } from "framer-motion";

export function Logo({ size = 26, animated = true, className }: { size?: number, animated?: boolean, className?: string }) {
  const content = (
    <img
      src="/brand/veloris-logo.png"
      alt="VELORIS"
      width={size}
      height={size}
      style={{ 
        width: size, 
        height: size, 
        boxShadow: `0 0 ${Math.round(size * 0.6)}px -4px rgba(201,162,39,0.6)` 
      }}
      className={clsx("rounded-[22%] object-cover select-none border border-[var(--accent)]/10", className)}
      draggable={false}
    />
  );

  if (!animated) return content;

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      {content}
    </motion.div>
  );
}

export function ActionButton({ title, onClick, icon: Icon, disabled, active }: { title: string; onClick: () => void; icon: React.ComponentType<{ className?: string }>; disabled?: boolean, active?: boolean }) {
  return (
    <motion.button
      whileHover={{ scale: 1.1, y: -2 }}
      whileTap={{ scale: 0.9 }}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={clsx(
        "p-2 rounded-xl transition-all disabled:opacity-40",
        active ? "bg-[var(--accent)] text-black" : "text-muted hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 glass"
      )}
    >
      <Icon className="w-4 h-4" />
    </motion.button>
  );
}

/** Text wordmark: "VELORIS" in gold serif */
export function VelorisWordmark({ size = "lg" }: { size?: "sm" | "md" | "lg" | "xl" }) {
  const cls = { sm: "text-sm tracking-[0.14em]", md: "text-base tracking-[0.15em]", lg: "text-lg tracking-[0.16em]", xl: "text-2xl tracking-[0.18em]" }[size];
  return (
    <span
      className={`font-bold ${cls} select-none`}
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        background: "linear-gradient(92deg, #a07810 0%, #c9a227 40%, #f5d96e 65%, #c9a227 85%, #a07810 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        textShadow: "none",
      }}
    >
      VELORIS
    </span>
  );
}
