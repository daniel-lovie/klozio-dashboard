/**
 * Which trends may become a shirt, and why not when they may not.
 *
 * Two gates, in this order, because they fail differently:
 *
 *   HARM first. A wildfire evacuation is not an intellectual-property problem, so every IP gate lets
 *   it through — and on 2026-08-24 one did: "velma ok" (a town in Oklahoma being evacuated) scored
 *   USABLE and drafted a rainy-day humour tee. Abstracting to the category does not save you when the
 *   category IS the joke. This gate runs before anything else and it is not appealable.
 *
 *   Then IP. Names, clubs, leagues, companies, titles. Measured over 35 distinct trends the same day,
 *   26 were blocked here — that ratio is the system working, not the system being broken.
 *
 * The regexes are the floor, not the ceiling. What they cannot decide lands in REVIEW, and REVIEW is
 * where the local model is asked — never to approve something a regex blocked, only to sort the
 * genuinely ambiguous. A model that can be talked into "this football club is a generic concept" would
 * be a liability; one that can tell a place name from a person's name is worth having.
 */
import { askLocalJSON } from "@/lib/agent/ollama";
import type { RawTrend } from "./sources";

export type Verdict = "USABLE" | "REVIEW" | "BLOCKED";
export type Judged = RawTrend & { verdict: Verdict; reason: string; judgedBy: "rule" | "model" };

// Fixtures, clubs and leagues. The scoreline and the "-spor / -SK / stadyum" markers were added after a
// Turkish top-flight match reached USABLE: the English-only list did not recognise "Kocaelispor 2-0 Amed
// Sportif" as football, and a stadium sponsor's name carried the word "coffee".
const TEAM = /\bvs\.?\b|\bv\b\s|\b\d{1,2}\s*[-–]\s*\d{1,2}\b|\b(fc|cf|sc|afc|sk|united|city|rovers|county|athletic)\b|\w+spor\b|\b(lig|liga|ligi|maci|maç[ıi]|stadyum|stadium|taraftar|derbi|derby|fixture|kickoff|half[- ]time|full[- ]time)\b|\b(football|soccer|basketball|baseball|hockey|scores?|match|matchday|league|tournament|playoffs?|cup final|transfer news|nfl|nba|nhl|mlb|mls|ufc|wwe|ncaa|premier league|super lig|süper lig|la liga|serie a|bundesliga|ligue 1|champions league|world cup|super bowl|olympics|formula 1|f1)\b/i;

const BRAND = /\b(honda|toyota|ford|tesla|bmw|apple|google|amazon|meta|microsoft|samsung|nike|adidas|outage|recall\w*|stock|earnings|ipo|layoffs|visa|airlines|lawsuit)\b/i;

const PROPERTY = /\b(season \d|episode|trailer|premiere|box office|netflix|disney|hbo|marvel|dc |star wars|pokemon|nintendo|playstation|xbox|taylor swift|album|tour dates|movie|film|series)\b/i;

const PERSON_HINT = /\b(actor|actress|singer|rapper|player|coach|quarterback|striker|ceo|senator|governor|died|dies|death|obituary|arrested|lawsuit|divorce|engaged|pregnant|wife|husband)\b/i;

/** Somebody is having the worst day of their life. Checked first; see the note at the top. */
const HARM = /\b(evacuat\w*|evacuation|casualt\w*|fatalit\w*|killed|dead|deaths?|death toll|injur\w*|victims?|missing|manhunt|shooting|shot|stabbed|stabbing|gunman|hostage|kidnap\w*|crash|collision|derail\w*|collapse|quake|earthquake|tsunami|flooding|floods?|mudslide|landfall|storm surge|state of emergency|disaster|wreckage|rescue|survivors?|outbreak|epidemic|overdose|suicide|funeral|memorial|mourning|vigil|war|airstrike|bombing|shelling|invasion|refugee|protest|riot|unrest)\b/i;

// Nobody wants the shirt and every one of these names a real institution, office or officeholder.
const CIVIC = /\b(politic\w*|election\w*|ballot|senate|congress|parliament|governor|president|prime minister|supreme court|verdict|indict\w*|tariff\w*|inflation|unemployment|interest rate|federal reserve|immigration|deportation|dhs|ice raid|shutdown|budget bill)\b/i;

