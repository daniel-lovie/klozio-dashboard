/** The six numbers that say how the shop is doing today.
 *
 * The dashboard opened onto a calendar, which answers "what is scheduled" and nothing else. An operator
 * arriving in the morning wants to know what is live, what is waiting to go, what needs a decision, and
 * whether an order is sitting unshipped — all of which existed in the database and nowhere on screen.
 */
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId } from "@/lib/shops";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const shopId = await currentShopId();

  const [row] = await q<any>(
    `SELECT
       count(*) FILTER (WHERE etsy_listing_id IS NOT NULL)                       AS live,
       count(*) FILTER (WHERE design_state = 'ready'
                          AND content_status = 'approved'
                          AND etsy_listing_id IS NULL)                           AS ready,
       count(*) FILTER (WHERE design_state = 'awaiting_approval')                AS awaiting,
       count(*)                                                                  AS total,
       round(avg(net_margin_pct) FILTER (WHERE net_margin_pct IS NOT NULL), 1)   AS net_margin
     FROM products WHERE shop_id = $1`, [shopId]);

  const [sched] = await q<any>(
    `SELECT count(*) FILTER (WHERE status = 'approved' AND scheduled_at >= now()
                               AND scheduled_at < now() + interval '7 days') AS next7,
            count(*) FILTER (WHERE status = 'approved' AND scheduled_at < now()) AS overdue
       FROM schedule s
       JOIN products p ON p.id = s.product_id
      WHERE p.shop_id = $1`, [shopId]);

  const [orders] = await q<any>(
    `SELECT count(*) FILTER (WHERE status = 'new' AND is_paid)                   AS unsent,
            count(*) FILTER (WHERE status = 'sent_to_producer'
                               AND tracking_code IS NULL)                        AS untracked
       FROM fulfillment_orders WHERE shop_id = $1`, [shopId]);

  // Views come from a manual snapshot, so the window is "whatever was captured", not a promise of 30 days.
  const [stats] = await q<any>(
    `WITH latest AS (
       SELECT DISTINCT ON (product_id) product_id, views, favorites, captured_on
         FROM listing_stats WHERE shop_id = $1 ORDER BY product_id, captured_at DESC)
     SELECT coalesce(sum(views), 0)::int AS views, coalesce(sum(favorites), 0)::int AS favorites,
            max(captured_on) AS captured_on FROM latest`, [shopId]);

  return Response.json({
    live: Number(row?.live ?? 0),
    ready: Number(row?.ready ?? 0),
    awaiting: Number(row?.awaiting ?? 0),
    total: Number(row?.total ?? 0),
    netMargin: row?.net_margin === null || row?.net_margin === undefined ? null : Number(row.net_margin),
    next7: Number(sched?.next7 ?? 0),
    overdue: Number(sched?.overdue ?? 0),
    unsentOrders: Number(orders?.unsent ?? 0),
    untrackedOrders: Number(orders?.untracked ?? 0),
    views: Number(stats?.views ?? 0),
    favorites: Number(stats?.favorites ?? 0),
    capturedOn: stats?.captured_on ?? null,
  });
}
