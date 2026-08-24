"use client";
import { useState } from "react";

/**
 * The one tool from Heckman's live reviews that does real work: it turns "ROAS went down" into
 * "which of three numbers moved". Every store review in all five streams starts here, and the whole
 * point is that you feel how disproportionate the leverage is — a tenth of a point on conversion rate
 * is worth more than a week of fiddling with ad settings.
 *
 * ROAS = conversion rate x AOV / CPC. Breakeven is 1 / (1 - cogs), so at 40% product+shipping cost
 * breakeven ROAS is 1.67 — which is why his "1.8-2.0 is break even" rule of thumb exists.
 */

const BANDS = {
  cpc:  { min: 0.20, max: 3.00, step: 0.01, good: [0.50, 0.75] as const, label: "Tıklama başı maliyet", unit: "$" },
  cvr:  { min: 0.20, max: 6.00, step: 0.01, good: [2.00, 3.00] as const, label: "Dönüşüm oranı",        unit: "%" },
  aov:  { min: 20,   max: 90,   step: 1,    good: [45, 55] as const,     label: "Ortalama sepet",        unit: "$" },
};

type Key = keyof typeof BANDS;

function verdict(k: Key, v: number): { tone: "ok" | "warn" | "danger"; text: string } {
  const [lo, hi] = BANDS[k].good;
  // CPC is the one where lower is unambiguously better; the other two are "at or above target".
  if (k === "cpc") {
    if (v <= hi) return v < lo ? { tone: "ok", text: "hedefin altında" } : { tone: "ok", text: "hedef bandında" };
    return v <= hi * 1.6 ? { tone: "warn", text: "biraz pahalı" } : { tone: "danger", text: "çok pahalı" };
  }
  if (v >= lo) return { tone: "ok", text: v >= hi ? "hedefin üstünde" : "hedef bandında" };
  return v >= lo * 0.75 ? { tone: "warn", text: "hedefin altında" } : { tone: "danger", text: "çok düşük" };
}

const TONE_TEXT = { ok: "text-ok", warn: "text-warn", danger: "text-danger" } as const;
const TONE_BG   = { ok: "bg-ok",   warn: "bg-warn",   danger: "bg-danger"   } as const;

