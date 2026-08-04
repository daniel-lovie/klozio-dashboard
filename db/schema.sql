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
ALTER TABLE products ADD COLUMN IF NOT EXISTS personalization_placeholder TEXT;

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
