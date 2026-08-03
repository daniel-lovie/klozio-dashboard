/** Preview or download the order's ready-to-print PNG.
 *  Priority: agent-generated per-order print → product stock print → EMB sibling design
 *  (hats carry no print_file of their own). ?download=1 forces a file download. */
import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await one<any>(
    `SELECT COALESCE(f.order_print_file, p.print_file, sib.print_file) AS png,
            p.slug, f.receipt_id
       FROM fulfillment_orders f
       JOIN products p ON p.id = f.product_id
       LEFT JOIN products sib ON sib.slot = 'EMB' AND sib.concept_no = p.concept_no
                             AND p.slot = 'EMBH' AND sib.print_file IS NOT NULL
      WHERE f.id = $1`, [Number(id)]);
  if (!row?.png) return NextResponse.json({ error: "no print file" }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download");
  const filename = `order-${id}-${row.slug ?? "print"}.png`;
  return new NextResponse(new Uint8Array(row.png as Buffer), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=60",
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
    },
  });
}
