/**
 * Klozio's home ground: nerd, geek, game, code, book, anime — 48 designs, six a day, 24–31 August.
 *
 *   set -a; . ./.env; set +a
 *   npx tsx scripts/klozio_nerd_batch.mts [--apply]
 *
 * Placed 14:00–19:00 UTC so the Texas pair stays at the bottom of each day, where the operator put it.
 *
 * One name is deliberately absent. "Dungeons & Dragons" and "D&D" are registered trademarks of Wizards
 * of the Coast, so the tabletop niche here is the hobby rather than the brand: dice, taverns, character
 * sheets, the natural 20. Those are generic to the whole category and belong to nobody. Same reasoning
 * keeps console names, game titles and anime series out of the video-game and anime sets — the joke is
 * the culture, which is what sells anyway.
 */
import { draftProduct } from "../src/lib/agent/draft-product";
import { pool } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");
const SHOP = 1;
// 25 August: today's 14:00-16:00 slots are already behind us, and 25-31 is seven days at
// six a day, which is the 42 the window actually holds.
const START = new Date(Date.UTC(2026, 7, 25, 14, 0, 0));
const PER_DAY = 6;

const AI_NOTE =
  "ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my "
  + "design process, then refined and prepared for print by hand. Original illustration.";
const BODY =
  "\n\nPrinted onto a soft garment-dyed cotton tee — full colour, no cracking, no stiff patch. Unisex "
  + "fit, true to size, sizes S through 4XL. Made to order and shipped from the US.";

const SPINE = "thick confident outlines and flat colour blocks, no gradients, no shading, bold "
  + "high-contrast illustration, the subject fills the frame, centred composition sized for a chest "
  + "print, transparent background.";

type D = { s: string; p: string; hook?: string };
type N = { key: string; label: string; kw: string[]; designs: D[] };

