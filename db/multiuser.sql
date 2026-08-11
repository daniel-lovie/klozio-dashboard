-- Multi-user foundation: identities, membership, and REAL isolation for the agent's SQL tool.
--
-- Two things were true before this file and both had to change before a second person could sign in:
--
--   1. Authorisation was a cookie. `currentShopId()` read `shop_id` from the browser and every query
--      trusted it, so anyone logged in could set it to another shop and manage that shop. Identity
--      (Clerk) does not fix this on its own — membership does.
--   2. The agent's `sql` tool runs arbitrary SQL as `postgres`, which is superuser and owner of every
--      table. Row-level security is *bypassed entirely* for a superuser, so policies alone would have
--      been decoration. Isolation only exists if the query runs as a role that RLS applies to.

-- ── identities ───────────────────────────────────────────────────────────────────────────────────
-- `ext_id` is the provider's subject (Clerk user id). Keeping our own row means membership, roles and
-- audit survive a change of auth provider — the identity is external, the authorisation is ours.
CREATE TABLE IF NOT EXISTS users (
  id         serial PRIMARY KEY,
  ext_id     text UNIQUE,                     -- Clerk user id; NULL for the pre-Clerk owner row
  email      text,
  name       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id  int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_id  int NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'owner',     -- owner | staff
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shop_id)
);
CREATE INDEX IF NOT EXISTS memberships_shop_idx ON memberships(shop_id);

-- ── the restricted role the agent's SQL runs as ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'klozio_agent') THEN
    -- NOLOGIN on purpose: nothing connects as this role. The app switches into it with SET LOCAL ROLE
    -- inside a transaction, so the switch cannot outlive the statement it was opened for.
    CREATE ROLE klozio_agent NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO klozio_agent;

-- Tenant tables the agent may work with.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  products, product_images, schedule, events, fulfillment_orders, listing_stats,
  shop_daily_stats, ad_spend, meta_ad_stats, jobs, agent_chats, usage_events
  TO klozio_agent;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO klozio_agent;

-- Shared reference data: readable, never writable by a tenant.
GRANT SELECT ON mockup_blanks, niches TO klozio_agent;

-- Credentials are not readable at all. etsy_tokens and hf_tokens hold live OAuth tokens, and
-- shops.creds holds every API key in the platform — one SELECT would hand another shop's Etsy account
-- to whoever is chatting. The agent gets a creds-free view of shops instead.
REVOKE ALL ON etsy_tokens, hf_tokens, shops, users, memberships FROM klozio_agent;
CREATE OR REPLACE VIEW shop_public AS SELECT id, slug, name FROM shops;
GRANT SELECT ON shop_public TO klozio_agent;

-- RLS politikalari ayri dosyada: db/multiuser_rls.sql
-- Ayirmanin sebebi: ENABLE ROW LEVEL SECURITY tabloda AccessExclusiveLock ister ve products
-- tablosuna surekli yazan bir goruntu isi varken bu kilit alinamaz. Kimlik/rol/izin kismi ise
-- sicak tablolari kilitlemez, o yuzden bagimsiz uygulanabilir.
