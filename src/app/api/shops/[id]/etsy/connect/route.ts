/** Start Etsy OAuth (PKCE) for a shop. Redirect URI must be registered in the Etsy app:
 *  https://web-production-c9b31.up.railway.app/api/etsy/callback */
import { NextResponse } from "next/server";
import crypto from "crypto";
import { isLoggedIn } from "@/lib/auth";
import { getShopCreds } from "@/lib/shops";

const SCOPES = "listings_r listings_w listings_d shops_r shops_w transactions_r transactions_w address_r";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const creds = await getShopCreds(Number(id));
  const clientId = creds.etsy_api_key || process.env.ETSY_API_KEY || "";
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = `${id}.${crypto.randomBytes(8).toString("hex")}`;
  const base = process.env.PUBLIC_BASE_URL ?? "https://web-production-c9b31.up.railway.app";
  const url = new URL("https://www.etsy.com/oauth/connect");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${base}/api/etsy/callback`);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  const res = NextResponse.redirect(url.toString());
  res.cookies.set("etsy_pkce", `${state}:${verifier}`, { path: "/", maxAge: 600, httpOnly: true, sameSite: "lax" });
  return res;
}
