"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { AudioLines, ChevronDown, Clapperboard, Image as ImageIcon, LayoutDashboard, LogOut, MessageSquareText, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { Logo, ThemeToggle, Toaster } from "./ui";

export type ShellUser = { id: string; email: string; name: string; role: string; plan: string };

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/images", label: "Images", icon: ImageIcon },
  { href: "/audio", label: "Audio", icon: AudioLines },
  { href: "/video", label: "Video", icon: Clapperboard },
  { href: "/pricing", label: "Plans", icon: Sparkles },
];

export default function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen relative">
      <div className="aurora"><div className="a1" /><div className="a2" /><div className="a3" /></div>
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elev)_80%,transparent)] backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 h-14">
          <Link href="/chat" className="flex items-center gap-2 mr-2">
            <Logo size={26} />
            <span className="font-semibold tracking-tight hidden sm:inline">VELORIS</span>
          </Link>
          <nav className="flex items-center gap-0.5 overflow-x-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] whitespace-nowrap transition-colors",
                  pathname.startsWith(n.href) ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text)] font-medium" : "text-muted hover:text-[var(--text)] hover:bg-[var(--panel)]",
                )}
              >
                <n.icon className="w-4 h-4" /> {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 relative">
            <ThemeToggle />
            <button className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-[var(--panel)]" onClick={() => setMenuOpen((s) => !s)}>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-semibold" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-3))" }}>
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-52 panel rounded-xl shadow-2xl py-1.5 z-50 anim-fade-up">
                  <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                    <div className="text-[13px] font-medium truncate">{user.name}</div>
                    <div className="text-[11px] text-muted truncate">{user.email}</div>
                    <span className="chip !text-[9.5px] mt-1.5 font-semibold">{user.plan.toUpperCase()}</span>
                  </div>
                  <Link href="/settings" className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[var(--panel)]" onClick={() => setMenuOpen(false)}>
                    <SettingsIcon className="w-4 h-4 text-muted" /> Settings
                  </Link>
                  {user.role === "admin" && (
                    <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[var(--panel)]" onClick={() => setMenuOpen(false)}>
                      <LayoutDashboard className="w-4 h-4 text-muted" /> Admin console
                    </Link>
                  )}
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-[var(--panel)] text-[var(--bad)]" onClick={logout}>
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="relative z-10">{children}</main>
      <Toaster />
    </div>
  );
}
