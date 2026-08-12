/**
 * Shopify Admin API client (GraphQL, 2026-07).
 *
 * Auth: client-credentials grant — the app ('daniella', Dev Dashboard) must be installed on
 * the store. Tokens live ~24h; we mint on demand and cache in-process with a 5-minute safety
 * margin, so there is no stored refresh token to rot (unlike Etsy's rotating refresh tokens).
 */
import { shopCtx, hasShopify } from "./shop-context";

/** Credentials for the shop this request is acting on.
 *
 * These were read straight from the environment, which made every Shopify call go to ONE store no matter
 * which shop was open — while the setup wizard had been collecting shopify_domain / client_id /
 * client_secret per shop and storing them in shops.creds, where nothing read them. A second customer
 * finishing the wizard would have published into our store.
 */
function creds() {
  const c = shopCtx();
  if (!hasShopify(c)) {
    throw new Error("bu magazanin Shopify baglantisi yok (shops.creds: shopify_domain, "
      + "shopify_client_id, shopify_client_secret) — kurulum sihirbazindan ekleyin");
  }
  return c;
}

// Keyed by store: one module-level token would be minted for whichever shop called first and then sent
// to the next shop's store, which either fails as unauthorised or, worse, does not.
const cached = new Map<string, { token: string; expiresAt: number }>();

async function token(): Promise<string> {
  const c = creds();
  const hit = cached.get(c.shopifyDomain);
  if (hit && hit.expiresAt - Date.now() > 5 * 60_000) return hit.token;
  const res = await fetch(`https://${c.shopifyDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.shopifyClientId,
      client_secret: c.shopifyClientSecret,
    }),
  });
  if (!res.ok) throw new Error(`shopify token mint failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  cached.set(c.shopifyDomain, {
    token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 86400) * 1000,
  });
  return j.access_token;
}

export async function shopifyGql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const res = await fetch(`https://${creds().shopifyDomain}/admin/api/2026-07/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": await token(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || j.errors) throw new Error(`shopify gql: ${JSON.stringify(j.errors ?? j).slice(0, 300)}`);
  return j.data as T;
}

export async function shopifyStatus() {
  const d = await shopifyGql(`query {
    shop { name myshopifyDomain currencyCode plan { displayName } }
    productsCount(query: "status:active") { count }
    collections(first: 10) { nodes { title productsCount { count } } }
  }`);
  return {
    shop: d.shop,
    activeProducts: d.productsCount.count,
    collections: d.collections.nodes.map((c: any) => ({ title: c.title, products: c.productsCount.count })),
  };
}
