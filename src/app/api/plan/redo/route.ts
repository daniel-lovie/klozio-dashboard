/** Reviewer disliked the generated design — queue a regeneration for the producer agent. */
import { NextResponse } from "next/server";
import { q, one, logEvent } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const id = Number(b.product_id);
  if (!id) return NextResponse.json({ error: "product_id required" }, { status: 400 });
  const p = await one<any>(`SELECT id, slug FROM products WHERE id=$1`, [id]);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const note = b.note ? String(b.note).slice(0, 500) : null;
  await q(`UPDATE products SET design_state='redo', redo_note=$2, updated_at=now() WHERE id=$1`, [id, note]);
  await logEvent("design_redo", { productId: id, detail: `reviewer requested redo${note ? ": " + note : ""}` });
  return NextResponse.json({ ok: true, queued: p.slug });
}
