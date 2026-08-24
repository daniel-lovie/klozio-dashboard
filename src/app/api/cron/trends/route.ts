/** Daily trend run. Writes products that are ready to approve; never approves and never touches Etsy. */
import { NextResponse } from "next/server";
import { runTrendDay } from "@/lib/trend-pipeline";
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
  const shop = Number(url.searchParams.get("shop") || 1);
  const max = Number(url.searchParams.get("max") || 2);
  const out = await runTrendDay(shop, { max });
  return NextResponse.json(out);
}
export const GET = POST;
