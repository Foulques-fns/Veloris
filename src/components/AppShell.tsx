"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { ChevronDown, Code, LayoutDashboard, LogOut, MessageSquareText, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { Logo, VelorisWordmark, ThemeToggle, Toaster } from "./ui";

export type ShellUser = { id: string; email: string; name: string; role: string; plan: string };

const NAV = [
  { href: "/chat", labelKey: "nav.chat", icon: MessageSquareText },
  { href: "/builder", labelKey: "nav.builder", icon: Code },
  { href: "/pricing", labelKey: "nav.plans", icon: Sparkles },
];

import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/context/I18nContext";

export default function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const { t, isRTL } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen relative bg-black" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-grid z-0" />
      <div className="aurora"><div className="a1" /><div className="a2" /><div className="a3" /></div>
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/40 backdrop-blur-2xl shadow-[0_1px_15px_-5px_rgba(201,162,39,0.15)]">
        <div className="max-w-6xl mx-auto px-4 flex items-center gap-1 h-14">
          <Link href="/chat" className="flex items-center gap-3 mr-3">
            <Logo size={28} />
            <span className="hidden sm:inline"><VelorisWordmark size="sm" /></span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            {NAV.map((n) => {
              const active = pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] uppercase tracking-widest whitespace-nowrap transition-all group relative",
                    active ? "text-[var(--accent)]" : "text-muted hover:text-white"
                  )}
                >
                  <n.icon className={clsx("w-3.5 h-3.5", active && "drop-shadow-[0_0_5px_var(--accent)]")} /> 
                  <span className="font-bold">{t(n.labelKey)}</span>
                  {active && (
                    <motion.div 
                      layoutId="active-nav"
                      className="absolute inset-0 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border-b-2 border-[var(--accent)] rounded-lg -z-10"
                      initial={false}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1 relative">
            <ThemeToggle />
            <button className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-[var(--panel)]" onClick={() => setMenuOpen((s) => !s)}>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-semibold" style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-3))" }}>
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-muted" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full mt-2 w-64 glass rounded-[1.5rem] shadow-2xl py-2 z-50 border-white/5 overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-white/5 mb-2 bg-white/2">
                      <div className="text-[14px] font-bold truncate text-white">{user.name}</div>
                      <div className="text-[11px] text-muted truncate mb-3">{user.email}</div>
                      <span className="chip !text-[10px] !bg-[var(--accent)] !text-black !border-none px-3 py-1 font-black uppercase tracking-widest">{user.plan}</span>
                    </div>
                    <Link href="/settings" className="flex items-center gap-3 px-5 py-3 text-[13px] font-bold text-soft hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] transition-all" onClick={() => setMenuOpen(false)}>
                      <SettingsIcon className="w-4 h-4" /> {t('nav.settings')}
                    </Link>
                    {user.role === "admin" && (
                      <Link href="/admin" className="flex items-center gap-3 px-5 py-3 text-[13px] font-bold text-soft hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] transition-all" onClick={() => setMenuOpen(false)}>
                        <LayoutDashboard className="w-4 h-4" /> {t('nav.admin')}
                      </Link>
                    )}
                    <div className="border-t border-white/5 my-2" />
                    <button className="w-full flex items-center gap-3 px-5 py-3 text-[13px] font-bold hover:bg-red-500/10 text-red-400 transition-all" onClick={logout}>
                      <LogOut className="w-4 h-4" /> {t('nav.logout')}
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
      <main className="relative z-10">{children}</main>
      <Toaster />
    </div>
  );
}
