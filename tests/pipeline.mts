/**
 * The pipeline, end to end, against the real database and the real producer.
 *
 *   set -a; . ./.env; set +a; npx tsx tests/pipeline.mts [--keep] [--n 2]
 *
 * Every bug found on 2026-08-19 was the same shape: a stage that succeeded while producing something
 * the next stage could not use, with nothing measuring the join between them. rembg ran on the wrong
 * machine. The cutout gate measured 3031 px while the file stored for the printer was 2048. The agent
 * reported five products and wrote one. Each was invisible because the only check on the pipeline was
 * whether it threw.
 *
 * So this test does not check that the code runs. It creates real products through the same tool the
 * agent uses, waits for the producer that runs in production to pick them up, and then measures the
 * ARTEFACTS against the standards a customer would notice: the resolution of the file the printer
 * receives, how much of the print envelope the artwork actually fills, whether the alpha is printable
 * on DTF, and whether the listing carries what Etsy requires. It cleans up after itself unless asked
 * not to.
 *
 * It is slow — about three minutes per product — because the thing being tested is slow. That is the
 * cost of testing the pipeline instead of testing the functions inside it.
 */
import { execFileSync } from "child_process";
import { draftProduct } from "../src/lib/agent/draft-product";
import { pool } from "../src/lib/db";

const KEEP = process.argv.includes("--keep");
const N = Math.max(1, Math.min(4, Number(process.argv[process.argv.indexOf("--n") + 1]) || 2));
const READY_TIMEOUT_MS = 14 * 60_000;

/** 10 inches at 300 PPI: the print the producer lays down. */
const PRINT_PX = 3000;
/** The type band takes the rest, so artwork filling less than eight inches is a composition problem. */
const MIN_ART_IN = 8.0;
/** DTF cannot lay ink at partial opacity; the cutout is supposed to leave almost none. */
const MAX_MID_ALPHA_PCT = 2.0;

type Case = { slug: string; niche: string; title: string; hook: string; prompt: string; tags: string[] };

const AI_NOTE =
  "ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my "
  + "design process, then refined and prepared for print by hand. All type is hand-set in a licensed "
  + "font. Original illustration, printed to order on a garment-dyed Comfort Colors tee.";