/** Ours to draw: weather, sky, seasons, food, hobbies, plain nouns. */
// Trailing \w* on purpose: "perseids" failed \bperseid\b and fell into REVIEW, and every one of these
// words is one the shop is happy to draw in any inflection.
const GENERIC = /\b(eclipse|meteor|perseid|aurora|solstice|equinox|full moon|comet|hurricane|blizzard|heat wave|wildfire|recipe|sourdough|coffee|matcha|garden|planting|frost|harvest|migration|whale|northern lights|daylight saving|leap year|tax day|back to school|thanksgiving|halloween|christmas|new year|spring|summer|autumn|winter)\w*/i;

/**
 * Google's own category tags, when the provider supplies them. A far better signal than our word list,
 * and the reason SerpApi is worth paying for: "Sports" or "Entertainment" on the trend itself settles
 * cases our regexes would have had to guess at.
 */
const CATEGORY_BLOCK = /^(sports|entertainment|politics|business|law and government|health)$/i;
const CATEGORY_SAFE = /^(science|nature|food and drink|hobbies and leisure|travel|weather|pets and animals|beauty and fashion)$/i;

// A named storm is a disaster with a first name, and the generic list contains "hurricane" because
// hurricanes make good seasonal designs. "hurricane andrew" scored USABLE on exactly that gap.
const NAMED_EVENT = /\b(hurricane|storm|typhoon|cyclone|tropical storm|wildfire|fire)\s+[a-z]{3,}\b/i;

/**
 * Two or three lowercase words the news writes as capitalised — a person, most of the time.
 *
 * DEAD ON SERPAPI DATA, and worth saying so: it works by finding the term capitalised in surrounding
 * news text, and the paid source returns no news text at all. "usain bolt" sailed through it and was
 * promoted by a Google category of "Science". The model is what covers this now, which is why it is run
 * over USABLE rows and not only over REVIEW ones.
 */
