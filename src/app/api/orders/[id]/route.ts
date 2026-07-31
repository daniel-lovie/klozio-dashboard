/** Move a fulfillment order through the loop, or annotate it. Producer submission is a
 *  stub until the Printinly API lands — 'sent_to_producer' is set manually for now. */
import { NextResponse } from "next/server";
import { q, one, logEvent } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

const FLOW = ["new", "generating", "qa", "ready", "sent_to_producer", "shipped", "done", "problem"];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));

  const row = await one<any>(`SELECT * FROM fulfillment_orders WHERE id=$1`, [Number(id)]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sets: string[] = []; const vals: any[] = [];
  const put = (col: string, v: any) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };

  if (b.status) {
    if (!FLOW.includes(b.status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
    put("status", b.status);
  }
  if (b.note !== undefined) put("note", String(b.note).slice(0, 2000));
  if (b.tracking_code !== undefined) put("tracking_code", b.tracking_code);
  if (b.carrier !== undefined) put("carrier", b.carrier);
  if (b.producer_order_id !== undefined) put("producer_order_id", b.producer_order_id);
  if (!sets.length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  vals.push(Number(id));
  await q(`UPDATE fulfillment_orders SET ${sets.join(", ")} WHERE id=$${vals.length}`, vals);
  await logEvent(`order_${b.status ?? "updated"}`, {
    productId: row.product_id, detail: `fulfillment #${id}${b.note ? ` — ${b.note}` : ""}`,
  });
  return NextResponse.json({ ok: true });
}
