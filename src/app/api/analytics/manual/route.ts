/** Etsy Shop Stats (Visits/Views) are not in the API — operator pastes them here. */
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
  const revenue = b.revenue === "" || b.revenue == null ? null : Math.round(Number(b.revenue) * 100);

  await q(
    `INSERT INTO shop_daily_stats (shop_id, day, visits, page_views, orders, revenue_cents, favorites)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (shop_id, day) DO UPDATE
       SET visits=EXCLUDED.visits, page_views=EXCLUDED.page_views, orders=EXCLUDED.orders,
           revenue_cents=EXCLUDED.revenue_cents, favorites=EXCLUDED.favorites`,
    [shopId, day, num(b.visits), num(b.page_views), num(b.orders), revenue, num(b.favorites)]);
  await logEvent("shop_stats_manual", { detail: `shop ${shopId} ${day}` });
  return NextResponse.json({ ok: true });
}
