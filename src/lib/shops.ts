/** Multi-shop context (Faz 1 — docs/multi-shop-spec.md).
 *  Selected shop lives in the 'shop_id' cookie; Klozio (id 1) is the default and
 *  falls back to env vars for any credential missing from shops.creds. */
import { cookies } from "next/headers";
import { q, one } from "./db";

export type Shop = { id: number; slug: string; name: string; creds: Record<string, any>; settings: Record<string, any> };

export async function currentShopId(): Promise<number> {
  const c = await cookies();
  const v = Number(c.get("shop_id")?.value ?? 1);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export async function listShops(): Promise<Shop[]> {
  return q<Shop>(`SELECT id, slug, name, creds, settings FROM shops ORDER BY id`);
}

export async function getShop(id: number): Promise<Shop | null> {
  return one<Shop>(`SELECT id, slug, name, creds, settings FROM shops WHERE id=$1`, [id]);
}

/** Credential resolution: shop.creds first; shop 1 falls back to env (legacy single-tenant). */
export async function getShopCreds(id: number): Promise<Record<string, string>> {
  const shop = await getShop(id);
  const c = { ...(shop?.creds ?? {}) };
  if (id === 1) {
    c.shopify_domain ||= process.env.SHOPIFY_STORE_DOMAIN;
    c.shopify_client_id ||= process.env.SHOPIFY_CLIENT_ID;
    c.shopify_client_secret ||= process.env.SHOPIFY_CLIENT_SECRET;
    c.printful_api_key ||= process.env.PRINTFUL_API_KEY;
    c.etsy_shop_id ||= process.env.ETSY_SHOP_ID;
    c.etsy_shipping_profile_id ||= process.env.ETSY_SHIPPING_PROFILE_ID;
    c.etsy_return_policy_id ||= process.env.ETSY_RETURN_POLICY_ID;
    c.etsy_readiness_state_id ||= process.env.ETSY_READINESS_STATE_ID;
    c.etsy_production_partner_ids ||= process.env.ETSY_PRODUCTION_PARTNER_IDS;
  }
  return c;
}

export async function createShop(input: { name: string; creds?: Record<string, any> }): Promise<Shop> {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shop";
  const rows = await q<Shop>(
    `INSERT INTO shops (slug, name, creds) VALUES ($1,$2,$3)
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
     RETURNING id, slug, name, creds, settings`,
    [slug, input.name.trim(), JSON.stringify(input.creds ?? {})]);
  return rows[0];
}

export async function updateShopCreds(id: number, patch: Record<string, any>) {
  await q(`UPDATE shops SET creds = creds || $2::jsonb WHERE id=$1`, [id, JSON.stringify(patch)]);
}
