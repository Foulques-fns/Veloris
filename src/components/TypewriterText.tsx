"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onDone?: () => void;
}

export function TypewriterText({ text, speed = 8, onDone }: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState("");
  const idxRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const textRef = useRef(text);

  useEffect(() => {
    if (text.startsWith(textRef.current)) {
      textRef.current = text;
    } else {
      textRef.current = text;
      setDisplayed("");
      idxRef.current = 0;
    }
  }, [text]);

  useEffect(() => {
    function step(now: number) {
      if (now - lastTimeRef.current >= speed) {
        lastTimeRef.current = now;
        if (idxRef.current < textRef.current.length) {
          const ch = textRef.current[idxRef.current];
          const burst = ch === " " || ch === "\n" ? 1 : 1;
          idxRef.current = Math.min(idxRef.current + burst, textRef.current.length);
          setDisplayed(textRef.current.slice(0, idxRef.current));
        } else if (idxRef.current >= textRef.current.length) {
          onDone?.();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  const isComplete = displayed.length >= text.length;
  return (
    <span>
      <Markdown content={displayed} />
      {!isComplete && <span className="inline-block w-[2px] h-[1em] bg-green-400 ml-0.5 align-middle animate-pulse" />}
    </span>
  );
}
