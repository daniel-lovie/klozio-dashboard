/**
 * Where trends come from. Two providers behind one shape.
 *
 * WHY THE RSS FEED WAS NEVER GOING TO BE ENOUGH — measured 2026-08-24, not assumed:
 *
 *   • It returns TEN items per geo and nothing else. Asking it for 96 hours returns the same ten,
 *     because it carries no history at all — every pubDate sat inside one half-hour band.
 *   • It rotates continuously. Two scans ONE MINUTE apart shared only 25 of 30 terms. So a single
 *     nightly read sees a sliver of the day and cannot know what it missed.
 *   • It carries no volume, no growth rate and no category. Every trend looks equally important, so
 *     there is no way to prefer the one people are actually searching for.
 *
 * A once-a-day reader of a ten-item rolling window is not a trend system; it is a coin flip with a
 * filter on it. SerpApi's trending-now endpoint answers all three: it takes `hours` natively (4, 24,
 * 48, 168), returns `search_volume` and `increase_percentage`, and tags each trend with categories.
 *
 * RSS stays as the fallback, unchanged in behaviour, so the pipeline keeps working without a key and
 * degrades honestly instead of going dark. `usedFallback` on the result is what the run reports.
 */

export type RawTrend = {
  source: "serpapi" | "rss";
  geo: string;
  term: string;
  /** Estimated searches. SerpApi reports this; RSS gives a coarse "20K+" string, parsed best-effort. */
  volume: number | null;
  /** Growth on the previous period, SerpApi only. */
  increasePct: number | null;
  /** Google's own topic tags, SerpApi only — a far better category signal than our regexes. */
  categories: string[];
  /** Related searches around the trend. Widens what the classifier and the brief have to work with. */
  breakdown: string[];
  headlines: string[];
  startedAt: string | null;
};

export type ScanResult = { trends: RawTrend[]; source: "serpapi" | "rss"; usedFallback: boolean; note: string };

const KEY = () => (process.env.SERPAPI_KEY || "").trim();
export const hasSerpApi = () => KEY().length > 0;

/** "20K+" / "2M+" -> a number we can sort by. Coarse on purpose; it is a coarse field. */
function parseTraffic(s: string): number | null {
  const m = /([\d.]+)\s*([KMB]?)/i.exec(s || "");
  if (!m) return null;
  const mult = { "": 1, K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase() as "" | "K" | "M" | "B"] ?? 1;
  return Math.round(Number(m[1]) * mult);
}

async function getJSON(url: string, timeoutMs = 30_000): Promise<any> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "user-agent": "klozio-trends/2.0" } });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/**
 * SerpApi trending-now. `hours` is the provider's own window, so the escalation this pipeline does
 * (24 → 48 → 72 → 96) can finally ask the source instead of digging through our own stored history.
 */
async function serpapi(geo: string, hours: number): Promise<RawTrend[]> {
  // The endpoint accepts 4, 24, 48 and 168 only; anything else is rounded UP to the next it supports,
  // so a 72-hour request reaches back at least 72 hours rather than silently narrowing to 48.
  const allowed = [4, 24, 48, 168];
  const h = allowed.find((a) => a >= hours) ?? 168;
  const u = new URL("https://serpapi.com/search");
  u.searchParams.set("engine", "google_trends_trending_now");
  u.searchParams.set("geo", geo);
  u.searchParams.set("hours", String(h));
  u.searchParams.set("api_key", KEY());
  const j = await getJSON(u.toString(), 45_000);
  if (j.error) throw new Error(`serpapi: ${j.error}`);
  const rows: any[] = j.trending_searches ?? [];
  return rows.map((r) => ({
    source: "serpapi" as const,
    geo,
    term: String(r.query ?? "").trim(),
    volume: typeof r.search_volume === "number" ? r.search_volume : null,
    increasePct: typeof r.increase_percentage === "number" ? r.increase_percentage : null,
    categories: (r.categories ?? []).map((c: any) => String(c.name ?? "")).filter(Boolean),
    breakdown: (r.trend_breakdown ?? []).map((x: any) => String(x)).filter(Boolean),
    // The news link is a second billed request per trend, so it is not followed here. The related
    // searches carry enough context for both the classifier and the brief, and cost nothing extra.
    headlines: [],
    startedAt: r.start_timestamp ? new Date(r.start_timestamp * 1000).toISOString() : null,
  })).filter((t) => t.term);
}

/** The free feed. Ten per geo, no history, no volume — kept so a missing key never means no system. */
async function rss(geo: string): Promise<RawTrend[]> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 30_000);
  let xml: string;
  try {
    const r = await fetch(`https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`, {
      signal: c.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; klozio-trends/2.0)" } });
    if (!r.ok) throw new Error(`rss ${r.status}`);
    xml = await r.text();
  } finally { clearTimeout(t); }

  const out: RawTrend[] = [];
  for (const block of xml.split("<item>").slice(1)) {
    const pick = (tag: string) => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
    };
    const term = pick("title");
    if (!term) continue;
    const headlines = [...block.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)]
      .map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()).filter(Boolean);
    out.push({
      source: "rss", geo, term, volume: parseTraffic(pick("ht:approx_traffic")),
      increasePct: null, categories: [], breakdown: [], headlines,
      startedAt: pick("pubDate") ? new Date(pick("pubDate")).toISOString() : null,
    });
  }
  return out;
}

/**
 * Every geo, best available provider.
 *
 * A SerpApi failure falls back to RSS rather than aborting the night: a quota error or a lapsed key is
 * a billing problem, and a billing problem should cost us resolution, not the whole run. The result
 * says which provider answered so the run can report it instead of quietly looking healthy.
 */
export async function scan(geos: string[], hours = 24): Promise<ScanResult> {
  // The seeded lane runs alongside whichever discovery lane is available, never instead of it. Its
  // candidates arrive already inside a niche we draw, which is why it survives the filters at a rate
  // the discovery feed cannot approach — but it can only find what we thought to seed, so dropping
  // discovery would trade a 95% reject rate for a blind spot.
  const { risingTrends, hasDataForSeo } = await import("./rising");
  const rising = hasDataForSeo() ? await risingTrends().catch(() => []) : [];
  const withRising = (r: ScanResult): ScanResult => rising.length
    ? { ...r, trends: [...r.trends, ...rising], note: `${r.note} + dataforseo ${rising.length} yukselen` }
    : r;

  if (hasSerpApi()) {
    try {
      const all = (await Promise.all(geos.map((g) => serpapi(g, hours)))).flat();
      return withRising({ trends: all, source: "serpapi", usedFallback: false,
               note: `serpapi · ${geos.length} geo · ${hours}s` });
    } catch (e: any) {
      const all = (await Promise.all(geos.map(rss))).flat();
      return withRising({ trends: all, source: "rss", usedFallback: true,
               note: `serpapi basarisiz (${String(e.message).slice(0, 70)}) — RSS'e dusuldu` });
    }
  }
  const all = (await Promise.all(geos.map(rss))).flat();
  return withRising({ trends: all, source: "rss", usedFallback: false,
           note: "SERPAPI_KEY yok — RSS (geo basina 10 kayit, gecmis yok)" });
}
