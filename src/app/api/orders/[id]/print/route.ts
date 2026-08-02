/** Preview the agent-generated order print (falls back to the product's stock print). */
import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await one<any>(
    `SELECT COALESCE(f.order_print_file, p.print_file) AS png
       FROM fulfillment_orders f JOIN products p ON p.id=f.product_id WHERE f.id=$1`, [Number(id)]);
  if (!row?.png) return NextResponse.json({ error: "no print file" }, { status: 404 });
  return new NextResponse(new Uint8Array(row.png as Buffer), {
    headers: { "content-type": "image/png", "cache-control": "private, max-age=60" },
  });
}
