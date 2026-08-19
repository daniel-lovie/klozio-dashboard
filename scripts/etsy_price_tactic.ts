/**
 * The pricing-and-digital-option tactic, applied to Etsy.
 *
 * Two changes, per shop (the cover stamp is scripts/free_shipping_stamp.py):
 *   1. the buyer pays $24.99 for a shirt
 *   2. a "Digital PNG" variation at $12
 *
 * Started as Klozio-only on 2026-08-16 and extended to HillsByElgin the same day, so the shop is an
 * ARGUMENT. Both shops were separately confirmed to be running the 30% sale — that is not an
 * assumption one shop can lend the other, and it is the whole basis of the anchor arithmetic below.
 *
 * The prices below are ANCHORS, not what the buyer pays. Both shops run a standing 30% sale — each
 * confirmed with the operator on 2026-08-16 — so every anchor is the target divided by 0.7. Writing
 * 2499 here would charge $17.49, and writing 2499 with the sale switched off would be correct. That is
 * the one assumption in this file that is not self-checking, and it is why it is stated twice.
 *
 * Etsy shows the LOWEST variation price on the search card. Adding a $12 digital option therefore makes
 * every Klozio listing advertise "$12.00" in search rather than $24.99. That is the point of the tactic
 * — it is what the reference seller does — but it is a deliberate change to how the shop reads.
 *
 * Embroidery is excluded on purpose. Hats and embroidered tees cost far more to make, and $24.99 would
 * sell them under cost — the tactic is a t-shirt tactic.
 *
 *   npx tsx scripts/etsy_price_tactic.ts --shop 2 --only <slug>   # one listing
 *   npx tsx scripts/etsy_price_tactic.ts --shop 2 --apply         # every live DTF listing in that shop
 */
import { q, one } from "@/lib/db";
import { runWithShop, shopCtx } from "@/lib/shop-context";
import { etsyRaw, SIZE_PROPERTY, SIZE_SCALE, SIZE_VALUE_IDS, SIZE_UPCHARGE_CENTS, CUSTOM1_PROPERTY } from "@/lib/etsy";

const DISCOUNT = 0.7;                       // the standing shop sale
const SHIRT_ANCHOR = Math.round(2499 / DISCOUNT);   // 3570 -> buyer pays $24.99
const PNG_ANCHOR   = Math.round(1200 / DISCOUNT);   // 1714 -> buyer pays $12.00
const PNG_LABEL = "Digital PNG";

type Row = { id: number; slug: string; etsy_listing_id: string; sizes: string[]; colorways: string[] };

/** Rebuild the full offering matrix, with the digital option carried as an extra size value.
 *
 *  Etsy's Size property is SCALED (scale_id 51) and "Digital PNG" is not a value on that scale, so the
 *  digital row is sent as a custom value — property_id and values, no scale_id, no value_ids. Whether
 *  Etsy accepts a mixed scaled/unscaled property is exactly what the single-listing test is for.
 */
function buildProducts(r: Row, readinessStateId: number) {
  const products: any[] = [];
  const colors = r.colorways?.length ? r.colorways : ["Default"];
  for (const color of colors) {
    for (const size of r.sizes) {
      const vid = SIZE_VALUE_IDS[size];
      if (!vid) throw new Error(`bilinmeyen beden "${size}"`);
      products.push({
        sku: `ETSY-${r.id}-${color.toUpperCase().replace(/\s+/g, "")}-${size}`,
        property_values: [
          { property_id: SIZE_PROPERTY, property_name: "Size", scale_id: SIZE_SCALE, value_ids: [vid], values: [size] },
          { property_id: CUSTOM1_PROPERTY, property_name: "Color", values: [color] },
        ],
        offerings: [{
          price: (SHIRT_ANCHOR + (SIZE_UPCHARGE_CENTS[size] ?? 0)) / 100,
          quantity: 999, is_enabled: true, readiness_state_id: readinessStateId,
        }],
      });
    }
    products.push({
      sku: `ETSY-${r.id}-${color.toUpperCase().replace(/\s+/g, "")}-PNG`,
      property_values: [
        { property_id: SIZE_PROPERTY, property_name: "Size", values: [PNG_LABEL] },
        { property_id: CUSTOM1_PROPERTY, property_name: "Color", values: [color] },
      ],
      offerings: [{ price: PNG_ANCHOR / 100, quantity: 999, is_enabled: true, readiness_state_id: readinessStateId }],
    });
  }
  return products;
}

async function applyOne(r: Row) {
  const readiness = shopCtx().readinessStateId;
  const products = buildProducts(r, readiness);
  await etsyRaw("PUT", `/listings/${r.etsy_listing_id}/inventory`, {
    products,
    price_on_property: [SIZE_PROPERTY],
    quantity_on_property: [],
    sku_on_property: [SIZE_PROPERTY, CUSTOM1_PROPERTY],
  });
  await q(`UPDATE products SET price_cents=$1, sizes=$2, updated_at=now() WHERE id=$3`,
          [SHIRT_ANCHOR, [...r.sizes, PNG_LABEL], r.id]);
  return products.length;
}

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  const apply = process.argv.includes("--apply") || !!only;
  const shop = process.argv.includes("--shop") ? Number(process.argv[process.argv.indexOf("--shop") + 1]) : 1;

  const rows = await q<Row>(
    `SELECT id, slug, etsy_listing_id, sizes, colorways FROM products
      WHERE shop_id=$2 AND etsy_listing_id IS NOT NULL
        AND technique = 'dtf'
        AND NOT ($1::text = ANY(sizes))
        ${only ? "AND slug = $3" : ""}
      ORDER BY id`, only ? [PNG_LABEL, shop, only] : [PNG_LABEL, shop]);

  console.log(`hedef: shop ${shop} — ${rows.length} canli DTF ilani`);
  console.log(`  gomlek capa ${SHIRT_ANCHOR} -> alici $${(SHIRT_ANCHOR * DISCOUNT / 100).toFixed(2)}`);
  console.log(`  PNG capa    ${PNG_ANCHOR} -> alici $${(PNG_ANCHOR * DISCOUNT / 100).toFixed(2)}`);
  if (!apply) { console.log("\nDRY RUN — --apply ya da --only <slug> ver."); process.exit(0); }

  let ok = 0, bad = 0;
  await runWithShop(shop, async () => {
    for (const r of rows) {
      try {
        const n = await applyOne(r);
        ok++;
        console.log(`  ${r.slug}: ${n} varyant yazildi`);
      } catch (e: any) {
        bad++;
        console.error(`  HATA ${r.slug}: ${String(e.message).slice(0, 300)}`);
      }
    }
  });
  console.log(`\n${ok} basarili, ${bad} basarisiz`);
  process.exit(bad ? 1 : 0);
}
main().catch(e => { console.error("HATA:", e.message); process.exit(1); });
