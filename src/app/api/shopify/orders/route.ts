/**
 * Shopify orders/create webhook — the only path by which a klozio.io order reaches a printer.
 *
 * Why this exists rather than Printful's Shopify app: that app only fulfils products it has synced
 * in its own dashboard, and on a Shopify-platform Printful store there is no API to sync or link an
 * existing product (v1 /store/products is refused for platform stores, v2 has no POST). Our products
 * are created by our own pipeline, so the app would never see them. The Orders API, by contrast, is
 * fully open on that store — so we create the order ourselves and keep the two things the app cannot
 * do for us: the exact thread palette per design, and the file-id cache that stops Printful billing
 * $6.50 digitisation twice for the same artwork.
 *
 * Printed items are deliberately ignored here. Those variants are mapped in Printinly, which pulls
 * them straight from Shopify; producing them here as well would print every shirt twice.
 */
import crypto from "crypto";
import { NextResponse } from "next/server";

import { q, one, logEvent } from "@/lib/db";
import { sendOrderToPrintful } from "@/lib/printful-fulfill";
import { runWithShop } from "@/lib/shop-context";

export const runtime = "nodejs";
/** Shopify retries on non-2xx; a body we failed to verify must not be cached. */
export const dynamic = "force-dynamic";

const SHOP_ID = Number(process.env.SHOPIFY_SHOP_DB_ID || 2);

type Line = {
  id: number;
  sku: string | null;
  quantity: number;
  variant_title: string | null;
  properties?: { name: string; value: string }[] | null;
};

function verify(raw: string, header: string | null): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "";
  if (!secret || !header) return false;
  const mine = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const a = Buffer.from(mine);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** "HEMBC9V1-BLUEJEAN-L" -> the slug key "HEMBC9V1". Colour and size come from variant_title,
 *  which keeps its spaces ("Blue Jean / L") and so never has to be un-squashed. */
function slugKey(sku: string | null): string | null {
  const head = (sku ?? "").trim().split("-")[0];
  return head ? head.toUpperCase() : null;
}

function splitVariant(title: string | null): { colorway: string | null; size: string | null } {
  const parts = (title ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { colorway: parts[0], size: parts[parts.length - 1] };
  return { colorway: parts[0] ?? null, size: null };
}

function personalizationOf(line: Line): string | null {
  const p = (line.properties ?? []).find((x) =>
    /name|personal|custom|text/i.test(x.name) && !x.name.startsWith("_"));
  return p?.value?.trim() || null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const order = JSON.parse(raw);
  const lines: Line[] = order.line_items ?? [];
  const shipping = order.shipping_address ?? order.customer?.default_address ?? {};
  const results: any[] = [];

  for (const line of lines) {
    const key = slugKey(line.sku);
    if (!key) {
      results.push({ line: line.id, skipped: "sku yok" });
      continue;
    }
    // Match on the squashed slug: SKUs drop the dashes the slug carries.
    const product = await one<{ id: number; slug: string; technique: string }>(
      `SELECT id, slug, technique FROM products
        WHERE regexp_replace(upper(slug), '[^A-Z0-9]', '', 'g') = $1
        ORDER BY (shop_id = $2) DESC, id LIMIT 1`, [key, SHOP_ID]);

    if (!product) {
      results.push({ line: line.id, sku: line.sku, skipped: "urun bulunamadi" });
      continue;
    }
    if (product.technique !== "embroidery") {
      // Printinly owns these. Recorded, not produced.
      results.push({ line: line.id, slug: product.slug, skipped: "baski -> printinly" });
      continue;
    }

    const { colorway, size } = splitVariant(line.variant_title);
    const inserted = await q<{ id: number; fresh: boolean }>(
      // receipt_id/transaction_id are NOT NULL and Etsy-shaped; the Shopify order and line ids slot
      // into them so every existing query, board view and export keeps working untouched.
      `INSERT INTO fulfillment_orders
         (source, shopify_order_id, shopify_line_id, receipt_id, transaction_id,
          product_id, quantity, sku,
          size, colorway, personalization, buyer_name, ship_to, ordered_at,
          ship_name, ship_address1, ship_address2, ship_city, ship_state, ship_zip, ship_country,
          shop_id, is_paid, status)
       VALUES ('shopify',$1,$2,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               $12,$13,$14,$15,$16,$17,$18,$19,true,'new')
       -- the index is PARTIAL (WHERE shopify_line_id IS NOT NULL), and Postgres will only infer a
       -- partial index when the conflict target repeats its predicate; without it: 42P10.
       ON CONFLICT (shopify_line_id) WHERE shopify_line_id IS NOT NULL DO NOTHING
       RETURNING id, true AS fresh`,
      [order.id, line.id, product.id, line.quantity ?? 1, line.sku,
       size, colorway, personalizationOf(line),
       [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") || order.email || null,
       [shipping.address1, shipping.city, shipping.province, shipping.zip, shipping.country]
         .filter(Boolean).join(", "),
       order.created_at ?? new Date().toISOString(),
       [shipping.first_name, shipping.last_name].filter(Boolean).join(" ") || null,
       shipping.address1 ?? null, shipping.address2 ?? null, shipping.city ?? null,
       shipping.province_code ?? shipping.province ?? null, shipping.zip ?? null,
       shipping.country_code ?? "US", SHOP_ID]);

    if (!inserted.length) {                       // Shopify redelivers; one order, one draft
      results.push({ line: line.id, slug: product.slug, skipped: "zaten islendi" });
      continue;
    }
    const orderId = inserted[0].id;
    try {
      // Deliberately the same Printful store as the Etsy channel. Both stores sit in one Printful
      // account, so a second store would only change a label in their dashboard — while splitting
      // the code path risks losing the digitisation file-id cache, which is worth $6.50 a design.
      const draft = await runWithShop(SHOP_ID, () => sendOrderToPrintful(orderId));
      results.push({ line: line.id, slug: product.slug, order: orderId, printful: draft.printfulOrderId });
    } catch (e: any) {
      // Never 500 back at Shopify for a fulfilment failure: it would retry the whole order and we
      // would re-insert siblings. The row is on the board with its error for the operator.
      results.push({ line: line.id, slug: product.slug, order: orderId, error: String(e?.message ?? e).slice(0, 300) });
    }
  }

  await logEvent("shopify_order", {
    detail: `shopify #${order.name ?? order.id}: ` + JSON.stringify(results).slice(0, 400),
  });
  return NextResponse.json({ ok: true, results });
}
