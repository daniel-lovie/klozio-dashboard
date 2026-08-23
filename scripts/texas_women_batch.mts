/**
 * Texas, for women buyers — 16 designs per shop, two a day from 24 to 31 August, at the end of each
 * day's schedule.
 *
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/texas_women_batch.mts [--apply]
 *
 * Three shops, forty-eight DIFFERENT designs. Putting the same sixteen into all three would set our own
 * listings against each other in the same Etsy queries, which is the cannibalisation the catalogue
 * README warns about — so each shop gets its own subjects and its own visual register.
 *
 * The category evidence is research/competitor-teardowns/hilariousteezz-texas.md: a two-month-old shop,
 * 6.19% conversion on one Texas-girl listing. Its lesson is that regional pride works as an identity
 * hook and trademarked slogans are what get shops closed.
 *
 * Not used, deliberately: "Don't Mess With Texas" is a registered TxDOT trademark, and Dr Pepper, H-E-B,
 * Buc-ee's and Whataburger are trademarks the teardown names explicitly. University and pro-team marks
 * are out for the same reason. The state flag, the bluebonnet, the mockingbird and cowgirl dress are
 * public and carry the identity on their own.
 */
import { draftProduct } from "../src/lib/agent/draft-product";
import { pool } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const DAYS = 8;                    // 24..31 August
const PER_DAY = 2;

const AI_NOTE =
  "ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my "
  + "design process, then refined and prepared for print by hand. Original illustration.";
const BODY =
  "\n\nPrinted onto a soft cotton tee — full colour, no cracking, no stiff patch. Unisex fit, true to "
  + "size, sizes S through 4XL. Made to order and shipped from the US.";

type Design = { s: string; p: string; hook?: string };
type ShopPlan = { shopId: number; key: string; register: string; kw: string[]; designs: Design[] };

/** The style spine differs per shop so three Texas ranges do not read as one. */
const REGISTER: Record<string, string> = {
  klz: "1970s travel-poster style, flat colour blocks with thick confident outlines, no gradients",
  hbe: "hand-drawn folk engraving style, fine linework over flat colour, no gradients",
  mot: "bold modern flat-colour illustration, heavy outlines, large simple shapes, no gradients",
};
const TAIL = ", the subject fills the frame, centred composition sized for a chest print, transparent background.";

const KW_KLZ = ["texas girl tee", "retro texas shirt", "texas lover gift", "bluebonnet lover tee",
  "southern girl tee", "texas pride shirt", "lone star gift tee", "texas women tee",
  "cowgirl gift shirt", "wildflower texas tee", "texas home gift", "hill country tee", "howdy gift tee"];
const KW_HBE = ["texas women shirt", "cowgirl lover tee", "western girl tee", "texas roots gift",
  "southern charm tee", "ranch life gift", "texas made shirt", "boots and bloom",
  "rodeo girl gift", "prairie style tee", "texas country tee", "western women gift", "lone star women"];
const KW_MOT = ["texas gift for her", "modern texas tee", "texas girl gift", "lone star lover tee",
  "texan women shirt", "texas graphic tee", "bold texas gift", "state pride tee",
  "texas native gift", "southern state tee", "texas born shirt", "y all gift tee", "texas fan tee"];

