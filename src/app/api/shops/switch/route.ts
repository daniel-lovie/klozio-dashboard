/** Switch the active shop (nav dropdown) — sets the shop_id cookie. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { getShop } from "@/lib/shops";

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  const shop = await getShop(Number(id));
  if (!shop) return NextResponse.json({ error: "shop not found" }, { status: 404 });
  // Switching is a permission check, not a preference change. Without this the cookie could be set to
  // any shop id in the system and every later query would honour it.
  const { canUseShop, clerkConfigured } = await import("@/lib/user");
  if (clerkConfigured() && !(await canUseShop(shop.id))) {
    return NextResponse.json({ error: "bu magazaya erisiminiz yok" }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("shop_id", String(shop.id), { path: "/", maxAge: 365 * 24 * 3600, sameSite: "lax" });
  return res;
}
