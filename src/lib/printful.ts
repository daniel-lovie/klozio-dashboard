/**
 * Printful API client — embroidery line fulfillment (CC1717 shirts + Yupoong 6245CM hats).
 *
 * Variant ids are resolved at runtime from GET /products/{id} and cached in-process —
 * Printful ids are stable but the color/size naming is theirs, so we normalize ours first
 * (Gray→Grey, 2X→2XL, hat Tan→Khaki: Printful has no Tan, Khaki is the same physical hat).
 *
 * Orders are created as DRAFTS (confirm:false) — confirming (= money) is a separate,
 * operator-triggered call.
 */
const BASE = "https://api.printful.com";

function key(): string {
  const k = process.env.PRINTFUL_API_KEY;
  if (!k) throw new Error("PRINTFUL_API_KEY not set — connect the Printful account first");
  return k;
}

async function pf(path: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`, "Content-Type": "application/json",
      ...extraHeaders, ...(init.headers ?? {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`printful ${path} ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return json.result ?? json;
}

/** Account-scoped keys need X-PF-Store-Id on order endpoints. Env override, else the
 *  account's first store, resolved once per process. Clear error while no store exists. */
let cachedStoreId: number | null = null;
async function storeId(): Promise<number> {
  if (process.env.PRINTFUL_STORE_ID) return Number(process.env.PRINTFUL_STORE_ID);
  if (cachedStoreId) return cachedStoreId;
  const stores = await pf(`/stores`);
  if (!Array.isArray(stores) || !stores.length) {
    throw new Error("Printful account has NO store — create one in the Printful dashboard: Stores → Add store → 'Manual order platform / API'. Detection is automatic afterwards.");
  }
  cachedStoreId = stores[0].id;
  return cachedStoreId!;
}

async function pfStore(path: string, init: RequestInit = {}) {
  return pf(path, init, { "X-PF-Store-Id": String(await storeId()) });
}

export const PRINTFUL_CC1717_PRODUCT_ID = 586;
export const PRINTFUL_DADHAT_PRODUCT_ID = 206; // Yupoong 6245CM Classic Dad Hat

const COLOR_FIX: Record<string, string> = { gray: "grey", tan: "khaki" };
const SIZE_FIX: Record<string, string> = { "2x": "2xl", "3x": "3xl", "4x": "4xl", os: "one size" };

const norm = (s: string) => s.trim().toLowerCase();

const variantCache = new Map<number, Map<string, number>>();

/** color+size (our Etsy naming) -> Printful catalog variant_id. */
export async function resolveVariant(productId: number, color: string, size: string): Promise<number> {
  let map = variantCache.get(productId);
  if (!map) {
    const d = await pf(`/products/${productId}`);
    map = new Map<string, number>();
    for (const v of d.variants ?? []) map.set(`${norm(v.color)}|${norm(v.size)}`, v.id);
    variantCache.set(productId, map);
  }
  const c = COLOR_FIX[norm(color)] ?? norm(color);
  const s = SIZE_FIX[norm(size)] ?? norm(size);
  const id = map.get(`${c}|${s}`);
  if (!id) throw new Error(`no Printful variant for product ${productId} color='${color}' size='${size}' (normalized ${c}|${s})`);
  return id;
}

export async function createEmbroideryDraft(opts: {
  recipient: {
    name: string; address1: string; address2?: string | null;
    city: string; state_code?: string | null; zip: string; country_code: string;
  };
  variantId: number;
  quantity: number;
  /** publicly reachable design PNG — Printful digitizes it */
  fileUrl: string;
  /** embroidery_chest_center | embroidery_chest_left (shirt) | default (hat front) */
  placement: string;
  /** subset of Printful's allowed thread palette, from products.thread_colors */
  threadColors: string[];
  isHat: boolean;
  externalId: string; // our fulfillment_orders.id
}) {
  // option id is placement-scoped on shirts, plain thread_colors on flat hat fronts
  const threadOption = opts.isHat ? "thread_colors" : `thread_colors_${opts.placement.replace("embroidery_", "")}`;
  const item: any = {
    variant_id: opts.variantId,
    quantity: opts.quantity,
    files: [{ type: opts.placement, url: opts.fileUrl }],
    options: [{ id: threadOption, value: opts.threadColors }],
  };
  if (opts.isHat) item.options.push({ id: "embroidery_type", value: "flat" });
  return pfStore(`/orders`, {
    method: "POST",
    body: JSON.stringify({
      external_id: opts.externalId,
      recipient: opts.recipient,
      items: [item],
      confirm: false,
    }),
  });
}

export async function confirmOrder(printfulOrderId: number) {
  return pfStore(`/orders/${printfulOrderId}/confirm`, { method: "POST" });
}

export async function getOrder(printfulOrderId: number) {
  return pfStore(`/orders/${printfulOrderId}`);
}
