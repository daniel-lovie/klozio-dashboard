/**
 * In-process ticker. Runs inside the Next.js server so a single Railway service
 * is enough — no separate worker needed. Railway cron can ALSO hit
 * POST /api/cron/publish with CRON_SECRET; the DB lock makes that safe.
 */
import { runDue } from "./publish";
import { pollOrders } from "./orders";
import { snapshotAllShops } from "./analytics";
import { adInsights } from "./meta";
import { q } from "./db";

declare global {
  // eslint-disable-next-line no-var
  var __klozioTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioOrderTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioStatsTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioMetaTicker: NodeJS.Timeout | undefined;
}

export function startScheduler() {
  if (process.env.ENABLE_INPROCESS_SCHEDULER === "false") return;
  if (global.__klozioTicker) return;

  const interval = Number(process.env.SCHEDULER_INTERVAL_MS || 60000);
  const tick = async () => {
    try {
      const out = await runDue(5);
      if (out.claimed > 0) console.log("[scheduler]", JSON.stringify(out));
    } catch (e) {
      console.error("[scheduler] tick failed:", e);
    }
  };

  global.__klozioTicker = setInterval(tick, interval);
  // don't hold the process open just for the timer
  global.__klozioTicker.unref?.();
  console.log(`[scheduler] started, every ${interval}ms`);

  // Order pull runs on its own, slower cadence: Etsy receipts don't need
  // minute-level latency and the endpoint counts against API rate limits.
  const orderInterval = Number(process.env.ORDER_POLL_INTERVAL_MS || 5 * 60000);
  const orderTick = async () => {
    try {
      const out = await pollOrders();
      if (out.inserted > 0) console.log("[orders]", JSON.stringify(out));
    } catch (e) {
      console.error("[orders] poll failed:", e);
    }
  };
  global.__klozioOrderTicker = setInterval(orderTick, orderInterval);
  global.__klozioOrderTicker.unref?.();
  console.log(`[orders] polling every ${orderInterval}ms`);

  // Listing views/favourites: one snapshot per day is the useful resolution (Etsy updates
  // view counts lazily), so a 6h cadence just keeps today's row fresh — the unique index
  // on (listing, day) means extra runs overwrite instead of piling up.
  const statsInterval = Number(process.env.STATS_INTERVAL_MS || 6 * 3600 * 1000);
  const statsTick = async () => {
    try {
      const out = await snapshotAllShops();
      console.log("[stats]", JSON.stringify(out));
    } catch (e) {
      console.error("[stats] snapshot failed:", e);
    }
  };
  setTimeout(statsTick, 90_000).unref?.();   // first run shortly after boot
  global.__klozioStatsTicker = setInterval(statsTick, statsInterval);
  global.__klozioStatsTicker.unref?.();
  console.log(`[stats] snapshot every ${statsInterval}ms`);

  // Meta spend/clicks: hourly is plenty (Meta itself reports with a lag) and it keeps /analytics
  // CAC current without the operator typing anything.
  const metaInterval = Number(process.env.META_INTERVAL_MS || 3600 * 1000);
  const metaTick = async () => {
    if (!process.env.META_SYSTEM_TOKEN) return;
    try {
      const rows = await adInsights(7);
      for (const r of rows) {
        await q(
          `INSERT INTO meta_ad_stats (day, campaign_name, adset_name, ad_name, impressions, clicks,
                                      spend_cents, reach, ctr, cpc, all_clicks, landings, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
           ON CONFLICT (day, COALESCE(adset_name,''), COALESCE(ad_name,'')) DO UPDATE
             SET impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks, spend_cents=EXCLUDED.spend_cents,
                 reach=EXCLUDED.reach, ctr=EXCLUDED.ctr, cpc=EXCLUDED.cpc, all_clicks=EXCLUDED.all_clicks, landings=EXCLUDED.landings, updated_at=now()`,
          [r.day, r.campaign_name, r.adset_name, r.ad_name, r.impressions, r.clicks,
           Math.round(r.spend * 100), r.reach, r.ctr, r.cpc, r.all_clicks, r.landings]);
      }
      await q(`
        INSERT INTO ad_spend (shop_id, day, channel, campaign, spend_cents, clicks, impressions)
        SELECT 2, day, 'meta', campaign_name, sum(spend_cents)::int, sum(clicks)::int, sum(impressions)::int
          FROM meta_ad_stats WHERE day >= (now() AT TIME ZONE 'UTC')::date - 7
         GROUP BY day, campaign_name
        ON CONFLICT (shop_id, day, channel, COALESCE(campaign,'')) DO UPDATE
          SET spend_cents=EXCLUDED.spend_cents, clicks=EXCLUDED.clicks, impressions=EXCLUDED.impressions`);
      if (rows.length) console.log(`[meta] synced ${rows.length} ad-day rows`);
    } catch (e) {
      console.error("[meta] sync failed:", String(e).slice(0, 200));
    }
  };
  setTimeout(metaTick, 120_000).unref?.();
  global.__klozioMetaTicker = setInterval(metaTick, metaInterval);
  global.__klozioMetaTicker.unref?.();
  console.log(`[meta] insights sync every ${metaInterval}ms`);
}
