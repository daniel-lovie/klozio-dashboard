/**
 * Etsy shop analytics — assembled ourselves, because Etsy v3 has NO shop-stats endpoint
 * (/shops/{id}/stats|analytics|visits all 404). What the API DOES expose per listing is
 * `views` and `num_favorers`; snapshotting those daily gives deltas (daily views), favourite
 * rates and — joined with fulfillment_orders — real conversion per listing.
 *
 * Snapshots are idempotent per (listing, day): re-running just refreshes today's row.
 */
import { q, logEvent } from "./db";
import { apiGet } from "./etsy";
import { runWithShop, shopCtx } from "./shop-context";

async function snapshotShop(shopId: number) {
  const products = await q<{ id: number; etsy_listing_id: string }>(
    `SELECT id, etsy_listing_id FROM products
      WHERE shop_id=$1 AND etsy_listing_id IS NOT NULL AND etsy_state='active'`, [shopId]);
  if (!products.length) return { listings: 0 };

  // batch: Etsy allows up to 100 ids per call
  let done = 0;
  for (let i = 0; i < products.length; i += 100) {
    const batch = products.slice(i, i + 100);
    const ids = batch.map((p) => p.etsy_listing_id).join(",");
    const res = await apiGet(`/listings/batch?listing_ids=${ids}`);
    for (const l of res.results ?? []) {
      const p = batch.find((x) => String(x.etsy_listing_id) === String(l.listing_id));
      await q(
        `INSERT INTO listing_stats (shop_id, product_id, etsy_listing_id, views, favorites)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (etsy_listing_id, captured_on) DO UPDATE
           SET views=EXCLUDED.views, favorites=EXCLUDED.favorites, captured_at=now()`,
        [shopId, p?.id ?? null, l.listing_id, l.views ?? 0, l.num_favorers ?? 0]);
      done++;
    }
  }
  return { listings: done };
}

export async function snapshotAllShops() {
  const shops = await q<{ shop_id: number }>(`SELECT DISTINCT shop_id FROM etsy_tokens`);
  const out: Record<number, number> = {};
  for (const s of shops) {
    try {
      const r = await runWithShop(s.shop_id, () => snapshotShop(s.shop_id));
      out[s.shop_id] = r.listings;
    } catch (e) {
      console.error(`stats snapshot shop ${s.shop_id}:`, String(e).slice(0, 200));
      out[s.shop_id] = -1;
    }
  }
  await logEvent("stats_snapshot", { detail: JSON.stringify(out) });
  return out;
}

export type ListingPerf = {
  product_id: number; slug: string; title: string; slot: string;
  etsy_listing_id: string; price_cents: number;
  views: number; favorites: number; views_7d: number | null;
  orders: number; revenue_cents: number; live_days: number;
};

/** Per-listing performance for a shop: lifetime views/faves, 7-day view delta, orders, revenue. */
export async function shopPerformance(shopId: number) {
  const rows = await q<ListingPerf>(`
    WITH latest AS (
      SELECT DISTINCT ON (etsy_listing_id) etsy_listing_id, views, favorites, captured_on
        FROM listing_stats WHERE shop_id=$1 ORDER BY etsy_listing_id, captured_on DESC
    ), weekago AS (
      SELECT DISTINCT ON (etsy_listing_id) etsy_listing_id, views
        FROM listing_stats
       WHERE shop_id=$1 AND captured_on <= (now() AT TIME ZONE 'UTC')::date - 7
       ORDER BY etsy_listing_id, captured_on DESC
    ), sales AS (
      SELECT product_id, count(*)::int AS orders, sum(quantity)::int AS units
        FROM fulfillment_orders WHERE shop_id=$1 GROUP BY product_id
    )
    SELECT p.id AS product_id, p.slug, p.title, COALESCE(p.slot,'') AS slot,
           p.etsy_listing_id::text, p.price_cents,
           COALESCE(l.views,0) AS views, COALESCE(l.favorites,0) AS favorites,
           CASE WHEN w.views IS NULL THEN NULL ELSE COALESCE(l.views,0) - w.views END AS views_7d,
           COALESCE(s.orders,0) AS orders,
           (COALESCE(s.units,0) * round(p.price_cents * 0.7))::int AS revenue_cents,
           GREATEST(1, EXTRACT(day FROM now() - p.created_at)::int) AS live_days
      FROM products p
      LEFT JOIN latest l ON l.etsy_listing_id = p.etsy_listing_id
      LEFT JOIN weekago w ON w.etsy_listing_id = p.etsy_listing_id
      LEFT JOIN sales s ON s.product_id = p.id
     WHERE p.shop_id=$1 AND p.etsy_listing_id IS NOT NULL AND p.etsy_state='active'
     ORDER BY COALESCE(l.views,0) DESC, p.slug`, [shopId]);

  const totals = rows.reduce((a, r) => ({
    listings: a.listings + 1,
    views: a.views + Number(r.views),
    favorites: a.favorites + Number(r.favorites),
    orders: a.orders + Number(r.orders),
    revenue: a.revenue + Number(r.revenue_cents),
  }), { listings: 0, views: 0, favorites: 0, orders: 0, revenue: 0 });

  const history = await q<{ captured_on: string; views: number; favorites: number }>(
    `SELECT captured_on::text, sum(views)::int AS views, sum(favorites)::int AS favorites
       FROM listing_stats WHERE shop_id=$1 GROUP BY 1 ORDER BY 1 DESC LIMIT 14`, [shopId]);

  return { rows, totals, history };
}
