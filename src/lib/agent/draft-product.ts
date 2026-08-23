/**
 * Create ONE product row, complete or not at all.
 *
 * What this replaces, and why it is a tool rather than a prompt rule: asked for five products across
 * five niches, the agent wrote five rows by hand with an INSERT carrying a dozen columns, and it filled
 * the ones it could see the shape of — title, tags, price — while `design_prompt`, `hook` and
 * `design_model` came out empty. Nothing failed. The rows sat at content_status='approved' looking
 * finished, and only the producer's own guard (a DTF row with no hook is refused) kept them from
 * becoming five wordless designs. The prompt already said all three were mandatory, in capitals. The
 * lesson is not that the model needs telling again; it is that a hand-written multi-column INSERT is
 * the wrong instrument, because it fails silently and partially. This one takes named fields, refuses
 * the row outright if any of them is missing or malformed, and says exactly what was wrong.
 *
 * Every check below is a rule that already exists somewhere — CLAUDE.md, the listing standards, the
 * producer's claim query — enforced here at the only moment where saying "no" is still cheap.
 */
import { pool, one } from "../db";

export const DEFAULT_COLORWAYS = [
  "Black", "Pepper", "Espresso", "Midnight", "Graphite", "Blue Jean", "Denim",
  "Blue Spruce", "Moss", "Ivory", "Butter", "Yam",
];
export const DEFAULT_SIZES = ["S", "M", "L", "XL", "2X", "3X", "4X", "Digital PNG"];

/**
 * Commercial rules are PER SHOP, and they were Klozio's constants pretending to be the shop's.
 *
 * Klozio runs a standing 30% sale and sells at $24.99, so the anchor is 3570. MOTIFLY runs 50% and
 * sells at $23.99, so its anchor is 4798 — put Klozio's number on a MOTIFLY product and the buyer pays
 * $17.85 instead, which is under the margin floor and invisible until someone reads a payout.
 *
 * These now live in shops.settings and this is the fallback for a shop that has none yet.
 */
const FALLBACK = { sale_pct: 30, buyer_price_usd: 24.99, print_inches: 10.0 };

type ShopRules = { salePct: number; buyerPrice: number; anchorCents: number; printInches: number;
                   techniques: string[]; digitalPng: boolean };

async function shopRules(shopId: number): Promise<ShopRules> {
  const row = await one<{ settings: any }>(`SELECT settings FROM shops WHERE id=$1`, [shopId]);
  const st = row?.settings ?? {};
  const salePct = Number(st.sale_pct ?? FALLBACK.sale_pct);
  const buyerPrice = Number(st.buyer_price_usd ?? FALLBACK.buyer_price_usd);
  return {
    salePct, buyerPrice,
    anchorCents: Math.round((buyerPrice / (1 - salePct / 100)) * 100),
    printInches: Number(st.print_inches ?? FALLBACK.print_inches),
    digitalPng: st.digital_png !== false,
    techniques: Array.isArray(st.techniques) && st.techniques.length ? st.techniques : ["dtf", "embroidery"],
  };
}

/** Producer cost and label, from pod-fulfillment/references/cost-model.md (real numbers, 2026-07-31). */
const POD_COST_CENTS = 950;
const LABEL_COST_CENTS = 550;

const TAXONOMY_TSHIRT = 482;
const BLANK = "Comfort Colors 1717";

export type DraftInput = {
  slug?: string; niche?: string; technique?: string; title?: string; description?: string;
  tags?: string[]; hook?: string; design_prompt?: string; design_model?: string;
  price_cents?: number; personalised?: boolean; hero_colorway?: string; scheduled_at?: string;
  colorways?: string[]; sizes?: string[];
};

/** Words that would put someone else's mark in our artwork. Cheap, and the only automatable half of
 *  the IP check — the visual pass on the finished design is still the real one. */
const IP_WORDS = [
  "nike", "adidas", "disney", "marvel", "pokemon", "pokémon", "star wars", "harry potter",
  "nfl", "nba", "mlb", "coca-cola", "coca cola", "supreme", "gucci", "louis vuitton",
  "taylor swift", "mickey", "batman", "superman", "spider-man", "spiderman", "barbie",
];

