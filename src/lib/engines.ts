/**
 * Which engine does the work, and what happens when it cannot.
 *
 * Generation currently runs on two hosted services: Anthropic for listing text, Higgsfield for
 * images. Both keep working exactly as they do today. This module adds a SECOND option behind a flag
 * — a worker on the DGX Spark — and the routing rules that decide between them.
 *
 * Three things it is careful about, each learned here rather than assumed:
 *
 *   TEXT AND IMAGE FALL BACK INDEPENDENTLY. A stalled LLM must not push the image to Higgsfield. They
 *   are separate stages with separate triggers, and each records what actually ran.
 *
 *   THE CLOUD PATH IS NEVER DELETED. `LOCAL_ENGINE=off` restores today's behaviour with no deploy,
 *   which is the only kill switch worth having on a home device serving a production storefront.
 *
 *   HEARTBEAT, NOT HOPE. The Spark is on a home network behind no inbound port. The only honest
 *   signal that it is alive is a row it wrote recently; routing to it because nothing has failed yet
 *   is how a job sits queued until someone notices.
 */
import { q, one } from "./db";

export type TextEngine = "local-qwen" | "sonnet";
export type ImageEngine = "local-comfyui" | "higgsfield";

/** Rollout stages. `off` is the kill switch and the default everywhere until proven. */
export type Rollout = "off" | "internal" | `percent:${number}` | "default_on";

export const CLOUD_TEXT: TextEngine = "sonnet";
export const CLOUD_IMAGE: ImageEngine = "higgsfield";

/** A worker quiet for longer than this is treated as gone, whatever the queue says. */
export const HEARTBEAT_STALE_MS = 5 * 60 * 1000;
export const WORKER_NAME = "dgx-spark";

export function rollout(): Rollout {
  const raw = (process.env.LOCAL_ENGINE || "off").trim();
  if (raw === "off" || raw === "internal" || raw === "default_on") return raw;
  if (/^percent:\d{1,3}$/.test(raw)) return raw as Rollout;
  // An unreadable value routes to cloud. A typo in an env var must not silently send production
  // traffic at a machine in someone's flat.
  console.warn(`[engines] LOCAL_ENGINE="${raw}" anlasilmadi, 'off' varsayildi`);
  return "off";
}

export async function workerAlive(worker = WORKER_NAME): Promise<boolean> {
  const row = await one<{ beat_at: string }>(
    `SELECT beat_at FROM worker_heartbeat WHERE worker = $1`, [worker]);
  if (!row) return false;
  return Date.now() - new Date(row.beat_at).getTime() < HEARTBEAT_STALE_MS;
}

/**
 * Should this job go local?
 *
 * `internal` is the operator's own account only; `percent:N` is a stable hash of the job id, not a
 * coin flip, so a job that starts local stays local across retries instead of ping-ponging.
 */
export async function routeLocal(opts: { jobId?: number; isOperator?: boolean }): Promise<boolean> {
  const stage = rollout();
  if (stage === "off") return false;
  if (!(await workerAlive())) return false;
  if (stage === "default_on") return true;
  if (stage === "internal") return !!opts.isOperator;
  const pct = Number(stage.split(":")[1]);
  return ((opts.jobId ?? 0) * 2654435761) % 100 < pct;
}

export type JobKind = "image" | "text" | "both";

export async function enqueue(job: {
  productId?: number; kind: JobKind; payload: unknown; runAt?: Date; enginePref?: string;
}): Promise<number> {
  const rows = await q<{ id: number }>(
    `INSERT INTO generation_jobs (product_id, kind, payload, run_at, engine_pref)
     VALUES ($1,$2,$3,COALESCE($4, now()),$5) RETURNING id`,
    [job.productId ?? null, job.kind, JSON.stringify(job.payload), job.runAt ?? null,
     job.enginePref ?? null]);
  return rows[0].id;
}

/**
 * Claim due jobs for a worker.
 *
 * Same shape as `claimDue()` in publish.ts, including the stale-lock release: a worker that dies
 * holding a claim must not park a job forever. It claims from generation_jobs and NOTHING else —
 * `products` already has an owner in the agent service's producer, and a second claimant on those
 * rows means two workers racing and paying twice for one product.
 */
export async function claimJobs(worker: string, limit = 1) {
  return q<any>(
    `UPDATE generation_jobs j
        SET status='claimed', claimed_at=now(), worker=$1, attempts=j.attempts+1, updated_at=now()
      WHERE j.id IN (
        SELECT id FROM generation_jobs
         WHERE status='queued' AND run_at <= now()
            OR (status IN ('claimed','running') AND claimed_at < now() - INTERVAL '20 minutes')
         ORDER BY run_at
         LIMIT $2
         FOR UPDATE SKIP LOCKED)
      RETURNING id, product_id, kind, payload, engine_pref, attempts`,
    [worker, limit]);
}

export async function beat(worker = WORKER_NAME, detail: unknown = {}) {
  await q(`INSERT INTO worker_heartbeat (worker, beat_at, detail) VALUES ($1, now(), $2)
           ON CONFLICT (worker) DO UPDATE SET beat_at = now(), detail = EXCLUDED.detail`,
          [worker, JSON.stringify(detail)]);
}
