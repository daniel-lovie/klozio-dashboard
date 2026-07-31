import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Railway's managed Postgres needs SSL; local docker does not.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

declare global {
  // eslint-disable-next-line no-var
  var __klozioPool: Pool | undefined;
}

export const pool =
  global.__klozioPool ??
  new Pool({
    connectionString,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") global.__klozioPool = pool;

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(sql, params);
  return res.rows as T[];
}

export async function one<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function logEvent(
  kind: string,
  opts: { scheduleId?: number | null; productId?: number | null; detail?: string } = {}
) {
  await q(
    `INSERT INTO events (schedule_id, product_id, kind, detail) VALUES ($1,$2,$3,$4)`,
    [opts.scheduleId ?? null, opts.productId ?? null, kind, opts.detail ?? null]
  );
}
