/**
 * The next design this rater has not judged yet.
 *
 * Two phases, because coverage and agreement pull in opposite directions and only one of them was being
 * served. "Least-rated first" spreads votes across the catalogue, which is right — but it also means two
 * people rating at the same time never see the same design until every design has one vote. Measured:
 * two raters, thirty votes each, ZERO overlap. Everyone doing fifty and stopping would have produced
 * broad coverage and no inter-rater signal at all, which is the one thing five raters are for.
 *
 * So the first CALIBRATION designs are a fixed set, in a fixed order, identical for everyone. Agreement
 * data exists from the first few minutes and survives people quitting early. After that it reverts to
 * least-rated-first and the rest of the catalogue gets covered.
 *
 * The set is chosen by md5(id) rather than by id: stable across sessions and machines, but not the
 * oldest or newest corner of the catalogue, which would calibrate everyone on one era of the shop.
 */
const CALIBRATION = 40;
import { q } from "@/lib/db";
import { checkRateToken, cleanRater } from "@/lib/rate-token";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkRateToken(url.searchParams.get("t"))) return new Response("forbidden", { status: 403 });
  const rater = cleanRater(url.searchParams.get("rater"));
  if (!rater) return Response.json({ error: "isim gerekli" }, { status: 400 });

  // Phase 1: the shared set, in the shared order.
  let rows = await q<{ id: number; slug: string }>(
    `WITH calib AS (
        SELECT id, md5(id::text) AS k FROM products
         WHERE print_file IS NOT NULL ORDER BY k LIMIT $2)
     SELECT p.id, p.slug FROM calib c JOIN products p ON p.id = c.id
      WHERE NOT EXISTS (SELECT 1 FROM design_feedback f
                         WHERE f.product_id = p.id AND f.source = 'operator' AND f.rater = $1)
      ORDER BY c.k
      LIMIT 1`, [rater, CALIBRATION]);

  // Phase 2: everything else, least-rated first so the catalogue gets covered rather than the same
  // corner getting deeper.
  if (!rows.length) {
    rows = await q<{ id: number; slug: string }>(
      `SELECT p.id, p.slug
         FROM products p
        WHERE p.print_file IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM design_feedback f
                           WHERE f.product_id = p.id AND f.source = 'operator' AND f.rater = $1)
        ORDER BY (SELECT count(*) FROM design_feedback f2
                   WHERE f2.product_id = p.id AND f2.source = 'operator') ASC, random()
        LIMIT 1`, [rater]);
  }

  const done = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM design_feedback WHERE source='operator' AND rater=$1`, [rater]);
  const total = await q<{ n: number }>(
    `SELECT count(*)::int AS n FROM products WHERE print_file IS NOT NULL`);

  if (!rows.length) {
    return Response.json({ done: true, rated: done[0]?.n ?? 0, total: total[0]?.n ?? 0 });
  }
  // Slug only — no title, no price, no listing id. A rating link is not a window into the shop.
  return Response.json({
    id: rows[0].id, slug: rows[0].slug,
    rated: done[0]?.n ?? 0, total: total[0]?.n ?? 0,
  });
}
