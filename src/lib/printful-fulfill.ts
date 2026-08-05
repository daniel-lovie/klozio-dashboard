/**
 * Embroidery order → Printful draft, automatically on order ingest.
 *
 * Flow: pollOrders inserts an embroidery order → sendOrderToPrintful() creates a DRAFT
 * Printful order (right variant + recipient + design file). Money is only spent when the
 * operator hits "confirm" (/api/orders/[id]/printful-confirm) — that flips our status to
 * sent_to_producer. Failures land in printful_status='failed' + printful_error and are
 * retryable from the /orders UI.
 *
 * Design file: Printful must FETCH the PNG, so /api/pf-file/[productId] serves it publicly
 * behind an HMAC signature (keyed off PRINTFUL_API_KEY — server-side only, not derivable).
 * Hats have no print_file of their own; they fall back to the EMB sibling (same concept_no).
 */
import crypto from "crypto";
import { one, q, logEvent } from "./db";
import { runWithShop } from "./shop-context";
import {
  resolveVariant, createEmbroideryDraft, confirmOrder,
  PRINTFUL_CC1717_PRODUCT_ID, PRINTFUL_DADHAT_PRODUCT_ID,
} from "./printful";

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL ?? "https://web-production-c9b31.up.railway.app";

export function pfFileSig(productId: number): string {
  const secret = process.env.PRINTFUL_FILE_SECRET ?? process.env.PRINTFUL_API_KEY ?? "";
  return crypto.createHmac("sha256", secret).update(`pf-file:${productId}`).digest("hex");
}

export function pfFileUrl(productId: number): string {
  return `${PUBLIC_BASE}/api/pf-file/${productId}?sig=${pfFileSig(productId)}`;
}

/** Fallback for rows created before the structured ship_* columns existed. */
function parseShipTo(blob: string | null) {
  const lines = (blob ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 4) return null;
  const country = lines[lines.length - 1];
  const cityLine = lines[lines.length - 2];
  const m = cityLine.match(/^(.+?)\s+(\S+)\s+([\w-]+)$/);
  return {
    name: lines[0],
    address1: lines[1],
    address2: lines.length >= 5 ? lines[2] : null,
    city: m?.[1] ?? cityLine,
    state_code: m?.[2] ?? null,
    zip: m?.[3] ?? "",
    country_code: country,
  };
}

export async function sendOrderToPrintful(orderId: number): Promise<{ printfulOrderId: number }> {
  const row = await one<{ shop_id: number }>(`SELECT shop_id FROM fulfillment_orders WHERE id=$1`, [orderId]);
  return runWithShop(row?.shop_id ?? 1, () => sendOrderToPrintfulInner(orderId));
}

async function sendOrderToPrintfulInner(orderId: number): Promise<{ printfulOrderId: number }> {
  const o = await one<any>(
    `SELECT f.*, p.slug, p.slot, p.technique, p.fulfillment, p.concept_no,
            p.printful_placement, p.thread_colors, octet_length(p.print_file) AS pf_bytes
       FROM fulfillment_orders f JOIN products p ON p.id = f.product_id
      WHERE f.id = $1`, [orderId]);
  if (!o) throw new Error(`order ${orderId} not found`);
  if ((o.technique ?? "dtf") !== "embroidery") throw new Error(`order ${orderId} is not embroidery`);
  if (o.printful_order_id && o.printful_status !== "failed")
    return { printfulOrderId: Number(o.printful_order_id) };

  const isHat = o.slot === "EMBH";
  const catalogId = isHat ? PRINTFUL_DADHAT_PRODUCT_ID : PRINTFUL_CC1717_PRODUCT_ID;

  // hats carry no print_file — use the EMB sibling's design (same concept)
  let fileProductId = o.product_id;
  if (!o.pf_bytes) {
    const sib = await one<{ id: number }>(
      `SELECT id FROM products WHERE slot='EMB' AND concept_no=$1 AND shop_id=$2 AND print_file IS NOT NULL`,
      [o.concept_no, o.shop_id]);
    if (!sib) throw new Error(`no design file: product ${o.slug} has none and no EMB sibling found`);
    fileProductId = sib.id;
  }

  const recipient = o.ship_address1
    ? { name: o.ship_name ?? o.buyer_name ?? "", address1: o.ship_address1, address2: o.ship_address2,
        city: o.ship_city ?? "", state_code: o.ship_state, zip: o.ship_zip ?? "", country_code: o.ship_country ?? "US" }
    : parseShipTo(o.ship_to);
  if (!recipient?.address1) throw new Error(`order ${orderId}: no usable shipping address`);

  const variantId = await resolveVariant(catalogId, o.colorway ?? "", o.size ?? (isHat ? "OS" : ""));

  // thread colors live on the product (set at production time); black is a safe fallback
  let threadColors: string[] = o.thread_colors ?? [];
  if (!threadColors.length) {
    const sib = await one<{ thread_colors: string[] | null }>(
      `SELECT thread_colors FROM products WHERE id=$1`, [fileProductId]);
    threadColors = sib?.thread_colors ?? ["#000000"];
  }

  try {
    const draft = await createEmbroideryDraft({
      recipient: recipient as any,
      variantId,
      quantity: o.quantity ?? 1,
      fileUrl: pfFileUrl(fileProductId),
      placement: o.printful_placement ?? (isHat ? "default" : "embroidery_chest_center"),
      threadColors,
      isHat,
      externalId: `klz-${orderId}`,
    });
    await q(`UPDATE fulfillment_orders
                SET printful_order_id=$2, printful_status='draft', printful_error=NULL
              WHERE id=$1`, [orderId, draft.id]);
    await logEvent("printful_draft", { productId: o.product_id, detail: `order #${orderId} → printful draft ${draft.id}` });
    return { printfulOrderId: draft.id };
  } catch (e: any) {
    await q(`UPDATE fulfillment_orders SET printful_status='failed', printful_error=$2 WHERE id=$1`,
      [orderId, String(e?.message ?? e).slice(0, 500)]);
    throw e;
  }
}

export async function confirmPrintfulOrder(orderId: number) {
  const row = await one<{ shop_id: number }>(`SELECT shop_id FROM fulfillment_orders WHERE id=$1`, [orderId]);
  return runWithShop(row?.shop_id ?? 1, () => confirmPrintfulOrderInner(orderId));
}

async function confirmPrintfulOrderInner(orderId: number) {
  const o = await one<any>(`SELECT * FROM fulfillment_orders WHERE id=$1`, [orderId]);
  if (!o?.printful_order_id) throw new Error(`order ${orderId} has no Printful draft`);
  const res = await confirmOrder(Number(o.printful_order_id));
  await q(`UPDATE fulfillment_orders
              SET printful_status='confirmed', status='sent_to_producer',
                  producer_order_id=COALESCE(producer_order_id, 'printful:' || printful_order_id)
            WHERE id=$1`, [orderId]);
  await logEvent("printful_confirmed", { productId: o.product_id, detail: `order #${orderId} confirmed → printful ${o.printful_order_id}` });
  return res;
}
