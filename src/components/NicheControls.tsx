"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STAGES: { v: string; label: string }[] = [
  { v: "candidate",  label: "Aday" },
  { v: "validating", label: "Doğrulanıyor" },
  { v: "scaling",    label: "Büyütülüyor" },
  { v: "harvesting", label: "Hasat" },
  { v: "retired",    label: "Bırakıldı" },
];

async function save(body: any): Promise<string | null> {
  const res = await fetch("/api/niches", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return "ağ hatası — tekrar dene";
  if (!res.ok) return (await res.json().catch(() => ({})))?.error ?? `hata ${res.status}`;
  return null;
}

/** Register a niche the catalogue already uses into the portfolio. */
export function AddNiche({ slug, family }: { slug: string; family: string }) {
  const router = useRouter();
  const [stage, setStage] = useState("candidate");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select value={stage} onChange={(e) => setStage(e.target.value)}
        className="rounded-md border border-espresso/20 bg-white px-2 py-1 text-xs">
        {STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
      </select>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr(null);
          const e = await save({ slug, family, stage });
          setBusy(false);
          // The slot budget can refuse this, and the reason has to reach the operator — a button that
          // silently does nothing is worse than no button.
          if (e) { setErr(e); return; }
          router.refresh();
        }}
        className="rounded-md bg-espresso px-2.5 py-1 text-xs font-medium text-ivory disabled:opacity-50">
        {busy ? "…" : "portföye ekle"}
      </button>
      {err && <span className="text-xs text-red-800">{err}</span>}
    </div>
  );
}

/** Move a niche between stages, or drop it from the portfolio. */
export function StageSelect({ slug, family, stage }: { slug: string; family: string; stage: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <select value={stage} disabled={busy}
        onChange={async (e) => {
          setBusy(true); setErr(null);
          const msg = await save({ slug, family, stage: e.target.value });
          setBusy(false);
          if (msg) { setErr(msg); return; }
          router.refresh();
        }}
        className="rounded-md border border-espresso/25 bg-white px-2 py-1 text-xs">
        {STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
      </select>
      <button
        disabled={busy}
        onClick={async () => {
          // Deliberate wording: the products keep their niche, only the decision record goes.
          if (!confirm(`${slug} portföyden çıkarılsın mı? Ürünler etkilenmez.`)) return;
          setBusy(true);
          const res = await fetch(`/api/niches?slug=${encodeURIComponent(slug)}`, { method: "DELETE" })
            .catch(() => null);
          setBusy(false);
          if (!res?.ok) { setErr("çıkarılamadı"); return; }
          router.refresh();
        }}
        className="rounded-md border border-espresso/20 px-2 py-1 text-xs text-muted">
        çıkar
      </button>
      {err && <span className="text-xs text-red-800">{err}</span>}
    </div>
  );
}