function looksLikeName(term: string, blob: string): boolean {
  const words = term.toLowerCase().split(/[^a-z']+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  const caps = words.filter((w) =>
    new RegExp(`\\b${w}\\b`, "i").test(blob) &&
    new RegExp(`\\b${w[0].toUpperCase()}${w.slice(1)}\\b`).test(blob)).length;
  return caps >= words.length - 1;
}

export function ruleVerdict(t: RawTrend): { verdict: Verdict; reason: string } {
  const blob = [t.term, ...t.headlines, ...t.breakdown].join(" ");
  if (HARM.test(blob)) return { verdict: "BLOCKED", reason: "afet / insan zarari — tisort konusu degil" };
  if (t.categories.some((c) => CATEGORY_BLOCK.test(c)))
    return { verdict: "BLOCKED", reason: `Google kategorisi: ${t.categories.join(", ")}` };
  if (NAMED_EVENT.test(blob)) return { verdict: "BLOCKED", reason: "adi konmus afet" };
  if (BRAND.test(blob)) return { verdict: "BLOCKED", reason: "sirket / urun markasi" };
  if (TEAM.test(blob)) return { verdict: "BLOCKED", reason: "kulup / lig markasi" };
  if (PROPERTY.test(blob)) return { verdict: "BLOCKED", reason: "telifli yapim ya da marka" };
  if (CIVIC.test(blob)) return { verdict: "BLOCKED", reason: "siyaset / kurum — tisort konusu degil" };
  if (t.categories.some((c) => CATEGORY_SAFE.test(c)) && !looksLikeName(t.term, blob))
    return { verdict: "USABLE", reason: `Google kategorisi: ${t.categories.join(", ")}` };
  if (PERSON_HINT.test(blob) || looksLikeName(t.term, blob))
    return { verdict: "BLOCKED", reason: "kisi adi / benzerlik hakki" };
  // The allowlist is trusted on the TERM and its related searches, never on the news text. A safe word
  // appearing anywhere in a headline is not evidence: "Coffee Xpress Kocaeli Stadyumu" made a football
  // fixture look like a coffee design. What people SEARCHED is the claim; what a reporter wrote is not.
  const claim = [t.term, ...t.breakdown].join(" ");
  if (GENERIC.test(claim)) return { verdict: "USABLE", reason: "jenerik kavram (arama terimi)" };
  return { verdict: "REVIEW", reason: "siniflandirilamadi" };
}

/**
 * ASK WHAT THE TERM IS, NOT WHETHER IT IS ALLOWED.
 *
 * Asked to apply the shop's policy directly, the model wrote "Robert Sanchez is a person (specifically,
 * a Chelsea goalkeeper)" and labelled it SAFE in the same breath — wrong on the one case that carries a
 * closure-tier penalty. Asked the factual question instead, the same model answered names_a_person:true
 * for the footballer, organisation:true for Barco, and all-false for Mallorca. It knows the facts; it is
 * bad at holding a policy. So we take the facts and apply the policy in code.
 *
 * It is not perfect at facts either — it called the Perseid meteor shower a person while describing it
 * as an astronomical event. That error blocks a good trend rather than passing a bad one, which is the
 * direction this is allowed to fail in, and the reason this only ever downgrades.
 */
const FACTS = {
  type: "object",
  properties: {
    names_a_person: { type: "boolean" },
    names_an_organisation: { type: "boolean" },
    names_a_fictional_work_or_character: { type: "boolean" },
    what_it_is: { type: "string" },
  },
  required: ["names_a_person", "names_an_organisation", "names_a_fictional_work_or_character", "what_it_is"],
} as const;

const FACT_SYSTEM =
  "You answer factual questions about what a search term refers to. Do not judge safety or suitability. "
  + "Answer only about the SEARCH TERM itself, not about the news around it.";

type Facts = { names_a_person: boolean; names_an_organisation: boolean;
               names_a_fictional_work_or_character: boolean; what_it_is: string };

export async function judge(
  trends: RawTrend[], opts: { useModel?: boolean; maxCalls?: number } = {},
): Promise<Judged[]> {
  const out: Judged[] = trends.map((t) => ({ ...t, ...ruleVerdict(t), judgedBy: "rule" as const }));
  if (opts.useModel === false) return out;

  // USABLE is checked too, not just REVIEW. On the paid source there are no headlines, so the
  // capitalisation heuristic that catches personal names cannot fire — a Google category of "Science"
  // was enough to promote "usain bolt" to drawable. The model only ever downgrades, so running it over
  // the promoted rows can cost a design and cannot cost the shop.
  //
  // Capped and ordered by volume: 526 trends produced 88 unresolved rows in one scan, and adjudicating
  // every one of them serially would put minutes between the scan and the drawing for rows nobody is
  // searching anyway.
  // EVERY promoted row is checked, without exception and regardless of volume. Ordering the whole queue
  // by volume put "usain bolt" (100 searches) outside the top sixty and left a named athlete sitting in
  // USABLE. A row the rules already rejected costs nothing if it stays rejected; a row they promoted is
  // the one that can reach a listing. Volume decides only how the LEFTOVER budget is spent on REVIEW.
  const budget = opts.maxCalls ?? Number(process.env.TREND_MODEL_MAX_CALLS || 60);
  const promoted = out.filter((t) => t.verdict === "USABLE");
  const unresolved = out.filter((t) => t.verdict === "REVIEW")
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, Math.max(0, budget - promoted.length));
  const queue = [...promoted, ...unresolved];

  for (const t of queue) {
    const ctx = [t.term, ...t.headlines.slice(0, 2), ...t.breakdown.slice(0, 4)].join(" | ");
    const f = await askLocalJSON<Facts>(`Search term and context: ${ctx}`, FACTS as unknown as object,
      { system: FACT_SYSTEM, maxTokens: 160 });
    if (!f) continue;                           // model unavailable → the trend stays in REVIEW
    const owned = f.names_a_person ? "kisi"
                : f.names_an_organisation ? "kurum / sirket"
                : f.names_a_fictional_work_or_character ? "kurgu eser / karakter" : null;
    if (!owned) continue;                       // never promotes; a clean answer just leaves it for a human
    t.verdict = "BLOCKED";
    t.reason = `model: ${owned} — ${String(f.what_it_is).slice(0, 44)}`;
    t.judgedBy = "model";
  }
  return out;
}
