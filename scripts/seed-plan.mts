/**
 * Load the August 2026 plan (200 listings) from output/deep/listings.json into
 * products + schedule.
 *
 * Deliberately image-free: content_status starts at 'draft' and artwork is generated
 * only for what the user approves. The schedule row is created as 'pending' so nothing
 * can publish — the launch approval still requires images.
 *
 * Idempotent: matches on slug, so re-running updates text instead of duplicating.
 * Never downgrades a live listing (COALESCE on etsy_state) and never resets an approval
 * the user already gave (content_status / schedule.status are preserved on conflict).
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const url = process.env.DATABASE_URL || "postgres://klozio:klozio@localhost:5433/klozio";
const isLocal = /localhost|127\.0\.0\.1/.test(url);
const db = new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } });
await db.connect();

type Row = {
  date: string; slot: string; niche: string; tree: string;
  concept: number; variant: number; slug: string;
  title: string; tags: string[]; description: string;
  hook: string; visual: string; price: number; personalised: boolean;
  design_prompt?: string; design_model?: string; design_params?: any;
  mockup_prompt?: string; hero_colorway?: string;
  mockup_prompt_hanging?: string; mockup_prompt_model?: string;
};

const rows: Row[] = JSON.parse(readFileSync(join(ROOT, "output", "deep", "listings.json"), "utf8"));
console.log(`loading ${rows.length} listings…`);

// Publish at 10:00 America/Chicago. Rows sharing a date are spaced 20 min apart so the
// scheduler picks them up in a defined order rather than all at once.
const perDay = new Map<string, number>();
let inserted = 0, updated = 0, scheduled = 0;

for (const r of rows) {
  const n = perDay.get(r.date) ?? 0;
  perDay.set(r.date, n + 1);
  const at = `${r.date} ${String(10 + Math.floor((n * 20) / 60)).padStart(2, "0")}:${String((n * 20) % 60).padStart(2, "0")}:00 America/Chicago`;

  const res = await db.query(
    `INSERT INTO products (slug, niche, title, description, tags, price_cents, quantity,
        taxonomy_id, blank, print_method, colorways, sizes,
        pod_cost_cents, label_cost_cents, slot, tree, concept_no, variant, hook, visual_idea,
        personalised, notes, design_prompt, design_model, design_params, mockup_prompt, hero_colorway,
        mockup_prompt_hanging, mockup_prompt_model)
     VALUES ($1,$2,$3,$4,$5,$6,999,482,'Comfort Colors 1717','DTF',
             ARRAY['Black','Blossom','Blue Jean','Blue Spruce','Butter','Brick','Denim','Gray','Ivory','Chambray','Espresso','Moss','Light Green','Midnight','Orchid','Pepper','Berry','Violet','Red','Watermelon','White','Grape'], ARRAY['S','M','L','XL','2X','3X','4X'],
             950,550,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (slug) DO UPDATE SET
        title=EXCLUDED.title, description=EXCLUDED.description, tags=EXCLUDED.tags,
        price_cents=EXCLUDED.price_cents, niche=EXCLUDED.niche, slot=EXCLUDED.slot,
        tree=EXCLUDED.tree, concept_no=EXCLUDED.concept_no, variant=EXCLUDED.variant,
        hook=EXCLUDED.hook, visual_idea=EXCLUDED.visual_idea,
        personalised=EXCLUDED.personalised, notes=EXCLUDED.notes,
        pod_cost_cents=EXCLUDED.pod_cost_cents, label_cost_cents=EXCLUDED.label_cost_cents,
        sizes=EXCLUDED.sizes, colorways=EXCLUDED.colorways,
        design_prompt=EXCLUDED.design_prompt, design_model=EXCLUDED.design_model,
        design_params=EXCLUDED.design_params, mockup_prompt=EXCLUDED.mockup_prompt,
        hero_colorway=EXCLUDED.hero_colorway,
        mockup_prompt_hanging=EXCLUDED.mockup_prompt_hanging,
        mockup_prompt_model=EXCLUDED.mockup_prompt_model,
        etsy_state=COALESCE(products.etsy_state, EXCLUDED.etsy_state)
     RETURNING id, (xmax = 0) AS is_new`,
    [r.slug, r.niche, r.title, r.description, r.tags, Math.round(r.price * 100),
     r.slot, r.tree, r.concept, r.variant, r.hook, r.visual, r.personalised,
     `${r.slot} concept ${r.concept} variant ${r.variant}`,
     r.design_prompt ?? null, r.design_model ?? null,
     r.design_params ? JSON.stringify(r.design_params) : null,
     r.mockup_prompt ?? null, r.hero_colorway ?? null,
     r.mockup_prompt_hanging ?? null, r.mockup_prompt_model ?? null]
  );
  const pid = res.rows[0].id as number;
  res.rows[0].is_new ? inserted++ : updated++;

  // one schedule row per product; leave an existing row's status alone
  const s = await db.query(
    `INSERT INTO schedule (product_id, scheduled_at)
     SELECT $1, $2::timestamptz
      WHERE NOT EXISTS (SELECT 1 FROM schedule WHERE product_id = $1)
     RETURNING id`,
    [pid, at]
  );
  if (s.rowCount) scheduled++;
  else await db.query(
    `UPDATE schedule SET scheduled_at=$2::timestamptz
      WHERE product_id=$1 AND status IN ('pending','cancelled')`, [pid, at]);
}

const [{ count: total }] = (await db.query(`SELECT count(*)::int FROM products WHERE slot IS NOT NULL`)).rows;
const byStatus = (await db.query(
  `SELECT content_status, count(*)::int FROM products WHERE slot IS NOT NULL GROUP BY 1`)).rows;

console.log(`✅ products: ${inserted} inserted, ${updated} updated (${total} in plan)`);
console.log(`✅ schedule rows created: ${scheduled}`);
console.log(`   content status:`, byStatus.map((r: any) => `${r.content_status}=${r.count}`).join(" · "));
await db.end();
