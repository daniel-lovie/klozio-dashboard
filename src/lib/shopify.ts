/**
 * Shopify Admin API client (GraphQL, 2026-07).
 *
 * Auth: client-credentials grant — the app ('daniella', Dev Dashboard) must be installed on
 * the store. Tokens live ~24h; we mint on demand and cache in-process with a 5-minute safety
 * margin, so there is no stored refresh token to rot (unlike Etsy's rotating refresh tokens).
 */
const DOMAIN = () => {
  const d = process.env.SHOPIFY_STORE_DOMAIN;
  if (!d) throw new Error("SHOPIFY_STORE_DOMAIN not set");
  return d;
};

let cached: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
  const res = await fetch(`https://${DOMAIN()}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SHOPIFY_CLIENT_ID ?? "",
      client_secret: process.env.SHOPIFY_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) throw new Error(`shopify token mint failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  cached = { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 86400) * 1000 };
  return cached.token;
}

export async function shopifyGql<T = any>(query: string, variables: Record<string, any> = {}): Promise<T> {
  const res = await fetch(`https://${DOMAIN()}/admin/api/2026-07/graphql.json`, {
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
