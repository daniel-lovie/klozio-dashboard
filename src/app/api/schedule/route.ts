import { NextResponse } from "next/server";
import { q, logEvent } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export async function GET(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const month = url.searchParams.get("month"); // YYYY-MM
  const params: any[] = [];
  let where = "";
  if (month) {
    params.push(`${month}-01`);
    where = `WHERE s.scheduled_at >= $1::date AND s.scheduled_at < ($1::date + INTERVAL '1 month')`;
  }
  const rows = await q(
    `SELECT s.id, s.scheduled_at, s.status, s.approved_at, s.published_at, s.last_error, s.attempts,
            p.id AS product_id, p.slug, p.title, p.price_cents, p.colorways, p.sizes,
            p.seo_score, p.net_margin_pct, p.etsy_listing_id, p.etsy_state,
            (SELECT id FROM product_images i WHERE i.product_id=p.id ORDER BY rank LIMIT 1) AS cover_image_id,
            (SELECT count(*) FROM product_images i WHERE i.product_id=p.id) AS image_count
       FROM schedule s JOIN products p ON p.id=s.product_id
       ${where}
      ORDER BY s.scheduled_at`, params);
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  if (!b.product_id || !b.scheduled_at) {
    return NextResponse.json({ error: "product_id and scheduled_at are required" }, { status: 400 });
  }
  const [row] = await q<{ id: number }>(
    `INSERT INTO schedule (product_id, scheduled_at) VALUES ($1,$2) RETURNING id`,
    [b.product_id, b.scheduled_at]
  );
  await logEvent("scheduled", { scheduleId: row.id, productId: b.product_id, detail: b.scheduled_at });
  return NextResponse.json({ id: row.id });
}
