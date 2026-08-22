/**
 * The slogans, for the roughly sixty percent of MOTIFLY's first batch that reads better with one.
 *
 *   set -a; . ./.env; set +a; npx tsx scripts/motifly_hooks.mts [--apply]
 *
 * Wordless is no longer the default here — it is one of two options, and the operator's split is about
 * 60/40 in favour of type where the line earns its place (2026-08-22). "Earns its place" is the whole
 * instruction: a design that already says what it is gets nothing, and a line that could sit on any
 * shirt in the niche is worse than silence. Every one of these names something in ITS OWN picture.
 *
 * The 40% left bare are the ones that carry themselves: a luna moth on an open book, a monstera leaf,
 * a bike crank, a cat curled nose to tail. Adding a caption to those is decoration, not design.
 */
import { pool } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

/** slug suffix -> the line typeset under the artwork. Absent = deliberately wordless. */
const HOOKS: Record<string, string> = {
  // basketball — the court, not the league
  "hoops-outdoor-hoop-v1":     "THE COURT NEVER CLOSED",
  "hoops-sneaker-squeak-v1":   "LEFT IT ON THE FLOOR",
  "hoops-gym-bag-v1":          "BAG'S BEEN IN THE CAR SINCE MARCH",

  // sport
  "sport-running-shoes-v1":    "MILES BEFORE COFFEE",
  "sport-volleyball-net-v1":   "TOUCH THE TAPE",
  "sport-baseball-glove-v1":   "BROKEN IN, NEVER BROKEN",
  "sport-pickleball-paddle-v1":"DINK RESPONSIBLY",

  // book lover
  "bookish-stacked-spines-v1": "THE STACK IS THE PLAN",
  "bookish-open-window-v1":    "ONE MORE CHAPTER (LYING)",
  "bookish-cat-on-books-v1":   "MY BOOKMARK HAS OPINIONS",
  "bookish-reading-nook-v1":   "OCCUPIED UNTIL FURTHER NOTICE",

  // pets
  "petjob-dachshund-scarf-v1": "LONG DOG, LONGER SCARF",
  "petjob-corgi-loaf-v1":      "FULLY LOADED LOAF",
  "petjob-greyhound-curl-v1":  "BUILT FOR SPEED, USED FOR NAPS",
  "petjob-three-dogs-v1":      "THE WHOLE CREW",

  // botanical — the dark end, which is where this niche sells
  "botanic-foxglove-stem-v1":  "BEAUTIFUL. DO NOT EAT.",
  "botanic-mushroom-cluster-v1":"LOOK, DON'T LICK",
  "botanic-nightshade-sprig-v1":"PRETTY ENOUGH TO RISK IT",
  "botanic-fern-unfurl-v1":    "SLOWLY, THEN ALL AT ONCE",

  // parks — wildlife with right of way
  "parks-bison-stand-v1":      "GIVE HIM THE ROAD",
  "parks-black-bear-v1":       "HE WAS HERE FIRST",
  "parks-moose-water-v1":      "RIGHT OF WAY: HIS",

  // halloween
  "spooky-ghost-sheet-v1":     "LOW EFFORT, HIGH SPIRIT",
  "spooky-haunted-house-v1":   "ZERO STARS, WOULD HAUNT AGAIN",
  "spooky-skeleton-hand-v1":   "STILL REACHING FOR SNACKS",

  // craft
  "craft-yarn-basket-v1":      "THE STASH HAS A PLAN",
  "craft-knit-needles-v1":     "ONE MORE ROW (A LIE)",
  "craft-thread-spools-v1":    "SORTED BY COLOUR, NOT BY LOGIC",
  "craft-scissors-pins-v1":    "FABRIC SCISSORS. DO NOT TOUCH.",

  // coffee
  "coffee-pour-over-v1":       "SLOW ON PURPOSE",
  "coffee-espresso-cup-v1":    "SMALL CUP, BIG PLANS",
  "coffee-iced-latte-v1":      "ICED, EVEN IN JANUARY",
  "coffee-grinder-hand-v1":    "GROUND BY HAND, BARELY AWAKE",

  // cottagecore
  "cottage-toadstool-ring-v1": "MIND THE RING",
  "cottage-cottage-house-v1":  "SMALL HOUSE, BIG GARDEN",
  "cottage-hedgehog-berries-v1":"CARRYING SNACKS HOME",

  // cats
  "catlife-loaf-cat-v1":       "FRESHLY BAKED",
  "catlife-three-cats-v1":     "THE COMMITTEE",
  "catlife-cat-plant-v1":      "THE PLANT IS MINE NOW",
  "catlife-kitten-box-v1":     "IF IT FITS, IT'S MINE",

  // camping
  "camp-tent-pines-v1":        "HOME FOR THE WEEKEND",
  "camp-campfire-logs-v1":     "STAY UNTIL IT'S EMBERS",
  "camp-enamel-mug-v1":        "COFFEE TASTES BETTER OUT HERE",
};

const c = pool();
const all = (await c.query<{ id: number; slug: string; design_state: string | null }>(
  `SELECT id, slug, design_state FROM products WHERE shop_id = 9 ORDER BY id`)).rows;

const withText = all.filter((p) => HOOKS[p.slug]);
const bare = all.filter((p) => !HOOKS[p.slug]);
const tooLong = Object.entries(HOOKS).filter(([, h]) => h.length > 60);
const orphan = Object.keys(HOOKS).filter((k) => !all.some((p) => p.slug === k));

console.log(`${all.length} urun · ${withText.length} yazili (%${Math.round(100 * withText.length / all.length)}) · ${bare.length} yazisiz`);
if (tooLong.length) console.log("60 karakteri asan:", tooLong.map(([k]) => k).join(", "));
if (orphan.length) console.log("eslesmeyen slug:", orphan.join(", "));

if (APPLY && !tooLong.length && !orphan.length) {
  let redrawn = 0;
  for (const p of withText) {
    // A product already drawn was drawn WITHOUT room for type, so it goes back to redo rather than
    // having a line dropped onto a composition that never expected one.
    const redo = p.design_state === "ready" || p.design_state === "error";
    await c.query(
      `UPDATE products SET hook = $2,
              design_state = CASE WHEN $3 THEN 'redo' ELSE design_state END,
              print_file   = CASE WHEN $3 THEN NULL  ELSE print_file   END
        WHERE id = $1`, [p.id, HOOKS[p.slug], redo]);
    if (redo) { await c.query(`DELETE FROM product_images WHERE product_id=$1`, [p.id]); redrawn++; }
  }
  console.log(`yazildi · ${redrawn} tanesi yeniden cizime alindi`);
} else if (!APPLY) {
  console.log("\nornekler:");
  for (const p of withText.slice(0, 6)) console.log(`  ${p.slug.padEnd(28)} "${HOOKS[p.slug]}"`);
  console.log("\nDRY RUN — --apply ile yaz.");
}
await c.end(); process.exit(0);
