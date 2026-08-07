/** Read-only daily campaign verdict: Meta creative stats + Etsy-side signal -> Turkish report.
 *  Auth: dashboard session OR ?key=REPORT_SECRET (a separate, read-only secret so a scheduled
 *  cloud agent never needs the Meta token or CRON_SECRET). */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  const authed = (await isLoggedIn()) || (process.env.REPORT_SECRET && key === process.env.REPORT_SECRET);
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const days = Number(new URL(req.url).searchParams.get("days") ?? 2);

  const ads = await q<any>(`
    SELECT ad_name, adset_name,
           sum(impressions)::int AS impressions, sum(clicks)::int AS clicks,
           sum(spend_cents)::int AS spend_cents,
           CASE WHEN sum(impressions) > 0 THEN round(100.0*sum(clicks)/sum(impressions), 2) END AS ctr,
           CASE WHEN sum(clicks) > 0 THEN round(sum(spend_cents)/100.0/sum(clicks), 2) END AS cpc
      FROM meta_ad_stats
     WHERE day >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY ad_name, adset_name ORDER BY sum(spend_cents) DESC`, [days]);

  const sets = await q<any>(`
    SELECT adset_name, sum(spend_cents)::int AS spend_cents, sum(clicks)::int AS clicks,
           CASE WHEN sum(clicks) > 0 THEN round(sum(spend_cents)/100.0/sum(clicks), 2) END AS cpc
      FROM meta_ad_stats
     WHERE day >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY adset_name ORDER BY 4 NULLS LAST`, [days]);

  // Etsy tarafı: reklamın gittiği listing'in görüntülenme artışı + siparişler
  const listing = await q<any>(`
    SELECT p.slug, max(l.views) - min(l.views) AS view_delta, max(l.favorites) - min(l.favorites) AS fav_delta
      FROM listing_stats l JOIN products p ON p.id = l.product_id
     WHERE p.etsy_listing_id = 4550083352
       AND l.captured_on >= (now() AT TIME ZONE 'UTC')::date - $1::int
     GROUP BY p.slug`, [days]);

  const orders = await q<{ n: string; revenue: string }>(`
    SELECT count(*)::text AS n,
           COALESCE(sum(round(p.price_cents * 0.7) * f.quantity), 0)::text AS revenue
      FROM fulfillment_orders f JOIN products p ON p.id = f.product_id
     WHERE f.shop_id = 2 AND f.status <> 'cancelled'
       AND f.ordered_at >= (now() AT TIME ZONE 'UTC')::date - $1::int`, [days]);

  // Real landings: a row here means the browser actually followed the redirect, unlike Meta's
  // inline_link_clicks which counts taps that never finish loading. Bots are filtered crudely
  // by user agent — good enough to keep curl/crawler hits out of the human count.
  const landings = await q<{ n: string; humans: string }>(`
    SELECT count(*)::text AS n,
           count(*) FILTER (WHERE user_agent NOT ILIKE '%bot%' AND user_agent NOT ILIKE '%curl%'
                              AND user_agent NOT ILIKE '%crawler%' AND user_agent NOT ILIKE '%spider%')::text AS humans
      FROM short_links_clicks
     WHERE clicked_at >= (now() AT TIME ZONE 'UTC')::date - $1::int`, [days]);

  const spend = ads.reduce((a, r) => a + Number(r.spend_cents), 0);
  const clicks = ads.reduce((a, r) => a + Number(r.clicks), 0);
  const orderCount = Number(orders[0]?.n ?? 0);
  const revenue = Number(orders[0]?.revenue ?? 0);

  const verdict = (r: any) => {
    const s = Number(r.spend_cents) / 100, ctr = r.ctr == null ? null : Number(r.ctr),
          cpc = r.cpc == null ? null : Number(r.cpc);
    if (s < 3) return { tag: "bekle", why: "veri az (<$3 harcama)" };
    if (s >= 15 && ctr != null && ctr < 1) return { tag: "KAPAT", why: `$${s.toFixed(2)} harcandı, CTR %${ctr} (<%1)` };
    if (cpc != null && cpc > 0.7) return { tag: "KAPAT", why: `CPC $${cpc} (>$0.70)` };
    if (cpc != null && cpc <= 0.45) return { tag: "ÖLÇEKLE", why: `CPC $${cpc} (≤$0.45) — bütçe +%20` };
    return { tag: "izle", why: cpc != null ? `CPC $${cpc}` : "tık yok" };
  };

  const lines: string[] = [];
  lines.push(`📊 Son ${days} gün — harcama ${money(spend)}, tık ${clicks}, ` +
             `ort. CPC ${clicks ? `$${(spend / 100 / clicks).toFixed(2)}` : "—"}`);
  lines.push(`🛒 HillsByElgin siparişleri: ${orderCount}` +
             (orderCount ? ` · ciro ${money(revenue)} · CAC $${(spend / 100 / orderCount).toFixed(2)} ` +
              `(başabaş $21.45 — ${spend / 100 / orderCount <= 21.45 ? "KÂRLI ✅" : "henüz üstünde"})` : ""));
  // The ratio is only meaningful once the ads actually point at /go — before that the handful of
  // manual test hits would read as a catastrophic 1% follow-through and invite a bad decision.
  const humanLandings = Number(landings[0]?.humans ?? 0);
  if (humanLandings >= 10 && clicks) {
    lines.push(`🔗 Gerçek varış (/go linki): ${humanLandings} — Meta'nın saydığı ${clicks} tıkın ` +
               `%${Math.round((humanLandings / clicks) * 100)}'i sayfayı gerçekten açtı`);
  } else {
    lines.push(`🔗 Gerçek varış (/go linki): ${humanLandings} — reklamlar henüz /go linkine ` +
               `yönlendirilmedi, bu sayı sadece manuel testler (oran anlamlı değil)`);
  }
  if (listing[0]) lines.push(`👀 Mama listing: +${listing[0].view_delta} görüntülenme, +${listing[0].fav_delta} favori (Etsy API'si gecikmeli)`);
  lines.push("");
  lines.push("Ad set karşılaştırması (ucuzdan pahalıya):");
  for (const s of sets) lines.push(`  · ${s.adset_name}: ${money(s.spend_cents)} · ${s.clicks} tık · CPC ${s.cpc ? `$${s.cpc}` : "—"}`);
  lines.push("");
  lines.push("Kreatif kararları:");
  for (const a of ads) {
    const v = verdict(a);
    lines.push(`  · [${v.tag}] ${a.ad_name} (${a.adset_name}) — ${money(a.spend_cents)}, ` +
               `${a.impressions} gösterim, ${a.clicks} tık, CTR ${a.ctr ?? "—"}% — ${v.why}`);
  }

  return NextResponse.json({
    ok: true,
    summary: { spend_cents: spend, clicks, orders: orderCount, revenue_cents: revenue },
    adsets: sets, ads: ads.map((a) => ({ ...a, verdict: verdict(a) })),
    listing: listing[0] ?? null,
    report_tr: lines.join("\n"),
  });
}
