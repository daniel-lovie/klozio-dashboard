/** Draw a stored trend on the operator's say-so. Drafts only — never approves, never touches Etsy. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { currentShopId } from "@/lib/shops";
import { drawTrend } from "@/lib/trend-pipeline";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const trendId = Number(body.trendId);
  if (!trendId) return NextResponse.json({ error: "trendId gerekli" }, { status: 400 });
  const shopId = Number(body.shopId) || (await currentShopId());
  try {
    const out = await drawTrend(trendId, shopId, Number(body.variant) || 0);
    return NextResponse.json({ ...out, ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message).slice(0, 200) }, { status: 400 });
  }
}
