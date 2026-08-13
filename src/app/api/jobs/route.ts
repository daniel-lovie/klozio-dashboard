/** Live progress of work running outside the web service (design generation, image builds). */
import { isLoggedIn } from "@/lib/auth";
import { q, one } from "@/lib/db";
import { currentShopId } from "@/lib/shops";
import { produceOne } from "@/lib/producer";

/** How long a 'running' row may go without a tick before we stop believing it. */
const STALL_MIN = 10;

/**
 * Close rows whose process is gone, and unlock what they were holding.
 *
 * A job row is closed by the script that opened it, so a process killed mid-run — a container restart, an
 * aborted request — leaves 'running' behind for ever. Three of those sat on screen warning that work had
 * stalled when the work had in fact finished under a NEW row for the same product, because each produce
 * call opens its own. The row was a phantom and the warning was noise.
 *
 * Worse is the other case: if the process died while the product was still marked 'generating', every later
 * produce call refuses it as already in flight, and nothing in the UI could clear that. So a reaped job
 * releases the product too.
 *
 * Runs on read. A cron would be tidier but this table is only ever looked at through this route, and a
 * reaper that only fires when someone is watching is a reaper that cannot drift.
 */
async function reapStalled(shopId: number | null): Promise<void> {
  const dead = await q<any>(
    `UPDATE jobs j SET status = 'stale', updated_at = updated_at,
            detail = coalesce(nullif(j.detail, ''), '') ||
                     ' · surec yanit vermedi, kayit kapatildi'
      WHERE j.status = 'running'
        AND j.updated_at < now() - ($2 || ' minutes')::interval
        AND (j.shop_id = $1 OR j.shop_id IS NULL)
      RETURNING j.id, j.product_id`, [shopId, String(STALL_MIN)]);
  if (!dead.length) return;

  const pids = dead.map((r) => Number(r.product_id)).filter(Boolean);
  if (pids.length) {
    // The work may have completed under a later row. A product that now has its images is not a failure to
    // report, so those rows are dismissed outright instead of shouting in red.
    await q(
      `UPDATE jobs SET dismissed_at = now()
        WHERE id = ANY($1::int[]) AND status = 'stale'
          AND product_id IN (SELECT id FROM products
                              WHERE design_state IN ('ready', 'awaiting_approval'))`,
      [dead.map((r) => Number(r.id))]);
    // Release anything still held open by the dead process, so it can be produced again.
    await q(
      `UPDATE products SET design_state = NULL, updated_at = now(),
              redo_note = coalesce(redo_note, 'uretim sureci yarida durdu, tekrar denenebilir')
        WHERE id = ANY($1::int[]) AND design_state = 'generating'`, [pids]);
  }
}

export async function GET() {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const shopId = await currentShopId();
  await reapStalled(shopId);
  // Anything still running, plus whatever finished in the last ten minutes so a run that completes
  // while the operator is looking away does not simply vanish — and an error stays on screen.
  // shop_id IS NULL covers local scripts that work across shops.
  const rows = await q<any>(
    `SELECT id, kind, label, total, done, failed, status, detail, product_id, started_at, updated_at
       FROM jobs
      WHERE (shop_id = $1 OR shop_id IS NULL)
        AND dismissed_at IS NULL
        AND (status = 'running'
             OR updated_at > now() - interval '10 minutes'
             -- A reaped row keeps its last tick time, so without this it would be marked stale and vanish
             -- in the same breath — hiding the retry button at exactly the moment it is needed. Two hours
             -- is long enough to come back to it; older phantoms stay buried.
             OR (status = 'stale' AND updated_at > now() - interval '2 hours'))
      ORDER BY started_at DESC LIMIT 6`, [shopId]);
  return Response.json({
    jobs: rows.map((r) => ({
      id: Number(r.id), kind: r.kind, label: r.label,
      total: Number(r.total ?? 0), done: Number(r.done ?? 0), failed: Number(r.failed ?? 0),
      status: r.status, detail: r.detail,
      productId: r.product_id ? Number(r.product_id) : null,
      // A "running" row whose last tick is old is not running — the process died without saying so,
      // and a bar that keeps spinning for ever is worse than no bar. reapStalled marks these 'stale';
      // this covers the window between the last tick and the next read.
      stale: r.status === "stale"
        || (r.status === "running" && Date.now() - new Date(r.updated_at).getTime() > STALL_MIN * 60_000),
    })),
  });
}

/** Close a finished strip, or restart what died.
 *
 * Local state is not enough for a dismissal: the poll runs every couple of seconds and would put the same
 * bar straight back, so it is recorded. Only this shop's rows (or the shared local-script rows) qualify.
 */
export async function POST(req: Request) {
  if (!(await isLoggedIn())) return new Response("unauthorized", { status: 401 });
  const shopId = await currentShopId();
  const body = (await req.json().catch(() => ({}))) as any;
  const id = Number(body?.id);
  if (!id) return Response.json({ error: "id gerekli" }, { status: 400 });

  const job = await one<any>(
    `SELECT id, product_id, status FROM jobs
      WHERE id = $1 AND (shop_id = $2 OR shop_id IS NULL)`, [id, shopId]);
  if (!job) return Response.json({ error: "is kaydi bulunamadi" }, { status: 404 });

  if (String(body?.action) === "retry") {
    // The operator pressing this has seen the job die. It costs a paid generation, which is why it is a
    // button and not something that happens by itself.
    if (!job.product_id) return Response.json({ error: "bu is bir urune bagli degil" }, { status: 400 });
    await q(`UPDATE jobs SET dismissed_at = now() WHERE id = $1`, [id]);
    // Whatever the dead process left behind must not block the retry.
    await q(`UPDATE products SET design_state = NULL, updated_at = now()
              WHERE id = $1 AND design_state IN ('generating', 'error')`, [job.product_id]);
    const res = await produceOne(Number(job.product_id));
    return Response.json(res.ok ? { ok: true, out: res.out } : { error: res.out }, { status: res.ok ? 200 : 409 });
  }

  await q(`UPDATE jobs SET dismissed_at = now() WHERE id = $1`, [id]);
  return Response.json({ ok: true });
}
