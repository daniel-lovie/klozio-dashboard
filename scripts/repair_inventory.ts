/**
 * Repair live listings that went out with no variations.
 *
 * A draft Etsy creates carries exactly one offering and no property values. `publish.ts` used to write
 * the real inventory only on the branch that CREATED the draft, so any listing published on a retry —
 * attempt 1 makes the draft and fails, attempt 2 finds the id and skips ahead — was activated in that
 * untouched shape: no sizes, no colours, no Digital PNG, one price. Fifteen listings on 2026-08-17.
 *
 * The publisher is fixed. This repairs what already shipped.
 *
 * It rewrites inventory ONLY where Etsy currently shows fewer than two offerings for a product that
 * should have many. A listing that already has its variations is left alone: re-PUTting inventory
 * resets per-variation state, and there is no reason to touch a listing that is correct.
 *
 *   npx tsx scripts/repair_inventory.ts --shop 1
 *   npx tsx scripts/repair_inventory.ts --shop 1 --apply
 */
import { apiGet, updateInventory } from "../src/lib/etsy";
import { runWithShop, shopCtx } from "../src/lib/shop-context";
import { q } from "../src/lib/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(shop: number, apply: boolean) {
  const rows: any[] = await q(
    `SELECT id, slug, etsy_listing_id, sizes, colorways, price_cents, quantity
       FROM products
      WHERE shop_id = $1 AND etsy_listing_id IS NOT NULL
      ORDER BY id`,
    [shop]
  );
  console.log(`shop ${shop} · ${rows.length} canli ilan taraniyor\n`);

  let broken = 0, fixed = 0, failed = 0;
  for (const p of rows) {
    await sleep(1300); // Etsy rate-limits per second; a sweep this size trips it without a gap.
    const wanted = (p.colorways?.length || 1) * (p.sizes?.length || 1);
    let offerings: number;
    try {
      const inv: any = await apiGet(`/listings/${p.etsy_listing_id}/inventory`);
      offerings = inv?.products?.length ?? 0;
    } catch (e: any) {
      console.log(`  ${p.slug.padEnd(32)} okunamadi: ${String(e?.message).slice(0, 60)}`);
      failed++;
      continue;
    }
    if (wanted < 2 || offerings >= 2) continue;

    broken++;
    console.log(`  ${p.slug.padEnd(32)} ${offerings} -> ${wanted} olmali`);
    if (!apply) continue;

    try {
      await sleep(1300);
      await updateInventory(Number(p.etsy_listing_id), {
        colorways: p.colorways ?? [],
        sizes: p.sizes ?? ["S", "M", "L", "XL", "2X", "3X"],
        priceCents: p.price_cents,
        quantity: p.quantity,
        readinessStateId: shopCtx().readinessStateId,
        skuPrefix: (p.slug || "SKU").slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      });
      // Read back rather than trust the 200. This whole failure was a write nobody confirmed.
      await sleep(1300);
      const after: any = await apiGet(`/listings/${p.etsy_listing_id}/inventory`);
      const n = after?.products?.length ?? 0;
      if (n >= 2) { fixed++; console.log(`     -> ${n} varyasyon`); }
      else { failed++; console.log(`     -> HALA ${n}`); }
    } catch (e: any) {
      failed++;
      console.log(`     -> HATA ${String(e?.message).slice(0, 100)}`);
    }
  }

  console.log(`\n${broken} bozuk bulundu · ${fixed} duzeltildi · ${failed} basarisiz`);
  if (!apply) console.log("DRY RUN. Uygulamak icin --apply");
  else if (failed) process.exitCode = 1;
}

const argv = process.argv.slice(2);
const shop = argv.includes("--shop") ? Number(argv[argv.indexOf("--shop") + 1]) : 1;
runWithShop(shop, () => run(shop, argv.includes("--apply"))).catch((e) => {
  console.error(e);
  process.exit(1);
});
