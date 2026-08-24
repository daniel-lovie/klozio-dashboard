"use client";
import { useState } from "react";

/**
 * The decision this store actually has to make, made arithmetic.
 *
 * Heckman's leaky bucket assumes the unit economics already work — his own brand runs ~40% product
 * and shipping cost against a $50 order. Klozio does not start there: $24.99 against $15.00 landed is
 * 60% cost, and 60% cost means breakeven ROAS 2.50, which is above the ceiling of the band he calls
 * "scaling". No amount of conversion-rate work fixes that, so the price and the basket have to move
 * before a single dollar of ad spend is sensible.
 *
 * Everything here is derived, nothing hardcoded: change price, cost or items per order and the
 * breakeven moves with it.
 */

const FEE_PCT = 2.9;      // Shopify Payments card rate, US
const FEE_FLAT = 0.30;    // per transaction

function money(n: number) {
  return (n < 0 ? "−$" : "$") + Math.abs(n).toFixed(2);
}

export function UnitEconomics() {
  const [price, setPrice] = useState(24.99);
  const [unitCost, setUnitCost] = useState(9.50);
  const [shipCost, setShipCost] = useState(5.50);
  const [items, setItems] = useState(1);
  const [shipCharge, setShipCharge] = useState(0);   // what the buyer pays for shipping

  const revenue = price * items + shipCharge;
  // One parcel per order: the garment cost scales with items, the label does not.
  const cogs = unitCost * items + shipCost;
  const fees = revenue * (FEE_PCT / 100) + FEE_FLAT;
  const contribution = revenue - cogs - fees;
  const costPct = revenue > 0 ? ((cogs + fees) / revenue) * 100 : 0;
  const breakeven = contribution > 0 ? revenue / contribution : Infinity;
  const maxCpa = contribution;                        // spend above this and the order loses money
  const healthy = breakeven <= 2.0;

  const presets: { label: string; hint: string; set: () => void }[] = [
    { label: "Bugünkü hâli", hint: "$24.99 · tek ürün · kargo bedava",
      set: () => { setPrice(24.99); setItems(1); setShipCharge(0); } },
    { label: "Kargo tahsil et", hint: "$24.99 + $4.87 kargo",
      set: () => { setPrice(24.99); setItems(1); setShipCharge(4.87); } },
    { label: "Heckman fiyatı", hint: "$29.99 + $4.87 kargo",
      set: () => { setPrice(29.99); setItems(1); setShipCharge(4.87); } },
    { label: "Hedef sepet", hint: "$29.99 × 2 · $75 üstü bedava",
      set: () => { setPrice(29.99); setItems(2); setShipCharge(0); } },
  ];

  const rows: { k: string; v: number; set: (n: number) => void; min: number; max: number; step: number; sfx?: string }[] = [
    { k: "Alıcı fiyatı (ürün başı)", v: price, set: setPrice, min: 15, max: 45, step: 0.5 },
    { k: "Ürün maliyeti (baskılı blank)", v: unitCost, set: setUnitCost, min: 5, max: 20, step: 0.25 },
    { k: "Kargo/etiket maliyeti (sipariş başı)", v: shipCost, set: setShipCost, min: 0, max: 12, step: 0.25 },
    { k: "Alıcının ödediği kargo", v: shipCharge, set: setShipCharge, min: 0, max: 10, step: 0.25 },
  ];

  return (
    <div className="rounded-lg border border-line bg-raised shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">Birim ekonomi — başabaş ROAS</h3>
        <span className="text-xs text-ink-faint">reklam açmadan önce çözülmesi gereken tek denklem</span>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
        {presets.map((p) => (
          <button key={p.label} onClick={p.set}
            className="rounded border border-line-strong bg-raised px-2.5 py-1.5 text-left text-xs hover:bg-sunken">
            <span className="block font-semibold">{p.label}</span>
            <span className="block text-ink-faint">{p.hint}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-3.5">
          {rows.map((r) => (
            <label key={r.k} className="block">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{r.k}</span>
                <span className="tabular ml-auto text-base font-semibold">${r.v.toFixed(2)}</span>
              </div>
              <input type="range" min={r.min} max={r.max} step={r.step} value={r.v}
                onChange={(e) => r.set(Number(e.target.value))}
                className="mt-1 w-full accent-[var(--accent)]" />
            </label>
          ))}
          <label className="block">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                Sipariş başına ürün
              </span>
              <span className="tabular ml-auto text-base font-semibold">{items.toFixed(1)}</span>
            </div>
            <input type="range" min={1} max={3} step={0.1} value={items}
              onChange={(e) => setItems(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--accent)]" />
            <span className="text-[11px] text-ink-faint">
              Tek parça kargolanıyor: etiket sabit, blank maliyeti adetle çarpılıyor.
            </span>
          </label>
        </div>

        <div className="space-y-3">
          <div className={`rounded-lg border px-4 py-4 ${healthy ? "border-ok/25 bg-ok-soft" : "border-danger/25 bg-danger-soft"}`}>
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">Başabaş ROAS</div>
            <div className={`tabular mt-0.5 text-4xl font-semibold ${healthy ? "text-ok" : "text-danger"}`}>
              {Number.isFinite(breakeven) ? breakeven.toFixed(2) : "∞"}
            </div>
            <div className="mt-1 text-xs leading-relaxed text-ink-soft">
              {!Number.isFinite(breakeven)
                ? "Bu fiyatta sipariş başına katkı yok — reklam matematiği hiç kurulmuyor."
                : healthy
                  ? "Heckman'ın 1.8–2.5 bandının içinde. Ödenebilir."
                  : `Onun "ölçekleme" dediği 2.0 eşiğinin üstünde. Her satış için ${breakeven.toFixed(2)}× getirmek zorundasın.`}
            </div>
          </div>

          <dl className="divide-y divide-line rounded-lg border border-line">
            {[
              ["Sipariş cirosu", money(revenue), `${items.toFixed(1)} ürün + kargo`],
              ["Ürün + kargo maliyeti", "−" + money(cogs), `${items.toFixed(1)}×${money(unitCost)} + ${money(shipCost)}`],
              ["Ödeme komisyonu", "−" + money(fees), `%${FEE_PCT} + ${money(FEE_FLAT)}`],
              ["Katkı payı", money(contribution), `ciroya oran %${(100 - costPct).toFixed(0)}`],
              ["Reklama harcanabilir üst sınır", money(maxCpa), "sipariş başına (CPA tavanı)"],
            ].map(([l, v, h], i) => (
              <div key={i} className="flex items-baseline gap-3 px-4 py-2.5">
                <dt className="text-sm text-ink-soft">{l}</dt>
                <dd className={`tabular ml-auto text-sm font-semibold ${
                  i === 3 ? (contribution > 0 ? "text-ok" : "text-danger") : ""}`}>{v}</dd>
                <dd className="w-36 shrink-0 text-right text-[11px] text-ink-faint">{h}</dd>
              </div>
            ))}
          </dl>

          <p className="rounded-lg border border-line bg-sunken px-4 py-3 text-xs leading-relaxed text-ink-soft">
            Heckman&apos;ın kendi markası %40 maliyetle çalışıyor ve başabaşı 1.67. Klozio bugün $24.99&apos;a
            $15.00 inen maliyetle satıyor — yani <strong>%60 maliyet ve 2.50 başabaş</strong>. Dönüşüm
            optimizasyonu bu farkı kapatmaz; fiyat ve sepet büyüklüğü kapatır.
          </p>
        </div>
      </div>
    </div>
  );
}
