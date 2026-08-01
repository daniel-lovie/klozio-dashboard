/**
 * In-process ticker. Runs inside the Next.js server so a single Railway service
 * is enough — no separate worker needed. Railway cron can ALSO hit
 * POST /api/cron/publish with CRON_SECRET; the DB lock makes that safe.
 */
import { runDue } from "./publish";
import { pollOrders } from "./orders";

declare global {
  // eslint-disable-next-line no-var
  var __klozioTicker: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __klozioOrderTicker: NodeJS.Timeout | undefined;
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
}