function money(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function LeakyBucket() {
  const [spend, setSpend] = useState(2200);
  const [cpc, setCpc]     = useState(0.76);
  const [cvr, setCvr]     = useState(2.35);
  const [aov, setAov]     = useState(51);
  const [cogs, setCogs]   = useState(40);

  const visits  = spend / cpc;
  const orders  = visits * (cvr / 100);
  const revenue = orders * aov;
  const roas    = revenue / spend;
  const breakeven = 1 / (1 - cogs / 100);
  const profit  = revenue * (1 - cogs / 100) - spend;
  const healthy = roas >= breakeven;

  const rows: { k: Key; v: number; set: (n: number) => void }[] = [
    { k: "cpc", v: cpc, set: setCpc },
    { k: "cvr", v: cvr, set: setCvr },
    { k: "aov", v: aov, set: setAov },
  ];

  return (
    <div className="rounded-lg border border-line bg-raised shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">Delik kova hesabı</h3>
        <span className="text-xs text-ink-faint">üç sayıyı oynat, ROAS&apos;ın nasıl kırıldığını gör</span>
        <button
          onClick={() => { setSpend(2200); setCpc(0.76); setCvr(2.35); setAov(51); setCogs(40); }}
          className="ml-auto h-8 rounded border border-line-strong bg-raised px-2.5 text-xs font-medium hover:bg-sunken"
        >
          sıfırla
        </button>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              Aylık reklam harcaması
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-ink-faint">$</span>
              <input
                type="number" value={spend} min={100} step={50}
                onChange={(e) => setSpend(Math.max(100, Number(e.target.value) || 100))}
                className="tabular h-9 w-32 rounded border border-line-strong bg-raised px-2 text-sm"
              />
              <span className="text-xs text-ink-soft">öncesi ve sonrası aynı bütçe</span>
            </div>
          </label>

          {rows.map(({ k, v, set }) => {
            const b = BANDS[k];
            const vd = verdict(k, v);
            const pct = ((v - b.min) / (b.max - b.min)) * 100;
            return (
              <label key={k} className="block">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{b.label}</span>
                  <span className={`ml-auto tabular text-lg font-semibold ${TONE_TEXT[vd.tone]}`}>
                    {b.unit === "$" ? "$" : ""}{v.toFixed(k === "aov" ? 0 : 2)}{b.unit === "%" ? "%" : ""}
                  </span>
                  <span className={`text-[11px] ${TONE_TEXT[vd.tone]}`}>{vd.text}</span>
                </div>
                <input
                  type="range" min={b.min} max={b.max} step={b.step} value={v}
                  onChange={(e) => set(Number(e.target.value))}
                  className="mt-1.5 w-full accent-[var(--accent)]"
                />
                {/* The target band drawn under the track: a number with no floor to compare against is
                    decoration, which is the same reason Stat carries a hint. */}
                <div className="relative mt-1 h-1 rounded-full bg-sunken">
                  <div
                    className="absolute h-1 rounded-full bg-ok/40"
                    style={{
                      left:  `${((b.good[0] - b.min) / (b.max - b.min)) * 100}%`,
                      width: `${((b.good[1] - b.good[0]) / (b.max - b.min)) * 100}%`,
                    }}
                  />
                  <div className={`absolute -top-0.5 h-2 w-2 -translate-x-1/2 rounded-full ${TONE_BG[vd.tone]}`}
                       style={{ left: `${Math.min(100, Math.max(0, pct))}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-ink-faint">
                  hedef {b.unit === "$" ? "$" : ""}{b.good[0]}{b.unit === "%" ? "%" : ""}
                  {" – "}
                  {b.unit === "$" ? "$" : ""}{b.good[1]}{b.unit === "%" ? "%" : ""}
                </div>
              </label>
            );
          })}

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              Ürün + kargo maliyeti (ciroya oran)
            </span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number" value={cogs} min={10} max={80} step={1}
                onChange={(e) => setCogs(Math.min(80, Math.max(10, Number(e.target.value) || 40)))}
                className="tabular h-9 w-20 rounded border border-line-strong bg-raised px-2 text-sm"
              />
              <span className="text-ink-faint">%</span>
              <span className="text-xs text-ink-soft">
                başabaş ROAS <span className="tabular font-semibold text-ink">{breakeven.toFixed(2)}</span>
              </span>
            </div>
          </label>
        </div>

        <div className="space-y-3">
          <div className={`rounded-lg border px-4 py-4 ${healthy ? "border-ok/25 bg-ok-soft" : "border-danger/25 bg-danger-soft"}`}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">ROAS</div>
            <div className={`tabular mt-0.5 text-4xl font-semibold ${healthy ? "text-ok" : "text-danger"}`}>
              {roas.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-ink-soft">
              {healthy
                ? `başabaşın ${(roas - breakeven).toFixed(2)} üstünde — ölçeklenebilir`
                : `başabaşın ${(breakeven - roas).toFixed(2)} altında — para kaybediyor`}
            </div>
          </div>

          <dl className="divide-y divide-line rounded-lg border border-line">
            {[
              ["Aylık ziyaret", Math.round(visits).toLocaleString("en-US"), "harcama ÷ TBM"],
              ["Sipariş", Math.round(orders).toLocaleString("en-US"), "ziyaret × dönüşüm"],
              ["Ciro", money(revenue), "sipariş × sepet"],
              ["Kâr", money(profit), `ciro × %${100 - cogs} − reklam`],
            ].map(([label, value, hint]) => (
              <div key={label} className="flex items-baseline gap-3 px-4 py-2.5">
                <dt className="text-sm text-ink-soft">{label}</dt>
                <dd className="tabular ml-auto text-sm font-semibold">{value}</dd>
                <dd className="w-28 shrink-0 text-right text-[11px] text-ink-faint">{hint}</dd>
              </div>
            ))}
          </dl>

          <p className="rounded-lg border border-line bg-sunken px-4 py-3 text-xs leading-relaxed text-ink-soft">
            Dönüşümü 2.35&apos;ten 2.8&apos;e çek: aynı bütçeyle ciro yaklaşık %19 artar ve tek bir reklam
            ayarına dokunmadın. Heckman&apos;ın her incelemeyi buradan başlatmasının sebebi bu — üç sayıdan
            hangisinin kırıldığını bilmeden mağazada rastgele değişiklik yapmak, çalıştığını sandığın
            haftaları yakar.
          </p>
        </div>
      </div>
    </div>
  );
}
