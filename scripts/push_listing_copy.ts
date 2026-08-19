/**
 * Push title/tags/description from the database to listings that are already live on Etsy.
 *
 * The publisher writes these fields once, at creation. Every later edit — a keyword change, a corrected
 * phrase — lands only in the database, and the shop keeps showing whatever it was published with. That
 * gap is invisible: the dashboard reads the database and looks right while the listing is stale.
 *
 * Requires --apply. Writing to Etsy without the operator asking is the one thing CLAUDE.md forbids
 * outright, so a bare run only prints the diff.
 *
 *   npx tsx scripts/push_listing_copy.ts --pattern 'vibe-%'
 *   npx tsx scripts/push_listing_copy.ts --pattern 'vibe-%' --apply
 */
import { Pool } from "pg";
import { updateListingFields } from "../src/lib/etsy";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const pi = args.indexOf("--pattern");
  const pattern = pi >= 0 ? args[pi + 1] : null;
  if (!pattern) {
    console.error("--pattern gerekli, orn: --pattern 'vibe-%'");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT slug, etsy_listing_id, title, tags, description
       FROM products
      WHERE slug LIKE $1 AND etsy_listing_id IS NOT NULL AND title <> ''
      ORDER BY slug`,
    [pattern]
  );

  console.log(`${rows.length} yayindaki ilan${apply ? "" : " (DRY RUN)"}\n`);
  let ok = 0;
  for (const r of rows) {
    console.log(`${r.slug}  listing ${r.etsy_listing_id}`);
    console.log(`   T(${r.title.length}) ${r.title}`);
    console.log(`   tags: ${r.tags.join(", ")}`);
    if (!apply) continue;
    try {
      await updateListingFields(Number(r.etsy_listing_id), {
        title: r.title,
        tags: r.tags,
        description: r.description,
      });
      ok++;
      console.log("   -> Etsy guncellendi");
    } catch (e: any) {
      console.error(`   -> HATA: ${e?.message ?? e}`);
    }
    // Etsy rate-limits writes; a short gap keeps a five-listing sweep from tripping it.
    await new Promise((res) => setTimeout(res, 1200));
  }

  await pool.end();
  console.log(apply ? `\n${ok}/${rows.length} ilan Etsy'ye yazildi.` : "\nYazmak icin --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
