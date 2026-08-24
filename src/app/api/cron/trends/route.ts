/** Daily trend run. Writes products that are ready to approve; never approves and never touches Etsy. */
import { NextResponse } from "next/server";
import { runTrendRound, trendShops } from "@/lib/trend-pipeline";
import { isLoggedIn } from "@/lib/auth";

async function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  if (secret && header === `Bearer ${secret}`) return true;
  return isLoggedIn();
}

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const perDay = Number(url.searchParams.get("perDay") || process.env.TREND_PER_DAY || 2);
  const shopParam = url.searchParams.get("shop");
  // No ?shop= means every opted-in shop, the same set the nightly ticker uses. Passing one runs it for
  // that shop alone, which is what you want when checking a single shop's output by hand.
  const shops = shopParam ? [Number(shopParam)] : await trendShops();
  if (!shops.length) return NextResponse.json({ error: "no shop has trend_daily enabled" }, { status: 400 });
  const out = await runTrendRound(shops, { perDay });
  return NextResponse.json(out);
}
export const GET = POST;
