/**
 * Record one verdict.
 *
 * Unlike the pipeline writer, a failure here IS fatal to the request: the rater is a person who just
 * spent attention on a judgement, and silently dropping it would waste the one resource this whole
 * exercise is trying to bank.
 */
import { q } from "@/lib/db";
import { checkRateToken, cleanRater } from "@/lib/rate-token";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!checkRateToken(body?.t)) return new Response("forbidden", { status: 403 });
  const rater = cleanRater(body?.rater);
  const productId = Number(body?.product_id);
  const verdict = String(body?.verdict ?? "");
  if (!rater || !Number.isFinite(productId)) return Response.json({ error: "eksik alan" }, { status: 400 });
  if (!["accepted", "rejected"].includes(verdict)) {
    return Response.json({ error: "gecersiz karar" }, { status: 400 });
  }
  const reason = String(body?.reason ?? "").slice(0, 500);

  // Changing your mind replaces the vote rather than adding one. A rater who clicks twice must not
  // outweigh a rater who clicks once.
  await q(
    `INSERT INTO design_feedback (product_id, source, verdict, reason, rater)
     VALUES ($1, 'operator', $2, $3, $4)
     ON CONFLICT (rater, product_id) WHERE source = 'operator'
     DO UPDATE SET verdict = EXCLUDED.verdict, reason = EXCLUDED.reason, created_at = now()`,
    [productId, verdict, reason, rater]);
  return Response.json({ ok: true });
}
