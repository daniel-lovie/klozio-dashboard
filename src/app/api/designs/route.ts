/** The approval gate for a freshly drawn design.
 *
 * Production stops at 'awaiting_approval' with a lead shot and a close crop — about twenty seconds of
 * compositing. Everything after that (eight more frames, the colour chart, a schedule slot) is what a yes
 * buys, so a batch of thirty concepts no longer spends half an hour rendering a style the operator was
 * going to reject on sight.
 */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { q, one } from "@/lib/db";
import { currentShopId, NO_SHOP } from "@/lib/shops";
import { finishApproved, rejectDesign } from "@/lib/producer";

async function ownProduct(productId: number) {
  const shopId = await currentShopId();
  if (!shopId || shopId === NO_SHOP) throw new Error("aktif mağaza çözülemedi");
  // Scoped in SQL: the id comes from the browser, so a product from another shop must read as missing.
  const row = await one<{ id: number; slug: string; design_state: string | null }>(
    `SELECT id, slug, design_state FROM products WHERE id = $1 AND shop_id = $2`, [productId, shopId]);
  if (!row) throw new Error(`urun ${productId} bu magazada bulunamadi`);
  return row;
}

/** Designs waiting for a decision, newest first, with the preview to look at. */
export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const shopId = await currentShopId();
  const rows = await q<any>(
    `SELECT p.id, p.slug, p.title, p.hook, p.hero_colorway, p.technique, p.updated_at,
            (SELECT g.id FROM product_images g WHERE g.product_id = p.id ORDER BY g.rank LIMIT 1) AS cover_id,
            (SELECT g.id FROM product_images g WHERE g.product_id = p.id AND g.role = 'detail' LIMIT 1) AS detail_id
       FROM products p
      WHERE p.shop_id = $1 AND p.design_state = 'awaiting_approval'
      ORDER BY p.updated_at DESC LIMIT 20`, [shopId]);
  return NextResponse.json({ designs: rows.map((r) => ({ ...r, id: Number(r.id) })) });
}

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  try {
    const b = await req.json().catch(() => ({}));
    const productId = Number(b?.product_id);
    const action = String(b?.action ?? "");
    if (!productId) return NextResponse.json({ error: "product_id gerekli" }, { status: 400 });
    const row = await ownProduct(productId);

    if (action === "approve") {
      // Runs the remaining frames now rather than queueing: the operator is looking at the screen and a
      // decision that takes a minute to show its effect reads as a decision that did not register.
      const res = await finishApproved(productId);
      if (!res.ok) return NextResponse.json({ error: res.out.slice(0, 300) }, { status: 409 });
      return NextResponse.json({ ok: true, slug: row.slug, out: res.out.slice(-200) });
    }
    if (action === "reject") {
      await rejectDesign(productId, String(b?.note ?? ""));
      // The cancelled design is not silently dropped: the reason is stored, and the chat asks what to do
      // with it — redraw with a change, rewrite the concept, or leave it.
      return NextResponse.json({ ok: true, slug: row.slug, state: "rejected" });
    }
    return NextResponse.json({ error: "action 'approve' veya 'reject' olmali" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).slice(0, 250) }, { status: 400 });
  }
}
