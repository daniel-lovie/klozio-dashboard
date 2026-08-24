import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId } from "@/lib/shops";
import { TrendDraw } from "@/components/TrendDraw";
import { hasSerpApi } from "@/lib/trends/sources";
import { hasDataForSeo } from "@/lib/trends/rising";

export const dynamic = "force-dynamic";

type T = {
  id: number; geo: string; term: string; verdict: string; reason: string; judged_by: string;
  headlines: string; categories: string; volume: number | null; source: string;
  first_seen: string; used_at: string | null;
};

const PILL: Record<string, string> = {
  USABLE: "bg-ok text-ok",
  REVIEW: "bg-espresso/10 text-espresso",
  BLOCKED: "bg-danger-soft text-danger",
};

function ago(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
  return h < 1 ? "az önce" : h < 24 ? `${h} sa` : `${Math.floor(h / 24)} gün`;
}

export default async function TrendsPage() {
  if (!(await isLoggedIn())) redirect("/login");
  const shopId = await currentShopId();

  const rows = await q<T>(
    `SELECT id, geo, term, verdict, coalesce(reason,'') reason, judged_by,
            coalesce(headlines,'') headlines, coalesce(categories,'') categories,
            volume, source, first_seen, used_at
       FROM trend_seen
      WHERE first_seen > now() - interval '96 hours'
      ORDER BY CASE verdict WHEN 'REVIEW' THEN 0 WHEN 'USABLE' THEN 1 ELSE 2 END,
               coalesce(volume,0) DESC, first_seen DESC
      LIMIT 200`);

  // What the paid plan has actually cost this month. A quota that runs out mid-month would silently
  // turn the system back into the free feed, so it is on screen rather than in a log.
  const paid = await q<{ n: number }>(
    `SELECT count(*)::int n FROM events
      WHERE kind = 'serpapi_call' AND created_at >= date_trunc('month', now())`);
  const budget = Number(process.env.SERPAPI_MAX_PER_MONTH || 220);

  const tally = await q<{ verdict: string; n: number }>(
    `SELECT verdict, count(*)::int n FROM trend_seen
      WHERE first_seen > now() - interval '96 hours' GROUP BY 1`);
  const count = Object.fromEntries(tally.map((t) => [t.verdict, t.n]));

  // Is any of this worth running? Trend products carry slot TR, so the comparison is one query.
  const perf = await q<{ bucket: string; urun: number; canli: number; goruntulenme: number; favori: number }>(
    `SELECT CASE WHEN p.slot = 'TR' THEN 'trend' ELSE 'diger' END bucket,
            count(DISTINCT p.id)::int urun,
            count(DISTINCT p.id) FILTER (WHERE p.etsy_listing_id IS NOT NULL)::int canli,
            coalesce(sum(s.views), 0)::int goruntulenme,
            coalesce(sum(s.favorites), 0)::int favori
       FROM products p
       LEFT JOIN LATERAL (
         SELECT max(views) views, max(favorites) favorites FROM listing_stats l
          WHERE l.product_id = p.id) s ON true
      WHERE p.shop_id = ${shopId}
      GROUP BY 1`).catch(() => []);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold sm:text-2xl">Trendler</h1>
        <p className="mt-0.5 text-sm text-ink-soft">
          Son 96 saatte görülen aramalar. <strong>REVIEW</strong> olanlar sınıflandırıcının karar
          veremediği, senin 5 saniyede çözdüğün olanlar — üstte duruyorlar.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-3 text-sm">
        {["REVIEW", "USABLE", "BLOCKED"].map((v) => (
          <span key={v} className={`rounded-md px-2.5 py-1 text-xs font-medium ${PILL[v]}`}>
            {v} · {count[v] ?? 0}
          </span>
        ))}
        <span className="rounded-md border border-line-strong px-2.5 py-1 text-xs">
          keşif: {hasSerpApi() ? "SerpApi" : "RSS (ücretsiz, geo başına 10 kayıt, geçmiş yok)"}
        </span>
        {hasSerpApi() && (
          <span className="rounded-md border border-line-strong px-2.5 py-1 text-xs tabular-nums">
            bu ay SerpApi: {paid[0]?.n ?? 0} / {budget}
          </span>
        )}
        <span className="rounded-md border border-line-strong px-2.5 py-1 text-xs">
          tohumlu: {hasDataForSeo() ? "DataForSEO — çizdiğimiz niche'lerde yükselen sorgular" : "kapalı"}
        </span>
      </div>

      {perf.length > 0 && (
        <section className="mb-6 overflow-x-auto rounded border border-line-strong">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-ink-soft">
              <tr><th className="p-2">grup</th><th className="p-2">ürün</th><th className="p-2">canlı</th>
                  <th className="p-2">görüntülenme</th><th className="p-2">favori</th></tr>
            </thead>
            <tbody>
              {perf.map((p) => (
                <tr key={p.bucket} className="border-t border-line">
                  <td className="p-2 font-medium">{p.bucket === "trend" ? "trend ürünleri" : "diğer ürünler"}</td>
                  <td className="p-2 tabular-nums">{p.urun}</td>
                  <td className="p-2 tabular-nums">{p.canli}</td>
                  <td className="p-2 tabular-nums">{p.goruntulenme}</td>
                  <td className="p-2 tabular-nums">{p.favori}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line p-2 text-xs text-ink-soft">
            Trend sisteminin işe yarayıp yaramadığı buradan okunur. Anlamlı olması için trend
            ürünlerinin 30 gün canlı kalması gerekir — o zamana kadar bu satır sadece bir sayaç.
          </p>
        </section>
      )}

      <div className="overflow-x-auto rounded border border-line-strong">
        <table className="w-full text-sm">
          <thead className="bg-sunken text-left text-xs text-ink-soft">
            <tr>
              <th className="p-2">trend</th><th className="p-2">hacim</th><th className="p-2">karar</th>
              <th className="p-2">sebep</th><th className="p-2">yaş</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="p-2">
                  <div className="font-medium">{r.term}</div>
                  {r.headlines && <div className="text-xs text-ink-soft">{r.headlines.slice(0, 110)}</div>}
                  {r.categories && <div className="text-xs text-ink-soft">{r.categories}</div>}
                </td>
                <td className="p-2 tabular-nums">{r.volume ? r.volume.toLocaleString("tr-TR") : "—"}</td>
                <td className="p-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PILL[r.verdict] ?? ""}`}>
                    {r.verdict}
                  </span>
                  {r.judged_by !== "rule" && <div className="text-[11px] text-ink-soft">{r.judged_by}</div>}
                </td>
                <td className="p-2 text-xs text-ink-soft">{r.reason}</td>
                <td className="p-2 text-xs text-ink-soft">{ago(r.first_seen)}</td>
                <td className="p-2">
                  {r.used_at ? <span className="text-xs text-ink-soft">çizildi</span>
                    : r.verdict === "BLOCKED" ? null
                    : <TrendDraw trendId={r.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
