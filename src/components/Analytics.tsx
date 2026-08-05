"use client";
import { useState } from "react";

export function SnapshotButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={busy}
        className="rounded-lg bg-espresso px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/cron/stats", { method: "POST" });
          const j = await res.json().catch(() => ({}));
          setBusy(false);
          setMsg(res.ok ? `✓ ${JSON.stringify(j.shops ?? j)}` : j.error ?? "hata");
          if (res.ok) location.reload();
        }}>
        {busy ? "Çekiliyor…" : "Şimdi güncelle"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}

type ManualRow = {
  day: string; visits: number | null; page_views: number | null;
  orders: number | null; revenue_cents: number | null; favorites: number | null;
};

/** Etsy Shop Stats aren't in the API — this is the paste-in path for the real funnel. */
export function ManualStats({ rows }: { rows: ManualRow[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ day: today, visits: "", page_views: "", orders: "", revenue: "", favorites: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const inp = "w-full rounded-lg border border-espresso/20 bg-white/80 px-2 py-1.5 text-sm";

  async function save() {
    setBusy(true);
    const res = await fetch("/api/analytics/manual", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) location.reload(); else setMsg(j.error ?? "hata");
  }

  return (
    <div className="rounded-xl border border-espresso/15 bg-white/60 p-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {([
          ["day", "Gün (YYYY-MM-DD)"], ["visits", "Visits"], ["page_views", "Views"],
          ["orders", "Sipariş"], ["revenue", "Ciro ($)"], ["favorites", "Favori"],
        ] as const).map(([k, label]) => (
          <label key={k} className="text-[11px] text-muted">
            {label}
            <input className={inp} value={(f as any)[k]}
              onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={save} disabled={busy}
          className="rounded-lg bg-espresso px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Kaydediliyor…" : "Kaydet"}
        </button>
        {msg && <span className="text-xs text-red-700">{msg}</span>}
      </div>

      {rows.length > 0 && (
        <table className="mt-4 w-full text-xs">
          <thead><tr className="text-left text-muted">
            <th className="p-1.5">Gün</th><th className="p-1.5">Visits</th><th className="p-1.5">Views</th>
            <th className="p-1.5">Sipariş</th><th className="p-1.5">Ciro</th>
            <th className="p-1.5">Dönüşüm</th><th className="p-1.5">Favori</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.day} className="border-t border-espresso/10">
                <td className="p-1.5">{r.day}</td>
                <td className="p-1.5">{r.visits ?? "—"}</td>
                <td className="p-1.5">{r.page_views ?? "—"}</td>
                <td className="p-1.5">{r.orders ?? "—"}</td>
                <td className="p-1.5">{r.revenue_cents == null ? "—" : `$${(r.revenue_cents / 100).toFixed(2)}`}</td>
                <td className="p-1.5">
                  {r.visits && r.orders != null ? `${((r.orders / r.visits) * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="p-1.5">{r.favorites ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
