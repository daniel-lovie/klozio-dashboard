# Klozio publishing dashboard

Monthly launch calendar → review every image and detail → approve → it publishes itself to Etsy at
the scheduled time.

## Quick start (local)

```bash
cd dashboard
npm install
npm run db:up        # docker postgres on :5433
npm run db:migrate
npm run db:seed      # imports products/images/token from ../pipeline and ../.etsy_token.json
npm run dev          # http://localhost:3010
```
Password is `DASHBOARD_PASSWORD` in `.env` (dev default: `klozio-dev`).

## How it works

| Piece | File |
|---|---|
| Calendar UI | `src/components/Calendar.tsx` |
| Product review + approve | `src/app/product/[id]/page.tsx`, `src/components/Approve.tsx` |
| Etsy API client (TS port) | `src/lib/etsy.ts` |
| Publish pipeline | `src/lib/publish.ts` |
| In-process scheduler | `src/lib/scheduler.ts` |
| Schema | `db/schema.sql` |
| Seed from the repo | `scripts/seed.mts` |

**Publish paths.** A product with no `etsy_listing_id` gets the full treatment: create draft →
upload images → set inventory → activate. A product already drafted on Etsy is verified and then
activated. Both go through the same approval gate.

**Images live in Postgres** (`product_images.bytes`). That is why Railway needs no volume and why
publishing works identically locally and in production.

**Times are always shown in `SHOP_TIMEZONE`** (America/Chicago — the producer and buyers are US
Central), never the viewer's timezone. A launch calendar that shifts when you travel is worse than
useless. The `datetime-local` input converts both ways so the label never lies.

## Safety rules

- only `approved` rows publish
- overdue beyond `PUBLISH_GRACE_MINUTES` (180) → refused, not published
- rescheduling resets approval to `pending`
- a DB lock (`schedule.locked_at`) prevents the ticker and Railway cron double-publishing
- 3 failures → `failed`, no auto-retry

## Deploy
See `DEPLOY.md`.
