/**
 * The next design this rater has not judged yet.
 *
 * Ordering is deliberately "least-rated first, then random". Serving them in id order would give the
 * first hundred products five votes each and the rest none, and the point of five raters is agreement
 * measured across the whole catalogue rather than depth on its oldest corner.
 */
import { q } from "@/lib/db";
import { checkRateToken, cleanRater } from "@/lib/rate-token";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!checkRateToken(url.searchParams.get("t"))) return new Response("forbidden", { status: 403 });
  const rater = cleanRater(url.searchParams.get("rater"));
  if (!rater) return Response.json({ error: "isim gerekli" }, { status: 400 });

  const rows = await q<{ id: number; slug: string; votes: number }>(
    `SELECT p.id, p.slug,
            (SELECT count(*) FROM design_feedback f
              WHERE f.product_id = p.id AND f.source = 'operator') AS votes
       FROM products p
      WHERE p.print_file IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM design_feedback f
                         WHERE f.product_id = p.id AND f.source = 'operator' AND f.rater = $1)
      ORDER BY votes ASC, random()
      LIMIT 1`, [rater]);

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
