"use client";
import { useEffect, useRef, useState } from "react";

export type LogLine = { k: "engine" | "think" | "tool" | "ok" | "warn" | "end"; s: string;
                        ms?: number; tok?: number; at: number };

/**
 * What the agent is doing, while it is doing it.
 *
 * The chat showed a single "…" for the whole turn. A turn that writes five products runs for minutes
 * across a dozen model calls, and from the outside that is indistinguishable from a hang — which is
 * precisely how a genuinely hung turn went unnoticed for fourteen minutes on 2026-08-19. Waiting is
 * fine; waiting with no idea whether anything is happening is not.
 *
 * Three decisions worth stating, because each one is the opposite of the obvious choice:
 *
 *   THE ELAPSED CLOCK RUNS ON THE LAST LINE ONLY. A ticking timer on every row turns the panel into
 *   noise and hides the one number that matters — how long the CURRENT step has been going. Finished
 *   rows keep the duration they actually took.
 *
 *   IT COLLAPSES WHEN THE TURN ENDS, and leaves one summary line behind. During the turn the log is
 *   the most important thing on screen; a second later the answer is, and a fifty-line trace above it
 *   buries the thing the operator was waiting for. Nothing is thrown away — the line reopens it.
 *
 *   IT IS NOT PERSISTED. These lines are progress, not transcript. Reloading gives you the answer and
 *   the tool chips, which is the durable record; re-reading last Tuesday's timings helps nobody.
 */
export function ActivityLog({ lines, live, liveTok = 0 }:
                            { lines: LogLine[]; live: boolean; liveTok?: number }) {
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(Date.now());
  const box = useRef<HTMLDivElement>(null);

  // One timer for the whole panel, and only while the turn is live: a per-row interval would be a dozen
  // timers repainting a component that is already streaming.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [live]);

  // The turn ending is the moment the answer becomes more important than the trace.
  useEffect(() => { if (!live) setOpen(false); }, [live]);

  useEffect(() => {
    if (open && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length, open]);

  if (!lines.length) return null;

  const t0 = lines[0].at;
  const total = (live ? now : lines[lines.length - 1].at) - t0;
  // Output tokens across the turn. A step count says how many times it thought; this says how much it
  // actually wrote, which is the number that tracks with the wait.
  const tokens = lines.reduce((n, l) => n + (l.tok ?? 0), 0) + liveTok;

  if (!open) {
    const tools = lines.filter((l) => l.k === "tool").length;
    return (
      <button onClick={() => setOpen(true)}
        className="mb-2 flex items-center gap-2 rounded border border-line bg-sunken px-2 py-1 font-mono text-[10px] text-muted hover:text-fg">
        <span className="opacity-60">▸</span>
        <span>{lines.length} lines · {tools} tool calls · {fmt(tokens)} tok · {secs(total)}</span>
        <span className="opacity-60">open log</span>
      </button>
    );
  }

  return (
    <div className="mb-2 overflow-hidden rounded border border-line bg-[#1c1917]">
      <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <Dot live={live} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-white/50">
            {live ? "RUNNING" : "DONE"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {tokens > 0 && (
            <span className="font-mono text-[10px] tabular-nums text-white/40">{fmt(tokens)} tok</span>
          )}
          <span className="font-mono text-[10px] tabular-nums text-white/40">{secs(total)}</span>
          <button onClick={() => setOpen(false)} className="font-mono text-[10px] text-white/40 hover:text-white/80">close</button>
        </div>
      </div>
      <div ref={box} className="max-h-56 overflow-y-auto px-2.5 py-1.5">
        {lines.map((l, i) => {
          const last = i === lines.length - 1;
          // A running step has no duration yet, so it shows the clock instead — the only place the
          // elapsed time is genuinely unknown until it stops.
          const ms = l.ms ?? (last && live ? now - l.at : undefined);
          return (
            <div key={i} className="flex gap-2 py-[1px] font-mono text-[11px] leading-[1.45]">
              <span className="w-11 shrink-0 tabular-nums text-white/25">+{secs(l.at - t0)}</span>
              <span className={`w-3 shrink-0 ${colour(l.k)}`}>{glyph(l.k)}</span>
              <span className={`min-w-0 flex-1 break-words ${l.k === "warn" ? "text-amber-300" : "text-white/80"}`}>
                {l.s}
              </span>
              {ms !== undefined && (
                <span className={`shrink-0 tabular-nums ${last && live ? "text-white/45" : "text-white/25"}`}>
                  {secs(ms)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5">
      {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-white/30"}`} />
    </span>
  );
}

/** Seconds below a minute, m:ss above it. Milliseconds are noise at this scale and "0.1s" reads as
 *  precision the number does not have. */
function secs(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s - m * 60)).padStart(2, "0")}`;
}

/** 1761 -> "1.8k". The exact figure is in the step line; the header wants the shape of it. */
function fmt(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;
}

function glyph(k: LogLine["k"]): string {
  return k === "engine" ? "◆" : k === "think" ? "›" : k === "tool" ? "▸"
       : k === "warn" ? "!" : k === "end" ? "■" : "✓";
}

function colour(k: LogLine["k"]): string {
  return k === "engine" ? "text-sky-300" : k === "tool" ? "text-violet-300"
       : k === "warn" ? "text-amber-300" : k === "end" ? "text-white/40"
       : k === "think" ? "text-white/35" : "text-emerald-300";
}
