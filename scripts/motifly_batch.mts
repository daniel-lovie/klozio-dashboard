/**
 * MOTIFLY's first 72 designs: twelve niches, six each, scheduled six a day an hour apart from 24 Aug.
 *
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/motifly_batch.mts            # dry run — validates all 72, writes nothing
 *   npx tsx scripts/motifly_batch.mts --apply
 *
 * NBA was requested and is not here. League, team and player marks are registered trademarks and a
 * likeness claim is the closure-tier incident, not the warning kind — so the basketball niche is the
 * game itself: courts, hoops, the culture around it, no marks of any kind. Everything else is as asked.
 *
 * Concepts and palettes are written per design. Titles and tags are composed from the niche's keyword
 * set, because that part is mechanical and doing it by hand across 72 rows is how a tag ends up 21
 * characters long. Every row still goes through draftProduct, so the same gates apply as to anything
 * the agent writes: title band, thirteen multi-word tags, named palette, no background or badge words,
 * no request for lettering, and MOTIFLY's own price rules.
 */
import { draftProduct } from "../src/lib/agent/draft-product";
import { pool } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const SHOP = 9;

/** 24 Aug, six a day, an hour apart, 14:00-19:00 UTC — 9am to 2pm on the US east coast. */
const START = new Date(Date.UTC(2026, 7, 24, 14, 0, 0));
const PER_DAY = 6;

const AI_NOTE =
  "ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my "
  + "design process, then refined and prepared for print by hand. Original illustration.";
const BODY =
  "\n\nPrinted with DTF onto a soft cotton tee — full colour, no cracking, no stiff patch. Unisex fit, "
  + "true to size, sizes S through 4XL. Made to order and shipped from the US.\n\n"
  + "Also available as an instant Digital PNG if you would rather print it yourself.";

/** Style spine shared by every prompt: what the file must BE, before what is in it. */
const SPINE =
  "thick confident outlines and flat colour blocks, no gradients, no shading, bold high-contrast "
  + "illustration, the subject fills the frame, centred composition sized for a chest print";

type Niche = { key: string; label: string; kw: string[]; designs: { s: string; p: string }[] };