const PLANS: ShopPlan[] = [
  { shopId: 1, key: "klz", register: REGISTER.klz, kw: KW_KLZ, designs: [
    { s: "bluebonnet-field", p: "A field of bluebonnets in the foreground with a low sun behind the blooms, drawn in cobalt blue, sage green, warm cream and burnt orange", hook: "BLUEBONNET SEASON" },
    { s: "boots-pair", p: "A pair of tooled cowgirl boots standing side by side with stitched patterns on the shafts, drawn in warm tan, turquoise, cream and deep brown", hook: "BOOTS BY THE DOOR" },
    { s: "armadillo-flowers", p: "An armadillo walking with two wildflowers tucked behind its shoulder plates, drawn in warm tan, dusty rose, sage green and cream" },
    { s: "wildflower-bunch", p: "A loose gathered bunch of Texas wildflowers with bluebonnets and indian paintbrush, drawn in cobalt blue, scarlet, sage green and cream", hook: "PICKED ROADSIDE" },
    { s: "hill-sun", p: "Layered hill country ridges with a large ringed sun setting behind them, drawn in burnt orange, mustard, deep teal and cream" },
    { s: "hat-bandana", p: "A wide brim cowgirl hat with a folded bandana tied around the crown, drawn in warm tan, scarlet, cream and deep brown", hook: "HAT ON, TROUBLE OFF" },
    { s: "prickly-bloom", p: "A prickly pear cactus pad with two open blooms on its edge, drawn in sage green, magenta pink, mustard and cream", hook: "SOFT IN THE MIDDLE" },
    { s: "mockingbird-branch", p: "A mockingbird perched on a slender branch with its tail angled down, drawn in dove grey, cream, sage green and mustard" },
    { s: "windmill-dusk", p: "A tall ranch windmill seen against nothing with a water tank at its base, drawn in charcoal, mustard, burnt orange and cream", hook: "STILL TURNING" },
    { s: "pickup-hay", p: "An old pickup truck seen side on carrying two round hay bales, drawn in teal, warm tan, mustard and cream" },
    { s: "sweet-tea", p: "A tall mason jar of iced tea with a lemon wheel and a sprig of mint, drawn in warm amber, cream, sage green and mustard", hook: "SWEET TEA WEATHER" },
    { s: "porch-swing", p: "A wooden porch swing hanging on two chains with a folded quilt over the seat, drawn in warm oak brown, dusty rose, sage green and cream", hook: "PORCH SITTING SEASON" },
    { s: "horse-run", p: "A quarter horse at a run seen side on with its mane lifted, drawn in warm chestnut, cream, mustard and charcoal" },
    { s: "pecan-branch", p: "A pecan branch with leaves and three nuts in their husks, drawn in warm brown, sage green, mustard and cream" },
    { s: "star-flowers", p: "A five pointed star shape built entirely from wildflowers and leaves, drawn in cobalt blue, scarlet, sage green and cream", hook: "LONE STAR GIRL" },
    { s: "boot-flowers", p: "A single cowgirl boot with wildflowers spilling out of its opening, drawn in warm tan, cobalt blue, scarlet and cream", hook: "WILDFLOWERS IN MY BOOTS" },
  ] },
  { shopId: 2, key: "hbe", register: REGISTER.hbe, kw: KW_HBE, designs: [
    { s: "lasso-roses", p: "A coiled lasso rope forming a loose oval with three open roses resting inside the coil, drawn in warm tan, deep red, sage green and cream", hook: "ROPED AND ROOTED" },
    { s: "saddle-detail", p: "A tooled western saddle seen three quarters on with a decorated skirt, drawn in warm chestnut, cream, turquoise and charcoal" },
    { s: "yucca-stalk", p: "A yucca plant with a tall flowering stalk rising from spiked leaves, drawn in sage green, cream, warm tan and mustard", hook: "TOUGH AND BLOOMING" },
    { s: "horseshoe-bloom", p: "A worn horseshoe with a small spray of wildflowers growing through it, drawn in charcoal, mustard, dusty rose and cream", hook: "LUCK GROWS HERE" },
    { s: "longhorn-head", p: "A longhorn cow head seen straight on with wide sweeping horns, drawn in warm tan, cream, charcoal and burnt orange" },
    { s: "prairie-grass", p: "A cluster of tall prairie grasses and seed heads bending in one direction, drawn in mustard, warm tan, sage green and cream" },
    { s: "bandana-fold", p: "A folded paisley bandana lying flat with its pattern visible, drawn in scarlet, cream, charcoal and mustard", hook: "TIED, NOT TAMED" },
    { s: "cactus-trio", p: "Three different cactus shapes standing at different heights, drawn in sage green, terracotta, mustard and cream" },
    { s: "feather-cluster", p: "Three long bird feathers bound at the quills with a leather cord, drawn in warm tan, turquoise, cream and charcoal", hook: "LIGHT AND STUBBORN" },
    { s: "gate-latch", p: "A wooden ranch gate with a metal latch seen straight on, drawn in warm oak brown, charcoal, sage green and cream" },
    { s: "sunflower-face", p: "A single large sunflower head seen face on with a thick stem below, drawn in mustard, warm brown, sage green and cream", hook: "FACING THE SUN" },
    { s: "boot-stitch", p: "One cowgirl boot seen side on with elaborate stitching across the shaft, drawn in warm tan, turquoise, cream and deep brown" },
    { s: "coyote-howl", p: "A coyote seen side on with its head raised to howl, drawn in dove grey, warm tan, mustard and cream" },
    { s: "quilt-star", p: "A pieced eight point quilt star seen flat with visible stitching, drawn in dusty rose, mustard, sage green and cream", hook: "STITCHED BY HAND" },
    { s: "bluebonnet-jar", p: "A tin can holding a small bunch of bluebonnets with a twine tie, drawn in cobalt blue, warm tan, sage green and cream" },
    { s: "hummingbird-sage", p: "A hummingbird hovering beside a stalk of flowering sage, drawn in emerald green, magenta pink, cream and mustard", hook: "SMALL AND FIERCE" },
  ] },
  { shopId: 9, key: "mot", register: REGISTER.mot, kw: KW_MOT, designs: [
    { s: "state-bloom", p: "The outline shape of Texas filled edge to edge with overlapping wildflowers and leaves, drawn in cobalt blue, scarlet, sage green and cream", hook: "GROWN HERE" },
    { s: "big-boots", p: "One oversized cowgirl boot seen straight on with bold stitched panels, drawn in turquoise, warm tan, cream and charcoal", hook: "THESE BOOTS KNOW THE WAY" },
    { s: "sun-cactus", p: "A large ringed sun behind a single tall saguaro style cactus, drawn in burnt orange, mustard, sage green and cream" },
    { s: "hat-flat", p: "A cowgirl hat seen from directly above with a beaded band around the crown, drawn in warm tan, turquoise, scarlet and cream", hook: "HAT ENERGY" },
    { s: "bluebonnet-bold", p: "Three bluebonnet stalks side by side rendered as bold simple shapes, drawn in cobalt blue, sage green, cream and mustard", hook: "STATE FLOWER, STATE OF MIND" },
    { s: "horse-head", p: "A horse head in profile with a flowing mane rendered in large flat shapes, drawn in warm chestnut, cream, mustard and charcoal" },
    { s: "star-simple", p: "A single bold five pointed star with a thick outline and a smaller star inside it, drawn in scarlet, cream, charcoal and mustard", hook: "ONE STAR, LOUD" },
    { s: "roadrunner", p: "A roadrunner mid stride with its tail raised and its head feathers lifted, drawn in sage green, mustard, cream and charcoal", hook: "ALWAYS IN A HURRY" },
    { s: "desert-layers", p: "Three layered desert mesas with a low sun between them, drawn in terracotta, burnt orange, deep teal and cream" },
    { s: "boots-flowers-bold", p: "A pair of boots with a thick band of flowers across the top of both shafts, drawn in turquoise, scarlet, sage green and cream", hook: "BLOOM AND RIDE" },
    { s: "armadillo-bold", p: "An armadillo seen side on rendered in large flat plates with bold outlines, drawn in warm tan, dusty rose, charcoal and cream", hook: "ARMOURED AND SWEET" },
    { s: "wind-turbine", p: "Two modern wind turbines standing at different heights with a low sun behind, drawn in cream, deep teal, mustard and charcoal" },
    { s: "peach-branch", p: "A branch with two ripe peaches and three leaves, drawn in coral, mustard, sage green and cream", hook: "SWEET AND STUBBORN" },
    { s: "sunset-strip", p: "Four horizontal bands of colour forming a stylised sunset with a small bird crossing them, drawn in scarlet, coral, mustard and cream" },
    { s: "cattle-skull-bloom", p: "A cow skull seen straight on with wildflowers growing across the top of the forehead, drawn in cream, dusty rose, sage green and charcoal", hook: "SOFT WHERE IT COUNTS" },
    { s: "y-all-flowers", p: "A dense round posy of mixed wildflowers tied with a ribbon, drawn in magenta pink, cobalt blue, sage green and cream", hook: "Y'ALL MEANS ALL" },
  ] },
];

