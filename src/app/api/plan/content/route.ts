/**
 * Bulk content approval, scoped to a slot or a single day.
 *
 * Refuses an unscoped call on purpose: approving all 200 in one click is exactly the
 * mistake this screen exists to prevent.
 */
import { NextResponse } from "next/server";
import { q, logEvent } from "@/lib/db";
import { isLoggedIn } from "@/lib/auth";

const STATUSES = new Set(["draft", "approved", "rejected"]);

export async function POST(req: Request) {
  if (!(await isLoggedIn())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "approved");
  if (!STATUSES.has(status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
  if (!body.slot && !body.date) {
    return NextResponse.json(
      { error: "pass slot or date — refusing to change all 200 at once" }, { status: 400 });
  }

  // Same reason as the plan page: a slotless product is a product, and bulk approve has to reach the
  // same rows the operator can now see. The `slot or date required` guard above is what stops a
  // change-everything-at-once, not this filter.
  const clauses = ["true"];
  const params: any[] = [status];
  if (body.slot) { params.push(String(body.slot)); clauses.push(`coalesce(slot,'—') = $${params.length}`); }
  if (body.date) {
    params.push(String(body.date));
    clauses.push(`id IN (SELECT product_id FROM schedule
                          WHERE (scheduled_at AT TIME ZONE 'America/Chicago')::date = $${params.length}::date)`);
  }
  const rows = await q<{ id: number }>(
    `UPDATE products SET content_status=$1, content_at=now()
      WHERE ${clauses.join(" AND ")} RETURNING id`, params);
  await logEvent(`content_${status}_bulk`, {
    detail: `${rows.length} products · slot=${body.slot ?? "-"} date=${body.date ?? "-"}`,
  });
  return NextResponse.json({ ok: true, count: rows.length });
}
