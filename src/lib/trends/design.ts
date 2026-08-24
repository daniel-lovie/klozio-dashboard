/**
 * From a trend to something drawable.
 *
 * The old version had six categories and a fixed picture for each, which had two consequences worth
 * stating plainly. First, a hard ceiling: with the niche locked per shop forever, six categories times
 * three shops was eighteen products and then permanent silence. Second, and worse, the trend barely
 * touched the design — "Perseids trending" drew the same ringed moon that any astronomy day drew, so
 * the product had no more to do with the news than a random pick would have.
 *
 * Both are addressed here. The category list is wider, each category carries several drawings, and the
 * SUBJECT is written from the actual trend by the local model — constrained hard, validated, and with
 * the template as the fallback whenever the model is busy, slow or off-brief.
 *
 * What is never taken from the trend is its subject matter: no person, no character, no mark, no logo.
 * The model is told this and the output is checked for it, because the prompt is not the last line of
 * defence — draft-product.ts validates again, and the plate check looks at the drawing itself.
 */
import { askLocalJSON } from "@/lib/agent/ollama";
import type { Judged } from "./classify";

export type Category = {
  test: RegExp;
  niche: string;
  tags: string[];               // exactly 13, each ≤20 chars, multi-word
  palettes: string[];
  draws: string[];
};

