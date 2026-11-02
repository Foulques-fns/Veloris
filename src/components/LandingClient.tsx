"use client";

import Link from "next/link";
import { useI18n } from "@/context/I18nContext";
import { Logo, VelorisWordmark } from "@/components/ui";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";

export function LandingClient() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen relative overflow-hidden bg-black flex flex-col items-center justify-center">
      <div className="aurora"><div className="a1" /><div className="a2" /><div className="a3" /></div>
      <div className="absolute inset-0 bg-grid opacity-10" />

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 text-center px-6 max-w-4xl"
      >
        <div className="flex justify-center mb-12 scale-125">
          <div className="orbit-wrap">
            <Logo size={100} />
            <span className="orbit-ring" />
          </div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-7xl md:text-9xl font-black tracking-tighter leading-[0.85] mb-8"
          style={{ fontFamily: 'Georgia, serif' }}
        >
          VELORIS <br/>
          <span className="text-white opacity-40">INTELLIGENCE</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted text-lg md:text-2xl max-w-2xl mx-auto mb-16 leading-relaxed font-light"
        >
          Architecting the future of applications and creative vision.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col md:flex-row items-center justify-center gap-6"
        >
          <Link href="/register" className="btn btn-primary !h-16 !px-12 !text-lg !rounded-full !font-black uppercase tracking-[0.2em] shadow-[0_0_50px_rgba(201,162,39,0.4)] hover:scale-105 transition-transform">
            Get Started
          </Link>
          <Link href="/login" className="text-sm font-black uppercase tracking-[0.3em] text-muted hover:text-[var(--accent)] transition-all">
            Sign In
          </Link>
        </motion.div>
      </motion.div>

      <footer className="absolute bottom-8 text-center w-full text-[10px] uppercase tracking-[0.5em] text-muted opacity-30">
         VELORIS &copy; 2026 PREMIUM ACCESS
      </footer>
    </div>
  );
}
