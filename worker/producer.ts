/** Producer agent — autonomous design/image generation after content approval.
 *  Spec: docs/producer-agent-spec.md. Shares the personalizer's loop and DB pool.
 *
 *  This file used to carry its own production pipeline: a Higgsfield call, process_design.py, a vision QA
 *  pass, its own print-file write, then produce_images.py. `scripts/produce_product.py` did the same job a
 *  different way, and the two drifted exactly as this codebase's own rule warns they will. Measured before
 *  the merge: 132 products came out of this path and 93 out of the script, and the two disagreed on things
 *  that reach the customer —
 *
 *    - this path never typeset the hook onto the artwork, so its designs shipped wordless, against the
 *      measured finding that nearly every product that sells carries words;
 *    - it never ran the measured contrast garment pick, so `hero_colorway` stayed whatever was in the row
 *      rather than the colour the artwork is actually readable on;
 *    - its print files came out up to 4096px where every product from the script is 2048.
 *
 *  So the pipeline is gone and this now runs the one script. What stays here is the part the script does
 *  not do: claiming work. This claim is the better of the two — it picks up 'redo', reclaims a 'generating'
 *  row whose worker died over 30 minutes ago, and skips anything already published.
 */
import pg from "pg";
import { spawn } from "child_process";

const SCRIPT = new URL("../scripts/produce_product.py", import.meta.url).pathname;

export function makeProducer(pool: pg.Pool) {
  const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;

  const log = async (pid: number, stage: string, detail: any) => {
    await q(`UPDATE products SET agent_log = agent_log || $2::jsonb WHERE id=$1`,
      [pid, JSON.stringify([{ t: new Date().toISOString(), stage, detail }])]);
    console.log(`[product ${pid}] ${stage}:`, typeof detail === "string" ? detail.slice(0, 160) : JSON.stringify(detail).slice(0, 160));
  };

  async function claim(): Promise<any | null> {
    const rows = await q(`
      UPDATE products p SET design_state='generating', updated_at=now()
      WHERE p.id = (
        SELECT pr.id FROM products pr
        WHERE (pr.design_prompt IS NOT NULL OR pr.mockup_prompt IS NOT NULL)
          AND pr.id NOT IN (SELECT product_id FROM schedule WHERE status='published')
          AND (
            (pr.content_status='approved' AND pr.design_state IS NULL
              AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id=pr.id))
            OR pr.design_state='redo'
            OR (pr.design_state='generating' AND pr.updated_at < now() - interval '30 minutes')
          )
        ORDER BY pr.id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING p.*`);
    return rows[0] ?? null;
  }

  /** Run the one production implementation. Same shape as src/lib/producer.ts's `run` — deliberately, so
   *  the agent's single-product `produce` tool and this queue behave identically. The timeout is generous
   *  but present: a hung child would hold the claim until the 30-minute reclaim above. */
  function run(pid: number): Promise<{ ok: boolean; out: string }> {
    return new Promise((resolve) => {
      const child = spawn("python3", [SCRIPT, String(pid)], { env: process.env, timeout: 15 * 60_000 });
      let out = "";
      child.stdout.on("data", (d) => { out += d.toString(); });
      child.stderr.on("data", (d) => { out += d.toString(); });
      child.on("close", (code) => resolve({ ok: code === 0, out: out.trim().slice(-800) }));
      child.on("error", (e) => resolve({ ok: false, out: String(e).slice(0, 300) }));
    });
  }

  async function produce(p: any): Promise<void> {
    // A product with no design_prompt has nothing to generate from. The script would refuse anyway; say
    // so on the row instead, because a bare 'error' with no reason is what made a failure unreadable.
    if (!p.design_prompt) {
      await log(p.id, "produce-error", "design_prompt yok: uretilecek bir tasarim tarifi yok");
      await q(`UPDATE products SET design_state='error',
                 redo_note='design_prompt gerekli — tasarimsiz uretim desteklenmiyor'
               WHERE id=$1`, [p.id]);
      return;
    }
    // Two attempts, as before: a Higgsfield hiccup or a transient cutout failure is worth one retry, and
    // the script is idempotent enough to re-run. A deterministic failure (a bad prompt, a missing blank)
    // fails the same way twice and parks the row rather than burning a paid call every tick.
    for (let attempt = 1; attempt <= 2; attempt++) {
      await log(p.id, "produce-start", { attempt, redo: !!p.redo_note, model: p.design_model });
      const res = await run(p.id);
      if (res.ok) {
        // produce_product.py owns the terminal state: it writes the print file, the images and
        // design_state='ready' itself. Do not set it here — a second writer is how the two paths drifted.
        return log(p.id, "ready", { slug: p.slug, out: res.out.slice(-300) });
      }
      await log(p.id, "produce-error", res.out.slice(-400));
      if (attempt === 2) {
        // Keep the reason on the row. This used to clear to a bare 'error' and the operator had nothing
        // to act on — the failure that took a thread down was diagnosed from a NULL redo_note.
        await q(`UPDATE products SET design_state='error', redo_note=$2, updated_at=now() WHERE id=$1`,
          [p.id, res.out.slice(-400)]);
      }
    }
  }

  return async function tickProducer(): Promise<boolean> {
    const p = await claim();
    if (!p) return false;
    await log(p.id, "claimed", { slug: p.slug, state: p.design_state });
    await produce(p).catch(async (e) => {
      await log(p.id, "unhandled", String(e).slice(0, 200));
      await q(`UPDATE products SET design_state='error', redo_note=$2, updated_at=now() WHERE id=$1`,
        [p.id, String(e).slice(0, 400)]);
    });
    return true;
  };
}
