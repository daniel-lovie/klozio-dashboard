import { NextResponse } from "next/server";
import { guardInventory } from "@/lib/inventory-guard";
import { isLoggedIn } from "@/lib/auth";
import { logEvent } from "@/lib/db";

async function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  if (secret && header === `Bearer ${secret}`) return true;
  return isLoggedIn();
}

/**
 * Sweep live listings for the no-variations shape. `?dry=1` reports without writing to Etsy.
 *
 * The sweep is started and NOT awaited. It reads every active listing with a rate-limit gap before it
 * writes anything, which on this shop is several minutes — well past the proxy's timeout, so awaiting
 * it returned 524 to the caller every time while the work carried on invisibly behind the error. The
 * result lands in the events table (`inventory_broken` / `inventory_repaired` / `inventory_repair_failed`)
 * and in the service logs; that is where to read the outcome, not in this response.
 */
export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dry = new URL(req.url).searchParams.get("dry") === "1";

  void guardInventory(!dry)
    .then((out) =>
      logEvent("inventory_sweep_done", {
        detail: `${dry ? "dry " : ""}tarandi:${out.scanned} bozuk:${out.broken} ` +
                `onarilan:${out.repaired} basarisiz:${out.failed}`,
      })
    )
    .catch((e) =>
      logEvent("inventory_sweep_failed", { detail: String(e?.message ?? e).slice(0, 500) })
    );

  return NextResponse.json({
    started: true,
    dry,
    note: "Tarama arkada calisiyor. Sonuc: events tablosunda inventory_* kayitlari.",
  });
}
export const GET = POST;