export const CATEGORIES: Category[] = [
  { test: /eclipse|moon|lunar|meteor|perseid|aurora|comet|solstice|equinox|night sky|stargaz|planet|nasa|telescope/i,
    niche: "astronomy",
    tags: ["astronomy lover tee", "star gazer gift", "moon lover shirt", "night sky tee",
      "space nerd gift", "celestial gift tee", "eclipse lover tee", "cosmos gift shirt",
      "lunar lover tee", "stargazing gift", "sky watcher tee", "moon phase gift", "astro fan tee"],
    palettes: ["deep indigo, cream, mustard and dusty rose", "charcoal, warm cream, burnt orange and pale blue"],
    draws: ["a large ringed moon with three small stars scattered around it",
            "a row of five moon phases above a low mountain ridge",
            "a bright comet with a long tail crossing four small stars"] },

  { test: /hurricane|storm|blizzard|snow|frost|heat wave|drought|wildfire|rain|thunder|forecast/i,
    niche: "weather humour",
    tags: ["weather lover tee", "storm chaser gift", "rainy day shirt", "cloud lover tee",
      "weather nerd gift", "forecast humor tee", "thunder lover tee", "cozy rain shirt",
      "storm humor gift", "weather fan tee", "rain lover gift", "grey sky tee", "wet weather tee"],
    palettes: ["charcoal, mustard, teal and cream", "burnt orange, cream, deep teal and soft grey"],
    draws: ["a heavy rain cloud with three lightning shapes below it",
            "a wide sun half hidden behind two flat cloud banks",
            "an open umbrella with six falling raindrops around it"] },

  { test: /recipe|sourdough|baking|bread|pizza|coffee|matcha|barbecue|harvest|chef|cooking|brunch/i,
    niche: "food humour",
    tags: ["food lover tee", "baking gift shirt", "home cook gift", "kitchen humor tee",
      "bread lover tee", "foodie gift shirt", "cooking lover tee", "baker gift tee",
      "sourdough lover", "kitchen lover tee", "recipe lover gift", "comfort food tee", "food humor gift"],
    palettes: ["warm tan, terracotta, sage green and cream", "deep brown, cream, mustard and dusty rose"],
    draws: ["a round loaf of bread with a scored cross on top beside a jar",
            "a tall coffee cup with three steam curls rising from it",
            "a stacked pair of pancakes with a pat of butter on top"] },

  { test: /garden|planting|seed|bloom|wildflower|pollinator|bee\b|houseplant|greenhouse/i,
    niche: "garden humour",
    tags: ["garden lover tee", "plant parent gift", "gardening gift tee", "green thumb shirt",
      "seedling lover tee", "garden humor tee", "plant lover gift", "grow your own",
      "potting shed tee", "gardener gift tee", "spring garden tee", "veg patch gift", "garden life tee"],
    palettes: ["terracotta, sage green, mustard and cream", "sage green, cream, warm tan and soft coral"],
    draws: ["a terracotta pot with three tall seedlings and one open bloom",
            "a watering can tipped forward with four falling drops beneath it",
            "a row of three potted plants of different heights on a shelf"] },

  { test: /whale|migration|bird|owl|fox|bear|deer|turtle|meerkat|otter|wildlife|shark|wolf|bison/i,
    niche: "wildlife",
    tags: ["wildlife lover tee", "animal lover gift", "nature lover tee", "wild animal shirt",
      "conservation gift", "bird lover gift", "woodland gift tee", "animal fan tee",
      "wildlife fan gift", "outdoor lover tee", "nature nerd tee", "creature lover", "wild life gift"],
    palettes: ["warm brown, sage green, cream and charcoal", "deep teal, warm cream, rust and soft olive"],
    draws: ["a single wild animal seen side on with its head turned to the viewer",
            "a wild animal curled asleep inside a ring of leaves",
            "a standing wild animal framed by three tall pine shapes"] },

  { test: /back to school|semester|exam|graduation|teacher|classroom|kindergarten/i,
    niche: "school humour",
    tags: ["teacher gift tee", "school humor shirt", "classroom gift tee", "educator gift",
      "back to school tee", "study life shirt", "student gift tee", "school year tee",
      "teacher life gift", "learning gift tee", "classroom humor", "school days tee", "teach love tee"],
    palettes: ["mustard, deep teal, coral and cream", "cream, warm tan, deep navy and soft coral"],
    draws: ["a stack of three books with a pencil resting across the top",
            "an open notebook with a coffee cup set on its corner",
            "a row of four sharpened pencils of different lengths"] },

  { test: /fishing|angler|bass\b|trout|kayak|canoe|lake|river|boating/i,
    niche: "fishing",
    tags: ["fishing lover tee", "angler gift shirt", "fisherman gift tee", "lake life shirt",
      "fishing humor tee", "bass fishing gift", "fly fishing tee", "weekend angler",
      "fishing dad gift", "river life tee", "catch and release", "tackle box gift", "fish lover tee"],
    palettes: ["deep teal, cream, rust and warm grey", "navy, mustard, sage green and cream"],
    draws: ["a single fish seen side on above two curved water lines",
            "a bent fishing rod with a taut line and three ripple rings",
            "a tackle lure with three small hooks below it"] },

  { test: /camping|hiking|trail|backpack|national park|campfire|mountain|summit|tent/i,
    niche: "outdoors",
    tags: ["hiking lover tee", "camping gift shirt", "trail lover tee", "outdoor gift tee",
      "mountain lover tee", "campfire gift tee", "national park tee", "wanderer gift tee",
      "backpacker gift", "adventure gift tee", "trail life shirt", "camp life tee", "hike more tee"],
    palettes: ["forest green, cream, burnt orange and charcoal", "rust, sage green, warm cream and navy"],
    draws: ["three mountain peaks of different heights with a sun behind them",
            "a small tent with two pine shapes beside it",
            "a campfire with four flame shapes above three logs"] },

  { test: /\bdog\b|puppy|golden retriever|labrador|rescue dog|shelter dog/i,
    niche: "dog lovers",
    tags: ["dog lover tee", "dog mom gift tee", "dog dad gift tee", "rescue dog shirt",
      "puppy lover gift", "dog humor tee", "fur parent gift", "dog owner tee",
      "adopt dont shop", "dog walker gift", "good boy tee", "dog people tee", "paw lover tee"],
    palettes: ["warm tan, charcoal, mustard and cream", "dusty rose, cream, deep brown and sage"],
    draws: ["a sitting dog seen side on with its ears raised",
            "a single paw print with three small hearts around it",
            "a dog bowl with a bone resting against its side"] },

  { test: /\bcat\b|kitten|feline|tabby/i,
    niche: "cat lovers",
    tags: ["cat lover tee", "cat mom gift tee", "cat dad gift tee", "kitten lover tee",
      "cat humor shirt", "crazy cat gift", "rescue cat tee", "feline lover tee",
      "cat owner gift", "cat people tee", "purr lover tee", "cat nap shirt", "whisker gift tee"],
    palettes: ["charcoal, mustard, dusty rose and cream", "deep teal, cream, rust and warm grey"],
    draws: ["a curled sleeping cat drawn as one continuous shape",
            "a sitting cat seen from behind with its tail curved to one side",
            "a cat face with closed eyes and three whiskers per side"] },

  { test: /book|reading|library|novel|author|literature|bookstore/i,
    niche: "book lovers",
    tags: ["book lover tee", "bookish gift tee", "reader gift shirt", "library lover tee",
      "book nerd gift", "reading lover tee", "bookworm gift tee", "novel lover tee",
      "just one chapter", "book club gift", "story lover tee", "shelf life tee", "read more tee"],
    palettes: ["deep navy, cream, mustard and rust", "warm tan, sage green, charcoal and cream"],
    draws: ["a stack of five books with a small plant on top",
            "an open book with three small stars rising from its pages",
            "a row of six book spines of different heights"] },

  { test: /running|marathon|5k|10k|cycling|gym|workout|yoga|fitness|pilates/i,
    niche: "fitness humour",
    tags: ["runner gift tee", "running lover tee", "marathon gift tee", "gym humor shirt",
      "workout gift tee", "yoga lover tee", "cycling gift tee", "fitness gift tee",
      "run more tee", "training day tee", "sweat life shirt", "cardio humor tee", "move more tee"],
    palettes: ["charcoal, coral, cream and teal", "navy, mustard, warm grey and cream"],
    draws: ["a pair of running shoes seen side on with three motion lines behind",
            "a water bottle with two small motion marks beside it",
            "a bicycle seen side on drawn in flat shapes"] },

  { test: /coffee|espresso|latte|barista|cafe/i,
    niche: "coffee humour",
    tags: ["coffee lover tee", "caffeine gift tee", "espresso lover tee", "coffee humor tee",
      "barista gift shirt", "morning coffee tee", "coffee addict gift", "latte lover tee",
      "but first coffee", "coffee people tee", "brew lover tee", "coffee mom gift", "bean lover tee"],
    palettes: ["deep brown, cream, mustard and dusty rose", "charcoal, warm tan, rust and cream"],
    draws: ["a wide coffee cup on a saucer with two steam curls",
            "a stovetop coffee pot seen side on in flat shapes",
            "three coffee beans arranged above a small cup"] },

  { test: /music|guitar|vinyl|record player|concert|festival|drum|piano/i,
    niche: "music lovers",
    tags: ["music lover tee", "vinyl lover tee", "guitar gift shirt", "record lover tee",
      "music nerd gift", "band shirt gift", "melody lover tee", "vinyl nerd tee",
      "play louder tee", "music fan gift", "sound lover tee", "studio life tee", "groove lover tee"],
    palettes: ["charcoal, mustard, coral and cream", "deep navy, rust, warm cream and sage"],
    draws: ["a vinyl record with three curved sound lines beside it",
            "an acoustic guitar seen from the front in flat shapes",
            "a cassette tape drawn in four flat colour blocks"] },
];

