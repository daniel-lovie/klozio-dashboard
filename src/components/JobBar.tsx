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
};

const KIND_TR: Record<string, string> = {
  design: "tasarım üretimi",
  listing_images: "ilan görselleri",
  etsy_resync: "Etsy görsel yükleme",
  shopify_refresh: "Shopify görsel yenileme",
};

export function JobBar() {
  const [jobs, setJobs] = useState<Job[]>([]);

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
        {jobs.map((j) => {
          const pct = j.total > 0 ? Math.min(100, Math.round(((j.done + j.failed) / j.total) * 100)) : null;
          const broken = j.status === "error" || j.stale;
          const running = j.status === "running" && !j.stale;
          return (
            <div key={j.id}
              className={`rounded-lg border px-3 py-2 text-xs ${broken
                ? "border-red-300 bg-red-50/70"
                : j.status === "done" ? "border-green-300 bg-green-50/70"
                : "border-espresso/20 bg-white/70"}`}>
              <div className="flex items-center gap-2">
                {running && (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-espresso/25 border-t-espresso" />
                )}
                <strong>{j.label}</strong>
                <span className="text-muted">{KIND_TR[j.kind] ?? j.kind}</span>
                <span className="ml-auto tabular-nums text-muted">
                  {j.total > 0 ? `${j.done + j.failed}/${j.total}` : j.done > 0 ? `${j.done}` : ""}
                  {j.failed > 0 && <span className="ml-2 text-red-700">{j.failed} hata</span>}
                </span>
              </div>
              {pct !== null && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-espresso/10">
                  <div className={`h-full rounded-full ${broken ? "bg-red-500" : j.status === "done" ? "bg-green-600" : "bg-espresso"}`}
                    style={{ width: `${pct}%` }} />
                </div>
              )}
              {/* Say why it stopped. A silent failure is the thing this component exists to prevent. */}
              {j.stale && <p className="mt-1 text-red-700">10 dakikadır ilerlemiyor — süreç durmuş olabilir</p>}
              {j.status === "error" && j.detail && <p className="mt-1 text-red-700">{j.detail}</p>}
              {!broken && j.detail && <p className="mt-1 text-muted">{j.detail}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
