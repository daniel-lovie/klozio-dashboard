/**
 * Etsy Open API v3 client — TypeScript port of the project's Python client.
 *
 * Ported rather than shelled out to Python so Railway runs a single Node runtime.
 * Behaviour and the hard-won gotchas are kept identical; see
 * ../../../.claude/skills/klozio-etsy-api/references/endpoints.md
 *
 * Verified gotchas encoded here:
 *  - x-api-key MUST be "keystring:shared_secret"; keystring alone returns 403
 *  - inventory is a JSON PUT to /listings/{id}/inventory (NOT shop-scoped)
 *  - every property_values entry needs property_name
 *  - every offering needs its own readiness_state_id
 *  - production_partner_ids is the WRITE param; production_partners is the READ field
 *  - refresh tokens ROTATE on every refresh and must be persisted
 *  - there is NO endpoint to buy shipping labels
 */
import { q, one } from "./db";

const BASE = "https://openapi.etsy.com/v3/application";
const TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token";
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

function apiKeyHeader(): string {
  const full = process.env.ETSY_API_KEY;
  if (full) return full;
  const id = process.env.ETSY_CLIENT_ID;
  const secret = process.env.ETSY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("ETSY_API_KEY or ETSY_CLIENT_ID+ETSY_CLIENT_SECRET must be set");
  return `${id}:${secret}`;
}

export function shopId(): number {
  return Number(process.env.ETSY_SHOP_ID || 67236031);
}

type TokenRow = { access_token: string; refresh_token: string; expires_at: string };

/** Load the token, refreshing (and persisting the rotation) when it's close to expiry. */
export async function accessToken(): Promise<string> {
  const row = await one<TokenRow>(`SELECT access_token, refresh_token, expires_at FROM etsy_tokens WHERE id=1`);
  if (!row) throw new Error("No Etsy token in the database. Run: npm run db:seed");

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt - Date.now() >= REFRESH_MARGIN_MS) return row.access_token;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.ETSY_CLIENT_ID || apiKeyHeader().split(":")[0],
    refresh_token: row.refresh_token,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Etsy token refresh failed (${res.status}): ${JSON.stringify(json)}. ` +
        `If invalid_grant, the refresh token is dead (~90 day life) — re-run oauth_bootstrap.py and reseed.`
    );
  }
  const newExpiry = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  await q(
    `UPDATE etsy_tokens SET access_token=$1, refresh_token=$2, expires_at=$3, updated_at=now() WHERE id=1`,
    [json.access_token, json.refresh_token, newExpiry.toISOString()]
  );
  return json.access_token as string;
}

async function authHeaders(extra: Record<string, string> = {}) {
  return { "x-api-key": apiKeyHeader(), Authorization: `Bearer ${await accessToken()}`, ...extra };
}

async function handle(res: Response, what: string) {
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${JSON.stringify(json).slice(0, 600)}`);
  return json;
}

export async function apiGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: await authHeaders(), cache: "no-store" });
  return handle(res, `GET ${path}`);
}

async function apiForm(method: "POST" | "PUT" | "PATCH", path: string, fields: Record<string, any>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    body.append(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: await authHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    body,
  });
  return handle(res, `${method} ${path}`);
}

async function apiJson(method: "PUT" | "POST", path: string, payload: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  return handle(res, `${method} ${path}`);
}

// ---------------------------------------------------------------- listings

export type DraftInput = {
  title: string;
  description: string;
  priceCents: number;
  quantity: number;
  taxonomyId: number;
  tags: string[];
  materials: string[];
  shippingProfileId: number;
  readinessStateId: number;
  productionPartnerIds: number[];
  /** REQUIRED for a listing to go active. Etsy rejects PATCH state=active with
   *  400 "There was a problem with /return/policy : cannot be null" when it is unset. */
  returnPolicyId: number;
  /** Text personalisation (the buyer's "Add your personalisation" box). Without these,
   *  a personalised product goes live with the box missing — which is the whole product. */
  personalization?: {
    required: boolean;
    instructions: string;   // shown to the buyer above the box
    charCountMax?: number;
  };
};

export async function createDraftListing(inp: DraftInput): Promise<number> {
  const json = await apiForm("POST", `/shops/${shopId()}/listings`, {
    quantity: inp.quantity,
    title: inp.title,
    description: inp.description,
    price: (inp.priceCents / 100).toFixed(2),
    who_made: "i_did",
    when_made: "made_to_order",
    taxonomy_id: inp.taxonomyId,
    shipping_profile_id: inp.shippingProfileId,
    readiness_state_id: inp.readinessStateId,
    return_policy_id: inp.returnPolicyId,
    state: "draft",
    tags: inp.tags,
    materials: inp.materials,
    production_partner_ids: inp.productionPartnerIds,
    is_personalizable: inp.personalization ? "true" : "false",
    ...(inp.personalization
      ? {
          personalization_is_required: inp.personalization.required ? "true" : "false",
          personalization_instructions: inp.personalization.instructions,
          personalization_char_count_max: inp.personalization.charCountMax ?? 256,
        }
      : {}),
  });
  return json.listing_id as number;
}