const NICHES: Niche[] = [
  { key: "hoops", label: "basketball",
    kw: ["basketball lover tee", "hoops fan gift", "basketball mom tee", "streetball shirt",
         "court side tee", "baller gift shirt", "basketball gift tee", "hooper shirt gift",
         "gym rat basketball", "playground hoops", "bball lover tee", "basketball fan tee",
         "sport lover gift"],
    designs: [
      { s: "outdoor-hoop", p: "A weathered outdoor basketball hoop with a chain net seen from below against nothing, drawn in burnt orange, charcoal, warm cream and steel blue" },
      { s: "worn-ball", p: "A single well-worn basketball with visible pebbling and scuffed seams, drawn in burnt orange, deep brown, cream and charcoal" },
      { s: "court-lines", p: "An overhead view of a half-court key and three point arc rendered as flat shapes, drawn in teal, warm cream, burnt orange and charcoal" },
      { s: "sneaker-squeak", p: "A pair of high top basketball sneakers laced together and hanging by the laces, drawn in cream, burnt orange, charcoal and cobalt blue" },
      { s: "net-swish", p: "A basketball passing through a net mid swish seen straight on, motion implied by the net shape alone, drawn in burnt orange, cream, charcoal and mustard" },
      { s: "gym-bag", p: "An open duffel bag with a basketball, a water bottle and a rolled towel spilling out, drawn in cobalt blue, burnt orange, cream and charcoal" },
    ] },
  { key: "sport", label: "sports",
    kw: ["sports lover tee", "running gift shirt", "volleyball mom tee", "soccer lover gift",
         "baseball fan tee", "pickleball gift tee", "cycling lover shirt", "athlete gift tee",
         "game day shirt", "team sport gift", "weekend athlete", "sports mom gift",
         "active life tee"],
    designs: [
      { s: "running-shoes", p: "A pair of well used running shoes with the laces mid flight, drawn in coral, charcoal, mustard and cream" },
      { s: "volleyball-net", p: "A volleyball frozen just above the tape of a net, drawn in cobalt blue, cream, coral and charcoal" },
      { s: "soccer-boot", p: "A single soccer boot resting on a ball, studs visible, drawn in emerald green, cream, charcoal and mustard" },
      { s: "baseball-glove", p: "A worn leather baseball glove with a ball nested in the pocket, drawn in warm tan, rust, cream and charcoal" },
      { s: "pickleball-paddle", p: "Two crossed pickleball paddles with a perforated ball between them, drawn in teal, coral, cream and charcoal" },
      { s: "bike-gears", p: "A bicycle crank and chainring seen side on with the chain looping away, drawn in charcoal, mustard, teal and cream" },
    ] },
  { key: "bookish", label: "book lover",
    kw: ["book lover tee", "bookish gift shirt", "reader gift tee", "library lover tee",
         "book nerd shirt", "reading gift tee", "novel lover shirt", "bookworm gift tee",
         "book club shirt", "literary gift tee", "cozy reading tee", "book stack shirt",
         "reader life tee"],
    designs: [
      { s: "stacked-spines", p: "A leaning stack of seven hardback books seen side on, spines textured, drawn in deep plum, mustard, sage green, terracotta and cream" },
      { s: "open-window", p: "An open book resting face down over a steaming mug, drawn in warm rust, cream, sage green and charcoal" },
      { s: "cat-on-books", p: "A curled sleeping cat lying across a closed book, drawn in warm ginger, cream, deep teal and charcoal" },
      { s: "library-ladder", p: "A rolling library ladder leaning against a tall shelf of books, drawn in deep green, warm oak brown, mustard and cream" },
      { s: "reading-nook", p: "A deep armchair with a blanket, a stack of books and a small lamp beside it, drawn in plum, mustard, sage and cream" },
      { s: "moth-and-book", p: "A large luna moth resting on an open book, wings spread over the pages, drawn in pale sage, cream, deep plum and gold" },
    ] },
  { key: "petjob", label: "pet",
    kw: ["dog lover tee", "cat lover gift tee", "pet parent shirt", "dog mom gift tee",
         "dog dad shirt gift", "rescue dog tee", "puppy lover shirt", "pet lover gift tee",
         "dog person tee", "fur parent shirt", "animal lover tee", "doggo gift shirt",
         "pet life shirt"],
    designs: [
      { s: "dachshund-scarf", p: "A long dachshund wearing a knitted scarf that trails behind it, drawn in warm chestnut, mustard, cream and charcoal" },
      { s: "corgi-loaf", p: "A corgi sitting in a compact loaf shape seen head on, drawn in warm ginger, cream, sage green and charcoal" },
      { s: "greyhound-curl", p: "A greyhound curled into a tight spiral asleep, drawn in dove grey, cream, dusty rose and charcoal" },
      { s: "cat-window", p: "A cat sitting upright with its tail curled around its feet, drawn in charcoal, cream, mustard and teal" },
      { s: "three-dogs", p: "Three different dog breeds sitting in a row at different heights, drawn in chestnut, cream, charcoal and mustard" },
      { s: "paw-and-heart", p: "A large dog paw print with a small heart shape inside one pad, drawn in terracotta, cream, deep teal and charcoal" },
    ] },
  { key: "botanic", label: "botanical",
    kw: ["plant lover tee", "botanical gift tee", "foraging lover tee", "mushroom lover tee",
         "houseplant gift tee", "garden lover shirt", "herbalist gift tee", "plant lady tee",
         "green thumb shirt", "wild plant tee", "nature lover gift", "leafy plant tee",
         "plant humor shirt"],
    designs: [
      { s: "foxglove-stem", p: "A single tall foxglove stem in flower with leaves at the base, drawn in deep plum, sage green, cream and charcoal" },
      { s: "mushroom-cluster", p: "A cluster of five fly agaric mushrooms at different heights with moss at their feet, drawn in scarlet, cream, deep green and warm brown" },
      { s: "monstera-leaf", p: "One large monstera leaf seen flat with its splits and holes, drawn in deep emerald, sage, mustard and cream" },
      { s: "nightshade-sprig", p: "A sprig of belladonna with berries and leaves, drawn in deep plum, near black green, cream and mustard" },
      { s: "herb-bundle", p: "A tied bundle of drying herbs hanging stems upward, drawn in sage green, warm tan, terracotta and cream" },
      { s: "fern-unfurl", p: "A fiddlehead fern unfurling beside two open fronds, drawn in deep green, sage, cream and warm brown" },
    ] },
  { key: "parks", label: "national park",
    kw: ["national park tee", "park lover gift", "wildlife lover tee", "outdoor lover tee",
         "mountain lover tee", "bison lover shirt", "ranger gift tee", "wild animal tee",
         "park visitor tee", "nature humor tee", "trail lover gift", "wilderness tee",
         "adventure gift tee"],
    designs: [
      { s: "bison-stand", p: "A single standing bison seen side on with a heavy shoulder hump, drawn in deep brown, warm tan, cream and charcoal" },
      { s: "black-bear", p: "A black bear standing on all fours looking toward the viewer, drawn in charcoal, warm brown, sage green and cream" },
      { s: "elk-bugle", p: "An elk with a full rack raising its head to bugle, drawn in warm chestnut, cream, deep green and mustard" },
      { s: "mountain-range", p: "Three layered mountain ridges with a lake shape below them, drawn in deep teal, sage, warm sand and cream" },
      { s: "pine-cluster", p: "A tight cluster of five pine trees at different heights, drawn in deep pine green, sage, warm brown and cream" },
      { s: "moose-water", p: "A moose standing knee deep in water with reeds beside it, drawn in deep brown, sage green, cream and mustard" },
    ] },
  { key: "spooky", label: "halloween",
    kw: ["halloween lover tee", "spooky season tee", "retro halloween", "ghost lover shirt",
         "pumpkin lover tee", "creepy cute tee", "witchy gift shirt", "haunted house tee",
         "skeleton gift tee", "horror lover tee", "fall spooky shirt", "black cat tee",
         "october gift tee"],
    designs: [
      { s: "ghost-sheet", p: "A simple sheet ghost with two oval eyes floating upright, drawn in cream, deep plum, charcoal and mustard" },
      { s: "pumpkin-pile", p: "Three carved pumpkins stacked at different angles, drawn in burnt orange, charcoal, mustard and cream" },
      { s: "black-cat-arch", p: "A black cat with an arched back and raised tail seen side on, drawn in charcoal, mustard, deep plum and cream" },
      { s: "haunted-house", p: "A tall narrow haunted house with crooked windows and a bent chimney, drawn in deep plum, charcoal, mustard and cream" },
      { s: "skeleton-hand", p: "A skeleton hand rising with fingers spread, drawn in cream, charcoal, deep plum and mustard" },
      { s: "bat-cluster", p: "Five bats at different sizes arranged in a loose diagonal, drawn in charcoal, deep plum, mustard and cream" },
    ] },
  { key: "craft", label: "craft",
    kw: ["crochet lover tee", "knitting gift tee", "yarn lover shirt", "sewing lover tee",
         "quilting gift tee", "crafter gift shirt", "maker life tee", "handmade gift tee",
         "fiber artist tee", "craft room shirt", "hobby lover tee", "stitching gift tee",
         "yarn hoarder tee"],
    designs: [
      { s: "yarn-basket", p: "A woven basket holding four balls of yarn with two crochet hooks resting across it, drawn in terracotta, mustard, sage green and cream" },
      { s: "knit-needles", p: "Two knitting needles holding a partly finished piece with a trailing strand, drawn in dusty rose, cream, charcoal and sage" },
      { s: "sewing-machine", p: "A vintage sewing machine seen side on with a spool of thread beside it, drawn in deep teal, mustard, cream and charcoal" },
      { s: "thread-spools", p: "Five thread spools of different heights standing in a row, drawn in coral, mustard, teal, cream and charcoal" },
      { s: "quilt-block", p: "A single pieced quilt block seen flat with visible stitching, drawn in terracotta, mustard, sage green and cream" },
      { s: "scissors-pins", p: "A pair of fabric shears with pins scattered around the blades, drawn in charcoal, coral, mustard and cream" },
    ] },
  { key: "coffee", label: "coffee",
    kw: ["coffee lover tee", "espresso gift tee", "latte lover shirt", "cold brew gift tee",
         "barista gift tee", "coffee humor tee", "caffeine lover tee", "morning coffee tee",
         "coffee bar shirt", "iced coffee tee", "coffee addict tee", "cafe lover gift",
         "coffee gift shirt"],
    designs: [
      { s: "moka-pot", p: "A stovetop moka pot seen side on with steam shapes rising, drawn in charcoal, burnt orange, cream and mustard" },
      { s: "pour-over", p: "A pour over cone on a glass carafe with a stream of coffee, drawn in warm brown, cream, teal and charcoal" },
      { s: "espresso-cup", p: "A small espresso cup on a saucer with a spoon beside it, drawn in burnt orange, cream, charcoal and teal" },
      { s: "bean-scatter", p: "A loose scatter of nine coffee beans arranged in an oval, drawn in deep brown, warm tan, cream and charcoal" },
      { s: "iced-latte", p: "A tall glass of iced latte with visible layers and a straw, drawn in warm tan, cream, charcoal and coral" },
      { s: "grinder-hand", p: "A hand crank coffee grinder seen side on, drawn in warm oak brown, charcoal, cream and mustard" },
    ] },
  { key: "cottage", label: "cottagecore",
    kw: ["cottagecore tee", "mushroom lover tee", "cottage core gift", "forest lover tee",
         "woodland gift tee", "fairy core shirt", "wildflower gift tee", "rustic charm tee",
         "meadow lover tee", "toadstool gift tee", "folk art gift tee", "country life tee",
         "cozy woodland tee"],
    designs: [
      { s: "toadstool-ring", p: "Seven small toadstools arranged in a loose ring with grass tufts, drawn in scarlet, cream, sage green and warm brown" },
      { s: "wildflower-jar", p: "A glass jar holding a loose bunch of wildflowers, drawn in dusty rose, mustard, sage green and cream" },
      { s: "cottage-house", p: "A small thatched cottage with a crooked chimney and a low fence, drawn in warm tan, sage green, terracotta and cream" },
      { s: "hedgehog-berries", p: "A hedgehog carrying berries on its spines, drawn in warm brown, scarlet, sage green and cream" },
      { s: "bread-basket", p: "A cloth lined basket holding two round loaves and a sprig of wheat, drawn in warm tan, mustard, sage and cream" },
      { s: "snail-shell", p: "A large garden snail with a spiral shell crossing a leaf, drawn in warm tan, sage green, cream and terracotta" },
    ] },
  { key: "catlife", label: "cat",
    kw: ["cat lover tee", "cat mom gift tee", "kitten lover shirt", "cat dad gift tee",
         "crazy cat person", "feline lover tee", "tabby cat gift", "cat person shirt",
         "kitty lover gift", "cat humor tee", "black cat gift", "cat nap shirt",
         "cat life gift tee"],
    designs: [
      { s: "loaf-cat", p: "A cat sitting in a compact loaf with its paws tucked under, drawn in warm ginger, cream, sage green and charcoal" },
      { s: "three-cats", p: "Three cats in different sitting poses arranged in a row, drawn in charcoal, warm ginger, cream and teal" },
      { s: "cat-plant", p: "A cat peering out from behind a large potted plant, drawn in charcoal, sage green, terracotta and cream" },
      { s: "sleeping-curl", p: "A cat curled nose to tail asleep seen from above, drawn in warm ginger, cream, dusty rose and charcoal" },
      { s: "cat-stretch", p: "A cat in a long front paw stretch with its back arched, drawn in charcoal, cream, mustard and teal" },
      { s: "kitten-box", p: "A kitten sitting inside a cardboard box with the flaps open, drawn in warm tan, cream, charcoal and coral" },
    ] },
  { key: "camp", label: "camping",
    kw: ["camping lover tee", "campfire gift tee", "tent life shirt", "hiking lover tee",
         "outdoor gift tee", "trail lover tee", "camp vibes shirt", "wilderness gift",
         "backpacker gift", "campsite lover", "forest camp tee", "weekend camp tee",
         "camp life gift"],
    designs: [
      { s: "tent-pines", p: "A small ridge tent with two pine trees behind it, drawn in deep pine green, warm sand, cream and burnt orange" },
      { s: "campfire-logs", p: "A campfire of crossed logs with flame shapes above, drawn in burnt orange, mustard, charcoal and cream" },
      { s: "enamel-mug", p: "A speckled enamel camp mug with steam rising, drawn in teal, cream, burnt orange and charcoal" },
      { s: "lantern-glow", p: "A hanging camp lantern seen straight on, drawn in mustard, charcoal, teal and cream" },
      { s: "canoe-water", p: "A canoe with a paddle resting across it on flat water, drawn in burnt orange, deep teal, cream and charcoal" },
      { s: "boots-pack", p: "A pair of hiking boots beside a rolled sleeping mat and a small pack, drawn in warm brown, sage green, mustard and cream" },
    ] },
];

