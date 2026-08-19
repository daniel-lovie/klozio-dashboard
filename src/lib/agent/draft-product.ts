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
import { pool } from "../db";

export const DEFAULT_COLORWAYS = [
  "Black", "Pepper", "Espresso", "Midnight", "Graphite", "Blue Jean", "Denim",
  "Blue Spruce", "Moss", "Ivory", "Butter", "Yam",
];
export const DEFAULT_SIZES = ["S", "M", "L", "XL", "2X", "3X", "4X", "Digital PNG"];

/** $24.99 to the buyer after the standing 30% sale. The column holds the anchor, never the paid price. */
const DEFAULT_PRICE_CENTS = 3570;
const SALE = 0.7;

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

/** Phrases that ask an image model to draw letters. Rule 5: all type is hand-set in a licensed font. */
const TEXT_IN_ART = [
  "the text", "text reads", "the word", "the words", "written", "lettering", "typography",
  "says ", "caption", "slogan on", "word art",
];

function fail(msg: string): never {
  throw new Error(msg);
}

export async function draftProduct(input: DraftInput, shopId: number) {
  const slug = String(input.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    fail("slug gecersiz: kucuk harf, rakam ve tire. Desen '{hat}-c{n}-v1' (ornek: pet-c1-v1).");
  }
  const technique = String(input.technique ?? "dtf").trim().toLowerCase();
  if (technique !== "dtf" && technique !== "embroidery") fail("technique 'dtf' ya da 'embroidery' olmali.");

  const niche = String(input.niche ?? "").trim();
  if (niche.length < 3) fail("niche bos — hangi alici kitlesi icin, birkac kelimeyle yaz.");

  const title = String(input.title ?? "").trim();
  // 140 is Etsy's hard cap; 125 is the bottom of the operating band. A short title is not an error
  // Etsy will report — it is simply less surface to be found on, so it is refused here.
  if (title.length < 125 || title.length > 140) {
    fail(`title ${title.length} karakter — 125-140 bandinda olmali (140 Etsy siniri). Anahtar kelime ilk 40 karakterde bolunmeden gecmeli.`);
  }

  const description = String(input.description ?? "").trim();
  if (description.length < 200) fail("description cok kisa (en az 200 karakter).");
  // Rule 4: the disclosure is a publish gate and it has to be high in the description, not buried.
  if (!/\bAI\b|yapay zeka|AI image|AI tools/i.test(description.slice(0, 600))) {
    fail("description'in ust kisminda AI aciklamasi yok. Etsy 14 Oca 2026'dan beri generatif AI beyanini "
       + "zorunlu tutuyor ve bunu gizlemek yuksek cezali. Ilk paragrafa acik bir cumle koy.");
  }

  const tags = (input.tags ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (tags.length !== 13) fail(`tags tam 13 olmali, ${tags.length} geldi.`);
  const tooLong = tags.filter((t) => t.length > 20);
  if (tooLong.length) fail(`20 karakteri asan tag: ${tooLong.join(", ")}`);
  // A single-word tag competes with the whole marketplace and matches almost nothing a buyer types.
  // The five rows written by hand on 2026-08-19 had thirteen of them ("pet", "dog", "cat").
  const single = tags.filter((t) => !/\s/.test(t));
  if (single.length) fail(`tek kelimelik tag kabul edilmiyor (cok kelimeli olmali): ${single.join(", ")}`);
  if (new Set(tags.map((t) => t.toLowerCase())).size !== 13) fail("tag'lerde tekrar var.");

  const hook = String(input.hook ?? "").trim();
  if (technique === "dtf") {
    if (!hook) {
      fail("hook bos. DTF'te hook tasariMA DIZILECEK SLOGANDIR ve zorunludur — hooksuz satiri uretim "
         + "kuyrugu almaz (wordless_no_hook), yani urun sessizce hic uretilmez.");
    }
    if (hook.length > 60) fail(`hook ${hook.length} karakter — 60'i gecmesin, tasarima sigmaz.`);
  }

  const designPrompt = String(input.design_prompt ?? "").trim();
  if (designPrompt.length < 120) {
    fail(`design_prompt ${designPrompt.length} karakter — en az 120. Ne cizilecegini tarif et: konu, `
       + "kompozisyon, stil, renk paleti, arka plan. Bos birakilirsa urun hic cizilmez.");
  }
  const askedForText = TEXT_IN_ART.filter((w) => designPrompt.toLowerCase().includes(w));
  if (askedForText.length) {
    fail(`design_prompt goruntu modelinden YAZI istiyor ("${askedForText[0]}"). Kural 5: yazi asla AI ile `
       + "cizilmez, lisansli fontla elle dizilir — model bozuk harf uretir. Sloganı hook alanina yaz, "
       + "prompt'tan yazi istegini cikar.");
  }
  const ip = IP_WORDS.filter((w) => `${designPrompt} ${title} ${hook}`.toLowerCase().includes(w));
  if (ip.length) fail(`marka/karakter adi geciyor: ${ip.join(", ")}. Ozgun is disinda hicbir sey cizilmez.`);

  const priceCents = Math.round(Number(input.price_cents ?? DEFAULT_PRICE_CENTS));
  const buyer = (priceCents * SALE) / 100;
  if (!Number.isFinite(priceCents) || buyer < 18 || buyer > 26) {
    fail(`price_cents ${priceCents} -> aliciya $${buyer.toFixed(2)}. price_cents ANCHOR fiyattir, `
       + "uzerinde surekli %30 indirim var; aliciya gorunen 18-26 bandinda olmali "
       + `(varsayilan ${DEFAULT_PRICE_CENTS} = $24.99).`);
  }

  const designModel = String(input.design_model ?? "gpt_image_2").trim() || "gpt_image_2";
  const colorways = input.colorways?.length ? input.colorways : DEFAULT_COLORWAYS;
  const sizes = input.sizes?.length ? input.sizes : DEFAULT_SIZES;
  const hero = String(input.hero_colorway ?? "Pepper").trim();

  let scheduledAt: Date | null = null;
  if (input.scheduled_at) {
    scheduledAt = new Date(input.scheduled_at);
    if (Number.isNaN(scheduledAt.getTime())) fail(`scheduled_at okunamadi: ${input.scheduled_at}`);
    if (scheduledAt.getTime() < Date.now() - 60_000) fail("scheduled_at gecmiste — ileri bir tarih ver.");
  }

  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const dup = await client.query(`SELECT id FROM products WHERE slug = $1 AND shop_id = $2`, [slug, shopId]);
    if (dup.rowCount) fail(`slug '${slug}' bu magazada zaten var (id ${dup.rows[0].id}).`);

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
    if (!r.has_prompt || !r.has_model || (technique === "dtf" && !r.has_hook)) {
      await client.query("ROLLBACK");
      fail("yazma sonrasi dogrulama basarisiz — satir geri alindi.");
    }
    await client.query("COMMIT");

    return {
      id, slug, technique, title_len: title.length, tags: tags.length,
      buyer_price: `$${buyer.toFixed(2)}`, scheduled: r.scheduled > 0 ? scheduledAt!.toISOString() : null,
      queue: technique === "dtf"
        ? "producer dongusu 90 sn'de bir bir urun alir; ilerlemeyi production_status ile bildir"
        : "nakis: uretim akisi ayri",
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
