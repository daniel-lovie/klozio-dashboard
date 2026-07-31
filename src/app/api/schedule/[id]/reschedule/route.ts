import { NextResponse } from "next/server";
import { q, one, logEvent } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { scheduled_at, cancel } = await req.json();
  const row = await one<any>(`SELECT * FROM schedule WHERE id=$1`, [Number(id)]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status === "published") return NextResponse.json({ error: "already published" }, { status: 409 });

  if (cancel) {
    await q(`UPDATE schedule SET status='cancelled' WHERE id=$1`, [Number(id)]);
    await logEvent("cancelled", { scheduleId: Number(id), productId: row.product_id });
    return NextResponse.json({ ok: true });
  }
  if (!scheduled_at) return NextResponse.json({ error: "scheduled_at required" }, { status: 400 });
  // moving a launch resets approval on purpose — the human re-confirms the new date
  await q(
    `UPDATE schedule SET scheduled_at=$2, status='pending', approved_at=NULL, last_error=NULL WHERE id=$1`,
    [Number(id), scheduled_at]
  );
  await logEvent("rescheduled", { scheduleId: Number(id), productId: row.product_id, detail: scheduled_at });
  return NextResponse.json({ ok: true });
}
