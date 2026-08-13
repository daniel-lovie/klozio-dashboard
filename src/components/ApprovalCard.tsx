"use client";
import { useEffect, useState } from "react";

/**
 * Designs waiting for a yes or a no, shown where the conversation that ordered them is.
 *
 * Production stops after the artwork and one preview frame — about twenty seconds of compositing — so a
 * batch of thirty concepts no longer renders nine frames each and books a schedule slot for a style the
 * operator was going to reject on sight. Approving buys the rest; rejecting stores the reason and hands the
 * question back to the chat.
 */
type Design = {
  id: number; slug: string; title: string | null; hook: string | null;
  hero_colorway: string | null; technique: string | null;
  cover_id: number | null; detail_id: number | null;
};

export function ApprovalCard({ onDecision }: { onDecision?: (msg: string) => void }) {
  const [designs, setDesigns] = useState<Design[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Design | null>(null);

  async function load() {
    const j = await fetch("/api/designs").then((r) => r.json()).catch(() => null);
    if (j?.designs) setDesigns(j.designs);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);      // a design can appear while the operator is reading
    return () => clearInterval(t);
  }, []);

  async function decide(d: Design, action: "approve" | "reject") {
    let note = "";
    if (action === "reject") {
      // The reason is the whole value of a rejection: it is what the next attempt is built from.
      note = prompt(`${d.slug} neden reddedildi? (tasarımı yeniden kurarken bu not kullanılacak)`) ?? "";
      if (note === null) return;
    }
    setBusy(d.id); setErr(null);
    const res = await fetch("/api/designs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: d.id, action, note }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) { setErr((await res?.json().catch(() => ({})))?.error ?? "islem basarisiz"); return; }
    setZoom(null);
    await load();
    // Tell the chat, so the agent picks up from the decision instead of the operator retyping it.
    onDecision?.(action === "approve"
      ? `${d.slug} tasarımını ONAYLADIM — kalan görselleri kurdum, schedule edip devam et.`
      : `${d.slug} tasarımını REDDETTİM. Sebep: ${note || "belirtilmedi"}. Bu konseptle ne yapalım?`);
  }

  if (!designs.length) return null;

  return (
    <div className="mb-2 space-y-2">
      {designs.map((d) => (
        <div key={d.id} className="rounded-lg border border-warn/25 bg-warn-soft p-2.5">
          <div className="flex items-start gap-3">
            {d.cover_id ? (
              <button onClick={() => setZoom(d)} title="büyüt">
                <img src={`/api/images/${d.detail_id ?? d.cover_id}`} alt=""
                     className="h-20 w-20 flex-none rounded-lg object-cover" />
              </button>
            ) : (
              <div className="grid h-20 w-20 flex-none place-items-center rounded-lg bg-raised text-[10px] text-muted">
                önizleme yok
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">Onay bekliyor · {d.slug}</div>
              <div className="truncate text-[11px] text-muted">
                {d.hook || d.title || "—"} · {d.hero_colorway ?? "?"} · {d.technique}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button disabled={busy === d.id} onClick={() => decide(d, "approve")}
                  className="rounded bg-ok px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">
                  {busy === d.id ? "…" : "Onayla"}
                </button>
                <button disabled={busy === d.id} onClick={() => decide(d, "reject")}
                  className="rounded border border-line-strong px-2.5 py-1 text-xs disabled:opacity-50">
                  Reddet
                </button>
                <button onClick={() => setZoom(d)}
                  className="rounded border border-line-strong px-2.5 py-1 text-xs">Büyüt</button>
                <a href={`/product/${d.id}`} className="rounded border border-line-strong px-2.5 py-1 text-xs">
                  ürünü aç →
                </a>
              </div>
            </div>
          </div>
        </div>
      ))}
      {err && <p className="text-xs text-danger">{err}</p>}

      {zoom && (
        // Judging a design from an 80px thumbnail is not judging it. The popup shows the close crop full
        // size, with the same two buttons so a decision does not need a second trip.
        <div className="fixed inset-0 z-50 grid place-items-center bg-espresso/60 p-4" onClick={() => setZoom(null)}>
          <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl bg-ivory p-3"
               onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <strong className="min-w-0 flex-1 truncate text-sm">{zoom.slug}</strong>
              <button onClick={() => setZoom(null)} className="rounded px-2 text-muted">✕</button>
            </div>
            <img src={`/api/images/${zoom.detail_id ?? zoom.cover_id}`} alt=""
                 className="w-full rounded-lg object-contain" />
            {zoom.cover_id && zoom.detail_id && (
              <img src={`/api/images/${zoom.cover_id}`} alt="" className="mt-2 w-full rounded-lg object-contain" />
            )}
            <p className="mt-2 text-xs text-muted">{zoom.hook || zoom.title}</p>
            <div className="mt-3 flex gap-2">
              <button disabled={busy === zoom.id} onClick={() => decide(zoom, "approve")}
                className="flex-1 rounded-lg bg-ok px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                Onayla — kalan görseller kurulsun
              </button>
              <button disabled={busy === zoom.id} onClick={() => decide(zoom, "reject")}
                className="rounded-lg border border-line-strong px-3 py-2 text-sm disabled:opacity-50">
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