/**
 * Colour words, for the one standing directive nothing enforced.
 *
 * "Designs should be colourful and eye-catching. DTF prints full colour natively; the constraint is
 * flatness, not palette size. Minimal one-colour work is a style, not the default." A prompt that
 * names no colour at all leaves the palette to the model, and the model's default is the muted,
 * washed-out look that directive was written against — measured on the first local batch, where a
 * prompt with no palette produced a beige dog on a beige cushion.
 *
 * Two named colours is a low bar deliberately: this rejects the prompt that forgot to decide, not the
 * prompt that decided on restraint. A design that genuinely wants one colour says so and passes.
 */
const COLOUR_WORDS = [
  "red", "crimson", "scarlet", "rust", "terracotta", "orange", "amber", "gold", "golden", "mustard",
  "yellow", "cream", "ivory", "sand", "tan", "brown", "chocolate", "olive", "sage", "green", "pine",
  "emerald", "teal", "turquoise", "aqua", "blue", "navy", "indigo", "cobalt", "purple", "violet",
  "plum", "lavender", "magenta", "pink", "blush", "coral", "peach", "charcoal", "grey", "gray",
  "black", "white", "silver", "bronze", "copper", "burgundy", "maroon", "mint", "lilac", "ochre",
];
const MONOCHROME = /monochrome|one[- ]colou?r|single colou?r|two[- ]tone|black and white/i;

/**
 * Compositions that produce a backing plate.
 *
 * Diffusion models drift toward badge and sticker layouts whenever a t-shirt graphic is described, and
 * asking for one outright guarantees it: a solid shape behind the subject that prints as a sticker
 * slapped on the garment and looks wrong on every colourway but the one it was previewed against.
 * `dnd-c1-v1` shipped a dragon on a dusty-pink disc on 2026-08-21. The negative prompt now fights this
 * on every generation; a prompt that ASKS for it fights back, so it is refused here.
 */
const PLATE_WORDS = [
  "badge", "emblem", "sticker", "die-cut", "circular background", "circle background",
  "inside a circle", "in a circle", "backing plate", "solid background", "panel behind",
  "framed", "in a frame", "banner", "plaque", "roundel", "crest",
];

/**
 * Asking for a background at all.
 *
 * The print is cut out and laid on cotton, so there IS no background — and a model told to put the
 * subject on "a plain white background" cannot paint white onto transparency, so it paints a coloured
 * panel instead. botanical-c2-v1 came out with a solid pink slab behind one plant on 2026-08-21, from
 * a prompt ending "...palette on plain white background". The pipeline strips this before generating
 * as a second line of defence; refusing it here means the concept never carries the contradiction.
 */
const BACKGROUND_WORDS = [
  "white background", "plain background", "solid background", "flat background",
  "light background", "neutral background", "clean background", "simple background",
  "coloured background", "colored background", "background colour", "background color",
  "on a background", "against a background", "backdrop",
];

/** Phrases that ask an image model to draw letters. Rule 5: all type is hand-set in a licensed font. */
const TEXT_IN_ART = [
  "the text", "text reads", "the word", "the words", "written", "lettering", "typography",
  "says ", "caption", "slogan on", "word art",
];

function fail(msg: string): never {
  throw new Error(msg);
}

/**
 * Characters Etsy allows at most ONCE in a title.
 *
 * Not a style rule — the API rejects the listing outright. `dnd-c1-v1` failed to publish on 2026-08-21
 * with `too_many_invalid_characters: "& can only be use once"` because its title said "D&D" twice, and
 * it failed at PUBLISH time: after the design was drawn, the images composited and the launch slot
 * approved. Every one of those steps is expensive and none of them could have known. It costs nothing
 * to check the string the moment it is written.
 */
const ETSY_ONCE_ONLY = ["&", "%", ":"];

/**
 * Words that belong to us, not to a buyer.
 *
 * The same title carried "No Text" and "DTF Print" — the operator's own instructions, echoed back into
 * the shop window. A buyer searching for a dragon shirt does not type "no text"; it spends characters
 * from a 140-character budget saying something about our process instead of about the product.
 */
