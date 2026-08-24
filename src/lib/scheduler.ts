/**
 * In-process ticker. Runs inside the Next.js server so a single Railway service
 * is enough — no separate worker needed. Railway cron can ALSO hit
 * POST /api/cron/publish with CRON_SECRET; the DB lock makes that safe.
 */
import { runDue } from "./publish";
import { produceDue } from "./producer";
import { pollOrders } from "./orders";
import { snapshotAllShops } from "./analytics";
import { adInsights } from "./meta";
import { guardInventory } from "./inventory-guard";
import { runTrendRound, recordScan, trendShops } from "./trend-pipeline";
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
  var __klozioProducerTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioInventoryTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioTrendTicker: NodeJS.Timeout | undefined;
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
  // Producer: approved products with no artwork become publish-ready without anyone asking. One at a
  // time on purpose — each pass is a paid Higgsfield call plus seven composites, and serialising keeps a
  // burst of approvals from running the container out of memory or the account out of credit.
  //
  // ⚠️ IN PRODUCTION THIS TICKER IS OFF AND THAT IS DELIBERATE. Production is the `agent` service's job:
  // scripts/personalizer.mts runs worker/producer.ts on its own container, which keeps minutes-long image
  // work off the process that serves HTTP. ENABLE_PRODUCER=false is set on the web service for that
  // reason. This ticker is the same work behind a flag, kept for local development and for a deployment
  // that runs the web service alone.
  //
  // Do not enable it to "get production going": both tickers claim from the same rows, so running both
  // means two workers racing and paying twice for one product. Someone (2026-08-12) read the flag as an
  // oversight, turned it on, and got exactly that — the flag was never why production looked stuck. If
  // nothing is being produced, check that the `agent` service is deployed and its loop is alive
  // (`railway logs --service agent` → "[personalizer] loop started") before touching this.
  const produceInterval = Number(process.env.PRODUCER_INTERVAL_MS || 90000);
  const produceTick = async () => {
    try {
      const out = await produceDue(1);
      if (out.produced || out.failed) console.log("[producer]", JSON.stringify(out));
    } catch (e) {
      console.error("[producer] tick failed:", e);
    }
  };
  if (process.env.ENABLE_PRODUCER !== "false") {
    global.__klozioProducerTicker = setInterval(produceTick, produceInterval);
    global.__klozioProducerTicker.unref?.();
    console.log(`[producer] every ${produceInterval}ms`);
  }

  global.__klozioOrderTicker = setInterval(orderTick, orderInterval);
  global.__klozioOrderTicker.unref?.();
  console.log(`[orders] polling every ${orderInterval}ms`);

  // Inventory guard: a listing can go live with no sizes, no colours and no Digital PNG, and nothing
  // in the database says so — the schedule row reads `published` and the product row reads correct.
  // The publisher now verifies its own write, but it can only vouch for listings IT published; this
  // sweep is what covers anything already live, edited by hand, or published by an older build.
  //
  // Hourly on purpose. It reads every active listing before it writes anything, so a fast cadence buys
  // nothing but Etsy rate limit pressure — the failure it looks for does not appear between sweeps on
  // its own, only at publish time.
  const invInterval = Number(process.env.INVENTORY_GUARD_INTERVAL_MS || 3600 * 1000);
  const invTick = async () => {
    try {
      const out = await guardInventory(process.env.INVENTORY_GUARD_REPAIR !== "false");
      if (out.broken > 0 || out.failed > 0 || out.imgBroken > 0) console.log("[inventory]", JSON.stringify(out));
    } catch (e) {
      console.error("[inventory] guard failed:", e);
    }
  };
  setTimeout(invTick, 120_000).unref?.();   // first sweep once the app has settled after boot
  global.__klozioInventoryTicker = setInterval(invTick, invInterval);
  global.__klozioInventoryTicker.unref?.();
  console.log(`[inventory] guard every ${invInterval}ms`);

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

  // Daily trend run at 19:00 America/Chicago: read the day's trending searches, draft the ones that can
  // legally and decently become a design, and leave them ready for the operator to approve. Nothing here
  // publishes — every product lands on a `pending` schedule row, which is rule 1 of this project and also
  // the only thing separating an automated pipeline from an automated mistake.
  //
  // The hour is read in Chicago time rather than as a fixed UTC offset, so 19:00 stays 19:00 across the
  // March and November DST changes instead of drifting an hour twice a year. The day is claimed by its
  // CHICAGO date for the same reason: 19:00 local is already tomorrow in UTC for half the year, so a
  // UTC-keyed claim would let one calendar day run twice.
  //
  // Yield is deliberately small. Measured across US/GB/CA, most days produce one drawable trend and some
  // produce none — the rest are athletes, celebrities, clubs, leagues, companies, and disasters. The
  // two-a-day quota is filled with a second drawing from the same category, never by relaxing a filter.
  const trendInterval = Number(process.env.TREND_INTERVAL_MS || 30 * 60 * 1000);
  const trendHour = Number(process.env.TREND_HOUR_LOCAL || 19);
  const TREND_TZ = process.env.TREND_TZ || "America/Chicago";
  const chicago = (part: "hour" | "day") => {
    const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: TREND_TZ, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    }).formatToParts(new Date());
    const get = (t: string) => f.find((x) => x.type === t)?.value ?? "";
    return part === "hour" ? get("hour") : `${get("year")}-${get("month")}-${get("day")}`;
  };
  const trendTick = async () => {
    // WATCH ON EVERY TICK. The free feed holds ten items per geo on a rolling window — two reads a
    // minute apart shared only 25 of 30 terms — so a once-a-night reader sees a sliver of the day and
    // cannot know what it missed. Recording every half hour is what turns a coin flip into a sample.
    try {
      const s = await recordScan();
      if (s.fresh) console.log("[trends] kaydedildi", JSON.stringify({ seen: s.seen, fresh: s.fresh, source: s.source }));
    } catch (e) {
      console.error("[trends] scan failed:", String(e).slice(0, 160));
    }

    // DRAW ONCE. Only after the hour, and only one shop-round per Chicago day.
    let claimed: string | null = null;
    try {
      if (Number(chicago("hour")) < trendHour) return;
      const day = chicago("day");
      const key = `trend gunu ${day} (${TREND_TZ})`;
      // Claim the day before doing any work. `web` and `agent` both run this scheduler, and the
      // advisory lock makes the check-then-insert one atomic step, so the loser of the race exits here
      // instead of drafting a second copy of everything.
      const claim = await q(
        `INSERT INTO events (kind, detail)
         SELECT 'trend_claim', $1
          WHERE pg_try_advisory_xact_lock(9182731)
            AND NOT EXISTS (SELECT 1 FROM events WHERE kind = 'trend_claim' AND detail = $1)
         RETURNING id`, [key]);
      if (!claim.length) return;
      claimed = key;

      const shops = await trendShops();
      if (!shops.length) return;
      const out = await runTrendRound(shops, { perDay: Number(process.env.TREND_PER_DAY || 2) });
      console.log("[trends]", JSON.stringify({
        day, scanned: out.scanned, source: out.source, usable: out.usable, hours: out.hours,
        target: out.target, made: out.made }));
      claimed = null;                                    // the night is genuinely done
    } catch (e) {
      console.error("[trends] run failed:", String(e).slice(0, 200));
      // Give the day back. The claim is written BEFORE the work so two services cannot both draw, but
      // leaving it behind after a failure means one transient provider error silently costs the whole
      // day — the next tick would find the day claimed and skip it until tomorrow.
      if (claimed) {
        await q(`DELETE FROM events WHERE kind='trend_claim' AND detail=$1`, [claimed]).catch(() => {});
        console.error("[trends] gun geri birakildi, sonraki tik yeniden dener");
      }
    }
  };
  setTimeout(trendTick, 180_000).unref?.();   // one attempt after boot; the claim row makes it idempotent
  global.__klozioTrendTicker = setInterval(trendTick, trendInterval);
  global.__klozioTrendTicker.unref?.();
  console.log(`[trends] daily at ${trendHour}:00 ${TREND_TZ}, checked every ${trendInterval}ms`);
}
