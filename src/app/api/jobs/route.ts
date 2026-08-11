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
    `SELECT id, kind, label, total, done, failed, status, detail, started_at, updated_at
       FROM jobs
      WHERE (shop_id = $1 OR shop_id IS NULL)
        AND (status = 'running' OR updated_at > now() - interval '10 minutes')
      ORDER BY started_at DESC LIMIT 6`, [shopId]);
  return Response.json({
    jobs: rows.map((r) => ({
      id: Number(r.id), kind: r.kind, label: r.label,
      total: Number(r.total ?? 0), done: Number(r.done ?? 0), failed: Number(r.failed ?? 0),
      status: r.status, detail: r.detail,
      // A "running" row whose last tick is old is not running — the process died without saying so,
      // and a bar that keeps spinning for ever is worse than no bar.
      stale: r.status === "running" && Date.now() - new Date(r.updated_at).getTime() > 10 * 60_000,
    })),
  });
}
