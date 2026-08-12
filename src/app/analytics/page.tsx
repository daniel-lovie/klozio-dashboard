import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { currentShopId, getShop } from "@/lib/shops";
import { shopPerformance } from "@/lib/analytics";
import { SnapshotButton, ManualStats, AdSpend } from "@/components/Analytics";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

export default async function AnalyticsPage() {
  if (!(await isLoggedIn())) redirect("/login");
  const shopId = await currentShopId();
  const shop = await getShop(shopId);
  const { rows, totals, history, manual, paid, paidTotals, creatives } = await shopPerformance(shopId);

  const maxDaily = Math.max(1, ...history.map((h) => Number(h.views)));

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Analytics — {shop?.name ?? "?"}</h1>
          <p className="mt-1 text-sm text-muted">
            Etsy API&apos;si mağaza istatistiği (Visits/Views) <strong>vermiyor</strong> — sadece listing
            başına <em>yaşam boyu</em> görüntülenme ve favori. O sayaç Etsy tarafında gecikmeli dolar, bu
            yüzden yeni listinglerde 0 görebilirsin ve sayılar Etsy panelindeki &quot;Visits&quot; ile
            birebir tutmaz. Panel rakamlarını aşağıdaki forma girersen gerçek huni de burada durur.
            Sipariş ve ciro rakamları API&apos;den kesin gelir (efektif fiyat, %30 indirimli).
          </p>
        </div>
        <SnapshotButton />
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Canlı listing", String(totals.listings)],
          ["Görüntülenme (API)", totals.views.toLocaleString("en-US")],
          ["Favori", totals.favorites.toLocaleString("en-US")],
          ["Sipariş", String(totals.orders)],
          ["Ciro", money(totals.revenue)],
        ].map(([label, val]) => (
          <div key={label} className="rounded-xl border border-espresso/15 bg-white/60 p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold">{val}</p>
          </div>
        ))}
      </section>

      {history.length > 1 && (
        <section className="mb-8 rounded-xl border border-espresso/15 bg-white/60 p-4">
          <p className="mb-3 text-sm font-medium">Günlük toplam görüntülenme (son {history.length} gün)</p>
          <div className="flex h-24 items-end gap-1">
            {[...history].reverse().map((h) => (
              <div key={h.captured_on} className="flex-1" title={`${h.captured_on}: ${h.views}`}>
                <div className="rounded-t bg-espresso/70" style={{ height: `${(Number(h.views) / maxDaily) * 100}%` }} />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {history[history.length - 1]?.captured_on} → {history[0]?.captured_on}
          </p>
        </section>
      )}

      {creatives.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-semibold">Meta kreatif performansı (son 7 gün, otomatik)</h2>
          <p className="mb-3 text-sm text-muted">
            Marketing API&apos;den saatlik çekiliyor. Kural: $15 harcamada CTR &lt; %1 → kapat ·
            CPC &gt; $0.70 → kapat · CPC ≤ $0.45 → bütçeyi artır.
          </p>
          <div className="overflow-x-auto rounded-xl border border-espresso/15 bg-white/60">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted">
                <th className="p-3">Kreatif</th><th className="p-3">Ad set</th>
                <th className="p-3">Gösterim</th><th className="p-3">Tık</th>
                <th className="p-3">CTR</th><th className="p-3">CPC</th><th className="p-3">Harcama</th>
                <th className="p-3">Karar</th>
              </tr></thead>
              <tbody>
                {creatives.map((c: any, i: number) => {
                  const spend = Number(c.spend_cents) / 100;
                  const ctr = c.ctr == null ? null : Number(c.ctr);
                  const cpc = c.cpc == null ? null : Number(c.cpc);
                  const verdict =
                    spend >= 15 && ctr != null && ctr < 1 ? "❌ kapat (CTR)"
                    : cpc != null && cpc > 0.7 ? "⚠️ CPC yüksek"
                    : cpc != null && cpc <= 0.45 && spend >= 5 ? "✅ ölçekle"
                    : "⏳ veri az";
                  return (
                    <tr key={i} className="border-t border-espresso/10">
                      <td className="p-3 font-medium">{c.ad_name}</td>
                      <td className="p-3 text-xs">{c.adset_name}</td>
                      <td className="p-3">{Number(c.impressions).toLocaleString("en-US")}</td>
                      <td className="p-3">{c.clicks}</td>
                      <td className="p-3">{ctr == null ? "—" : `${ctr.toFixed(2)}%`}</td>
                      <td className="p-3">{cpc == null ? "—" : `$${cpc.toFixed(2)}`}</td>
                      <td className="p-3">${spend.toFixed(2)}</td>
                      <td className="p-3 text-xs">{verdict}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Reklam harcaması → sonuç (Meta&apos;dan otomatik + Etsy elle)</h2>
        <p className="mb-3 text-sm text-muted">
          Etsy listing&apos;e Pixel konamıyor. Günlük reklam harcamasını gir, sistem aynı günün Etsy
          verisiyle eşleştirip <strong>CAC ve ROAS</strong> hesaplar.
          {paidTotals.spend > 0 && (
            <>
              {" "}Şimdiye kadar: harcama <strong>${(paidTotals.spend / 100).toFixed(2)}</strong>
              {paidTotals.orders > 0 && <> · CAC <strong>${(paidTotals.spend / 100 / paidTotals.orders).toFixed(2)}</strong></>}
              {paidTotals.revenue > 0 && <> · ROAS <strong>{(paidTotals.revenue / paidTotals.spend).toFixed(2)}</strong></>}
            </>
          )}
        </p>
        <AdSpend rows={JSON.parse(JSON.stringify(paid))} />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Etsy panel verisi (elle)</h2>
        <p className="mb-3 text-sm text-muted">
          Shop Manager → Stats&apos;taki günlük sayıları buraya gir (API bunları vermiyor). Aynı gün
          tekrar girersen üzerine yazar.
        </p>
        <ManualStats rows={JSON.parse(JSON.stringify(manual))} />
      </section>

      <h2 className="mb-2 font-semibold">Listing performansı (API verisi)</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-espresso/15 bg-white/60 p-6 text-sm text-muted">
          Henüz veri yok — &quot;Şimdi güncelle&quot; ile ilk fotoğrafı çek (canlı listing gerekir).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-espresso/15 bg-white/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="p-3">Ürün</th><th className="p-3">Slot</th>
                <th className="p-3">Görüntülenme*</th><th className="p-3">7 gün</th>
                <th className="p-3">Favori</th><th className="p-3">Fav %</th>
                <th className="p-3">Sipariş</th><th className="p-3">Dönüşüm</th>
                <th className="p-3">Ciro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id} className="border-t border-espresso/10">
                  <td className="p-3">
                    <a className="underline" target="_blank"
                       href={`https://www.etsy.com/listing/${r.etsy_listing_id}`}>{r.slug}</a>
                    <span className="ml-2 text-xs text-muted">{r.title?.slice(0, 44)}…</span>
                  </td>
                  <td className="p-3 text-xs">{r.slot}</td>
                  <td className="p-3 font-medium">{Number(r.views) > 0 ? Number(r.views).toLocaleString("en-US") : "—"}</td>
                  <td className="p-3 text-xs">{r.views_7d == null ? "—" : `+${r.views_7d}`}</td>
                  <td className="p-3">{r.favorites}</td>
                  <td className="p-3 text-xs">{pct(Number(r.favorites), Number(r.views))}</td>
                  <td className="p-3">{r.orders}</td>
                  <td className="p-3 text-xs">{pct(Number(r.orders), Number(r.views))}</td>
                  <td className="p-3">{money(Number(r.revenue_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        * Etsy&apos;nin listing sayacı (yaşam boyu, gecikmeli güncellenir). Panel &quot;Visits&quot;
        rakamıyla aynı şey değildir.
      </p>
    </main>
  );
}