export async function uploadListingImage(
  listingId: number,
  rank: number,
  filename: string,
  mime: string,
  bytes: Buffer
) {
  const fd = new FormData();
  fd.append("rank", String(rank));
  fd.append("image", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const res = await fetch(`${BASE}/shops/${shopId()}/listings/${listingId}/images`, {
    method: "POST",
    headers: await authHeaders(), // do NOT set Content-Type; fetch adds the boundary
    body: fd,
  });
  return handle(res, `uploadListingImage rank ${rank}`);
}

/** Size property/scale + value ids verified against the live taxonomy (node 482). */
export const SIZE_PROPERTY = 62809790533;
export const SIZE_SCALE = 51;
export const SIZE_VALUE_IDS: Record<string, number> = {
  S: 2137, M: 2139, L: 2141, XL: 2144, "2X": 2147, "3X": 2149, "4X": 2151,
};
export const CUSTOM1_PROPERTY = 513; // buyer-facing colorway name

/** Producer cost rises with size (CC 2XL +$1.50, 3XL +$3.50, 4XL +$4.30 — Printinly sheet
 *  2026-07-31). Charged through, rounded to retail-clean steps, so net stays flat.
 *  GROSSED UP by /0.7 (2026-08-02): prices are anchor prices — the shop runs a permanent
 *  store-wide 30% sale, so the buyer-effective upcharge lands back at +$2/+$4/+$5. */
export const SIZE_UPCHARGE_CENTS: Record<string, number> = {
  "2X": 286, "3X": 572, "4X": 715,
};

export async function updateInventory(
  listingId: number,
  opts: { colorways: string[]; sizes: string[]; priceCents: number; quantity: number; readinessStateId: number; skuPrefix: string }
) {
  const products = [];
  let variesBySize = false;
  for (const color of opts.colorways.length ? opts.colorways : ["Default"]) {
    for (const size of opts.sizes) {
      const vid = SIZE_VALUE_IDS[size];
      if (!vid) throw new Error(`Unknown size "${size}" — no Etsy value_id mapping`);
      const cents = opts.priceCents + (SIZE_UPCHARGE_CENTS[size] ?? 0);
      if (cents !== opts.priceCents) variesBySize = true;
      products.push({
        sku: `${opts.skuPrefix}-${color.toUpperCase().replace(/\s+/g, "")}-${size}`,
        property_values: [
          // property_name is REQUIRED or Etsy returns 400 "Expected string value for 'property_name'"
          { property_id: SIZE_PROPERTY, property_name: "Size", scale_id: SIZE_SCALE, value_ids: [vid], values: [size] },
          { property_id: CUSTOM1_PROPERTY, property_name: "Color", values: [color] },
        ],
        offerings: [
          {
            price: cents / 100,
            quantity: opts.quantity,
            is_enabled: true,
            // REQUIRED per offering or Etsy returns 400 "All offerings need readiness state"
            readiness_state_id: opts.readinessStateId,
          },
        ],
      });
    }
  }
  return apiJson("PUT", `/listings/${listingId}/inventory`, {
    products,
    // price varies by size only — declaring it is REQUIRED or Etsy rejects differing offering prices
    price_on_property: variesBySize ? [SIZE_PROPERTY] : [],
    quantity_on_property: [],
    sku_on_property: [SIZE_PROPERTY, CUSTOM1_PROPERTY],
  });
}

/** Attach the shop return policy to a listing. Drafts created before this field was set
 *  (or created in Shop Manager) have return_policy_id = null and cannot be activated. */
export async function setReturnPolicy(listingId: number, returnPolicyId: number) {
  return apiForm("PATCH", `/shops/${shopId()}/listings/${listingId}`, { return_policy_id: returnPolicyId });
}

export async function activateListing(listingId: number) {
  return apiForm("PATCH", `/shops/${shopId()}/listings/${listingId}`, { state: "active" });
}

export async function getReturnPolicies() {
  return apiGet(`/shops/${shopId()}/policies/return`);
}

export async function getListing(listingId: number) {
  return apiGet(`/listings/${listingId}`);
}

export async function getShop() {
  return apiGet(`/shops/${shopId()}`);
}

/** Read side is `production_partners` (array), not `production_partner_ids`. */
export async function getProductionPartners() {
  return apiGet(`/shops/${shopId()}/production-partners`);
}

/** Paid receipts, newest first, transactions included. min_created is epoch seconds. */
export async function getShopReceipts(minCreated?: number) {
  const qs = new URLSearchParams({ was_paid: "true", limit: "50", sort_on: "created", sort_order: "desc" });
  if (minCreated) qs.set("min_created", String(minCreated));
  return apiGet(`/shops/${shopId()}/receipts?${qs}`);
}

export async function getShippingProfiles() {
  return apiGet(`/shops/${shopId()}/shipping-profiles`);
}

export async function getReadinessStates() {
  return apiGet(`/shops/${shopId()}/readiness-state-definitions`);
}
