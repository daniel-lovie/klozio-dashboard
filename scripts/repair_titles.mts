/**
 * Bring existing titles into the operating band, using the product's own tags.
 *
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/repair_titles.mts            # dry run
 *   npx tsx scripts/repair_titles.mts --apply
 *
 * Thirty-four products were scheduled to launch with titles of 76-95 characters against a 125-140
 * band. None of them would have FAILED — Etsy's 140 is an upper bound — so nothing would ever have
 * reported it; each would simply have gone live with forty characters of search surface unused.
 *
 * It touches only products that are NOT on Etsy yet. A live listing's title is a thing buyers and
 * Etsy's index have already seen, and changing it is a decision about an existing listing rather than
 * a repair of an unfinished one; that goes through update_product, which writes to Etsy as well.
 *
 * The padding logic is imported, not reimplemented, so this cannot drift from what the agent does.
 */
import { fitTitle } from "../src/lib/agent/draft-product";
import { pool } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const c = pool();

const rows = await c.query<{ id: number; slug: string; title: string; tags: string[] }>(
  `SELECT p.id, p.slug, p.title, p.tags
     FROM products p
    WHERE p.etsy_listing_id IS NULL
      AND p.title IS NOT NULL
      AND length(p.title) < 125
      AND EXISTS (SELECT 1 FROM schedule s
                   WHERE s.product_id = p.id AND s.status IN ('approved','pending'))
    ORDER BY p.id`);

let fixed = 0, skipped = 0;
for (const r of rows.rows) {
  try {
    const { title, titleNote } = fitTitle(r.title, r.tags ?? []);
    if (title === r.title) { skipped++; continue; }
    console.log(`  ${r.slug.padEnd(16)} ${r.title.length} -> ${title.length}`);
    console.log(`      ${title}`);
    if (APPLY) await c.query(`UPDATE products SET title=$2, updated_at=now() WHERE id=$1`, [r.id, title]);
    fixed++;
  } catch (e: any) {
    // A title the rules cannot repair is a title someone has to write. Say which and why.
    console.log(`  ${r.slug.padEnd(16)} ATLANDI — ${String(e.message).slice(0, 90)}`);
    skipped++;
  }
}
console.log(`\n${rows.rowCount} aday · ${fixed} onarildi · ${skipped} atlandi${APPLY ? "" : "  (DRY RUN — --apply ile yaz)"}`);
await c.end();
process.exit(0);
