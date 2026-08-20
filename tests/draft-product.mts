/**
 * draft_product's rules, checked against the real database.
 *
 *   set -a; . ./.env; set +a; npx tsx tests/draft-product.mts
 *
 * Ten rejections and one write. The write is removed again at the end, so the test leaves the
 * catalogue exactly as it found it. Every rejection here is a rule that was already written down
 * somewhere and was not enforced anywhere — which is how five rows reached content_status='approved'
 * on 2026-08-19 with no design_prompt and no hook.
 */
import { draftProduct } from "../src/lib/agent/draft-product";
import { pool } from "../src/lib/db";

const good = {
  slug: "zztest-guard-c1-v1",
  niche: "test niche for guard",
  technique: "dtf",
  title: "Guard Test T-Shirt for Validation Only, Please Ignore This Row, Internal Check Tee, Not For Sale Shirt, Test Only Apparel Gift",
  description: "ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my design process, then refined and prepared for print by hand. All type is hand-set in a licensed font. Original illustration. This is a test row created to verify the draft_product validation path and it is not for sale.",
  tags: ["guard test tee","validation shirt","internal test tee","do not buy shirt","check row tee","test only apparel","sample guard tee","qa check shirt","draft test tee","never sold shirt","fake row tee","dummy check tee","ignore this tee"],
  hook: "GUARD TEST ROW",
  design_prompt: "A flat vector illustration of a simple geometric shield shape in muted teal and warm sand tones, centered composition, bold clean outlines, no gradients, transparent background, poster style suitable for direct-to-film printing on a dark garment.",
  price_cents: 3570,
};

const cases: [string, any][] = [
  ["baslik kisa", { ...good, title: "Short Title Tee" }],
  ["12 tag", { ...good, tags: good.tags.slice(0, 12) }],
  ["tek kelime tag", { ...good, tags: [...good.tags.slice(0, 12), "dog"] }],
  ["hook bos", { ...good, hook: "" }],
  ["prompt kisa", { ...good, design_prompt: "a dog" }],
  ["prompt yazi istiyor", { ...good, design_prompt: good.design_prompt + " The text reads GOOD BOY across the chest." }],
  ["marka adi", { ...good, design_prompt: good.design_prompt.replace("shield", "nike swoosh") }],
  ["palet yok", { ...good, design_prompt: "A simple geometric shield shape, centered composition, bold "
    + "clean outlines, no gradients, transparent background, poster style suitable for direct-to-film "
    + "printing on a garment, drawn with confident even strokes throughout the whole mark." }],
  ["AI beyani yok", { ...good, description: "A lovely tee for people who like shields. ".repeat(8) }],
  ["fiyat bandi disi", { ...good, price_cents: 900 }],
  ["gecmis tarih", { ...good, scheduled_at: "2020-01-01T10:00:00Z" }],
];

// A previous run that died mid-way leaves its rows behind and every later run then fails on the slug
// instead of on what it meant to test.
{
  const c0 = pool();
  await c0.query("delete from generation_jobs where product_id in (select id from products where slug like 'zztest-%')");
  await c0.query("delete from schedule where product_id in (select id from products where slug like 'zztest-%')");
  await c0.query("delete from products where slug like 'zztest-%'");
}

let pass = 0;
for (const [label, inp] of cases) {
  try {
    const r = await draftProduct(inp as any, 1);
    console.log(`  BASARISIZ  ${label} — reddedilmesi gerekirken yazdi (id ${r.id})`);
  } catch (e: any) {
    pass++;
    console.log(`  ok  ${label.padEnd(22)} -> ${String(e.message).slice(0, 78)}`);
  }
}
console.log(`\nred testleri: ${pass}/${cases.length}`);

// A short title is no longer a refusal: the tool closes the gap with the product's own tags. This is
// the case that burned an entire turn on 2026-08-19, six calls in a row.
const short = { ...good, slug: "zztest-shorttitle-c1-v1",
                title: "Guard Test T-Shirt for Validation Only, Please Ignore This Row, Internal Check Tee, Not For Sale Shirt" };
const fixed = await draftProduct(short as any, 1);
console.log(`\n  ok  kisa baslik onarildi -> ${fixed.title_len} karakter · ${fixed.title_fixed}`);
if (fixed.title_len < 125 || fixed.title_len > 140) throw new Error("baslik banda oturmadi");
{
  const c2 = pool();
  await c2.query("delete from generation_jobs where product_id=$1", [fixed.id]);
  await c2.query("delete from products where id=$1", [fixed.id]);
}

// happy path, then remove it again
const ok = await draftProduct({ ...good, scheduled_at: "2026-08-23T15:00:00Z" } as any, 1);
console.log("\nyazildi:", JSON.stringify(ok));
const c = pool();
const back = await c.query("select coalesce(btrim(design_prompt),'')<>'' p, coalesce(btrim(hook),'')<>'' h, design_model is not null m, (select count(*) from schedule s where s.product_id=$1) sched from products where id=$1", [ok.id]);
console.log("geri okuma:", back.rows[0]);
await c.query("delete from generation_jobs where product_id=$1", [ok.id]);
await c.query("delete from schedule where product_id=$1", [ok.id]);
await c.query("delete from products where id=$1", [ok.id]);
console.log("test satiri silindi");
process.exit(0);
