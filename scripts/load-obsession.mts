import { readFileSync } from "fs";
import pg from "pg";
const db = new pg.Client({ connectionString: "postgres://klozio:klozio@localhost:5433/klozio" });
await db.connect();
const rows = JSON.parse(readFileSync("/tmp/w1/obsession.json", "utf8"));
for (const r of rows) {
  const res = await db.query(
    `INSERT INTO products (slug, niche, title, description, tags, price_cents, quantity, taxonomy_id,
        blank, print_method, colorways, sizes, pod_cost_cents, label_cost_cents,
        slot, tree, concept_no, variant, hook, visual_idea, personalised, notes,
        design_prompt, design_model, design_params, mockup_prompt, hero_colorway,
        mockup_prompt_hanging, mockup_prompt_model)
     VALUES ($1,$2,$3,$4,$5,$6,999,482,'Comfort Colors 1717','DTF',
        ARRAY['Black','Blossom','Blue Jean','Blue Spruce','Butter','Brick','Denim','Gray','Ivory','Chambray','Espresso','Moss','Light Green','Midnight','Orchid','Pepper','Berry','Violet','Red','Watermelon','White','Grape'],
        ARRAY['S','M','L','XL','2X','3X','4X'], 950,550,
        $7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
        design_prompt=EXCLUDED.design_prompt, mockup_prompt=EXCLUDED.mockup_prompt,
        mockup_prompt_hanging=EXCLUDED.mockup_prompt_hanging, mockup_prompt_model=EXCLUDED.mockup_prompt_model
     RETURNING id`,
    [r.slug, r.niche, r.title, r.description, r.tags, Math.round(r.price*100),
     r.slot, r.tree, r.concept, r.variant, r.hook, r.visual, r.personalised,
     `OB topical daily #${r.concept} (Obsession movie week)`,
     r.design_prompt, r.design_model, JSON.stringify(r.design_params), r.mockup_prompt, r.hero_colorway,
     r.mockup_prompt_hanging, r.mockup_prompt_model]);
  const pid = res.rows[0].id;
  await db.query(
    `INSERT INTO schedule (product_id, scheduled_at)
     SELECT $1, ($2 || ' 11:40:00 America/Chicago')::timestamptz
     WHERE NOT EXISTS (SELECT 1 FROM schedule WHERE product_id=$1)`, [pid, r.date]);
  console.log(`${r.slug} -> product ${pid} @ ${r.date} 11:40 CT`);
}
await db.end();