function titleFor(kw: string[], i: number): string {
  const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  const rot = [kw[0], kw[1], ...kw.slice(2).map((_, x) => kw[2 + (x + i) % (kw.length - 2)])];
  let t = `${cap(rot[0])} Shirt`;
  for (const k of rot.slice(1)) {
    if (t.length >= 125) break;
    const next = `${t}, ${cap(k)}`;
    if (next.length > 140) continue;
    t = next;
  }
  return t;
}

const c = pool();
const report: { shop: number; slug: string; ok: boolean; msg: string; when?: string }[] = [];

for (const plan of PLANS) {
  // Where the day's schedule currently ends, per shop. "At the bottom" means after everything already
  // there; if that would cross midnight the two go inside the last half hour instead of onto the next day.
  const last = new Map<string, string>();
  const rows = (await c.query<{ d: string; t: string }>(
    `SELECT to_char(s.scheduled_at,'YYYY-MM-DD') d, to_char(max(s.scheduled_at),'HH24:MI') t
       FROM schedule s JOIN products p ON p.id = s.product_id
      WHERE p.shop_id = $1 AND s.status <> 'cancelled'
        AND s.scheduled_at >= '2026-08-24' AND s.scheduled_at < '2026-09-01'
      GROUP BY 1`, [plan.shopId])).rows;
  for (const r of rows) last.set(r.d, r.t);

  for (let i = 0; i < plan.designs.length; i++) {
    const d = plan.designs[i];
    const day = new Date(Date.UTC(2026, 7, 24 + Math.floor(i / PER_DAY)));
    const key = day.toISOString().slice(0, 10);
    const [lh, lm] = (last.get(key) ?? "21:00").split(":").map(Number);
    const lastMin = lh * 60 + lm;
    // 30 and 60 minutes after the day's last launch, unless that runs past midnight — then 10 and 20.
    const step = lastMin + 60 <= 23 * 60 + 59 ? 30 : 10;
    const at = lastMin + step * ((i % PER_DAY) + 1);
    const when = new Date(day.getTime() + at * 60_000);

    const slug = `texas-${plan.key}-${d.s}-v1`;
    await c.query(`DELETE FROM products WHERE slug=$1 AND shop_id=$2`, [slug, plan.shopId]);
    try {
      const out = await draftProduct({
        slug, niche: "Texas pride, women buyers", technique: "dtf",
        title: titleFor(plan.kw, i),
        description: AI_NOTE + BODY,
        tags: plan.kw,
        hook: d.hook,
        design_prompt: `${d.p}, ${plan.register}${TAIL}`,
        scheduled_at: when.toISOString(),
      }, plan.shopId);
      if (!APPLY) {
        await c.query(`DELETE FROM schedule WHERE product_id=$1`, [out.id]);
        await c.query(`DELETE FROM products WHERE id=$1`, [out.id]);
      }
      report.push({ shop: plan.shopId, slug, ok: true,
                    msg: `${out.title_len} krk · ${out.buyer_price}${d.hook ? " · yazili" : ""}`,
                    when: when.toISOString().slice(0, 16) });
    } catch (e: any) {
      report.push({ shop: plan.shopId, slug, ok: false, msg: String(e.message).slice(0, 100) });
    }
  }
}

const bad = report.filter((r) => !r.ok);
for (const b of bad) console.log(`  RED  ${b.slug.padEnd(34)} ${b.msg}`);
for (const s of [1, 2, 9]) {
  const mine = report.filter((r) => r.shop === s && r.ok);
  const text = mine.filter((r) => r.msg.includes("yazili")).length;
  console.log(`  magaza ${s}: ${mine.length} tasarim · ${text} yazili · ${mine[0]?.when} → ${mine[mine.length - 1]?.when}`);
}
console.log(`\n${report.length} tasarim · ${report.length - bad.length} gecti · ${bad.length} reddedildi`);
if (!APPLY) console.log("DRY RUN — --apply ile yaz.");
await c.end();
process.exit(bad.length ? 1 : 0);