function titleFor(n: Niche, i: number): string {
  const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  const k = n.kw;
  // Build up to the band rather than composing a fixed number of phrases and hoping. Five phrases
  // landed four titles on 124 characters — one short — and the tag padding could not rescue them
  // because every tag was already IN the title, leaving nothing to append.
  const rotated = [k[0], k[1], ...k.slice(2).map((_, x) => k[2 + (x + i) % (k.length - 2)])];
  let t = `${cap(rotated[0])} Shirt`;
  for (const kw of rotated.slice(1)) {
    if (t.length >= 125) break;
    const next = `${t}, ${cap(kw)}`;
    if (next.length > 140) continue;          // skip a phrase that would overshoot, try a shorter one
    t = next;
  }
  return t;
}

const c = pool();
const items: { slug: string; ok: boolean; msg: string; when?: string }[] = [];
let idx = 0;

for (const n of NICHES) {
  for (let i = 0; i < n.designs.length; i++) {
    const d = n.designs[i];
    const slug = `${n.key}-${d.s}-v1`;
    const when = new Date(START.getTime()
      + Math.floor(idx / PER_DAY) * 86400_000 + (idx % PER_DAY) * 3600_000);
    idx++;
    // draftProduct opens its own transaction on its own connection, so an outer BEGIN here wraps
    // nothing — the first dry run wrote all seventy-two rows and then reported them as duplicates.
    // The dry run creates and then deletes instead: it exercises the real path and leaves nothing.
    await c.query(`DELETE FROM products WHERE slug=$1 AND shop_id=$2`, [slug, SHOP]);
    try {
      const out = await draftProduct({
        slug, niche: n.label, technique: "dtf",
        title: titleFor(n, i),
        description: AI_NOTE + BODY,
        tags: n.kw,
        design_prompt: `${d.p}, ${SPINE}, transparent background.`,
        scheduled_at: when.toISOString(),
      }, SHOP);
      if (!APPLY) {
        await c.query(`DELETE FROM schedule WHERE product_id=$1`, [out.id]);
        await c.query(`DELETE FROM products WHERE id=$1`, [out.id]);
      }
      items.push({ slug, ok: true, msg: `${out.title_len} krk · ${out.buyer_price}`, when: when.toISOString().slice(0, 16) });
    } catch (e: any) {
      items.push({ slug, ok: false, msg: String(e.message).slice(0, 110) });
    }
  }
}

const bad = items.filter((x) => !x.ok);
for (const b of bad) console.log(`  RED  ${b.slug.padEnd(28)} ${b.msg}`);
console.log(`\n${items.length} tasarim · ${items.length - bad.length} gecti · ${bad.length} reddedildi`);
if (!bad.length && items.length) {
  console.log(`ilk: ${items[0].when}   son: ${items[items.length - 1].when}`);
}
if (!APPLY) console.log("DRY RUN — yazilmadi. --apply ile uygula.");
await c.end();
process.exit(bad.length ? 1 : 0);