const NICHES: N[] = [
  { key: "anime", label: "anime lovers", kw: [
      "anime lover tee", "anime fan gift", "manga lover shirt", "otaku gift tee",
      "anime girl shirt", "japan lover tee", "anime style gift", "manga reader tee",
      "weeb gift shirt", "anime night tee", "shoujo lover tee", "anime cat gift", "anime vibes tee"],
    designs: [
      { s: "ramen-bowl", p: "A steaming ramen bowl with chopsticks resting across it and a soft-boiled egg half showing, drawn in scarlet, cream, deep teal and mustard", hook: "ONE MORE EPISODE, ONE MORE BOWL" },
      { s: "cat-sleeve", p: "A cat curled asleep inside a wide kimono sleeve, drawn in cream, dusty rose, charcoal and sage green" },
      { s: "sakura-branch", p: "A cherry blossom branch with petals falling from it, drawn in dusty rose, cream, charcoal and sage green" },
      { s: "katana-rest", p: "A sheathed katana resting on a simple wooden stand, drawn in charcoal, deep red, mustard and cream", hook: "SHEATHED, NOT SETTLED" },
      { s: "onigiri-trio", p: "Three onigiri rice balls at different angles with seaweed bands, drawn in cream, charcoal, deep green and coral", hook: "SNACKS BEFORE PLOT" },
      { s: "lantern-night", p: "Two paper lanterns hanging from a cord with tassels below them, drawn in scarlet, mustard, charcoal and cream" },
    ] },
  { key: "code", label: "developer humour", kw: [
      "developer gift tee", "coder humor shirt", "programmer gift", "software dev tee",
      "coding lover tee", "debug life shirt", "engineer gift tee", "tech humor tee",
      "code nerd shirt", "dev life gift", "keyboard lover", "terminal gift tee", "bug hunter tee"],
    designs: [
      { s: "rubber-duck", p: "A rubber duck sitting beside a small stack of books, drawn in mustard, cream, charcoal and teal", hook: "EXPLAINED IT TO THE DUCK" },
      { s: "coffee-terminal", p: "A coffee mug with a blinking cursor shape rising from it like steam, drawn in charcoal, mustard, teal and cream", hook: "COMPILING" },
      { s: "keyboard-keys", p: "Three loose mechanical keyboard keycaps at different angles, drawn in cream, coral, charcoal and teal" },
      { s: "bug-jar", p: "A glass jar with a beetle inside and a vented lid, drawn in sage green, charcoal, mustard and cream", hook: "CAUGHT ONE" },
      { s: "server-stack", p: "A short stack of server units with cables looping between them, drawn in charcoal, teal, mustard and cream" },
      { s: "merge-arrows", p: "Two thick arrows curving together into one, drawn in coral, teal, charcoal and cream", hook: "IT MERGED CLEAN" },
    ] },
  { key: "table", label: "tabletop gaming", kw: [
      "tabletop rpg tee", "dice lover gift", "rpg gamer shirt", "dice goblin tee",
      "tabletop gift tee", "game night shirt", "dungeon master", "critical hit tee",
      "roleplay gift tee", "dice collector", "fantasy gamer tee", "tavern lover tee", "rpg night gift"],
    designs: [
      { s: "d20-hand", p: "A twenty sided die resting between two fingers seen close, drawn in deep plum, mustard, cream and charcoal", hook: "NATURAL TWENTY" },
      { s: "dice-pile", p: "A loose pile of seven polyhedral dice of different shapes, drawn in emerald green, mustard, cream and charcoal", hook: "THE DICE DECIDE" },
      { s: "tavern-mug", p: "A heavy tavern tankard with foam over the rim and a candle beside it, drawn in warm amber, cream, deep brown and mustard" },
      { s: "spell-scroll", p: "A partly unrolled scroll with a wax seal hanging from a ribbon, drawn in cream, deep red, mustard and charcoal" },
      { s: "lantern-map", p: "An old lantern standing on a folded map with a compass beside it, drawn in mustard, warm brown, deep teal and cream", hook: "THE PARTY WENT LEFT" },
      { s: "sword-shield", p: "A short sword crossed behind a round shield, drawn in charcoal, mustard, deep red and cream" },
    ] },
  { key: "retro", label: "retro gaming", kw: [
      "retro gamer tee", "gamer gift shirt", "arcade lover tee", "pixel art gift",
      "video game tee", "gaming humor tee", "old school gamer", "joystick gift tee",
      "arcade night tee", "gamer life gift", "pixel lover tee", "retro arcade tee", "game night tee"],
    designs: [
      { s: "arcade-stick", p: "An arcade joystick with a ball top and three round buttons beside it, drawn in scarlet, cobalt blue, cream and charcoal", hook: "INSERT COIN" },
      { s: "crt-screen", p: "A chunky CRT television with a rounded screen and two dials, drawn in warm tan, charcoal, teal and cream" },
      { s: "cartridge-stack", p: "Three unlabelled game cartridges stacked at slight angles, drawn in charcoal, mustard, coral and cream", hook: "BLOW ON IT" },
      { s: "pixel-heart", p: "A large pixelated heart built from visible square blocks, drawn in scarlet, cream, charcoal and coral", hook: "ONE LIFE LEFT" },
      { s: "dpad-buttons", p: "A directional pad beside two round action buttons, drawn in charcoal, coral, cream and teal" },
      { s: "high-score", p: "An old scoreboard panel with blank digit slots and a small trophy beside it, drawn in mustard, charcoal, teal and cream" },
    ] },
  { key: "book", label: "book lovers", kw: [
      "book lover tee", "bookish gift tee", "reader gift shirt", "book nerd tee",
      "fantasy reader tee", "library lover tee", "bookworm gift tee", "book stack shirt",
      "reading gift tee", "book club shirt", "novel lover tee", "cozy reader tee", "book pile gift"],
    designs: [
      { s: "tbr-tower", p: "A precarious leaning tower of eleven books stacked upward, drawn in deep plum, mustard, sage green and cream", hook: "THE PILE IS LOAD-BEARING" },
      { s: "dragon-book", p: "A small dragon curled asleep on top of a closed book, drawn in emerald green, mustard, cream and charcoal", hook: "HOARDING CHAPTERS" },
      { s: "quill-ink", p: "A feather quill standing in an inkpot with a folded page beside it, drawn in charcoal, mustard, deep teal and cream" },
      { s: "candle-read", p: "A short candle burning beside an open book at night, drawn in mustard, deep plum, cream and charcoal", hook: "JUST TO THE CHAPTER BREAK" },
      { s: "map-fantasy", p: "A folded fantasy map with a compass rose and a mountain range drawn on it, drawn in warm tan, deep teal, mustard and cream" },
      { s: "bookmark-ribbon", p: "An open book with three ribbon bookmarks trailing from its spine, drawn in deep red, cream, sage green and charcoal" },
    ] },
  { key: "space", label: "space and sci-fi", kw: [
      "space lover tee", "astronomy gift", "sci fi lover tee", "star gazer shirt",
      "rocket gift tee", "planet lover tee", "cosmos gift shirt", "nasa style tee",
      "galaxy lover tee", "night sky gift", "telescope gift", "space nerd tee", "orbit lover tee"],
    designs: [
      { s: "ringed-planet", p: "A ringed planet with two small moons beside it, drawn in deep teal, mustard, coral and cream" },
      { s: "rocket-launch", p: "A slim rocket rising with three flame shapes beneath it, drawn in scarlet, cream, charcoal and mustard", hook: "GOING ANYWAY" },
      { s: "telescope-stand", p: "A refracting telescope on a tripod angled upward, drawn in charcoal, mustard, deep teal and cream" },
      { s: "moon-phases", p: "Seven moon phases arranged in a row at even spacing, drawn in cream, charcoal, mustard and deep teal" },
      { s: "satellite-orbit", p: "A boxy satellite with two solar panels and a dish, drawn in mustard, deep teal, cream and charcoal", hook: "STILL TRANSMITTING" },
      { s: "astronaut-float", p: "An astronaut floating with a tether curling behind, drawn in cream, coral, deep teal and charcoal", hook: "OUT OF OFFICE" },
    ] },
  { key: "crypt", label: "cryptid and paranormal", kw: [
      "cryptid lover tee", "bigfoot gift tee", "mothman lover tee", "paranormal gift",
      "ufo lover shirt", "cryptid fan gift", "believe gift tee", "sasquatch tee",
      "spooky nerd tee", "monster lover tee", "folklore gift tee", "cryptid club tee", "weird gift tee"],
    designs: [
      { s: "bigfoot-walk", p: "A shaggy bigfoot figure mid stride seen side on, drawn in warm brown, sage green, cream and charcoal", hook: "SEEN ONCE, NEVER AGAIN" },
      { s: "mothman-wings", p: "A moth-like winged figure with two round glowing eyes, drawn in charcoal, scarlet, cream and mustard" },
      { s: "ufo-beam", p: "A saucer with a widening beam below it and a small cow inside the beam, drawn in sage green, mustard, charcoal and cream", hook: "TAKE ME, I'M READY" },
      { s: "lake-monster", p: "Three humps of a lake creature breaking the water with a small head in front, drawn in deep teal, sage green, cream and mustard" },
      { s: "jackalope", p: "A jackrabbit with antlers standing alert, drawn in warm tan, cream, sage green and charcoal", hook: "TECHNICALLY REAL" },
      { s: "ouija-planchette", p: "A heart-shaped planchette with a round window seen from above, drawn in warm brown, cream, charcoal and mustard" },
    ] },
  { key: "puzzle", label: "board games and puzzles", kw: [
      "board game tee", "chess lover gift", "puzzle lover tee", "game night gift",
      "strategy game tee", "chess nerd shirt", "tabletop game tee", "puzzle nerd gift",
      "meeple lover tee", "card game gift", "quiz night tee", "brain game tee", "game shelf tee"],
    designs: [
      { s: "chess-knight", p: "A carved chess knight seen side on with its base showing, drawn in cream, charcoal, mustard and deep teal", hook: "ALWAYS THE ODD MOVE" },
      { s: "meeple-row", p: "Five wooden meeple figures standing in a row at different colours, drawn in coral, mustard, teal, cream and charcoal" },
      { s: "domino-fall", p: "Five dominoes mid fall in a diagonal line, drawn in cream, charcoal, coral and mustard", hook: "IT WAS ALWAYS GOING TO HAPPEN" },
      { s: "puzzle-piece", p: "Three interlocking jigsaw pieces with one slightly lifted, drawn in teal, mustard, coral and cream" },
      { s: "card-fan", p: "A fanned hand of five blank playing cards, drawn in cream, scarlet, charcoal and mustard" },
      { s: "hourglass-timer", p: "A wooden hourglass with sand mid fall, drawn in warm oak brown, mustard, cream and charcoal", hook: "THIRTY SECONDS LEFT" },
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
const report: { slug: string; ok: boolean; msg: string; when?: string }[] = [];

// Round-robin across niches, not niche by niche. Six anime shirts landing on one day and six coding
// shirts the next makes the shop look like it lurches; a day with one of each reads as a range.
// It also decides WHICH 42 of the 48 make the window — one from every niche rather than losing a
// whole niche off the end.
const FLAT: { n: N; d: D; i: number }[] = [];
for (let i = 0; i < Math.max(...NICHES.map((n) => n.designs.length)); i++) {
  for (const n of NICHES) if (n.designs[i]) FLAT.push({ n, d: n.designs[i], i });
}
const DAYS = 7;
const PLANNED = FLAT.slice(0, DAYS * PER_DAY);

{
  let idx = 0;
  for (const { n, d, i } of PLANNED) {
    const slug = `nerd-${n.key}-${d.s}-v1`;
    const when = new Date(START.getTime()
      + Math.floor(idx / PER_DAY) * 86400_000 + (idx % PER_DAY) * 3600_000);
    idx++;
    await c.query(`DELETE FROM products WHERE slug=$1 AND shop_id=$2`, [slug, SHOP]);
    try {
      const out = await draftProduct({
        slug, niche: n.label, technique: "dtf",
        title: titleFor(n.kw, i), description: AI_NOTE + BODY, tags: n.kw,
        hook: d.hook, design_prompt: `${d.p}, ${SPINE}`,
        scheduled_at: when.toISOString(),
      }, SHOP);
      if (!APPLY) {
        await c.query(`DELETE FROM schedule WHERE product_id=$1`, [out.id]);
        await c.query(`DELETE FROM products WHERE id=$1`, [out.id]);
      }
      report.push({ slug, ok: true, msg: `${out.title_len} krk${d.hook ? " · yazili" : ""}`,
                    when: when.toISOString().slice(0, 16) });
    } catch (e: any) {
      report.push({ slug, ok: false, msg: String(e.message).slice(0, 110) });
    }
  }
}

const bad = report.filter((r) => !r.ok);
for (const b of bad) console.log(`  RED  ${b.slug.padEnd(30)} ${b.msg}`);
const text = report.filter((r) => r.ok && r.msg.includes("yazili")).length;
console.log(`\n${report.length} tasarim · ${report.length - bad.length} gecti · ${bad.length} reddedildi · ${text} yazili`);
if (!bad.length) console.log(`ilk ${report[0].when} → son ${report[report.length - 1].when}`);
if (!APPLY) console.log("DRY RUN — --apply ile yaz.");
await c.end();
process.exit(bad.length ? 1 : 0);
