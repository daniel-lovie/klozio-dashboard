"use client";
import { useState } from "react";

/**
 * The one action the review list needs.
 *
 * Trends the classifier could not place used to reach the operator as a count in a log line and
 * nowhere else — eight signals a day, discarded. This turns "insan baksin" into a button.
 */
export function TrendDraw({ trendId }: { trendId: number }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function draw() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/trends/draw", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trendId }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || "olmadi"); return; }
    setDone(j.slug ?? "taslak olustu");
  }

  if (done) return <span className="text-xs text-ok">✓ {done}</span>;
  return (
    <span className="flex items-center gap-2">
      <button onClick={draw} disabled={busy}
        className="h-7 rounded border border-line-strong bg-raised px-2 text-xs transition hover:bg-sunken disabled:opacity-50">
        {busy ? "çiziliyor…" : "bunu çiz"}
      </button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}
