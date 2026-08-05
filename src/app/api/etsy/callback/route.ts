/** Etsy OAuth callback: exchange code, store per-shop tokens, pull shop defaults. */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { q, logEvent } from "@/lib/db";
import { updateShopCreds, getShopCreds } from "@/lib/shops";

export async function GET(req: Request) {
  const u = new URL(req.url);
  // behind Railway's proxy req.url origin is localhost:8080 — never redirect to it
  const base = process.env.PUBLIC_BASE_URL ?? "https://web-production-c9b31.up.railway.app";
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state") ?? "";
  const c = await cookies();
  const pkce = c.get("etsy_pkce")?.value ?? "";
  const [savedState, verifier] = pkce.split(":");
  if (!code || !verifier || savedState !== state) {
    await logEvent("etsy_oauth_fail", { detail: `state mismatch (code=${!!code}, cookie=${!!verifier})` });
    return NextResponse.redirect(`${base}/shops/new?etsy=state_mismatch`);
  }
  const shopId = Number(state.split(".")[0]);
  const creds = await getShopCreds(shopId);
  const clientId = creds.etsy_api_key || process.env.ETSY_API_KEY || "";
  // new-style Etsy apps require "keystring:sharedsecret" in x-api-key for API calls
  const apiKey = creds.etsy_shared_secret ? `${clientId}:${creds.etsy_shared_secret}` : clientId;

  const tr = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: `${base}/api/etsy/callback`,
      code, code_verifier: verifier,
    }),
  });
  const tok: any = await tr.json().catch(() => ({}));
  if (!tr.ok || !tok.access_token) {
    await logEvent("etsy_oauth_fail", { detail: `token exchange ${tr.status}: ${JSON.stringify(tok).slice(0, 200)}` });
    return NextResponse.redirect(`${base}/shops/new?etsy=token_fail`);
  }
  // etsy user id is the token prefix; resolve their shop
  const userId = String(tok.access_token).split(".")[0];
  const sr = await fetch(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
    headers: { "x-api-key": apiKey, Authorization: `Bearer ${tok.access_token}` },
  });
  const shopInfo: any = await sr.json().catch(() => ({}));
  const etsyShop = shopInfo?.shop_id ? shopInfo : (shopInfo?.results?.[0] ?? null);

  await q(
    `INSERT INTO etsy_tokens (id, shop_id, access_token, refresh_token, expires_at)
     VALUES ((SELECT COALESCE(max(id),0)+1 FROM etsy_tokens), $1, $2, $3, now() + make_interval(secs => $4))
     ON CONFLICT (shop_id) DO UPDATE
       SET access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token,
           expires_at=EXCLUDED.expires_at, updated_at=now()`,
    [shopId, tok.access_token, tok.refresh_token, tok.expires_in ?? 3600]);
  if (etsyShop?.shop_id) {
    await updateShopCreds(shopId, { etsy_shop_id: String(etsyShop.shop_id), etsy_shop_name: etsyShop.shop_name });
  }
  return NextResponse.redirect(`${base}/shops/new?etsy=connected&shop=${shopId}`);
}
