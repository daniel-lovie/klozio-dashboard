/** (Re)create the Printful draft for an embroidery order — used as retry from /orders. */
import { NextResponse } from "next/server";
import { isLoggedIn } from "@/lib/auth";
import { sendOrderToPrintful } from "@/lib/printful-fulfill";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const r = await sendOrderToPrintful(Number(id));
    return NextResponse.json({ ok: true, printful_order_id: r.printfulOrderId });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
