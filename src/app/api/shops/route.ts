/** List shops / create a shop (onboarding wizard backend). */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { listShops, createShop, updateShopCreds } from "@/lib/shops";
import { logEvent } from "@/lib/db";

/** Credential keys the wizard may set. One list, or a field the form collects is silently dropped. */
const CRED_KEYS = [
  "shopify_domain", "shopify_client_id", "shopify_client_secret",
  "printful_api_key", "printful_store_id",
  "anthropic_api_key", "higgsfield_api_key",
];

export async function GET() {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shops = await listShops();
  return NextResponse.json({ shops: shops.map((s) => ({ id: s.id, slug: s.slug, name: s.name })) });
}

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (/https?:\/\//i.test(b.name) || b.name.length > 60) return NextResponse.json({ error: "bu bir mağaza adı gibi görünmüyor" }, { status: 400 });
  const creds: Record<string, string> = {};
  for (const k of CRED_KEYS) {
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
  // Empty means "leave alone", not "clear". The wizard's Etsy step redirects to Etsy and back, which
  // reloads the page and empties the form state — so a later save would post blank AI keys and wipe
  // the ones entered two steps earlier. Removing a stored credential is a deliberate act; it belongs
  // on the shop settings screen, not as a side effect of finishing onboarding.
  const patch: Record<string, string> = {};
  for (const k of CRED_KEYS) {
    if (typeof b[k] === "string" && b[k].trim()) patch[k] = String(b[k]).trim();
  }
  await updateShopCreds(Number(b.id), patch);
  return NextResponse.json({ ok: true });
}
