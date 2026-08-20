"use client";
import { useEffect, useState } from "react";

/**
 * Live strip for work that runs off the web service.
 *
 * Design generation and image builds happen on the operator's machine, so the dashboard used to show
 * nothing at all while they ran: approving a product and a dead pipeline looked identical, and the only
 * way to find out was to ask. This shows what is running, how far it has got, and — the part that
 * matters — when something failed or stopped ticking.
 *
 * Renders nothing when there is nothing to say, so it costs the page no space on a normal day.
 */

type Job = {
  id: number; kind: string; label: string;
  total: number; done: number; failed: number;
  status: string; detail: string | null; stale: boolean;
  productId: number | null;
};

const KIND_LABEL: Record<string, string> = {
  design: "design generation",
  listing_images: "listing images",
  etsy_resync: "Etsy image upload",
  shopify_refresh: "Shopify image refresh",
};

export function JobBar() {
  const [jobs, setJobs] = useState<Job[]>([]);
  // Hide it here as well as recording it on the server: the poll may already be in flight, and a bar that
  // lingers for one more tick after the ✕ feels like the click missed.
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function dismiss(id: number) {
    setHidden((h) => new Set(h).add(id));
    await fetch("/api/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  /** Restart a run whose process died. Closing the bar only hides the symptom; this is the way out. */
  async function retry(id: number) {
    setBusy(id); setErr(null);
    const r = await fetch("/api/jobs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "retry" }),
    }).catch(() => null);
    setBusy(null);
    if (r?.ok) { setHidden((h) => new Set(h).add(id)); return; }
    setErr((await r?.json().catch(() => ({})))?.error ?? "yeniden deneme basarisiz");
  }

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const r = await fetch("/api/jobs");
        if (r.ok) {
          const j = await r.json();
          if (!stop) setJobs(j.jobs ?? []);
        }
      } catch { /* a missed poll is not worth showing */ }
      if (!stop) setTimeout(poll, 5000);
    }
    poll();
    return () => { stop = true; };
  }, []);

  if (!jobs.length) return null;

  // No page-level wrapper: this used to carry `mx-auto max-w-[1200px] px-6`, which was right under the nav
  // and wrong inside the chat column — the strip came out centred and narrower than the composer it sits
  // above. Spacing belongs to whoever places it.
  return (
    <div className="w-full">
      <div className="space-y-2">
        {jobs.filter((j) => !hidden.has(j.id)).map((j) => {
          const pct = j.total > 0 ? Math.min(100, Math.round(((j.done + j.failed) / j.total) * 100)) : null;
          const broken = j.status === "error" || j.stale;
          const running = j.status === "running" && !j.stale;
          return (
            <div key={j.id}
              className={`rounded-lg border px-3 py-2 text-xs ${broken
                ? "border-danger/25 bg-danger-soft"
                : j.status === "done" ? "border-ok/25 bg-ok-soft"
                : "border-line bg-raised"}`}>
              <div className="flex items-center gap-2">
                {running && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-accent" />
                )}
                <strong className="min-w-0 truncate">{j.label}</strong>
                <span className="hidden text-muted sm:inline">{KIND_LABEL[j.kind] ?? j.kind}</span>
                <span className="ml-auto tabular text-muted">
                  {j.total > 0 ? `${j.done + j.failed}/${j.total}` : j.done > 0 ? `${j.done}` : ""}
                  {j.failed > 0 && <span className="ml-2 text-danger">{j.failed} hata</span>}
                </span>
                {/* "Done" is a claim until someone looks at the output, so a finished job offers the way
                    to look rather than only reporting success. */}
                {j.productId && (j.status === "done" || (j.total > 0 && j.done + j.failed >= j.total)) && (
                  <a href={`/product/${j.productId}`}
                     className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 hover:bg-sunken">
                    ürünü aç →
                  </a>
                )}
                {/* A dead run needs a way forward, not just a way to hide it. Costs a paid generation, so
                    it is a deliberate click — and the server clears whatever state the dead process was
                    holding before it starts, otherwise the retry is refused as "already generating". */}
                {broken && j.productId && (
                  <button disabled={busy === j.id} onClick={() => retry(j.id)}
                          className="shrink-0 rounded border border-danger/25 bg-raised px-1.5 py-0.5 font-medium text-danger hover:bg-danger-soft disabled:opacity-50">
                    {busy === j.id ? "…" : "yeniden dene"}
                  </button>
                )}
                {/* Only once it has stopped. Dismissing a live job would hide exactly the thing this
                    component exists to show, and it would not come back when the run finished. */}
                {!running && (
                  <button onClick={() => dismiss(j.id)} title="kapat"
                          className="shrink-0 rounded px-1 text-muted hover:bg-sunken">✕</button>
                )}
              </div>
              {pct !== null && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sunken">
                  <div className={`h-full rounded-full ${broken ? "bg-danger" : j.status === "done" ? "bg-ok" : "bg-espresso"}`}
                    style={{ width: `${pct}%` }} />
                </div>
              )}
              {/* Say why it stopped. A silent failure is the thing this component exists to prevent. */}
              {j.stale && (
                <p className="mt-1 text-danger">
                  süreç yanıt vermiyor — ürün kilidi açıldı, “yeniden dene” ile baştan üretebilirsin
                </p>
              )}
              {j.status === "error" && j.detail && <p className="mt-1 text-danger">{j.detail}</p>}
              {!broken && j.detail && <p className="mt-1 text-muted">{j.detail}</p>}
            </div>
          );
        })}
        {/* A refused retry has a reason — usually that the product moved on, or that another run claimed it
            first. Swallowing it would leave the operator clicking a button that appears to do nothing. */}
        {err && <p className="rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{err}</p>}
      </div>
    </div>
  );
}