const INTERNAL_WORDS = [
  "no text", "wordless", "dtf print", "dtf", "print file", "design file", "mockup", "png",
  "300 dpi", "transparent background", "t-shirt design", "tshirt design",
];

const TITLE_MIN = 125;
const TITLE_MAX = 140;

/**
 * Is there a title here to repair, or only a stub?
 *
 * Length was the first answer and it was wrong. An Etsy title is comma-separated keyword phrases, and
 * three of those can easily land at 80 characters — "Big Sis Tee, Custom Sibling Names Shirt Comfort
 * Colors Shirt, Big Sister Reveal" is a real title that a length floor of 90 threw out. Structure is
 * what actually separates the two cases: a stub is one phrase someone started, a title is several.
 *
 * The floor stays as a second route, for the rare long title written without commas. Together they
 * still refuse the fifteen-character stub that padding would turn into keyword salad.
 */
function isRepairableTitle(t: string): boolean {
  // Phrases, not commas: a two-phrase title at 76 characters ("Halloween Trip Shirt, Funny
  // Personalized Headstone Tee") is a real title with room left, and a comma count of two threw it
  // out. The length floor beside it is what keeps a short fragment with one comma from being padded
  // into keyword salad — the two conditions have to hold together.
  const phrases = t.split(",").map((x) => x.trim()).filter((x) => x.length > 3);
  return (phrases.length >= 2 && t.length >= 50) || t.length >= 90;
}

/** Bring a short title into the operating band using the product's own tags; refuse an over-long one. */
function checkTitleText(t: string): void {
  for (const ch of ETSY_ONCE_ONLY) {
    const n = t.split(ch).length - 1;
    if (n > 1) {
      fail(`title uses "${ch}" ${n} times — Etsy allows it once and rejects the listing otherwise `
         + `(too_many_invalid_characters). Rewrite so only one "${ch}" remains; for example spell the `
         + "second one out.");
    }
  }
  const lower = t.toLowerCase();
  const leaked = INTERNAL_WORDS.filter((w) => lower.includes(w));
  if (leaked.length) {
    fail(`title contains our own process words (${leaked.join(", ")}). The title is shop-window copy: `
       + "it says what the buyer is getting, not how we make it. Spend those characters on keywords "
       + "someone would actually search for.");
  }
}

/**
 * Exported so the bulk repair uses the SAME rules as the write path.
 *
 * Thirty-four scheduled products carried titles of 76-95 characters, written before the band was
 * enforced. Re-implementing the padding in a one-off script is how two definitions of "a correct
 * title" start drifting apart; there is one, and it lives here.
 */
export function fitTitle(raw: string, tags: string[]): { title: string; titleNote: string | null } {
  checkTitleText(raw);
  if (raw.length > TITLE_MAX) {
    fail(`title is ${raw.length} characters, ${raw.length - TITLE_MAX} over Etsy's ${TITLE_MAX} limit. `
       + "Remove a phrase — which keyword to drop is your call, so the tool will not cut it for you.");
  }
  if (raw.length >= TITLE_MIN) return { title: raw, titleNote: null };
  // Repair a title, do not write one. Padding a fifteen-character stub with seven tags produces a
  // keyword salad that satisfies the rule and sells nothing — the test caught exactly that. Below this
  // floor the title has not been written yet, and no amount of appending changes that.
  if (!isRepairableTitle(raw)) {
    fail(`title is only ${raw.length} characters and is a single phrase. Write a real title first — `
       + `comma-separated keyword phrases, primary keyword unbroken in the first 40 characters, `
       + `${TITLE_MIN}-${TITLE_MAX} total. The tool will close a gap with your tags, but it will not `
       + "invent the title for you.");
  }

  const titleCase = (t: string) => t.replace(/\b\w/g, (m) => m.toUpperCase());
  const used = raw.toLowerCase();
  let out = raw;
  const added: string[] = [];
  // Nearest fit first, so one good tag lands mid-band instead of three short ones overshooting.
  const pool = tags.filter((t) => !used.includes(t.toLowerCase()))
                   .sort((a, b) => Math.abs(132 - (raw.length + a.length + 2))
                                 - Math.abs(132 - (raw.length + b.length + 2)));
  for (const t of pool) {
    if (out.length >= TITLE_MIN) break;
    const next = `${out}, ${titleCase(t)}`;
    if (next.length <= TITLE_MAX) { out = next; added.push(titleCase(t)); }
  }
  // Padding pulls text in from the tags, so the rules have to hold for the RESULT, not just the input.
  checkTitleText(out);
  if (out.length < TITLE_MIN) {
    fail(`title is ${out.length} characters and the tags could not close the gap to ${TITLE_MIN}. `
       + `Add at least ${TITLE_MIN - out.length} more characters of real keywords.`);
  }
  return { title: out, titleNote: added.length ? `${raw.length} -> ${out.length} chars, appended: ${added.join(", ")}` : null };
}