export function categoryFor(t: Judged): Category | null {
  const blob = [t.term, ...t.headlines, ...t.breakdown, ...t.categories].join(" ");
  return CATEGORIES.find((c) => c.test.test(blob)) ?? null;
}

const SUBJECT_BRIEF =
  "You name the OBJECTS in a flat vector t-shirt graphic. Rules, all hard:\n"
  + "- 8 to 18 words, one noun phrase, no sentence, no verb like 'we', 'create' or 'design'.\n"
  + "- Objects and shapes only. Never a person, face, character, team, logo, brand, jersey or mascot.\n"
  + "- Never any text, letters, words, numbers or signage in the picture.\n"
  + "- Exact counts for repeated elements: 'three stars', never 'some stars'.\n"
  + "- No background, no scene, no gradient, no shading. One centred subject.\n"
  + "Example for a meteor shower: four meteors with long tails falling past two small stars";

const SUBJECT_SCHEMA = {
  type: "object",
  properties: { subject: { type: "string" } },
  required: ["subject"],
} as const;

/** Things a drawing may never be about, and phrases that mean the model narrated instead of answering. */
const REJECT =
  /\b(text|word|words|letter|lettering|typography|font|slogan|caption|sign|logo|brand|emblem|jersey|mascot|celebrity|portrait|likeness|person|man|woman|child|player|team|we are|here is|subject line|t-?shirt|graphic|design|trend|prompt)\b/i;

/**
 * The drawing, written from this trend when the model can, from the template when it cannot.
 *
 * The reply is forced through a JSON schema. Left to write prose, the model answered "We are creating a
 * subject line for a flat vector t-shirt graphic based on the Perseid meteor shower trend" — inside the
 * word limit, no forbidden nouns, and completely unusable as a drawing instruction. A schema makes the
 * field the answer instead of the preamble.
 *
 * Off-brief output is discarded rather than repaired: the template is a known-good phrase that has
 * already produced accepted designs, so a doubtful rewrite is never worth taking over it.
 */
export async function subjectFor(
  t: Judged, cat: Category, variant: number, opts: { useModel?: boolean } = {},
): Promise<{ subject: string; from: "model" | "template" }> {
  const template = cat.draws[variant % cat.draws.length];
  if (opts.useModel === false) return { subject: template, from: "template" };

  const ctx = [t.term, ...t.headlines.slice(0, 2), ...t.breakdown.slice(0, 4)].join(" | ");
  const got = await askLocalJSON<{ subject: string }>(
    `Trend: ${ctx}\nName the objects to draw for a ${cat.niche} design this trend would make people want.`,
    SUBJECT_SCHEMA as unknown as object, { system: SUBJECT_BRIEF, maxTokens: 120 });

  const line = String(got?.subject ?? "").trim().replace(/^["'\-•\s]+|["'.]+$/g, "");
  const words = line ? line.split(/\s+/).length : 0;
  if (!line || words < 6 || words > 24 || REJECT.test(line)) {
    return { subject: template, from: "template" };
  }
  return { subject: line, from: "model" };
}

/** The finished prompt. The palette is ours, never the model's — draft-product.ts requires one. */
export function promptFrom(subject: string, cat: Category, variant: number): string {
  const palette = cat.palettes[variant % cat.palettes.length];
  return `${subject}, drawn in ${palette}, thick confident outlines and flat colour blocks, `
       + "no gradients, no shading, bold high-contrast illustration, the subject fills the frame, "
       + "centred composition sized for a chest print, transparent background.";
}
