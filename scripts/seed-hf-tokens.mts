/** Seed/refresh the hf_tokens row from env (run locally against the Railway DB):
 *  HF_ACCESS_TOKEN=... HF_REFRESH_TOKEN=... HF_CLIENT_ID=... HF_EXPIRES_AT_MS=... npm run db:seed-hf */
import pg from "pg";
const url = process.env.DATABASE_URL!;
const c = new pg.Client({ connectionString: url, ssl: /localhost/.test(url) ? undefined : { rejectUnauthorized: false } });
await c.connect();
const { HF_ACCESS_TOKEN, HF_REFRESH_TOKEN, HF_CLIENT_ID, HF_EXPIRES_AT_MS } = process.env;
if (!HF_ACCESS_TOKEN || !HF_REFRESH_TOKEN || !HF_CLIENT_ID) { console.error("HF_* env vars required"); process.exit(1); }
await c.query(`INSERT INTO hf_tokens (id, access_token, refresh_token, client_id, expires_at)
  VALUES (1,$1,$2,$3,to_timestamp($4::bigint/1000.0))
  ON CONFLICT (id) DO UPDATE SET access_token=$1, refresh_token=$2, client_id=$3,
    expires_at=to_timestamp($4::bigint/1000.0), updated_at=now()`,
  [HF_ACCESS_TOKEN, HF_REFRESH_TOKEN, HF_CLIENT_ID, HF_EXPIRES_AT_MS ?? String(Date.now() + 3600_000)]);
console.log("✅ hf_tokens seeded");
await c.end();
