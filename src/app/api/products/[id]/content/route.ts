/**
 * Content approval — stage 1 of two.
 *
 * This approves the TEXT and the visual idea, before any artwork exists. It is what
 * gates design generation. It deliberately does NOT schedule or publish anything:
 * the launch approval (/api/schedule/[id]/approve) still requires images, so a
 * content-approved product with no artwork can never go live by accident.
 */
import { NextResponse } from "next/server";
import { q, one, logEvent } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

const STATUSES = new Set(["draft", "approved", "rejected"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const pid = Number(id);
  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "approved");
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: `status must be one of ${[...STATUSES].join(", ")}` }, { status: 400 });
  }
  const p = await one<{ id: number; slug: string }>(`SELECT id, slug FROM products WHERE id=$1`, [pid]);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  const note = body.note ? String(body.note).slice(0, 2000) : null;
  await q(
    `UPDATE products SET content_status=$2, content_note=$3, content_at=now() WHERE id=$1`,
    [pid, status, note]
  );
  await logEvent(`content_${status}`, { productId: pid, detail: note ?? p.slug });
  return NextResponse.json({ ok: true, status });
}

// Bulk approval lives at /api/plan/content — a slot- or date-scoped endpoint, so an
// id-scoped route never silently touches 200 rows.
