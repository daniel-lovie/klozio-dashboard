-- Klozio publishing dashboard schema
-- Images live in Postgres as bytea so the app is self-contained on Railway
-- (no persistent disk, no object storage dependency).

CREATE TABLE IF NOT EXISTS etsy_tokens (
  id             INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token   TEXT        NOT NULL,
  refresh_token  TEXT        NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  scopes         TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id                 SERIAL PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  niche              TEXT,
  title              TEXT        NOT NULL,
  description        TEXT        NOT NULL,
  tags               TEXT[]      NOT NULL DEFAULT '{}',
  materials          TEXT[]      NOT NULL DEFAULT '{cotton}',
  price_cents        INT         NOT NULL,
  quantity           INT         NOT NULL DEFAULT 999,
  taxonomy_id        INT         NOT NULL DEFAULT 482,
  blank              TEXT,                       -- e.g. "Comfort Colors 1717"
  print_method       TEXT,                       -- e.g. "DTF"
  colorways          TEXT[]      NOT NULL DEFAULT '{}',
  sizes              TEXT[]      NOT NULL DEFAULT '{S,M,L,XL,2X,3X}',
  -- economics, for the approval screen
  pod_cost_cents     INT,
  label_cost_cents   INT,
  gross_margin_pct   NUMERIC(5,2),
  net_margin_pct     NUMERIC(5,2),
  seo_score          INT,
  -- print file (kept so the producer handoff can pull it later)
  print_file_name    TEXT,
  print_file         BYTEA,
  print_file_w       INT,
  print_file_h       INT,
  print_dpi          INT,
  -- Etsy linkage
  etsy_listing_id    BIGINT,
  etsy_state         TEXT,                       -- draft | active
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id          SERIAL PRIMARY KEY,
  product_id  INT  NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rank        INT  NOT NULL,
  role        TEXT,                              -- cover | detail | colorway | size-guide | trust
  label       TEXT,                              -- e.g. "Pepper"
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL DEFAULT 'image/png',
  width       INT,
  height      INT,
  bytes       BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, rank)
);

