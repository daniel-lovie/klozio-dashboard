/**
 * Pull paid Etsy receipts into the fulfillment queue.
 *
 * Idempotent: transaction_id is UNIQUE, re-polling never duplicates. Only transactions
 * whose listing_id matches one of our products are queued; anything else is recorded in
 * the events log so nothing silently disappears.
 */
import { NextResponse } from "next/server";
import { q, one, logEvent } from "@/lib/db";
import { getShopReceipts } from "@/lib/etsy";
import { isLoggedIn } from "@/lib/auth";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const ok = (await isLoggedIn()) || (process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // look back 30 days on first run, else since the newest row we have (with 1h overlap)
  const last = await one<{ m: string | null }>(`SELECT max(ordered_at)::text AS m FROM fulfillment_orders`);
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
      const p = await one<{ id: number }>(
        `SELECT id FROM products WHERE etsy_listing_id=$1`, [t.listing_id]);
      if (!p) { unmatched++; continue; }

      // personalization + size/colour arrive in the variations array
      let personalization: string | null = null, size: string | null = null, colorway: string | null = null;
      for (const v of t.variations ?? []) {
        const name = String(v.formatted_name ?? "").toLowerCase();
        if (name.includes("personal")) personalization = v.formatted_value ?? null;
        else if (name.includes("size")) size = v.formatted_value ?? null;
        else if (name.includes("color") || name.includes("colour")) colorway = v.formatted_value ?? null;
      }

      const res = await q<{ id: number }>(
        `INSERT INTO fulfillment_orders
           (receipt_id, transaction_id, etsy_listing_id, product_id, quantity, sku,
            size, colorway, personalization, buyer_name, ship_to, ordered_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, to_timestamp($12))
         ON CONFLICT (transaction_id) DO NOTHING
         RETURNING id`,
        [r.receipt_id, t.transaction_id, t.listing_id, p.id, t.quantity ?? 1, t.sku ?? null,
         size, colorway, personalization, r.name ?? null, shipTo,
         t.paid_timestamp ?? t.created_timestamp ?? r.created_timestamp]);
      if (res.length) {
        inserted++;
        await logEvent("order_queued", {
          productId: p.id,
          detail: `receipt ${r.receipt_id} tx ${t.transaction_id}${personalization ? " · personalised" : ""}`,
        });
      } else skipped++;
    }
  }
  return NextResponse.json({ receipts: receipts.length, inserted, skipped, unmatched });
}
