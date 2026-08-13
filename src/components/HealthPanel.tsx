"use client";
import { useEffect, useState } from "react";
import { Badge, Card, Skeleton } from "@/components/ui";

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
  products: { id: number; slug: string; detail: string | null; href: string }[];
};

export function HealthPanel() {
  const [data, setData] = useState<{ products: number; findings: Finding[]; clean: string[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);

  if (!data) return <Skeleton className="mb-4 h-24" />;
  const high = data.findings.filter((f) => f.severity === "high").reduce((n, f) => n + f.count, 0);

  if (!data.findings.length) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-ok/25 bg-ok-soft px-3 py-2 text-xs text-ok">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
        {data.products} üründe {data.clean.length} kontrolün hepsi temiz.
      </div>
    );
  }

  return (
    <Card className="mb-4 p-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2 text-sm">
        <strong className="font-semibold">Katalog sağlığı</strong>
        <span className="text-ink-faint">{data.products} ürün</span>
        {high > 0 && <Badge tone="danger">{high} yüksek öncelikli</Badge>}
        {data.clean.length > 0 && <Badge tone="ok">{data.clean.length} kontrol temiz</Badge>}
      </div>
      <div className="space-y-1.5">
        {data.findings.map((f) => (
          <div key={f.key}
               className={`rounded border px-2.5 py-1.5 text-xs ${
                 f.severity === "high" ? "border-danger/25 bg-danger-soft" : "border-warn/25 bg-warn-soft"}`}>
            <button className="flex w-full items-center gap-2 text-left"
                    onClick={() => setOpen(open === f.key ? null : f.key)}>
              <span className="tabular font-semibold">{f.count}</span>
              <span className="min-w-0 flex-1">{f.label}</span>
              <span className="text-ink-faint">{open === f.key ? "gizle" : "göster"}</span>
            </button>
            {open === f.key && (
              <div className="mt-1.5 border-t border-line pt-1.5">
                <p className="mb-1.5 leading-relaxed text-ink-soft">{f.why}</p>
                <ul className="space-y-0.5">
                  {f.products.map((p) => (
                    <li key={p.id}>
                      <a href={p.href} className="font-medium underline decoration-line-strong underline-offset-2 hover:decoration-accent">{p.slug}</a>
                      {p.detail && <span className="text-ink-soft"> — {p.detail}</span>}
                    </li>
                  ))}
                </ul>
                {/* Never let a capped list read as the whole list. */}
                {f.count > f.products.length && (
                  <p className="mt-1 text-ink-faint">… ve {f.count - f.products.length} ürün daha</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
