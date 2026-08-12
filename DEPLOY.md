# Deploying the dashboard to Railway

## 0. What this service does
Next.js app + Postgres. It renders the launch calendar, lets you approve a product, and publishes
to Etsy at the scheduled time. Images are stored **in Postgres as bytea** — deliberately, so the
service needs no persistent disk and no object storage.

## 1. Create the project and database
```bash
cd dashboard
railway login
railway init                 # creates a project, links this directory
railway add --database postgres
```
Railway injects `DATABASE_URL` automatically. Do not set it yourself.

## 2. Set the variables
```bash
railway variables --set "DASHBOARD_PASSWORD=$(openssl rand -hex 12)" \
  --set "SESSION_SECRET=$(openssl rand -hex 32)" \
  --set "CRON_SECRET=$(openssl rand -hex 24)" \
  --set "ETSY_CLIENT_ID=..."      \
  --set "ETSY_CLIENT_SECRET=..."  \
  --set "ETSY_API_KEY=keystring:shared_secret" \
  --set "ETSY_SHOP_ID=67236031" \
  --set "ETSY_SHIPPING_PROFILE_ID=312066804390" \
  --set "ETSY_READINESS_STATE_ID=1504534157129" \
  --set "ETSY_PRODUCTION_PARTNER_IDS=5739954" \
  --set "ETSY_RETURN_POLICY_ID=1503311217104" \
  --set "SHOP_TIMEZONE=America/Chicago" \
  --set "NEXT_PUBLIC_SHOP_TIMEZONE=America/Chicago" \
  --set "ENABLE_INPROCESS_SCHEDULER=true" \
  --set "ENABLE_PRODUCER=false" \
  --set "PUBLISH_GRACE_MINUTES=180"
```

`ENABLE_PRODUCER=false` is **not** a placeholder — design production belongs to the `agent` service
(`scripts/personalizer.mts` → `worker/producer.ts`), which keeps minutes-long image work off the process
serving HTTP. Both tickers claim from the same rows, so enabling this one alongside the agent means two
workers racing and paying twice for one product. If nothing is being produced, check that the `agent`
service is deployed and its loop is alive (`railway logs --service agent`) rather than flipping this.
Copy the Etsy values from `../.env` — **print them from there, don't retype**.

## 3. Deploy
```bash
railway up
```
`railway.json` runs the migration on every deploy (it is idempotent) and then starts Next.

## 4. Seed the data
The seed reads local files (`../pipeline/**`, `../.etsy_token.json`), so run it **from your machine
against the Railway database**:
```bash
railway run --service <service-name> npm run db:seed
```
`railway run` injects the production `DATABASE_URL` while executing locally, so the local images and
token land in the Railway DB. Re-run it any time you regenerate mockups.

## 5. Scheduling
Two independent triggers; the DB lock makes running both safe:

- **In-process ticker** — on by default, every 60s. Nothing else needed.
- **Railway cron** (belt and braces, survives a sleeping container):
  add a cron service with schedule `*/5 * * * *` and either command:
  ```bash
  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/publish
  # or, equivalently:
  BASE_URL=https://<your-domain> npm run publish:tick
  ```
  `publish:tick` is an HTTP client on purpose — it calls the same endpoint rather than importing the
  publish code, so there is exactly one publish path and no bundler-vs-Node module resolution issue.

## 6. Token maintenance
The Etsy refresh token lives in the `etsy_tokens` table and **rotates on every refresh** — the app
persists it automatically. Its shelf life is ~90 days. If it ever dies (`invalid_grant`), re-run
`../.claude/skills/klozio-etsy-api/scripts/oauth_bootstrap.py` locally and `npm run db:seed` again.

## Safety behaviour you should know about
- Only rows with `status='approved'` are ever published.
- A row overdue by more than `PUBLISH_GRACE_MINUTES` (default 180) is **refused**, not published.
  This stops a container that slept for a week from dumping a month of backdated launches on the shop.
- Rescheduling resets approval to `pending` on purpose — you re-confirm the new date.
- 3 failed attempts moves a row to `failed`; it will not retry until you re-approve.
