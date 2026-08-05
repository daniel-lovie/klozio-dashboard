/**
 * In-process ticker. Runs inside the Next.js server so a single Railway service
 * is enough — no separate worker needed. Railway cron can ALSO hit
 * POST /api/cron/publish with CRON_SECRET; the DB lock makes that safe.
 */
import { runDue } from "./publish";
import { pollOrders } from "./orders";
import { snapshotAllShops } from "./analytics";

declare global {
  // eslint-disable-next-line no-var
  var __klozioTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioOrderTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioStatsTicker: NodeJS.Timeout | undefined;
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
}
