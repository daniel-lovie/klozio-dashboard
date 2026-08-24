/**
 * The seeded lane: what is rising INSIDE the niches we are allowed to draw.
 *
 * DataForSEO has no trending-now endpoint. Every trends endpoint it offers — Google Trends explore and
 * its own clickstream Trends — takes up to five caller-supplied keywords, and the SERP API has no
 * equivalent either. So it cannot replace a discovery feed.
 *
 * It is, on the measured evidence, a better instrument than one. Of 55 distinct trends the discovery
 * feed produced, 52 were people, clubs, companies, politics or disasters — a 95% reject rate, and the
 * three that survived were survivors of a filter rather than things anyone wanted on a shirt. Discovery
 * asks "what is the world talking about" and the answer is almost never something we may print.
 *
 * This asks the question we actually have: within astronomy, gardening, fishing, coffee — the fourteen
 * things we draw — what is climbing right now? Every candidate arrives already inside a niche we can
 * legally draw, with a popularity number attached, and the reject rate collapses because the seed did
 * the filtering the classifier was carrying alone.
 *
 * It does NOT replace the classifier. A rising query inside a niche can still name a person, a brand or
 * a disaster ("<celebrity> sourdough" is a real shape of query), so everything here goes through the
 * same gates as anything else.
 */
import type { RawTrend } from "./sources";
import { CATEGORIES } from "./design";

const LOGIN = () => (process.env.DATAFORSEO_LOGIN || "").trim();
const PASSWORD = () => (process.env.DATAFORSEO_PASSWORD || "").trim();
export const hasDataForSeo = () => LOGIN().length > 0 && PASSWORD().length > 0;

const ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live";

/** Five keywords per request is the provider's hard limit, so the seeds are batched to it. */
function batches<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function post(body: unknown, timeoutMs = 60_000): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(ENDPOINT, {
      method: "POST", signal: c.signal,
      headers: {
        authorization: `Basic ${Buffer.from(`${LOGIN()}:${PASSWORD()}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`dataforseo ${r.status} ${JSON.stringify(j).slice(0, 140)}`);
    if (j?.status_code && j.status_code !== 20000) throw new Error(`dataforseo ${j.status_code} ${j.status_message}`);
    return j;
  } finally { clearTimeout(t); }
}

/**
 * How far above its own recent baseline a keyword is sitting.
 *
 * Google Trends values are relative to the series, not absolute, so the only honest read is momentum:
 * the last point against the mean of the ones before it. A keyword flat at 90 is not news; one that
 * moved from 20 to 60 is.
 */
function momentum(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  if (v.length < 4) return null;
  const last = v[v.length - 1];
  const before = v.slice(0, -1);
  const mean = before.reduce((a, b) => a + b, 0) / before.length;
  if (mean <= 0) return null;
  return Math.round(((last - mean) / mean) * 100);
}

/** Every item the provider nests under a result, flattened defensively — shapes vary by item_type. */
function items(j: any): any[] {
  const out: any[] = [];
  for (const task of j?.tasks ?? []) {
    for (const res of task?.result ?? []) {
      for (const it of res?.items ?? []) out.push(it);
    }
  }
  return out;
}

/**
 * One sweep over every category's seeds.
 *
 * Returns the RISING related queries, each tagged with the niche whose seed found it, so the category
 * matcher downstream has an exact answer instead of a regex guess.
 */
export async function risingTrends(
  opts: { location?: string; timeRange?: string } = {},
): Promise<RawTrend[]> {
  if (!hasDataForSeo()) return [];
  const location = opts.location ?? "United States";
  // Seven days, not one: a rising query needs a baseline to rise from, and the shorter windows return
  // series too short for momentum to mean anything.
  const time_range = opts.timeRange ?? "past_7_days";

  const seeded = CATEGORIES.flatMap((c) => c.seeds.map((s) => ({ niche: c.niche, seed: s })));
  const out: RawTrend[] = [];

  for (const group of batches(seeded, 5)) {
    let j: any;
    try {
      j = await post([{
        keywords: group.map((g) => g.seed),
        location_name: location,
        language_code: "en",
        time_range,
        item_types: ["google_trends_graph", "google_trends_queries_list"],
      }]);
    } catch {
      continue;                                  // one bad batch must not cost the whole sweep
    }

    const nicheOf = (kw: string) => group.find((g) => g.seed.toLowerCase() === String(kw).toLowerCase())?.niche;

    for (const it of items(j)) {
      // The seeds themselves: worth taking when they are climbing, because a seed is by definition
      // something we can draw.
      if (it?.type === "google_trends_graph") {
        for (const [i, kw] of (it.keywords ?? []).entries()) {
          const series = (it.data ?? []).map((d: any) => d?.values?.[i] ?? null);
          const m = momentum(series);
          if (m === null || m < 40) continue;    // flat or falling is not a trend
          const niche = nicheOf(kw);
          if (!niche) continue;
          out.push({
            source: "rss", geo: "US", term: String(kw), volume: null, increasePct: m,
            categories: [niche], breakdown: [], headlines: [], startedAt: null,
          });
        }
      }

      // Rising related queries: the actual discovery, but discovery already inside a drawable niche.
      if (it?.type === "google_trends_queries_list") {
        const niche = nicheOf(it.keywords?.[0] ?? "");
        const rising: any[] = it?.data?.rising ?? [];
        for (const r of rising.slice(0, 6)) {
          const term = String(r?.query ?? "").trim();
          if (!term) continue;
          out.push({
            source: "rss", geo: "US", term,
            volume: typeof r?.value === "number" ? r.value : null,
            increasePct: typeof r?.value === "number" ? r.value : null,
            categories: niche ? [niche] : [],
            // The seed goes in the breakdown so the allowlist — which is trusted on the search term and
            // its related searches, never on news text — can see the niche it came from.
            breakdown: [it.keywords?.[0] ?? ""].filter(Boolean),
            headlines: [], startedAt: null,
          });
        }
      }
    }
  }

  // Same query can surface under two seeds; keep the strongest.
  const best = new Map<string, RawTrend>();
  for (const t of out) {
    const k = t.term.toLowerCase();
    const prev = best.get(k);
    if (!prev || (t.increasePct ?? 0) > (prev.increasePct ?? 0)) best.set(k, t);
  }
  return [...best.values()];
}