export async function draftProduct(input: DraftInput, shopId: number) {
  const slug = String(input.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    fail("invalid slug: lowercase letters, digits and hyphens. Pattern '{line}-c{n}-v1' (e.g. pet-c1-v1).");
  }
  const rules = await shopRules(shopId);

  const technique = String(input.technique ?? "dtf").trim().toLowerCase();
  if (technique !== "dtf" && technique !== "embroidery") fail("technique must be 'dtf' or 'embroidery'.");
  if (!rules.techniques.includes(technique)) {
    fail(`this shop does not sell ${technique} yet — it sells ${rules.techniques.join(", ")}. `
       + "Change shops.settings.techniques first if that is wrong.");
  }

  const niche = String(input.niche ?? "").trim();
  if (niche.length < 3) fail("niche is empty — name the buyer audience in a few words.");

  const rawTitle = String(input.title ?? "").trim();

  const description = String(input.description ?? "").trim();
  if (description.length < 200) fail("description is too short (200 characters minimum).");
  // Rule 4: the disclosure is a publish gate and it has to be high in the description, not buried.
  if (!/\bAI\b|yapay zeka|AI image|AI tools/i.test(description.slice(0, 600))) {
    fail("no AI disclosure near the top of the description. Etsy has required a generative-AI "
       + "disclosure since 14 Jan 2026 and burying it carries a heavy penalty. Put a clear sentence "
       + "in the first paragraph.");
  }

  const tags = (input.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (tags.length !== 13) fail(`tags must be exactly 13, got ${tags.length}.`);
  const tooLong = tags.filter((t) => t.length > 20);
  if (tooLong.length) fail(`tags over 20 characters: ${tooLong.join(", ")}`);
  // A single-word tag competes with the whole marketplace and matches almost nothing a buyer types.
  // The five rows written by hand on 2026-08-19 had thirteen of them ("pet", "dog", "cat").
  const single = tags.filter((t) => !/\s/.test(t));
  if (single.length) fail(`single-word tags are not accepted (they must be multi-word): ${single.join(", ")}`);
  if (new Set(tags.map((t) => t.toLowerCase())).size !== 13) fail("duplicate tags.");

  // Title length is arithmetic, and the model cannot do arithmetic on its own output.
  //
  // Asked for two anime products, the agent called this tool seven times and six of those calls died on
  // the same rule — 123, 145, 123, 144, 115 characters — until the turn's time budget ran out with one
  // product written instead of two. Rejecting was correct and useless: it sent the model back to guess
  // a length it has no way to measure, and it guessed wrong five more times.
  //
  // So the tool closes the gap itself, and only in the direction that is safe. Too SHORT is padded with
  // the product's own tags in title case — the model's keywords, not invented ones — until the band is
  // reached. Too LONG is still refused, because trimming an SEO title means choosing which keyword to
  // throw away, and that is the model's decision, not a formatting step.
  const { title, titleNote } = fitTitle(rawTitle, tags);

  // WORDLESS BY DEFAULT (operator instruction, 2026-08-20). The hook used to be required on DTF, and a
  // required field is exactly what makes a model invent one: asked for an anime design it produced a
  // portrait captioned "CHERRY ANIME", which means nothing and reads as a template. Words go on a shirt
  // when the operator asks for words. Leave this empty otherwise — the design ships as artwork alone.
  const hook = String(input.hook ?? "").trim();
  if (hook.length > 60) {
    fail(`hook is ${hook.length} characters — keep it under 60 or it will not fit the design.`);
  }

  const designPrompt = String(input.design_prompt ?? "").trim();
  if (designPrompt.length < 120) {
    fail(`design_prompt is ${designPrompt.length} characters — 120 minimum. Describe what to draw: `
       + "subject, composition, style, colour palette, background. Left empty the product is never drawn.");
  }
  const askedForText = TEXT_IN_ART.filter((w) => designPrompt.toLowerCase().includes(w));
  if (askedForText.length) {
    fail(`design_prompt asks the image model for TEXT ("${askedForText[0]}"). Rule 5: type is never `
       + "drawn by AI, it is hand-set in a licensed font, because models return malformed glyphs. Put "
       + "the slogan in the hook field and take the request for words out of the prompt.");
  }
  const lower = designPrompt.toLowerCase();
  const named = COLOUR_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
  if (named.length < 2 && !MONOCHROME.test(designPrompt)) {
    fail(`design_prompt names no palette (${named.length} colour words found). Designs are meant to be `
       + "colourful and eye-catching — DTF prints full colour natively, the constraint is flatness, not "
       + "palette size. Name at least two colours (e.g. 'warm rust, deep olive and mustard'). If you "
       + "want one colour on purpose, say 'monochrome' or 'one-colour' and it passes.");
  }

  const bg = BACKGROUND_WORDS.filter((w) => lower.includes(w));
  if (bg.length) {
    fail(`design_prompt asks for a background ("${bg[0]}"). The artwork is cut out and printed onto `
       + "cotton, so there is no background to paint — and a model told to paint a white one cannot "
       + "paint white onto transparency, so it paints a coloured panel instead. Say 'transparent "
       + "background' or describe the subject alone.");
  }

  const plate = PLATE_WORDS.filter((w) => lower.includes(w));
  if (plate.length) {
    fail(`design_prompt asks for a badge-style composition ("${plate[0]}"). That draws a solid shape `
       + "behind the subject, which prints as a sticker on the shirt and looks wrong on every colourway "
       + "but the previewed one. Describe the subject itself against a transparent background — no "
       + "disc, panel, frame or banner behind it.");
  }

  // Word boundaries, not substrings. "sunflower" contains "nfl" and was refused as a league mark, which
  // is the guard blocking legitimate work — the failure mode that makes people switch a guard off.
  // Multi-word entries keep plain matching: a phrase already has its own boundaries.
  const haystack = `${designPrompt} ${title} ${hook}`.toLowerCase();
  const ip = IP_WORDS.filter((w) => w.includes(" ")
    ? haystack.includes(w)
    : new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack));
  if (ip.length) fail(`a brand or character name appears: ${ip.join(", ")}. Nothing but original work is drawn.`);

  const priceCents = Math.round(Number(input.price_cents ?? rules.anchorCents));
  // What the buyer actually pays, through THIS shop's sale — 30% at Klozio, 50% at MOTIFLY.
  const buyer = (priceCents * (1 - rules.salePct / 100)) / 100;
  if (!Number.isFinite(priceCents) || buyer < 18 || buyer > 32) {
    fail(`price_cents ${priceCents} -> $${buyer.toFixed(2)} to the buyer after this shop's `
       + `${rules.salePct}% sale. price_cents is the ANCHOR, never the paid price; what the buyer pays `
       + `must land in the 18-32 band (this shop's default ${rules.anchorCents} = `
       + `$${rules.buyerPrice.toFixed(2)}).`);
  }

  const designModel = String(input.design_model ?? "gpt_image_2").trim() || "gpt_image_2";
  const colorways = input.colorways?.length ? input.colorways : DEFAULT_COLORWAYS;
  // The Digital PNG option rides on the sizes array, so whether a shop sells the file is decided by
  // whether the row carries it. It was arriving only because it happens to sit in DEFAULT_SIZES, which
  // makes "every product gets one" true by accident and false the moment somebody passes sizes
  // explicitly. The shop's setting decides now, in both directions.
  let sizes = input.sizes?.length ? [...input.sizes] : [...DEFAULT_SIZES];
  const hasDigital = sizes.some((z) => String(z).trim().toLowerCase() === "digital png");
  if (rules.digitalPng && !hasDigital) sizes.push("Digital PNG");
  if (!rules.digitalPng && hasDigital) {
    sizes = sizes.filter((z) => String(z).trim().toLowerCase() !== "digital png");
  }
  const hero = String(input.hero_colorway ?? "Pepper").trim();

  let scheduledAt: Date | null = null;
  if (input.scheduled_at) {
    scheduledAt = new Date(input.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) fail(`could not read scheduled_at: ${input.scheduled_at}`);
    if (scheduledAt.getTime() < Date.now() - 60_000) fail("scheduled_at is in the past — give a future date.");
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query(`SELECT id FROM products WHERE slug = $1 AND shop_id = $2`, [slug, shopId]);
    if (dup.rowCount) fail(`slug '${slug}' already exists in this shop (id ${dup.rows[0].id}).`);

    const ins = await client.query(
      `INSERT INTO products
         (shop_id, slug, niche, technique, title, description, tags, hook, design_prompt, design_model,
          price_cents, quantity, taxonomy_id, blank, materials, colorways, sizes, hero_colorway,
          pod_cost_cents, label_cost_cents, personalised, content_status, fulfillment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,999,$12,$13,ARRAY['cotton'],$14,$15,$16,$17,$18,$19,'approved','printinly')
       RETURNING id`,
      [shopId, slug, niche, technique, title, description, tags, hook, designPrompt, designModel,
       priceCents, TAXONOMY_TSHIRT, BLANK, colorways, sizes, hero,
       POD_COST_CENTS, LABEL_COST_CENTS, Boolean(input.personalised)]
    );
    const id = Number(ins.rows[0].id);

    // 'pending', never 'approved': the operator approves, and a tool that could approve its own work
    // would make rule 1 unenforceable.
    if (scheduledAt) {
      await client.query(`INSERT INTO schedule (product_id, scheduled_at, status) VALUES ($1,$2,'pending')`,
                         [id, scheduledAt]);
    }

    // Read back inside the transaction. The whole failure this tool exists for was a write that
    // reported success and left the columns that matter empty.
    const back = await client.query(
      `SELECT id, slug, content_status,
              coalesce(btrim(design_prompt),'') <> '' AS has_prompt,
              coalesce(btrim(hook),'')          <> '' AS has_hook,
              design_model IS NOT NULL          AS has_model,
              (SELECT count(*)::int FROM schedule s WHERE s.product_id = products.id) AS scheduled
         FROM products WHERE id = $1`, [id]);
    const r = back.rows[0];
    // The hook is NOT checked. It was, and it outlived the rule it was enforcing: when the hook became
    // optional the validation above stopped requiring one and this line kept demanding it, so every
    // wordless DTF product — which is now the default — passed every check and was then rolled back by
    // its own verification, reporting only "post-write verification failed". A read-back must verify
    // what the writer actually promised; it stops being a safety net the moment it asks for more.
    const missing = [!r.has_prompt && "design_prompt", !r.has_model && "design_model"].filter(Boolean);
    if (missing.length) {
      await client.query("ROLLBACK");
      fail(`post-write verification failed (${missing.join(", ")} empty after the insert) — `
         + "the row was rolled back.");
    }
    await client.query("COMMIT");

    return {
      id, slug, technique, title_len: title.length, title_fixed: titleNote, tags: tags.length,
      buyer_price: `$${buyer.toFixed(2)} (${rules.salePct}% sale)`,
      digital_png: rules.digitalPng, scheduled: r.scheduled > 0 ? scheduledAt!.toISOString() : null,
      queue: technique === "dtf"
        ? "the producer loop takes one product every 90s; report progress with production_status"
        : "embroidery: separate production flow",
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
