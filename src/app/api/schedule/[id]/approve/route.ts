import { NextResponse } from "next/server";
import { q, one, logEvent } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await one<any>(`SELECT s.*, p.id AS pid,
      (SELECT count(*) FROM product_images i
        WHERE i.product_id=p.id AND coalesce(i.role,'') <> 'cover_unstamped') AS imgs
    FROM schedule s JOIN products p ON p.id=s.product_id WHERE s.id=$1`, [Number(id)]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status === "published") return NextResponse.json({ error: "already published" }, { status: 409 });
  if (Number(row.imgs) === 0) {
    return NextResponse.json({ error: "product has no images; Etsy needs at least one" }, { status: 400 });
  }
  await q(`UPDATE schedule SET status='approved', approved_at=now(), approved_by='dashboard', last_error=NULL WHERE id=$1`, [Number(id)]);
  await logEvent("approved", { scheduleId: Number(id), productId: row.pid });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await one<any>(`SELECT * FROM schedule WHERE id=$1`, [Number(id)]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.status === "published") return NextResponse.json({ error: "already published" }, { status: 409 });
  await q(`UPDATE schedule SET status='pending', approved_at=NULL, approved_by=NULL WHERE id=$1`, [Number(id)]);
  await logEvent("unapproved", { scheduleId: Number(id), productId: row.product_id });
  return NextResponse.json({ ok: true });
}
