/** List shops / create a shop (onboarding wizard backend). */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { listShops, createShop, updateShopCreds } from "@/lib/shops";
import { logEvent } from "@/lib/db";

export async function GET() {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shops = await listShops();
  return NextResponse.json({ shops: shops.map((s) => ({ id: s.id, slug: s.slug, name: s.name })) });
}

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const creds: Record<string, string> = {};
  for (const k of ["shopify_domain", "shopify_client_id", "shopify_client_secret", "printful_api_key", "anthropic_api_key"]) {
    if (b[k]?.trim()) creds[k] = String(b[k]).trim();
  }
  const shop = await createShop({ name: b.name, creds });
  await logEvent("shop_created", { detail: `shop ${shop.id} '${shop.name}'` });
  return NextResponse.json({ ok: true, shop: { id: shop.id, slug: shop.slug, name: shop.name } });
}

export async function PATCH(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const patch: Record<string, string> = {};
  for (const k of ["shopify_domain", "shopify_client_id", "shopify_client_secret", "printful_api_key", "anthropic_api_key"]) {
    if (b[k] !== undefined) patch[k] = String(b[k]).trim();
  }
  await updateShopCreds(Number(b.id), patch);
  return NextResponse.json({ ok: true });
}
