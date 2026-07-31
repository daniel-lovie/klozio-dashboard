/**
 * In-process ticker. Runs inside the Next.js server so a single Railway service
 * is enough — no separate worker needed. Railway cron can ALSO hit
 * POST /api/cron/publish with CRON_SECRET; the DB lock makes that safe.
 */
import { runDue } from "./publish";

declare global {
  // eslint-disable-next-line no-var
  var __klozioTicker: NodeJS.Timeout | undefined;
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
}
