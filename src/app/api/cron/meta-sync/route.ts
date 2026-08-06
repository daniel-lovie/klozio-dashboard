/** Pull Meta ad-level insights into meta_ad_stats and feed ad_spend (kills manual entry). */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { q, logEvent } from "@/lib/db";
import { adInsights } from "@/lib/meta";

export const maxDuration = 120;

export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const authed = (await isLoggedIn()) || (process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const rows = await adInsights(new URL(req.url).searchParams.get("preset") ?? "last_7d");
    for (const r of rows) {
      await q(
        `INSERT INTO meta_ad_stats (day, campaign_name, adset_name, ad_name, impressions, clicks,
                                    spend_cents, reach, ctr, cpc, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
         ON CONFLICT (day, COALESCE(adset_name,''), COALESCE(ad_name,'')) DO UPDATE
           SET impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, spend_cents=EXCLUDED.spend_cents,
               reach=EXCLUDED.reach, ctr=EXCLUDED.ctr, cpc=EXCLUDED.cpc,
               campaign_name=EXCLUDED.campaign_name, updated_at=now()`,
        [r.day, r.campaign_name, r.adset_name, r.ad_name, r.impressions, r.clicks,
         Math.round(r.spend * 100), r.reach, r.ctr, r.cpc]);
    }

    // roll ad-level rows up into the shop's daily spend ledger (shop 2 = HillsByElgin)
    await q(`
      INSERT INTO ad_spend (shop_id, day, channel, campaign, spend_cents, clicks, impressions)
      SELECT 2, day, 'meta', campaign_name, sum(spend_cents)::int, sum(clicks)::int, sum(impressions)::int
        FROM meta_ad_stats WHERE day >= (now() AT TIME ZONE 'UTC')::date - 7
       GROUP BY day, campaign_name
      ON CONFLICT (shop_id, day, channel, COALESCE(campaign,'')) DO UPDATE
        SET spend_cents=EXCLUDED.spend_cents, clicks=EXCLUDED.clicks, impressions=EXCLUDED.impressions`);

    await logEvent("meta_sync", { detail: `${rows.length} ad-day rows` });
    return NextResponse.json({ ok: true, rows: rows.length });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
