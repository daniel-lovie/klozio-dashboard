/**
 * Catch and repair listings that went live without their variations.
 *
 * The failure this exists for: a draft Etsy creates carries exactly one offering and no property
 * values. `publish.ts` used to write real inventory only on the branch that CREATED the draft, so a
 * listing published on a RETRY — attempt 1 makes the draft and fails, attempt 2 finds the id and skips
 * ahead — went active in that untouched shape. No sizes, no colours, no Digital PNG, one price.
 * Sixteen live listings on 2026-08-17, and nothing anywhere said so: the schedule row read `published`,
 * the database read correct, and only opening the listing on Etsy showed it.
 *
 * The publisher is fixed and now verifies its own write. This is the second line: the publisher can
 * only check listings it publishes, and it cannot check anything that was already live, edited by hand
 * in Shop Manager, or published by an older build still running somewhere.
 *
 * It is deliberately narrow. It repairs ONLY the provably-broken shape — Etsy showing fewer than two
 * offerings for a product whose own row says it should have many. A listing that already has its
 * variations is never touched, because re-PUTting inventory resets per-variation state and there is no
 * reason to rewrite something that is correct.
 */
import { apiGet, updateInventory, uploadListingImage } from "./etsy";
import { runWithShop, shopCtx, hasEtsy } from "./shop-context";
import { q, logEvent } from "./db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Etsy rate-limits per second and this sweep reads before it writes. The gap keeps a scan of a hundred
// listings from tripping the limit and turning a health check into an outage.
const GAP_MS = 1400;

export type GuardResult = {
  scanned: number; broken: number; repaired: number; failed: number;
  imgBroken: number; imgRepaired: number;
};

async function guardShop(shopId: number, repair: boolean): Promise<GuardResult> {
  const out: GuardResult = { scanned: 0, broken: 0, repaired: 0, failed: 0,
                             imgBroken: 0, imgRepaired: 0 };
  const rows: any[] = await q(
    `SELECT id, slug, etsy_listing_id, sizes, colorways, price_cents, quantity,
            (SELECT count(*) FROM product_images g
              WHERE g.product_id = products.id AND g.role <> 'cover_unstamped') img_n
       FROM products
      WHERE shop_id = $1 AND etsy_listing_id IS NOT NULL AND etsy_state = 'active'
      ORDER BY updated_at DESC`,
    [shopId]
  );

  for (const p of rows) {
    out.scanned++;

    // Photos. Same failure family as the inventory gap below: a publish that retried skipped the
    // upload step, our tables still read eight images, and the listing went live showing one.
    // `cryptid-m1-v1` shipped that way on 2026-08-18.
    if (Number(p.img_n) > 0) {
      await sleep(GAP_MS);
      try {
        const onEtsy: any = await apiGet(`/listings/${p.etsy_listing_id}/images`);
        const haveRanks = new Set<number>((onEtsy?.results ?? []).map((x: any) => Number(x.rank)));
        if (haveRanks.size < Number(p.img_n)) {
          out.imgBroken++;
          await logEvent("images_missing", {
            productId: p.id,
            detail: `listing ${p.etsy_listing_id} (${p.slug}): Etsy'de ${haveRanks.size}, bizde ${p.img_n}`,
          });
          if (repair) {
            const ours: any[] = await q(
              `SELECT rank, filename, mime, bytes FROM product_images
                WHERE product_id = $1 AND role <> 'cover_unstamped' ORDER BY rank`,
              [p.id]
            );
            let up = 0;
            for (const img of ours) {
              if (haveRanks.has(Number(img.rank))) continue;
              await uploadListingImage(Number(p.etsy_listing_id), img.rank, img.filename,
                                       img.mime, img.bytes as Buffer);
              up++;
              await sleep(600);
            }
            out.imgRepaired++;
            await logEvent("images_repaired", {
              productId: p.id,
              detail: `listing ${p.etsy_listing_id} (${p.slug}): ${up} gorsel yuklendi`,
            });
          }
        }
      } catch {
        // a read or upload failure is not a finding; the next sweep looks again
      }
    }

    const wanted = (p.colorways?.length || 1) * (p.sizes?.length || 1);
    if (wanted < 2) continue; // genuinely single-variant products are not evidence of anything
    await sleep(GAP_MS);

    let offerings: number;
    try {
      const inv: any = await apiGet(`/listings/${p.etsy_listing_id}/inventory`);
      offerings = inv?.products?.length ?? 0;
    } catch {
      continue; // a read failure is not a finding; the next sweep will look again
    }
    if (offerings >= 2) continue;

    out.broken++;
    await logEvent("inventory_broken", {
      productId: p.id,
      detail: `listing ${p.etsy_listing_id} (${p.slug}): ${offerings} offering, ${wanted} bekleniyor`,
    });
    if (!repair) continue;

    try {
      await sleep(GAP_MS);
      await updateInventory(Number(p.etsy_listing_id), {
        colorways: p.colorways ?? [],
        sizes: p.sizes ?? ["S", "M", "L", "XL", "2X", "3X"],
        priceCents: p.price_cents,
        quantity: p.quantity,
        readinessStateId: shopCtx().readinessStateId,
        skuPrefix: (p.slug || "SKU").slice(0, 12).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      });
      // Read back. This entire class of bug was a write that returned 200 and changed nothing.
      await sleep(GAP_MS);
      const after: any = await apiGet(`/listings/${p.etsy_listing_id}/inventory`);
      const n = after?.products?.length ?? 0;
      if (n >= 2) {
        out.repaired++;
        await logEvent("inventory_repaired", {
          productId: p.id,
          detail: `listing ${p.etsy_listing_id} (${p.slug}): ${n} varyasyon geri yazildi`,
        });
      } else {
        out.failed++;
        await logEvent("inventory_repair_failed", {
          productId: p.id,
          detail: `listing ${p.etsy_listing_id} (${p.slug}): yazildi ama Etsy hala ${n} gosteriyor`,
        });
      }
    } catch (e: any) {
      out.failed++;
      await logEvent("inventory_repair_failed", {
        productId: p.id,
        detail: `listing ${p.etsy_listing_id} (${p.slug}): ${String(e?.message ?? e).slice(0, 300)}`,
      });
    }
  }
  return out;
}

/** Sweep every Etsy-connected shop. `repair: false` reports without writing. */
export async function guardInventory(repair = true): Promise<GuardResult> {
  const shops: any[] = await q(`SELECT id FROM shops ORDER BY id`);
  const total: GuardResult = { scanned: 0, broken: 0, repaired: 0, failed: 0,
                               imgBroken: 0, imgRepaired: 0 };
  for (const s of shops) {
    // hasEtsy reads the ACTIVE context, so it can only be asked inside runWithShop.
    const r = await runWithShop(s.id, async () =>
      hasEtsy() ? guardShop(s.id, repair)
                : { scanned: 0, broken: 0, repaired: 0, failed: 0, imgBroken: 0, imgRepaired: 0 }
    );
    total.scanned += r.scanned;
    total.broken += r.broken;
    total.repaired += r.repaired;
    total.failed += r.failed;
    total.imgBroken += r.imgBroken;
    total.imgRepaired += r.imgRepaired;
  }
  return total;
}
