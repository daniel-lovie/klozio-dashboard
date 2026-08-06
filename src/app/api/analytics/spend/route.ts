/** Daily ad spend entry — the input side of pixel-less CAC/ROAS measurement. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { q, logEvent } from "@/lib/db";
import { currentShopId } from "@/lib/shops";

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const shopId = await currentShopId();
  const day = String(b.day || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  const num = (v: any) => (v === "" || v == null ? null : Math.round(Number(v)));
  await q(
    `INSERT INTO ad_spend (shop_id, day, channel, campaign, spend_cents, clicks, impressions)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (shop_id, day, channel, COALESCE(campaign,'')) DO UPDATE
       SET spend_cents=EXCLUDED.spend_cents, clicks=EXCLUDED.clicks, impressions=EXCLUDED.impressions`,
    [shopId, day, String(b.channel || "meta"), b.campaign?.trim() || null,
     Math.round(Number(b.spend || 0) * 100), num(b.clicks), num(b.impressions)]);
  await logEvent("ad_spend", { detail: `${day} ${b.channel} $${b.spend}` });
  return NextResponse.json({ ok: true });
}