-- one row per planned launch. This is what the calendar renders.
CREATE TABLE IF NOT EXISTS schedule (
  id             SERIAL PRIMARY KEY,
  product_id     INT         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  scheduled_at   TIMESTAMPTZ NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','publishing','published','failed','cancelled')),
  approved_at    TIMESTAMPTZ,
  approved_by    TEXT,
  published_at   TIMESTAMPTZ,
  attempts       INT         NOT NULL DEFAULT 0,
  last_error     TEXT,
  locked_at      TIMESTAMPTZ,                    -- crude lock so two tickers can't double-publish
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_due_idx  ON schedule (status, scheduled_at);
CREATE INDEX IF NOT EXISTS schedule_month_idx ON schedule (scheduled_at);

-- append-only audit trail: every approval and publish attempt
CREATE TABLE IF NOT EXISTS events (
  id           SERIAL PRIMARY KEY,
  schedule_id  INT,
  product_id   INT,
  kind         TEXT NOT NULL,                    -- approved | unapproved | publish_start | publish_ok | publish_fail | rescheduled | cancelled
  detail       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_touch ON products;
CREATE TRIGGER products_touch BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS schedule_touch ON schedule;
CREATE TRIGGER schedule_touch BEFORE UPDATE ON schedule
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------- niche portfolio
-- Slot-budgeted stage gate. The whole point is the slot rule:
-- validating + scaling <= MAX_SLOTS at any time, so a new niche cannot start
-- until an existing one is promoted or killed. See
-- .claude/skills/etsy-growth/references/niche-portfolio.md
CREATE TABLE IF NOT EXISTS niches (
  slug            TEXT PRIMARY KEY,
  family          TEXT NOT NULL,              -- buyer identity, NOT style. Drives cross-sell + sections.
  stage           TEXT NOT NULL DEFAULT 'candidate'
                  CHECK (stage IN ('candidate','validating','scaling','harvesting','retired')),
  slot            INT,                        -- only set while validating/scaling
  entered_stage   DATE,
  decision_due    DATE,                       -- 30-60 days after entering validating
  views_to_date   INT  NOT NULL DEFAULT 0,
  sales_to_date   INT  NOT NULL DEFAULT 0,
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A niche portfolio belongs to a shop, not to the platform. The table shipped keyed on slug alone, so the
-- second shop would have inherited the first one's portfolio and two shops could never both work
-- "halloween". Safe to restructure in place: the table was still empty when this landed.
ALTER TABLE niches ADD COLUMN IF NOT EXISTS shop_id INT NOT NULL DEFAULT 1;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'niches_pkey'
               AND pg_get_constraintdef(oid) = 'PRIMARY KEY (slug)') THEN
    ALTER TABLE niches DROP CONSTRAINT niches_pkey;
    ALTER TABLE niches ADD PRIMARY KEY (shop_id, slug);
  END IF;
END
$do$;
CREATE INDEX IF NOT EXISTS niches_shop_idx ON niches (shop_id, stage);

CREATE INDEX IF NOT EXISTS niches_stage_idx ON niches (stage);

-- ---------------------------------------------------------------- month-1 plan columns
-- Added 2026-07-31 for the 200-listing August plan. Two-stage approval:
--   content_status  -> the user approves the TEXT + visual idea (no artwork exists yet)
--   schedule.status -> the existing launch approval, which still requires images
-- Content approval is what gates design generation; launch approval gates publishing.
ALTER TABLE products ADD COLUMN IF NOT EXISTS slot           TEXT;   -- A1..C13
ALTER TABLE products ADD COLUMN IF NOT EXISTS tree           TEXT;   -- fandom / original humour / …
ALTER TABLE products ADD COLUMN IF NOT EXISTS concept_no     INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant        INT;    -- 1 or 2 (title A/B of one design)
ALTER TABLE products ADD COLUMN IF NOT EXISTS hook           TEXT;   -- the line printed ON the shirt
ALTER TABLE products ADD COLUMN IF NOT EXISTS visual_idea    TEXT;   -- art direction for generation
ALTER TABLE products ADD COLUMN IF NOT EXISTS personalised   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS content_status TEXT NOT NULL DEFAULT 'draft'
  CHECK (content_status IN ('draft','approved','rejected'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS content_note   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS content_at     TIMESTAMPTZ;
-- generation prompts (2026-07-31): the user approves the PROMPT, not just the idea.
-- design_prompt goes verbatim into PROVENANCE.md at generation time.
ALTER TABLE products ADD COLUMN IF NOT EXISTS design_prompt  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS design_model   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS design_params  TEXT;   -- JSON: resolution/model_type/colors/background_color
ALTER TABLE products ADD COLUMN IF NOT EXISTS mockup_prompt  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hero_colorway  TEXT;
-- 3-mockup set per product (user decision 2026-07-31): cover flat lay · hanging · on-model
ALTER TABLE products ADD COLUMN IF NOT EXISTS mockup_prompt_hanging TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS mockup_prompt_model   TEXT;

CREATE INDEX IF NOT EXISTS products_slot_idx    ON products (slot, concept_no, variant);
CREATE INDEX IF NOT EXISTS products_content_idx ON products (content_status);

DROP TRIGGER IF EXISTS niches_touch ON niches;
CREATE TRIGGER niches_touch BEFORE UPDATE ON niches
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------- fulfillment queue
-- One row per SOLD transaction. Drives the per-order loop:
--   new -> generating -> qa -> ready -> sent_to_producer -> shipped -> done
-- Personalised orders regenerate the design from products.design_prompt with the
-- buyer's text before 'qa'. Producer leg is stubbed until the Printinly API lands.
CREATE TABLE IF NOT EXISTS fulfillment_orders (
  id              SERIAL PRIMARY KEY,
  receipt_id      BIGINT NOT NULL,
  transaction_id  BIGINT NOT NULL UNIQUE,
  etsy_listing_id BIGINT,
  product_id      INT REFERENCES products(id),
  quantity        INT NOT NULL DEFAULT 1,
  sku             TEXT,
  size            TEXT,
  colorway        TEXT,
  personalization TEXT,                -- buyer's exact text, verbatim
  buyer_name      TEXT,
  ship_to         TEXT,                -- formatted address block
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new','generating','qa','ready','sent_to_producer','shipped','done','problem')),
  order_print_file BYTEA,              -- per-order PNG for personalised items
  producer_order_id TEXT,
  tracking_code   TEXT,
  carrier         TEXT,
  -- The buyer paid for the "Rush service + UPS shipping" upgrade. Standard shipping is $0 shop-wide,
  -- so any shipping the buyer was charged IS the upgrade — no extra Etsy field is needed to detect it.
  -- Without this the order looks identical to every other one in the queue, and an upgrade nobody can
  -- see is a promise sold and not kept.
  rush            BOOLEAN NOT NULL DEFAULT false,
  shipping_paid_cents INTEGER,
  note            TEXT,
  ordered_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fulfillment_status_idx ON fulfillment_orders (status);
DROP TRIGGER IF EXISTS fulfillment_touch ON fulfillment_orders;
CREATE TRIGGER fulfillment_touch BEFORE UPDATE ON fulfillment_orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- personalizer agent (2026-08-02): agent-managed personalization rendering
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS agent_state TEXT;
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS interpreted_text TEXT;
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS agent_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS agent_log JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS agent_claimed_at TIMESTAMPTZ;
-- Two different strings, and mixing them ships nonsense to buyers: `_placeholder` is the token the
-- personalizer swaps OUT of the print file ("KAELEN"), `_instructions` is the buyer-facing prompt on
-- the Etsy listing (see src/lib/publish.ts, Etsy caps it at 120 chars). The instructions column was
-- added straight to the live DB and never made it here, so a rebuild from schema.sql lost it.
ALTER TABLE products ADD COLUMN IF NOT EXISTS personalization_placeholder TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS personalization_instructions TEXT;

-- Shopify is a second sales channel, not a second orders table: klozio.io lines land in the same
-- board as Etsy ones. receipt_id/transaction_id are NOT NULL and Etsy-shaped, so the Shopify order
-- and line ids go in there and every existing query keeps working. The partial unique index is what
-- makes the webhook idempotent — Shopify redelivers on any non-2xx and on manual replay.
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'etsy';
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS shopify_order_id BIGINT;
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS shopify_line_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_orders_shopify_line
  ON fulfillment_orders (shopify_line_id) WHERE shopify_line_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS hf_tokens (
  id            INT PRIMARY KEY DEFAULT 1,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  client_id     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- producer agent (2026-08-03): autonomous design/mockup generation after content approval
ALTER TABLE products ADD COLUMN IF NOT EXISTS design_state TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS design_job_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS redo_note TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS agent_log JSONB NOT NULL DEFAULT '[]'::jsonb;

-- embroidery line via Printful (2026-08-03)
ALTER TABLE products ADD COLUMN IF NOT EXISTS technique TEXT NOT NULL DEFAULT 'dtf';
ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment TEXT NOT NULL DEFAULT 'printinly';

-- Printful auto-fulfillment (embroidery line): structured recipient + draft tracking
ALTER TABLE fulfillment_orders
  ADD COLUMN IF NOT EXISTS ship_name text,
  ADD COLUMN IF NOT EXISTS ship_address1 text,
  ADD COLUMN IF NOT EXISTS ship_address2 text,
  ADD COLUMN IF NOT EXISTS ship_city text,
  ADD COLUMN IF NOT EXISTS ship_state text,
  ADD COLUMN IF NOT EXISTS ship_zip text,
  ADD COLUMN IF NOT EXISTS ship_country text,
  ADD COLUMN IF NOT EXISTS printful_order_id bigint,
  ADD COLUMN IF NOT EXISTS printful_status text,
  ADD COLUMN IF NOT EXISTS printful_error text;
-- embroidery_chest_center | embroidery_chest_left (shirts) | default (hat front)
ALTER TABLE products ADD COLUMN IF NOT EXISTS printful_placement text;
-- Printful embroidery: chosen thread colors (subset of Printful's allowed palette)
ALTER TABLE products ADD COLUMN IF NOT EXISTS thread_colors text[];

-- web chat agent conversation persistence (single operator thread)
CREATE TABLE IF NOT EXISTS agent_chats (
  id int PRIMARY KEY,
  messages jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Chat sessions (many per shop). The table shipped with a unique index on shop_id, which made "one
-- endless thread per shop" a database rule: the operator could not keep a design conversation and an
-- order conversation apart, and clearing one to start another destroyed the only copy of the first.
ALTER TABLE agent_chats ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE agent_chats ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
DROP INDEX IF EXISTS agent_chats_shop_uidx;
CREATE INDEX IF NOT EXISTS agent_chats_shop_idx ON agent_chats (shop_id, updated_at DESC);

-- multi-shop (Faz 1): shops + shop_id scoping; Klozio = shop 1 (docs/multi-shop-spec.md)
CREATE TABLE IF NOT EXISTS shops (
  id serial PRIMARY KEY, slug text UNIQUE NOT NULL, name text NOT NULL,
  creds jsonb NOT NULL DEFAULT '{}', settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_id int NOT NULL DEFAULT 1 REFERENCES shops(id);
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS shop_id int NOT NULL DEFAULT 1 REFERENCES shops(id);
ALTER TABLE agent_chats ADD COLUMN IF NOT EXISTS shop_id int NOT NULL DEFAULT 1 REFERENCES shops(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS shop_id int NOT NULL DEFAULT 1 REFERENCES shops(id);
ALTER TABLE etsy_tokens ADD COLUMN IF NOT EXISTS shop_id int NOT NULL DEFAULT 1 REFERENCES shops(id);

-- per-shop provider usage metering (anthropic tokens, higgsfield jobs) — future credit billing
CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  shop_id int NOT NULL DEFAULT 1 REFERENCES shops(id),
  provider text NOT NULL, kind text NOT NULL, model text,
  input_tokens int NOT NULL DEFAULT 0, output_tokens int NOT NULL DEFAULT 0,
  units numeric NOT NULL DEFAULT 0, cost_usd numeric(10,5) NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- cache token cols + hf per-shop
ALTER TABLE usage_events ADD COLUMN IF NOT EXISTS cache_read int NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS cache_write int NOT NULL DEFAULT 0;
ALTER TABLE hf_tokens ADD COLUMN IF NOT EXISTS shop_id int NOT NULL DEFAULT 1;
-- multi-shop: drop single-row check on etsy_tokens; one token row per shop
ALTER TABLE etsy_tokens DROP CONSTRAINT IF EXISTS etsy_tokens_id_check;
CREATE UNIQUE INDEX IF NOT EXISTS etsy_tokens_shop_uidx ON etsy_tokens(shop_id);

-- Etsy has NO shop-analytics API; listings expose views + num_favorers. Daily snapshots here
-- give us deltas (daily views), favourite rates and conversion when joined with orders.
CREATE TABLE IF NOT EXISTS listing_stats (
  id bigserial PRIMARY KEY,
  shop_id int NOT NULL REFERENCES shops(id),
  product_id int REFERENCES products(id),
  etsy_listing_id bigint NOT NULL,
  views int NOT NULL DEFAULT 0,
  favorites int NOT NULL DEFAULT 0,
  captured_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS listing_stats_daily_uidx ON listing_stats(etsy_listing_id, captured_on);

-- Etsy dashboard Visits/Views are NOT exposed by the API (open-api discussion #1386), so the
-- operator can paste the real funnel numbers here; the API-derived listing_stats stay separate.
CREATE TABLE IF NOT EXISTS shop_daily_stats (
  id bigserial PRIMARY KEY,
  shop_id int NOT NULL REFERENCES shops(id),
  day date NOT NULL,
  visits int, page_views int, orders int, revenue_cents int, favorites int,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS shop_daily_stats_uidx ON shop_daily_stats(shop_id, day);
-- unpaid orders are ingested too (Etsy 'Payment Processing' hides them from was_paid=true queries)
ALTER TABLE fulfillment_orders ADD COLUMN IF NOT EXISTS etsy_status text, ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;
-- Printful digitizes each embroidery file ONCE ($6.50). Reusing the file id avoids paying
-- again — including across shops, since both use the same Printful account. Keyed by design bytes.
CREATE TABLE IF NOT EXISTS printful_files (
  design_md5 text PRIMARY KEY, file_id bigint NOT NULL, placement text, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Etsy listings can't host a Meta Pixel, so paid tests are measured by pairing daily ad spend with
-- Etsy-side visits/orders: CAC = spend / orders, ROAS = revenue / spend.
CREATE TABLE IF NOT EXISTS ad_spend (
  id bigserial PRIMARY KEY,
  shop_id int NOT NULL REFERENCES shops(id), day date NOT NULL, channel text NOT NULL,
  campaign text, spend_cents int NOT NULL DEFAULT 0, impressions int, clicks int, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_spend_uidx ON ad_spend(shop_id, day, channel, COALESCE(campaign,''));

-- Meta insights pulled per ad per day (Marketing API): the creative-level truth for kill/scale
-- decisions, and the automatic feed for ad_spend (no more manual entry).
CREATE TABLE IF NOT EXISTS meta_ad_stats (
  id bigserial PRIMARY KEY, shop_id int NOT NULL DEFAULT 2 REFERENCES shops(id), day date NOT NULL,
  campaign_name text, adset_name text, ad_name text,
  impressions int NOT NULL DEFAULT 0, clicks int NOT NULL DEFAULT 0,
  spend_cents int NOT NULL DEFAULT 0, reach int, ctr numeric(6,3), cpc numeric(8,3),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS meta_ad_stats_uidx ON meta_ad_stats(day, COALESCE(adset_name,''), COALESCE(ad_name,''));


-- Licensed blank-garment photographs, with the chest quad each one is calibrated to. They live in
-- Postgres rather than on disk for the same reason product images do: the service keeps no
-- persistent volume, so a file beside the script would not survive a deploy — and the deployed
-- producer needs them to build any listing image at all.
CREATE TABLE IF NOT EXISTS mockup_blanks (
  name       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,            -- model | flat
  colorway   TEXT NOT NULL,            -- the Comfort Colors shade actually photographed
  quad       JSONB NOT NULL,           -- four corners of the print area, calibrated by eye
  opacity    REAL NOT NULL DEFAULT 0.94,
  shade      REAL NOT NULL DEFAULT 0.85,   -- how much of the garment's light shows through the print
  bytes      BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Progress for work that runs OUTSIDE the web service. Design generation and listing-image builds
-- happen on the operator's machine (Higgsfield's client and the compositor are local), so the
-- dashboard had no way to tell "running" from "nothing is happening" — approving a product looked
-- identical to a stalled pipeline, and the operator had to ask. Local scripts write a row here and
-- tick it; the UI reads it. Rows are small and self-expiring in practice: nothing depends on them.
CREATE TABLE IF NOT EXISTS jobs (
  id          bigserial PRIMARY KEY,
  shop_id     int REFERENCES shops(id),
  kind        text NOT NULL,                     -- design | listing_images | etsy_resync | shopify_refresh
  label       text NOT NULL,                     -- shown to the operator, e.g. "SPA · 7 tasarım"
  total       int  NOT NULL DEFAULT 0,           -- 0 = unknown length
  done        int  NOT NULL DEFAULT 0,
  failed      int  NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'running',   -- running | done | error
  detail      text,                              -- last step, or the error that stopped it
  started_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_live_idx ON jobs(status, updated_at DESC);
-- Which product the work was for, so a finished job can offer "open it and look" instead of leaving the
-- operator to find the row by name — checking the output is the step that catches a bad design, and it has
-- to be one click. And dismissed_at, because a green bar that cannot be closed is clutter: without it the
-- poll brings the same finished job back every two seconds until the ten-minute window expires.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS product_id int;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- A shop's agent cannot see another shop's rows, but products.slug is unique GLOBALLY. The two rules
-- together produce a failure the agent has no way to diagnose: its SELECT finds nothing, its INSERT
-- fails on a duplicate key, and the row it collides with is invisible. Watched live, the agent spent
-- four turns guessing prefixes ("demek ki a4- slug'ları başka bir mağazada var — farklı bir prefix
-- kullanacağım") and never got a clean run.
--
-- Relaxing the constraint to (shop_id, slug) would be the textbook multi-tenant fix, and it is the wrong
-- one here: twenty-two operator scripts look a product up by slug alone, and each would silently pick an
-- arbitrary row the first time two shops shared one.
--
-- So keep the constraint and give the agent a way to satisfy it. SECURITY DEFINER runs as the owner, so
-- the search sees every shop; the function returns a STRING, never a row, so nothing about another
-- shop's catalogue is exposed beyond what the duplicate-key error already revealed.
CREATE OR REPLACE FUNCTION next_free_slug(base text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate text := base;
  n int := 1;
BEGIN
  IF base IS NULL OR btrim(base) = '' THEN
    RAISE EXCEPTION 'next_free_slug: base bos olamaz';
  END IF;
  -- Bounded: a runaway loop inside a SECURITY DEFINER function is worse than a clear error.
  WHILE n < 200 LOOP
    IF NOT EXISTS (SELECT 1 FROM products WHERE slug = candidate) THEN
      RETURN candidate;
    END IF;
    n := n + 1;
    candidate := base || '-' || n;
  END LOOP;
  RAISE EXCEPTION 'next_free_slug: % icin 200 varyantin hepsi dolu', base;
END;
$$;

REVOKE ALL ON FUNCTION next_free_slug(text) FROM PUBLIC;
-- The agent role is created by db/multiuser_rls.sql, which a fresh database may not have run yet.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'klozio_agent') THEN
    GRANT EXECUTE ON FUNCTION next_free_slug(text) TO klozio_agent;
  END IF;
END
$do$;
