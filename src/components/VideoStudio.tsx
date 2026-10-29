"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowDownToLine, Clapperboard, Loader2, Radar, Sparkles } from "lucide-react";
import { Badge, toast } from "./ui";

type VideoModel = { id: string; title: string; minDuration: number; maxDuration: number; defaultDuration: number; resolutions: string[]; health: string };
type VideoFile = { id: string; url: string; name: string; createdAt: string };

type Availability = { hasFreeModel: boolean; available: VideoModel[]; quota: { used: number; limit: number }; videos: VideoFile[] };

const ASPECTS = ["16:9", "9:16", "1:1"];

export default function VideoStudio() {
  const [state, setState] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [duration, setDuration] = useState(5);
  const [aspect, setAspect] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/video").then((r) => r.json()).catch(() => null);
    setLoading(false);
    if (res?.ok) {
      setState(res);
      if (res.available.length && !model) {
        setModel(res.available[0].id);
        setDuration(res.available[0].defaultDuration);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const active = state?.available.find((m) => m.id === model) ?? state?.available[0];

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), model: active?.id, duration, aspectRatio: aspect }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast(data.error || "Video generation failed.", "bad");
      } else {
        toast("Video generated.", "ok");
        await load();
      }
    } catch {
      toast("Network error.", "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 anim-fade-up">
        <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: "color-mix(in srgb,var(--accent) 14%,transparent)" }}>
          <Clapperboard className="w-5 h-5 text-[var(--accent)]" />
        </div>
        <div>
          <h1 className="font-semibold tracking-tight text-lg">Video studio</h1>
          <p className="text-[12px] text-muted">Free-tier verified video generation via Pollinations</p>
        </div>
        <div className="ml-auto">
          {state && <Badge tone={state.hasFreeModel ? "ok" : "warn"}>{state.hasFreeModel ? "Free model available" : "No free model right now"}</Badge>}
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-64 mt-8 rounded-3xl" />
      ) : !state?.hasFreeModel ? (
        <div className="panel rounded-3xl p-12 mt-8 text-center anim-fade-up max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-2xl mx-auto grid place-items-center" style={{ background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}>
            <Radar className="w-7 h-7 text-[var(--accent)]" />
          </div>
          <h2 className="font-semibold text-lg mt-5">Video generation is standing by</h2>
          <p className="text-sm text-muted mt-2 leading-relaxed max-w-md mx-auto">
            Pollinations currently lists all video models as <b>paid-only</b>. Nova strictly never falls back to paid models, so generation is paused.
            This studio checks the live catalog and activates automatically the moment a free video model ships — prompt input, duration &amp; aspect controls, previews and downloads are all wired up.
          </p>
          <div className="text-[11px] text-muted mt-4 chip !px-3 !py-1.5 inline-flex">Live catalog check · every 5 minutes</div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[380px_1fr] gap-6 mt-8 items-start">
          <section className="panel rounded-3xl p-5 space-y-4 anim-fade-up">
            <div>
              <label className="text-[12px] font-medium text-muted block mb-1.5">Prompt</label>
              <textarea className="input min-h-[100px] resize-y" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A drone shot gliding over a neon-lit cyberpunk city in the rain…" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-muted block mb-1.5">Model</label>
              <select className="input !py-2" value={model} onChange={(e) => setModel(e.target.value)}>
                {state.available.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
            {active && (
              <div>
                <div className="flex justify-between text-[12px] mb-1.5">
                  <span className="font-medium text-soft">Duration</span>
                  <span className="text-muted">{duration}s</span>
                </div>
                <input type="range" className="w-full" min={active.minDuration} max={active.maxDuration} step={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              </div>
            )}
            <div>
              <label className="text-[12px] font-medium text-muted block mb-1.5">Aspect ratio</label>
              <div className="flex gap-1.5">
                {ASPECTS.map((a) => (
                  <button key={a} className={clsx("btn !px-3 !py-1.5 !text-[12px]", aspect === a && "!border-[color-mix(in_srgb,var(--accent)_60%,transparent)] !bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]")} onClick={() => setAspect(a)}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary w-full !py-3 !rounded-xl" disabled={busy || !prompt.trim()} onClick={generate}>
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Rendering… {elapsed}s</> : <><Sparkles className="w-4 h-4" /> Generate video</>}
            </button>
          </section>
          <section className="space-y-4">
            {state.videos.length === 0 && !busy ? (
              <div className="glass rounded-3xl p-12 text-center text-muted text-sm">Generated videos will appear here with previews and downloads.</div>
            ) : (
              state.videos.map((v) => (
                <div key={v.id} className="panel rounded-2xl overflow-hidden anim-fade-up">
                  <video controls src={v.url} className="w-full bg-black" preload="metadata" />
                  <div className="flex items-center justify-between p-3">
                    <span className="text-[12px] text-muted truncate">{v.name}</span>
                    <a href={v.url} download={v.name} className="btn !py-1.5 !px-3 !text-[12px]"><ArrowDownToLine className="w-3.5 h-3.5" /> Download</a>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}
