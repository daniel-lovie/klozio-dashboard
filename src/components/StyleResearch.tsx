"use client";
import { useState } from "react";

type Winner = { listingId: number; title: string; url: string; image: string | null;
                price: number | null; sales: number | null; conversion: number | null; shop: string };
type Read = { phrase: string; demand: { vol: number; competition: number; score: number } | null;
              winners: Winner[]; styleLine: string | null; notes: string[] };

/**
 * The operator's own eye on a niche.
 *
 * The nightly run reads this automatically and puts the style line into the prompt, but a number in a
 * log is not the same as seeing the four covers that produced it. This is where a decision to trust or
 * override the read gets made.
 */
export function StyleResearch({ presets }: { presets: string[] }) {
  const [q, setQ] = useState(presets[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Read | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(phrase: string) {
    setQ(phrase); setBusy(true); setErr(null); setData(null);
    const res = await fetch(`/api/research?q=${encodeURIComponent(phrase)}`);
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(j.error || "olmadı"); return; }
    setData(j);
  }

  return (
    <section className="mb-6 rounded border border-line-strong p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && run(q)}
               placeholder="ör. astronomy shirt"
               className="h-8 min-w-[220px] flex-1 rounded border border-line-strong bg-raised px-2 text-sm" />
        <button onClick={() => run(q)} disabled={busy || !q.trim()}
                className="h-8 rounded bg-accent px-3 text-sm font-medium text-accent-ink disabled:opacity-50">
          {busy ? "okunuyor…" : "kazananları oku"}
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p} onClick={() => run(p)} disabled={busy}
                  className="rounded border border-line px-2 py-0.5 text-xs text-ink-soft transition hover:bg-sunken disabled:opacity-50">
            {p}
          </button>
        ))}
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}
      {busy && <p className="text-sm text-ink-soft">EverBee + görsel modeli — 30 saniye kadar sürer.</p>}

      {data && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm tabular-nums">
            <span>hacim <strong>{data.demand?.vol?.toLocaleString("tr-TR") ?? "—"}</strong></span>
            <span>rekabet <strong>{data.demand?.competition?.toLocaleString("tr-TR") ?? "—"}</strong></span>
            <span>skor <strong>{data.demand?.score ?? "—"}</strong></span>
          </div>
          <div className="rounded bg-sunken p-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-ink-soft">okunan stil</span>
            <p className="mt-0.5">{data.styleLine ?? "okunamadı — ev varsayılanları kullanılır"}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.winners.map((w) => (
              <a key={w.listingId} href={w.url} target="_blank" rel="noreferrer"
                 className="block rounded border border-line p-1.5 transition hover:bg-sunken">
                {w.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={w.image} alt="" className="mb-1 aspect-square w-full rounded object-cover" />
                )}
                <div className="text-xs tabular-nums">{w.sales}/ay · ${w.price}</div>
                <div className="truncate text-[11px] text-ink-soft">{w.shop}</div>
              </a>
            ))}
          </div>
          {data.notes.length > 0 && (
            <details className="text-xs text-ink-soft">
              <summary className="cursor-pointer">model kapakları nasıl okudu</summary>
              <ul className="mt-1 space-y-1">{data.notes.map((n, i) => <li key={i}>· {n}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
