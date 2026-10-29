import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { Logo, ThemeToggle } from "@/components/ui";
import { MessageSquareText, Image as ImageIcon, AudioLines, Clapperboard, ShieldCheck, Zap, Sparkles, ArrowRight } from "lucide-react";

const features = [
  { icon: MessageSquareText, title: "Streaming chat", desc: "Multiple free frontier-class models, Markdown with code highlighting, file & image understanding, edit & regenerate." },
  { icon: ImageIcon, title: "Image studio", desc: "FLUX, MAI Image 2.6, Z-Image Turbo & more. Text-to-image, image editing and image-to-image transforms." },
  { icon: AudioLines, title: "Audio studio", desc: "Text-to-speech in 20+ languages with 100+ voices, plus fast transcription of uploads and voice notes." },
  { icon: Clapperboard, title: "Video ready", desc: "The pipeline is built in — video generation activates automatically the moment a free model ships." },
  { icon: ShieldCheck, title: "Real accounts", desc: "Email verification, encrypted passwords, session security, rate limiting and a full admin console." },
  { icon: Zap, title: "Free forever", desc: "Every model we use is verified free on the Pollinations catalog. Paid models are never used as fallback." },
];

export default async function Landing() {
  const user = await getSessionUser();
  if (user) redirect("/chat");

  return (
    <div className="min-h-screen relative">
      <div className="aurora"><div className="a1" /><div className="a2" /><div className="a3" /></div>
      <header className="relative z-10 max-w-6xl mx-auto flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="font-semibold tracking-tight text-lg">VELORIS</span>
        </div>
        <nav className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/pricing" className="btn btn-ghost">Plans</Link>
          <Link href="/login" className="btn btn-ghost">Sign in</Link>
          <Link href="/register" className="btn btn-primary">Get started <ArrowRight className="w-4 h-4" /></Link>
        </nav>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-5">
        <section className="pt-16 pb-24 text-center">
          <div className="inline-flex items-center gap-2 chip !py-1.5 !px-3 anim-fade-up">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            Free &amp; open models · verified live from Pollinations
          </div>
          <h1
            className="mt-6 font-bold tracking-tighter leading-[1.04] anim-fade-up"
            style={{ fontSize: "clamp(2.6rem, 7vw, 5rem)", animationDelay: "60ms" }}
          >
            One assistant for
            <br />
            <span className="grad-text">words, images &amp; voice</span>
          </h1>
          <p className="text-muted max-w-xl mx-auto mt-6 text-lg anim-fade-up" style={{ animationDelay: "120ms" }}>
            VELORIS is a full-stack AI workspace — streaming chat, image generation and editing, speech synthesis and transcription — with real accounts, plans and quotas.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3 anim-fade-up" style={{ animationDelay: "180ms" }}>
            <Link href="/register" className="btn btn-primary !px-6 !py-3 !text-[15px] !rounded-xl">Create free account</Link>
            <Link href="/login" className="btn !px-6 !py-3 !text-[15px] !rounded-xl">Sign in</Link>
          </div>
        </section>

        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-24">
          {features.map((f, i) => (
            <div key={f.title} className="glass rounded-2xl p-6 card-hover anim-fade-up" style={{ animationDelay: `${220 + i * 60}ms` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
                <f.icon className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <h3 className="font-semibold mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </section>

        <footer className="border-t border-[var(--border)] py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted">
          <div className="flex items-center gap-2"><Logo size={18} /> VELORIS</div>
          <p>
            AI provided by{" "}
            <a href="https://gen.pollinations.ai" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[var(--accent)]">
              Pollinations
            </a>{" "}
            free endpoints
          </p>
        </footer>
      </main>
    </div>
  );
}
