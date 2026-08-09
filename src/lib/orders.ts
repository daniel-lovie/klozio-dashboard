/**
 * Pull paid Etsy receipts into the fulfillment queue.
 *
 * Idempotent: transaction_id is UNIQUE, re-polling never duplicates. Only transactions
 * whose listing_id matches one of our products are queued. Shared by the manual
 * /api/orders/poll endpoint and the in-process scheduler.
 */
import { q, one, logEvent } from "./db";
import { getShopReceipts } from "./etsy";
import { runWithShop } from "./shop-context";
import { sendOrderToPrintful } from "./printful-fulfill";

export async function pollOrders() {
  const shops = await q<{ shop_id: number }>(`SELECT DISTINCT shop_id FROM etsy_tokens`);
  const totals = { receipts: 0, inserted: 0, skipped: 0, unmatched: 0 };
  for (const s of shops) {
    try {
      const r = await runWithShop(s.shop_id, () => pollShopOrders(s.shop_id));
      totals.receipts += r.receipts; totals.inserted += r.inserted;
      totals.skipped += r.skipped; totals.unmatched += r.unmatched;
    } catch (e) { console.error(`pollOrders shop ${s.shop_id}:`, String(e).slice(0, 200)); }
  }
  return totals;
}

async function pollShopOrders(shopId: number) {
  // look back 30 days on first run, else since the newest row we have (with 1h overlap)
  const last = await one<{ m: string | null }>(`SELECT max(ordered_at)::text AS m FROM fulfillment_orders WHERE shop_id=$1`, [shopId]);
  const since = last?.m ? Math.floor(new Date(last.m).getTime() / 1000) - 3600
                        : Math.floor(Date.now() / 1000) - 30 * 86400;

  const data = await getShopReceipts(since);
  const receipts: any[] = data.results ?? [];
  let inserted = 0, skipped = 0, unmatched = 0;

  for (const r of receipts) {
    const shipTo = [r.name, r.first_line, r.second_line,
      `${r.city ?? ""} ${r.state ?? ""} ${r.zip ?? ""}`.trim(), r.country_iso]
      .filter(Boolean).join("\n");

    for (const t of r.transactions ?? []) {
      const p = await one<{ id: number; technique: string | null }>(
        `SELECT id, technique FROM products WHERE etsy_listing_id=$1 AND shop_id=$2`, [t.listing_id, shopId]);
      if (!p) { unmatched++; continue; }

      // personalization + size/colour arrive in the variations array
      let personalization: string | null = null, size: string | null = null, colorway: string | null = null;
      for (const v of t.variations ?? []) {
        const name = String(v.formatted_name ?? "").toLowerCase();
        if (name.includes("personal")) personalization = v.formatted_value ?? null;
        else if (name.includes("size")) {
          // Etsy formats sizes per locale: "L US letter", "2X US letter" → keep our own label
          size = (v.formatted_value ?? "").replace(/\s*\b(US|UK|EU|AU)\b.*$/i, "").trim() || null;
        }
        else if (name.includes("color") || name.includes("colour")) colorway = v.formatted_value ?? null;
      }

      const res = await q<{ id: number }>(
        `INSERT INTO fulfillment_orders
           (receipt_id, transaction_id, etsy_listing_id, product_id, quantity, sku,
            size, colorway, personalization, buyer_name, ship_to, ordered_at,
            ship_name, ship_address1, ship_address2, ship_city, ship_state, ship_zip, ship_country, shop_id,
            etsy_status, is_paid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, to_timestamp($12),
                 $13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (transaction_id) DO UPDATE
           SET etsy_status = EXCLUDED.etsy_status, is_paid = EXCLUDED.is_paid,
               -- Etsy can void an order (risk checks, refund): stop the line, don't produce
               status = CASE
                 WHEN EXCLUDED.etsy_status IN ('Canceled','Cancelled','Refunded')
                      AND fulfillment_orders.status NOT IN ('shipped','done') THEN 'cancelled'
                 WHEN fulfillment_orders.status = 'cancelled'
                      AND EXCLUDED.etsy_status NOT IN ('Canceled','Cancelled','Refunded') THEN 'new'
                 ELSE fulfillment_orders.status END
         RETURNING id, (xmax = 0) AS inserted, is_paid`,
        [r.receipt_id, t.transaction_id, t.listing_id, p.id, t.quantity ?? 1, t.sku ?? null,
         size, colorway, personalization, r.name ?? null, shipTo,
         t.paid_timestamp ?? t.created_timestamp ?? r.created_timestamp,
         r.name ?? null, r.first_line ?? null, r.second_line ?? null,
         r.city ?? null, r.state ?? null, r.zip ?? null, r.country_iso ?? null, shopId,
         r.status ?? null, r.is_paid !== false]);
      const row: any = res[0];
      if (row?.inserted) {
        inserted++;
        await logEvent("order_queued", {
          productId: p.id,
          detail: `receipt ${r.receipt_id} tx ${t.transaction_id}` +
                  `${personalization ? " · personalised" : ""}${row.is_paid ? "" : " · ÖDEME BEKLİYOR"}`,
        });
      } else skipped++;

      // Embroidery no longer goes to Printful. Customzon fulfils it, pulled straight from the shop
      // by AllPodi, so a draft raised here would be the same garment produced and paid for twice —
      // and on a personalised design it also books a $6.50 digitisation we have moved away from.
      // The row still lands on the board; production is simply not ours to trigger.
    }
  }
  return { receipts: receipts.length, inserted, skipped, unmatched };
}
