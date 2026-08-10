/** Shop execution context (Faz 2). Wrap any Etsy-touching work in runWithShop(shopDbId, fn);
 *  lib/etsy.ts reads the resolved credentials synchronously from the store. Without a store
 *  everything falls back to env — i.e. legacy single-tenant behaviour (Klozio, shop 1). */
import { AsyncLocalStorage } from "async_hooks";
import { q } from "./db";

export type ShopCtx = {
  dbShopId: number;
  etsyShopId: number;
  /** "keystring:shared_secret" — required by Etsy for API calls */
  apiKey: string;
  clientId: string;
  shippingProfileId: number;
  readinessStateId: number;
  returnPolicyId: number;
  productionPartnerIds: number[];
  /** platform key by default — shops may BYO via creds.printful_api_key */
  printfulApiKey: string;
  printfulStoreId: string;
};

const als = new AsyncLocalStorage<ShopCtx>();

function envCtx(): ShopCtx {
  return {
    dbShopId: 1,
    etsyShopId: Number(process.env.ETSY_SHOP_ID || 67236031),
    apiKey: process.env.ETSY_API_KEY || "",
    clientId: (process.env.ETSY_API_KEY || "").split(":")[0],
    shippingProfileId: Number(process.env.ETSY_SHIPPING_PROFILE_ID || 0),
    readinessStateId: Number(process.env.ETSY_READINESS_STATE_ID || 0),
    returnPolicyId: Number(process.env.ETSY_RETURN_POLICY_ID || 0),
    productionPartnerIds: (process.env.ETSY_PRODUCTION_PARTNER_IDS || "")
      .split(",").map((s) => Number(s.trim())).filter(Boolean),
    printfulApiKey: process.env.PRINTFUL_API_KEY || "",
    printfulStoreId: process.env.PRINTFUL_STORE_ID || "",
  };
}

/** Does this shop have a usable Etsy connection? Checked where Etsy is actually called. */
export function hasEtsy(ctx?: ShopCtx): boolean {
  const c = ctx ?? shopCtx();
  return !!c.etsyShopId && c.apiKey.includes(":");
}

export function shopCtx(): ShopCtx {
  return als.getStore() ?? envCtx();
}

export async function runWithShop<T>(dbShopId: number, fn: () => Promise<T>): Promise<T> {
  if (dbShopId === 1) return als.run(envCtx(), fn);
  const rows = await q<{ creds: any }>(`SELECT creds FROM shops WHERE id=$1`, [dbShopId]);
  const c = rows[0]?.creds ?? {};
  const keystring = c.etsy_api_key ?? "";
  const ctx: ShopCtx = {
    dbShopId,
    etsyShopId: Number(c.etsy_shop_id || 0),
    apiKey: c.etsy_shared_secret ? `${keystring}:${c.etsy_shared_secret}` : keystring,
    clientId: keystring,
    shippingProfileId: Number(c.etsy_shipping_profile_id || 0),
    readinessStateId: Number(c.etsy_readiness_state_id || 0),
    returnPolicyId: Number(c.etsy_return_policy_id || 0),
    productionPartnerIds: String(c.etsy_production_partner_ids || "")
      .split(",").map((s: string) => Number(s.trim())).filter(Boolean),
    printfulApiKey: c.printful_api_key || process.env.PRINTFUL_API_KEY || "",
    printfulStoreId: c.printful_store_id || process.env.PRINTFUL_STORE_ID || "",
  };
  // Deliberately NOT a precondition. A new shop should be able to hold products, generate designs,
  // build listing images and fulfil orders before anyone has an Etsy developer account — Etsy is one
  // sales channel, not the price of entry. Throwing here also took out work that has nothing to do
  // with Etsy: the Printful fulfilment path and the analytics snapshot both run inside this context.
  // The Etsy client refuses with a clear message at the point of use instead; see hasEtsy().
  return als.run(ctx, fn);
}
