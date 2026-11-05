"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/context/ThemeContext";

function hexRgb(h: string) {
  const c = h.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

export default function MatrixBg() {
  const { colors } = useTheme();
  const colorRef = useRef(colors.matrixColor ?? "#00ff41");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });

  useEffect(() => { colorRef.current = colors.matrixColor ?? "#00ff41"; }, [colors.matrixColor]);

  useEffect(() => {
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext("2d", { alpha: false })!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const SZ = 14;
    const SPEED_MIN = 1.5;
    const SPEED_MAX = 4.5;
    const SPOT_R = 180;
    type P = { x: number; y: number; v: number; ch: string };
    let particles: P[] = [];
    function randomChar() { return Math.random() > 0.5 ? "1" : "0"; }
    function init() {
      W = window.innerWidth; H = window.innerHeight;
      cvs.width = W * dpr; cvs.height = H * dpr;
      cvs.style.width = W + "px"; cvs.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rows = Math.ceil(H / SZ);
      const density = Math.ceil(W / SZ) * 0.7;
      particles = [];
      for (let row = 0; row < rows; row++) {
        const count = Math.floor(density * (0.5 + Math.random() * 0.5));
        for (let j = 0; j < count; j++) particles.push({
          x: Math.random() * (W + 400) - 200, y: row * SZ + Math.random() * SZ,
          v: SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN), ch: randomChar(),
        });
      }
    }
    init();
    window.addEventListener("resize", init);
    const onMove = (e: MouseEvent) => { mouse.current.x = e.clientX; mouse.current.y = e.clientY; };
    const onLeave = () => { mouse.current.x = -9999; mouse.current.y = -9999; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    let raf = 0;
    function frame() {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      const [cr, cg, cb] = hexRgb(colorRef.current);
      const mx = mouse.current.x, my = mouse.current.y, spotActive = mx > -1000;
      ctx.font = `${SZ - 2}px "Courier New", monospace`; ctx.textBaseline = "middle";
      for (const p of particles) {
        p.x += p.v;
        if (p.x > W + 100) { p.x = -100 - Math.random() * 200; p.ch = randomChar(); }
        if (Math.random() < 0.003) p.ch = randomChar();
        let alpha = 0.08 + Math.random() * 0.07;
        if (spotActive) {
          const dx = p.x - mx, dy = p.y - my, d = Math.sqrt(dx * dx + dy * dy);
          if (d < SPOT_R) {
            const t = 1 - d / SPOT_R, t3 = t * t * t;
            alpha = 0.08 + t3 * 0.92;
            const wr = cr + (255 - cr) * t3, wg = cg + (255 - cg) * t3, wb = cb + (255 - cb) * t3;
            ctx.fillStyle = `rgba(${wr | 0},${wg | 0},${wb | 0},${alpha})`;
            ctx.fillText(p.ch, p.x, p.y); continue;
          }
        }
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`; ctx.fillText(p.ch, p.x, p.y);
      }
      if (spotActive) {
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, SPOT_R);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.12)`);
        grad.addColorStop(0.4, `rgba(${cr},${cg},${cb},0.04)`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad; ctx.fillRect(mx - SPOT_R, my - SPOT_R, SPOT_R * 2, SPOT_R * 2);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", init);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 z-0" style={{ pointerEvents: "none" }} aria-hidden />;
}
