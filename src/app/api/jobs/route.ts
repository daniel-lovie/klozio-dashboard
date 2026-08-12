/** Live progress of work running outside the web service (design generation, image builds). */
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId } from "@/lib/shops";

export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const shopId = await currentShopId();
  // Anything still running, plus whatever finished in the last ten minutes so a run that completes
  // while the operator is looking away does not simply vanish — and an error stays on screen.
  // shop_id IS NULL covers local scripts that work across shops.
  const rows = await q<any>(
    `SELECT id, kind, label, total, done, failed, status, detail, product_id, started_at, updated_at
       FROM jobs
      WHERE (shop_id = $1 OR shop_id IS NULL)
        AND dismissed_at IS NULL
        AND (status = 'running' OR updated_at > now() - interval '10 minutes')
      ORDER BY started_at DESC LIMIT 6`, [shopId]);
  return Response.json({
    jobs: rows.map((r) => ({
      id: Number(r.id), kind: r.kind, label: r.label,
      total: Number(r.total ?? 0), done: Number(r.done ?? 0), failed: Number(r.failed ?? 0),
      status: r.status, detail: r.detail,
      productId: r.product_id ? Number(r.product_id) : null,
      // A "running" row whose last tick is old is not running — the process died without saying so,
      // and a bar that keeps spinning for ever is worse than no bar.
      stale: r.status === "running" && Date.now() - new Date(r.updated_at).getTime() > 10 * 60_000,
    })),
  });
}

/** Close a finished strip. Local state is not enough: the poll runs every couple of seconds and would put
 *  the same green bar straight back, so the dismissal is recorded. Only this shop's rows (or the shared
 *  local-script rows) can be dismissed. */
export async function POST(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const shopId = await currentShopId();
  const id = Number((await req.json().catch(() => ({})))?.id);
  if (!id) return Response.json({ error: "id gerekli" }, { status: 400 });
  await q(`UPDATE jobs SET dismissed_at = now()
            WHERE id = $1 AND (shop_id = $2 OR shop_id IS NULL)`, [id, shopId]);
  return Response.json({ ok: true });
}