const CASES: Case[] = [
  {
    slug: "zzpipe-garden-c1-v1",
    niche: "gardeners, plant people, allotment humour",
    title: "Garden Lover T-Shirt, Tomato Grower Gift for Plant Parents, Vegetable Patch Tee, Funny Gardening Shirt, Allotment Season Apparel",
    hook: "STILL WAITING FOR TOMATOES",
    prompt: "A bold flat-colour illustration of a terracotta pot holding a leggy tomato plant with two "
      + "stubbornly green tomatoes, drawn in warm rust, deep olive and mustard against a cream sky "
      + "shape, thick confident outlines, vintage seed-packet poster style, high contrast, no gradients, "
      + "transparent background, centred composition sized for a chest print.",
    tags: ["garden lover tee", "tomato grower gift", "plant parent shirt", "funny garden tee",
           "allotment humor tee", "vegetable patch tee", "gardening gift shirt", "green thumb tee",
           "plant lady shirt", "homegrown tomato tee", "garden season shirt", "veggie garden tee",
           "gardener funny tee"],
  },
  {
    slug: "zzpipe-coffee-c1-v1",
    niche: "coffee drinkers, morning people humour, barista gifts",
    title: "Coffee Lover T-Shirt, Espresso Addict Gift for Caffeine Fans, Retro Coffee Bar Tee, Funny Barista Shirt, Morning Ritual Apparel Gift",
    hook: "MEASURED IN CUPS",
    prompt: "A retro diner-style illustration of a stacked espresso cup and saucer with a curl of steam, "
      + "drawn in burnt orange, teal and cream with a thick charcoal outline, flat colour blocks and "
      + "halftone dots, mid-century coffee advertisement style, high contrast against a dark garment, "
      + "transparent background, centred composition sized for a chest print.",
    tags: ["coffee lover tee", "espresso addict gift", "retro coffee shirt", "funny barista tee",
           "caffeine fan shirt", "morning ritual tee", "coffee bar apparel", "cold brew fan tee",
           "coffee humor shirt", "latte lover tee", "coffee gift shirt", "espresso shot tee",
           "coffee addict tee"],
  },
  {
    slug: "zzpipe-hiking-c1-v1",
    niche: "hikers, trail walkers, national park visitors",
    title: "Hiking T-Shirt, Mountain Trail Gift for Outdoor Lovers, Retro National Park Tee, Funny Hiker Shirt, Weekend Summit Apparel Gift Idea",
    hook: "ONE MORE SWITCHBACK",
    prompt: "A layered illustration of three ridge lines under a rising sun, drawn in sage, deep pine "
      + "and warm sand with a cream sun disc, flat vector shapes and thick outlines, 1970s national "
      + "park poster style, strong contrast, no gradients, transparent background, centred composition "
      + "sized for a chest print.",
    tags: ["hiking lover tee", "mountain trail shirt", "national park tee", "funny hiker shirt",
           "outdoor lover tee", "weekend summit tee", "trail walker shirt", "retro hiking tee",
           "camping gift shirt", "adventure gift tee", "wilderness fan tee", "summit chaser tee",
           "hiking humor shirt"],
  },
  {
    slug: "zzpipe-cat-c1-v1",
    niche: "cat owners, cat humour, pet parent gifts",
    title: "Cat Lover T-Shirt, Grumpy Cat Gift for Pet Parents, Retro Feline Portrait Tee, Funny Cat Owner Shirt, Crazy Cat Person Apparel",
    hook: "STAFF, NOT OWNER",
    prompt: "A flat-colour portrait of a supremely unimpressed tabby cat sitting upright, drawn in warm "
      + "ginger, cream and charcoal with a mustard collar, thick confident outlines, vintage matchbox "
      + "label style, high contrast, no gradients, transparent background, centred composition sized "
      + "for a chest print.",
    tags: ["cat lover tee", "grumpy cat gift", "retro cat shirt", "funny cat owner tee",
           "pet parent shirt", "crazy cat person", "feline portrait tee", "cat humor shirt",
           "tabby cat tee", "cat mom gift tee", "cat dad shirt", "kitty lover tee",
           "cat person apparel"],
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const c = pool();

/** Pixel facts about the print file, measured with PIL because that is what produced it. */
function measurePrint(buf: Buffer): { w: number; h: number; artPx: number; midAlphaPct: number } {
  const py = `
import sys, io, json
from PIL import Image
import numpy as np
im = Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGBA")
a = np.asarray(im)[:, :, 3]
bb = im.getbbox() or (0, 0, im.width, im.height)
print(json.dumps({"w": im.width, "h": im.height,
                  "artPx": max(bb[2] - bb[0], bb[3] - bb[1]),
                  "midAlphaPct": 100.0 * float(((a > 8) & (a < 248)).sum()) / a.size}))
`;
  return JSON.parse(execFileSync("python3", ["-c", py], { input: buf, maxBuffer: 64 << 20 }).toString());
}

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const cases = CASES.slice(0, N);
  console.log(`pipeline testi · ${cases.length} urun · urun basina ~3 dk\n`);

  // 1. create through the same tool the agent calls, so a validation change breaks this too
  const ids: number[] = [];
  for (const t of cases) {
    await c.query(`DELETE FROM products WHERE slug = $1`, [t.slug]);   // a previous aborted run
    const out = await draftProduct({
      slug: t.slug, niche: t.niche, technique: "dtf", title: t.title,
      description: `${AI_NOTE}\n\nUnisex heavyweight cotton tee, garment-dyed for a soft lived-in feel. `
        + `Relaxed fit, true to size. Printed to order in the US and shipped within three business days.`,
      tags: t.tags, hook: t.hook, design_prompt: t.prompt, price_cents: 3570,
    }, 1);
    ids.push(out.id);
    console.log(`  olusturuldu ${out.slug} (${out.id}) · ${out.title_len} karakter · ${out.buyer_price}`);
  }
  console.log();

  // 2. the producer in production picks them up on its own; nothing here pushes it
  const t0 = Date.now();
  const done = new Map<number, string>();
  while (done.size < ids.length && Date.now() - t0 < READY_TIMEOUT_MS) {
    const r = await c.query(
      `SELECT id, slug, design_state FROM products WHERE id = ANY($1) AND design_state IN ('ready','error')`,
      [ids]);
    for (const row of r.rows) {
      if (!done.has(row.id)) {
        done.set(row.id, row.design_state);
        console.log(`  ${row.slug}: ${row.design_state} (+${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    }
    if (done.size < ids.length) await sleep(15_000);
  }
  console.log();

  // 3. measure what came out
  for (const id of ids) {
    const p = (await c.query(
      `SELECT slug, design_state, print_file, print_file_w w, print_file_h h, print_dpi dpi,
              title, tags, hook, description, price_cents, hero_colorway,
              (SELECT count(*)::int FROM product_images g WHERE g.product_id = products.id) imgs,
              (SELECT count(*)::int FROM product_images g WHERE g.product_id = products.id AND g.role='cover') covers,
              (SELECT count(*)::int FROM product_images g WHERE g.product_id = products.id AND g.role='colorway-chart') charts
         FROM products WHERE id = $1`, [id])).rows[0];
    console.log(`${p.slug}`);
    check(`${p.slug} · uretim tamamlandi`, p.design_state === "ready", p.design_state);
    if (p.design_state !== "ready") { console.log(); continue; }

    const m = measurePrint(p.print_file as Buffer);
    check(`${p.slug} · baski tuvali ${PRINT_PX}px`, m.w >= PRINT_PX && m.h >= PRINT_PX, `${m.w}x${m.h}`);
    check(`${p.slug} · print_dpi kayitli`, Number(p.dpi) === 300, String(p.dpi));
    check(`${p.slug} · cizim >=${MIN_ART_IN} inc`, m.artPx / 300 >= MIN_ART_IN,
          `${m.artPx}px = ${(m.artPx / 300).toFixed(1)} inc`);
    check(`${p.slug} · orta-alfa <%${MAX_MID_ALPHA_PCT}`, m.midAlphaPct < MAX_MID_ALPHA_PCT,
          `%${m.midAlphaPct.toFixed(2)}`);
    check(`${p.slug} · en az 7 gorsel`, p.imgs >= 7, String(p.imgs));
    check(`${p.slug} · kapak var`, p.covers >= 1, String(p.covers));
    check(`${p.slug} · renk karti var`, p.charts >= 1, String(p.charts));
    check(`${p.slug} · hero colorway secildi`, !!p.hero_colorway, String(p.hero_colorway));
    check(`${p.slug} · baslik 125-140`, p.title.length >= 125 && p.title.length <= 140, `${p.title.length}`);
    check(`${p.slug} · 13 cok-kelimeli tag`,
          p.tags.length === 13 && p.tags.every((t: string) => /\s/.test(t) && t.length <= 20));
    check(`${p.slug} · hook duruyor`, !!String(p.hook || "").trim(), p.hook);
    check(`${p.slug} · AI beyani ust kisimda`, /\bAI\b/i.test(String(p.description).slice(0, 600)));
    const buyer = (p.price_cents * 0.7) / 100;
    check(`${p.slug} · alici fiyati 18-26`, buyer >= 18 && buyer <= 26, `$${buyer.toFixed(2)}`);
    console.log();
  }

  if (!KEEP) {
    // generation_jobs holds a foreign key to the product and outlives the run, so it goes first.
    await c.query(`DELETE FROM generation_jobs WHERE product_id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM design_feedback WHERE product_id = ANY($1)`, [ids]).catch(() => {});
    await c.query(`DELETE FROM product_images WHERE product_id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM schedule WHERE product_id = ANY($1)`, [ids]);
    await c.query(`DELETE FROM products WHERE id = ANY($1)`, [ids]);
    console.log("test urunleri silindi (--keep ile birakilir)\n");
  }

  const bad = results.filter((r) => !r.ok);
  console.log(`${results.length - bad.length}/${results.length} kontrol gecti`);
  if (bad.length) {
    console.log("\nBASARISIZ:");
    for (const b of bad) console.log(`  ${b.name} — ${b.detail}`);
  }
  await c.end();
  process.exit(bad.length ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await c.end().catch(() => {}); process.exit(1); });
