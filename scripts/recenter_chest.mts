/**
 * Move every left-chest print to a centred ten inch one, and rebuild its mockups.
 *
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/recenter_chest.mts            # list what would change
 *   npx tsx scripts/recenter_chest.mts --apply
 *
 * A 3.5 or 4 inch chest patch does not read in Etsy's gallery grid — at thumbnail size the design is a
 * smudge and the listing looks like a blank shirt. The operator went through 196 of them and could not
 * tell what any of them were (2026-08-24).
 *
 * The artwork does not need redrawing: these print files are 3000 px, which is 280 PPI across ten
 * inches, so the same file simply gets composited larger. Only the placement and the mockups change.
 *
 * It does NOT touch Etsy. Live listings still show what went up the day they were published until
 * scripts/resync_etsy_images.py runs, which is a separate and much heavier operation.
 */
import { execFileSync } from "child_process";
import { pool } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const SHOPS = [1, 2];

const c = pool();
const rows = (await c.query<{ id: number; slug: string; shop_id: number; live: boolean }>(
  `SELECT id, slug, shop_id, etsy_listing_id IS NOT NULL AS live
     FROM products
    WHERE shop_id = ANY($1)
      AND design_params::jsonb->>'placement' = 'left_chest'
      AND print_file IS NOT NULL
    ORDER BY shop_id, id`, [SHOPS])).rows;

const live = rows.filter((r) => r.live).length;
console.log(`${rows.length} sol-gogus urunu · ${live} tanesi Etsy'de canli\n`);
if (!APPLY) {
  for (const s of SHOPS) {
    const mine = rows.filter((r) => r.shop_id === s);
    console.log(`  magaza ${s}: ${mine.length} urun (${mine.filter((r) => r.live).length} canli)`);
  }
  console.log("\nDRY RUN — --apply ile uygula.");
  await c.end(); process.exit(0);
}

let done = 0, failed = 0;
for (const r of rows) {
  await c.query(
    `UPDATE products SET design_params = (design_params::jsonb
        || '{"placement":"center_chest","print_inches":10.0}'::jsonb)::text,
        updated_at = now()
      WHERE id = $1`, [r.id]);
  try {
    execFileSync("python3", ["scripts/produce_images.py", String(r.id)],
                 { stdio: "pipe", timeout: 8 * 60_000 });
    done++;
  } catch (e: any) {
    failed++;
    console.log(`  HATA ${r.slug}: ${String(e.stderr ?? e.message).slice(-140)}`);
  }
  if ((done + failed) % 10 === 0) {
    console.log(`  ${done + failed}/${rows.length} · ${done} tamam · ${failed} hata`);
  }
}
console.log(`\n${done} urun yeniden kuruldu · ${failed} hata`);
console.log(`${live} canli ilan hala eski gorseli gosteriyor — resync_etsy_images.py ayri bir adim.`);
await c.end();
process.exit(0);
