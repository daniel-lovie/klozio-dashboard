/** Snapshot listing views/favorites for every connected shop. Session OR CRON_SECRET. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { snapshotAllShops } from "@/lib/analytics";

export const maxDuration = 300;

export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const authed = (await isLoggedIn()) || (process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, shops: await snapshotAllShops() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
