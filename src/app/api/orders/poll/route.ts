/**
 * Manual/cron trigger for the order poll. The actual pull lives in src/lib/orders
 * and also runs from the in-process scheduler every ORDER_POLL_INTERVAL_MS.
 */
import { NextResponse } from "next/server";
import { pollOrders } from "@/lib/orders";
import { isLoggedIn } from "@/lib/auth";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const ok = (await isLoggedIn()) || (process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json(await pollOrders());
}
