/** Read-only daily campaign verdict: Meta creative stats + Etsy-side signal -> Turkish report.
 *  Auth: dashboard session OR ?key=REPORT_SECRET (a separate, read-only secret so a scheduled
 *  cloud agent never needs the Meta token or CRON_SECRET). */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Which listings each campaign is actually driving traffic to. Without this the report divides
 *  TOTAL account spend by one campaign's orders — the same mistake as crediting unrelated shop
 *  orders to an ad, one level up. Match is a substring of the Meta campaign name. */
const CAMPAIGNS: { match: string; label: string; listings: number[] }[] = [
  { match: "Mama", label: "Mama tee", listings: [4550083352] },
  { match: "TTRPG", label: "TTRPG d20 arma", listings: [4551744060, 4551743654, 4551746506, 4551746166] },
];

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const authed = (await isLoggedIn()) || (process.env.REPORT_SECRET && key === process.env.REPORT_SECRET);
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const days = Number(new URL(req.url).searchParams.get("days") ?? 2);

  // Judged on landings, not clicks: a click that never finishes loading buys us nothing, and the
  // gap between the two is large enough on some placements to flip a verdict.
  const ads = await q<any>(`
    SELECT ad_name, adset_name,
           sum(impressions)::int AS impressions, sum(clicks)::int AS clicks,
           sum(COALESCE(landings, 0))::int AS landings, sum(spend_cents)::int AS spend_cents,
           CASE WHEN sum(impressions) > 0 THEN round(100.0*sum(clicks)/sum(impressions), 2) END AS ctr,
           CASE WHEN sum(clicks) > 0 THEN round(sum(spend_cents)/100.0/sum(clicks), 2) END AS cpc,
           CASE WHEN sum(COALESCE(landings,0)) > 0
                THEN round(sum(spend_cents)/100.0/sum(COALESCE(landings,0)), 2) END AS cost_per_landing,
           CASE WHEN sum(clicks) > 0
                THEN round(100.0*sum(COALESCE(landings,0))/sum(clicks)) END AS landing_rate
      FROM meta_ad_stats
     WHERE day >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY ad_name, adset_name ORDER BY sum(spend_cents) DESC`, [days]);

  const sets = await q<any>(`
    SELECT adset_name, sum(spend_cents)::int AS spend_cents, sum(clicks)::int AS clicks,
           sum(COALESCE(landings, 0))::int AS landings,
           CASE WHEN sum(COALESCE(landings,0)) > 0
                THEN round(sum(spend_cents)/100.0/sum(COALESCE(landings,0)), 2) END AS cost_per_landing
      FROM meta_ad_stats
     WHERE day >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY adset_name ORDER BY 5 NULLS LAST`, [days]);

  const perCampaign = await q<any>(`
    SELECT campaign_name, sum(spend_cents)::int AS spend_cents, sum(clicks)::int AS clicks,
           sum(COALESCE(landings, 0))::int AS landings
      FROM meta_ad_stats
     WHERE day >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY campaign_name`, [days]);

  const perListing = await q<any>(`
    SELECT p.etsy_listing_id::text AS listing, count(*)::int AS n,
           COALESCE(sum(round(p.price_cents * 0.7) * f.quantity), 0)::int AS revenue
      FROM fulfillment_orders f JOIN products p ON p.id = f.product_id
     WHERE f.shop_id = 2 AND f.status <> 'cancelled'
       AND f.ordered_at >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY p.etsy_listing_id`, [days]);

  // Etsy tarafı: reklamın gittiği listing'in görüntülenme artışı + siparişler
  // every advertised listing, not just the first campaign's
  const listing = await q<any>(`
    SELECT p.slug, p.etsy_listing_id::text AS listing,
           max(l.views) - min(l.views) AS view_delta,
           max(l.favorites) - min(l.favorites) AS fav_delta
      FROM listing_stats l JOIN products p ON p.id = l.product_id
     WHERE p.etsy_listing_id = ANY($2::bigint[])
       AND l.captured_on >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY p.slug, p.etsy_listing_id
     HAVING max(l.views) - min(l.views) > 0 OR max(l.favorites) - min(l.favorites) > 0`,
    [days, CAMPAIGNS.flatMap((c) => c.listings)]);

  // Split the advertised listing from the rest of the shop. Lumping them together credited the
  // campaign with orders for completely different products and made CAC look near breakeven.
  const orders = await q<{ n: string; revenue: string; ad_n: string; ad_revenue: string }>(`
    SELECT count(*)::text AS n,
           COALESCE(sum(round(p.price_cents * 0.7) * f.quantity), 0)::text AS revenue,
           count(*) FILTER (WHERE p.etsy_listing_id = 4550083352)::text AS ad_n,
           COALESCE(sum(round(p.price_cents * 0.7) * f.quantity)
                    FILTER (WHERE p.etsy_listing_id = 4550083352), 0)::text AS ad_revenue
      FROM fulfillment_orders f JOIN products p ON p.id = f.product_id
     WHERE f.shop_id = 2 AND f.status <> 'cancelled'
       AND f.ordered_at >= (now() AT TIME ZONE 'UTC')::date - $1::int`, [days]);

  // Real landings: a row here means the browser actually followed the redirect, unlike Meta's
  // inline_link_clicks which counts taps that never finish loading.
  // facebookexternalhit is the big one — Meta re-crawls the destination of every ad, which on our
  // first day was 214 of 237 hits. Counting those as people would have inflated the landing rate
  // past 100% and made the whole measurement useless.
  const goHits = await q<{ n: string; humans: string }>(`
    SELECT count(*)::text AS n,
           count(*) FILTER (WHERE user_agent !~* '(bot|crawler|spider|curl|wget|python-requests|okhttp|headless|facebookexternalhit|facebookcatalog|preview)')::text AS humans
      FROM short_links_clicks
     WHERE clicked_at >= (now() AT TIME ZONE 'UTC')::date - $1::int`, [days]);

  const spend = ads.reduce((a, r) => a + Number(r.spend_cents), 0);
  const clicks = ads.reduce((a, r) => a + Number(r.clicks), 0);
  const orderCount = Number(orders[0]?.n ?? 0);
  const revenue = Number(orders[0]?.revenue ?? 0);

  const verdict = (r: any) => {
    const s = Number(r.spend_cents) / 100;
    const ctr = r.ctr == null ? null : Number(r.ctr);
    const cpl = r.cost_per_landing == null ? null : Number(r.cost_per_landing);
    const rate = r.landing_rate == null ? null : Number(r.landing_rate);
    if (s < 3) return { tag: "bekle", why: "veri az (<$3 harcama)" };
    // A creative can look fine on CTR while almost nobody actually reaches the page.
    if (rate != null && rate < 40 && Number(r.clicks) >= 20)
      return { tag: "KAPAT", why: `tıkların yalnızca %${rate}'i sayfayı açıyor` };
    if (s >= 15 && ctr != null && ctr < 1) return { tag: "KAPAT", why: `$${s.toFixed(2)} harcandı, CTR %${ctr} (<%1)` };
    if (cpl != null && cpl > 0.9) return { tag: "KAPAT", why: `iniş başına $${cpl} (>$0.90)` };
    if (cpl != null && cpl <= 0.5) return { tag: "ÖLÇEKLE", why: `iniş başına $${cpl} (≤$0.50) — bütçe +%20` };
    return { tag: "izle", why: cpl != null ? `iniş başına $${cpl}` : "iniş yok" };
  };

  const metaLandings = ads.reduce((a, r) => a + Number(r.landings ?? 0), 0);

  const lines: string[] = [];
  lines.push(`📊 Son ${days} gün — harcama ${money(spend)}, tık ${clicks}, ` +
             `gerçek iniş ${metaLandings}` +
             (metaLandings ? ` (iniş başına $${(spend / 100 / metaLandings).toFixed(2)})` : "") +
             (clicks ? ` · tıkların %${Math.round((metaLandings / clicks) * 100)}'i sayfayı açıyor` : ""));
  let attributedOrders = 0;
  for (const c of CAMPAIGNS) {
    const rows = perCampaign.filter((r) => (r.campaign_name ?? "").includes(c.match));
    if (!rows.length) continue;
    const cSpend = rows.reduce((a, r) => a + Number(r.spend_cents), 0);
    const cLandings = rows.reduce((a, r) => a + Number(r.landings ?? 0), 0);
    const mine = perListing.filter((r) => c.listings.includes(Number(r.listing)));
    const n = mine.reduce((a, r) => a + Number(r.n), 0);
    const rev = mine.reduce((a, r) => a + Number(r.revenue), 0);
    attributedOrders += n;
    lines.push(`🛒 ${c.label}: ${money(cSpend)} harcama · ${cLandings} iniş · ${n} sipariş` +
               (n ? ` · ciro ${money(rev)} · CAC $${(cSpend / 100 / n).toFixed(2)} ` +
                    `(başabaş $21.45 — ${cSpend / 100 / n <= 21.45 ? "KÂRLI ✅" : "henüz üstünde"})`
                  : cLandings >= 100 ? " — 100+ iniş oldu, hâlâ sipariş yok: listing/teklif tarafına bak"
                                     : " — henüz veri az"));
  }
  if (orderCount > attributedOrders)
    lines.push(`   (dükkanın tamamı: ${orderCount} sipariş · ${money(revenue)} — ` +
               `${orderCount - attributedOrders} tanesi reklam verilen ürünlerden değil, CAC'a katılmıyor)`);
  // Count only, never a ratio against total clicks: just a few ads carry the /go link, so dividing
  // by campaign-wide clicks understates it badly. Meta's landing_page_view is the ratio metric;
  // this is an independent, non-Meta-reported sanity check on it.
  const humanLandings = Number(goHits[0]?.humans ?? 0);
  lines.push(`🔗 /go linkli reklamlardan gerçek varış: ${humanLandings} kişi ` +
             `(botlar ayıklandı — bağımsız doğrulama)`);
  for (const l of listing)
    lines.push(`👀 ${l.slug}: +${l.view_delta} görüntülenme, +${l.fav_delta} favori (Etsy API'si gecikmeli)`);
  lines.push("");
  lines.push("Ad set karşılaştırması (iniş başına maliyete göre, ucuzdan pahalıya):");
  for (const s of sets)
    lines.push(`  · ${s.adset_name}: ${money(s.spend_cents)} · ${s.clicks} tık · ${s.landings} iniş · ` +
               `iniş başına ${s.cost_per_landing ? `$${s.cost_per_landing}` : "—"}`);
  lines.push("");
  lines.push("Kreatif kararları:");
  for (const a of ads) {
    const v = verdict(a);
    lines.push(`  · [${v.tag}] ${a.ad_name} (${a.adset_name}) — ${money(a.spend_cents)}, ` +
               `${a.impressions} gösterim, ${a.clicks} tık, ${a.landings} iniş` +
               `${a.landing_rate != null ? ` (%${a.landing_rate})` : ""}, CTR ${a.ctr ?? "—"}% — ${v.why}`);
  }

  return NextResponse.json({
    ok: true,
    summary: { spend_cents: spend, clicks, landings: metaLandings, orders: orderCount,
               ad_orders: Number(orders[0]?.ad_n ?? 0), revenue_cents: revenue },
    adsets: sets, ads: ads.map((a) => ({ ...a, verdict: verdict(a) })),
    listing: listing[0] ?? null,
    report_tr: lines.join("\n"),
  });
}
