-- Row-level security for the agent's SQL tool. Apply when no batch job is writing to products:
-- ENABLE/FORCE ROW LEVEL SECURITY takes an AccessExclusiveLock and will deadlock against an
-- image build or the order poll otherwise. Run with `SET lock_timeout` and retry.

-- ── row-level security ───────────────────────────────────────────────────────────────────────────
-- Every policy keys off app.shop_id, which the app sets with SET LOCAL after checking membership.
-- current_setting(..., true) returns NULL when unset, and NULL = anything is never true, so a query
-- that forgets to set the shop sees nothing rather than everything. That default is deliberate.
CREATE OR REPLACE FUNCTION app_shop_id() RETURNS int LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.shop_id', true), '')::int $$;

DO $$
DECLARE t text;
BEGIN
  -- Tables that carry shop_id directly.
  FOREACH t IN ARRAY ARRAY['products','events','fulfillment_orders','listing_stats',
                           'shop_daily_stats','ad_spend','meta_ad_stats','jobs','agent_chats',
                           'usage_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_%s ON %I', t, t);
    EXECUTE format($f$CREATE POLICY tenant_%s ON %I USING (shop_id = app_shop_id())
                                                WITH CHECK (shop_id = app_shop_id())$f$, t, t);
  END LOOP;
END $$;

-- product_images and schedule hang off products and carry no shop_id of their own.
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_product_images ON product_images;
CREATE POLICY tenant_product_images ON product_images
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.shop_id = app_shop_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.shop_id = app_shop_id()));

ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_schedule ON schedule;
CREATE POLICY tenant_schedule ON schedule
  USING (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.shop_id = app_shop_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.shop_id = app_shop_id()));

-- FORCE applies the policies to the table owner too, but NOT to a superuser: `postgres` still sees
-- everything, which is what the rest of the application (publisher, order poll, image builds) needs.
-- The agent is the only path that switches role, and it is the only path that must be contained.
