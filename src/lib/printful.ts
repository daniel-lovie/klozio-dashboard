/**
 * Printful API client — embroidery line fulfillment (CC 1717, technique EMBROIDERY).
 *
 * Activation: set PRINTFUL_API_KEY (Printful dashboard -> Settings -> Stores -> API).
 * Until the key exists every call throws a clear error; /orders shows these orders as
 * fulfillment='printful' so the operator places them manually in the meantime.
 *
 * Order shape (catalog order, no store sync needed):
 *   POST /orders  { recipient, items: [{ variant_id, quantity, files, options }] }
 * CC1717 catalog variant ids are resolved at runtime via GET /products/{id} once and cached
 * in printful_variants — Printful ids are stable but color/size mapping is theirs, not ours.
 */
const BASE = "https://api.printful.com";

function key(): string {
  const k = process.env.PRINTFUL_API_KEY;
  if (!k) throw new Error("PRINTFUL_API_KEY not set — connect the Printful account first");
  return k;
}

async function pf(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`printful ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.result ?? json;
}

/** CC1717 in Printful's catalog. */
export const PRINTFUL_CC1717_PRODUCT_ID = 586;

export async function listCc1717Variants() {
  return pf(`/products/${PRINTFUL_CC1717_PRODUCT_ID}`);
}

export async function createEmbroideryOrder(opts: {
  recipient: { name: string; address1: string; city: string; state_code: string; zip: string; country_code: string };
  variantId: number;
  quantity: number;
  /** Text-based embroidery: thread text config; file-based: file URL. */
  embroideryText?: { text: string; font?: string; threadColor?: string };
  fileUrl?: string;
  externalId: string; // our fulfillment_orders.id
}) {
  const item: any = { variant_id: opts.variantId, quantity: opts.quantity, options: [] };
  if (opts.fileUrl) item.files = [{ type: "embroidery_chest_left", url: opts.fileUrl }];
  if (opts.embroideryText) {
    item.options.push(
      { id: "embroidery_type", value: "flat" },
      { id: "text", value: opts.embroideryText.text },
      ...(opts.embroideryText.threadColor ? [{ id: "thread_colors", value: [opts.embroideryText.threadColor] }] : [])
    );
  }
  return pf(`/orders`, {
    method: "POST",
    body: JSON.stringify({ external_id: opts.externalId, recipient: opts.recipient, items: [item], confirm: false }),
  });
}

export async function confirmOrder(printfulOrderId: number) {
  return pf(`/orders/${printfulOrderId}/confirm`, { method: "POST" });
}
