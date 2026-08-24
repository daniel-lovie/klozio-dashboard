/**
 * Learn the style from what is already winning, in words.
 *
 * The operator's instruction was plain: it does not have to be super original, taking inspiration is
 * normal. It is — and the useful form of it here is not pixels but description. The vision model looks
 * at the covers of the listings actually selling in a niche, and the text model turns what they have in
 * common into one instruction line that goes into our own prompt.
 *
 * Why words rather than the image itself: our generator has no image input at all (all three ComfyUI
 * workflows start from EmptyLatentImage), so a reference picture has nowhere to go today. But the more
 * important reason is that a described style — "thick uniform outlines, four flat colours, one centred
 * subject, no gradients" — is the part that transfers. It is what the winners share; the specific
 * drawing is what makes each of them theirs.
 *
 * The winners' cover URLs are recorded on the product anyway, so the provenance archive shows exactly
 * what was looked at.
 */
import { topSellers, demandFor, hasEverBee, type EbListing } from "./everbee";
import { describeImageUrl, askLocalJSON } from "@/lib/agent/ollama";

export type StyleRead = {
  phrase: string;
  demand: { vol: number; competition: number; score: number } | null;
  winners: EbListing[];
  /** One line to append to a design prompt, or null when nothing could be read. */
  styleLine: string | null;
  /** What the covers looked like, kept for the archive and for the operator to check the read. */
  notes: string[];
};

const COVER_BRIEF =
  "This is a t-shirt listing photo. Describe ONLY the printed graphic on the garment, in at most 45 "
  + "words: how many colours, whether outlines are thick or thin, flat colour or shaded, how many "
  + "separate objects, whether there is lettering and how it is set, and whether the composition is "
  + "centred. Ignore the garment, the model and the background.";

const SYNTH_SCHEMA = {
  type: "object",
  properties: { style: { type: "string" }, common: { type: "string" } },
  required: ["style", "common"],
} as const;

const SYNTH_SYSTEM =
  "You read descriptions of several best-selling t-shirt graphics in one niche and state the STYLE they "
  + "share, as drawing instructions. Rules:\n"
  + "- `style` is 10 to 25 words, describing execution only: line weight, colour count, flatness, "
  + "composition. Never a subject, never a slogan, never a brand.\n"
  + "- Say nothing about text or lettering; we set type by hand and never draw it.\n"
  + "- `common` is one short sentence for a human about what these winners have in common.";

/** What is selling in this phrase, and how it is drawn. */
export async function readStyle(phrase: string, opts: { winners?: number } = {}): Promise<StyleRead> {
  const empty: StyleRead = { phrase, demand: null, winners: [], styleLine: null, notes: [] };
  if (!hasEverBee()) return empty;

  const [demand, winners] = await Promise.all([
    demandFor(phrase),
    topSellers(phrase, { minSales: 10, perPage: opts.winners ?? 4 }),
  ]);
  const withCovers = winners.filter((w) => w.image).slice(0, opts.winners ?? 4);

  const notes: string[] = [];
  for (const w of withCovers) {
    const d = await describeImageUrl(w.image!, COVER_BRIEF);
    if (d) notes.push(d.replace(/\s+/g, " ").slice(0, 300));
  }

  let styleLine: string | null = null;
  if (notes.length >= 2) {
    const got = await askLocalJSON<{ style: string; common: string }>(
      notes.map((n, i) => `Winner ${i + 1}: ${n}`).join("\n"),
      SYNTH_SCHEMA as unknown as object, { system: SYNTH_SYSTEM, maxTokens: 160 });
    // Winners very often carry lettering, so the model mentions it — and rule 5 says we never draw
    // type. Dropping the whole read over one clause threw away a good style line ("thick outlines, five
    // flat colours, centred composition, minimal detail") because it ended "with bold lettering". So the
    // offending CLAUSE is removed and the rest is kept.
    const clean = String(got?.style ?? "")
      .split(/[,;]/)
      .map((c) => c.trim())
      .filter((c) => c && !/\b(text|words?|letter\w*|type|typograph\w*|font|slogan|caption|logo|brand)\b/i.test(c))
      .join(", ");
    const line = clean.replace(/\s+/g, " ").trim();
    const words = line ? line.split(/\s+/).length : 0;
    // A style line that names a subject is not a style line; it would fight the drawing we chose.
    // "design" and "graphic" were on this list and rejected "flat centered design with thick outlines",
    // which is exactly the instruction we wanted. Only garment words are disqualifying now; the schema
    // and system prompt are what keep a SUBJECT out.
    const bad = /\b(shirt|t-?shirt|hoodie|sweatshirt|mockup|garment)\b/i.test(line);
    if (line && words >= 4 && words <= 32 && !bad) styleLine = line;
    if (got?.common) notes.unshift(`ORTAK: ${got.common}`);
  }

  return {
    phrase,
    demand: demand ? { vol: demand.vol, competition: demand.competition, score: demand.score } : null,
    winners: withCovers, styleLine, notes,
  };
}
