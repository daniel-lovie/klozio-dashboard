"use client";
import { useEffect, useState } from "react";

/**
 * What is wrong with the catalogue, on the page the operator opens first.
 *
 * The numbers behind this existed only as NULL columns and a script nobody ran. The margin floors are the
 * clearest case: 187 products sat under the stated 55% gross floor and the product page showed a dash,
 * because the margin was never computed. A rule that is written down but never displayed is not a rule.
 *
 * Collapsed to a single line when everything passes, so a healthy day costs no attention.
 */
type Finding = {
  key: string; label: string; severity: "high" | "medium"; why: string; count: number;
  products: { id: number; slug: string; detail: string | null }[];
};

export function HealthPanel() {
  const [data, setData] = useState<{ products: number; findings: Finding[]; clean: string[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  if (!data) return null;
  const high = data.findings.filter((f) => f.severity === "high").reduce((n, f) => n + f.count, 0);

  if (!data.findings.length) {
    return (
      <div className="mb-4 rounded-xl border border-green-300 bg-green-50/70 px-3 py-2 text-xs">
        {data.products} üründe {data.clean.length} kontrolün hepsi temiz.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-espresso/20 bg-white/70 p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2 text-sm">
        <strong>Katalog sağlığı</strong>
        <span className="text-muted">{data.products} ürün</span>
        {high > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            {high} yüksek öncelikli
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {data.findings.map((f) => (
          <div key={f.key}
               className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                 f.severity === "high" ? "border-red-300 bg-red-50/60" : "border-amber/50 bg-amber/10"}`}>
            <button className="flex w-full items-center gap-2 text-left"
                    onClick={() => setOpen(open === f.key ? null : f.key)}>
              <span className="tabular-nums font-medium">{f.count}</span>
              <span className="min-w-0 flex-1">{f.label}</span>
              <span className="text-muted">{open === f.key ? "gizle" : "göster"}</span>
            </button>
            {open === f.key && (
              <div className="mt-1.5 border-t border-espresso/10 pt-1.5">
                <p className="mb-1 text-muted">{f.why}</p>
                <ul className="space-y-0.5">
                  {f.products.map((p) => (
                    <li key={p.id}>
                      <a href={`/product/${p.id}`} className="underline decoration-espresso/30">{p.slug}</a>
                      {p.detail && <span className="text-muted"> — {p.detail}</span>}
                    </li>
                  ))}
                </ul>
                {/* Never let a capped list read as the whole list. */}
                {f.count > f.products.length && (
                  <p className="mt-1 text-muted">… ve {f.count - f.products.length} ürün daha</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
