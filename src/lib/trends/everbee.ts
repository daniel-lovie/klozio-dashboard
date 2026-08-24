/**
 * EverBee: what is actually SELLING on Etsy, which is a different question from what is trending on
 * Google — and a much better one for this shop.
 *
 * Measured on 24 Aug: one SerpApi call returned 526 trends and 469 of them were people, clubs,
 * companies, politics or disasters. That is not a filtering problem to be tuned away; it is what the
 * question "what is the world talking about" returns. EverBee answers "what are Etsy buyers searching
 * and buying", so its rows arrive already inside our market.
 *
 * Three things it gives that nothing else here does:
 *   1. DEMAND, per keyword, on the marketplace we actually sell in — volume and competition, so a niche
 *      can be checked before we spend a design on it instead of after.
 *   2. WINNERS, per keyword — the listings doing 50+ sales a month, with their titles, tags, prices and
 *      cover images.
 *   3. Those cover images, which is what makes style research possible at all.
 *
 * The `trending` endpoint is NOT one of them. It returns keyword sludge — "gifte fully", "gift gifte
 * gifting" — and is deliberately not wired in.
 */

const ID = () => (process.env.EVERBEE_CLIENT_ID || "").trim();
const SECRET = () => (process.env.EVERBEE_CLIENT_SECRET || "").trim();
export const hasEverBee = () => ID().length > 0 && SECRET().length > 0;

const BASE = "https://research-open-api.everbee.com/api/v1";

export type EbKeyword = { keyword: string; vol: number; competition: number; score: number };

export type EbListing = {
  listingId: number; title: string; url: string; image: string | null;
  price: number | null; sales: number | null; revenue: number | null;
  conversion: number | null; favorers: number | null; tags: string[];
  shop: string; ageMonths: number | null;
};

async function get(path: string, params: Record<string, string | number | undefined>): Promise<any> {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, String(v));
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 45_000);
  try {
    const r = await fetch(u.toString(), {
      signal: c.signal,
      // Credentials go in HEADERS on every request — this API ignores Authorization entirely.
      headers: { client_id: ID(), client_secret: SECRET(), accept: "application/json" },
    });
    if (!r.ok) throw new Error(`everbee ${r.status} ${(await r.text()).slice(0, 120)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** /shops puts rows in `data`; everything else uses `results`. Reading the wrong key returns zero rows. */
function rows(j: any): any[] {
  return j?.results ?? j?.data ?? [];
}

/** Etsy demand for a phrase and its neighbours. The first row is usually the phrase itself. */
export async function keywordStats(seed: string): Promise<EbKeyword[]> {
  if (!hasEverBee()) return [];
  try {
    const j = await get(`/keywords/${encodeURIComponent(seed)}`, {});
    return rows(j).map((r) => ({
      keyword: String(r.keyword ?? ""), vol: Number(r.vol ?? 0),
      competition: Number(r.competition ?? 0), score: Number(r.score ?? 0),
    })).filter((k) => k.keyword);
  } catch {
    return [];
  }
}

/**
 * Demand for exactly one phrase, or null when EverBee has never seen it.
 *
 * `score` is EverBee's own demand-over-competition read and is the number worth sorting on: raw volume
 * rewards phrases that fifteen thousand listings are already fighting over.
 */
export async function demandFor(phrase: string): Promise<EbKeyword | null> {
  const all = await keywordStats(phrase);
  const exact = all.find((k) => k.keyword.trim().toLowerCase() === phrase.trim().toLowerCase());
  return exact ?? all[0] ?? null;
}

/**
 * The listings winning a phrase right now.
 *
 * `--title-include` is the search; there is no free-text query parameter. `per_page` is the page size —
 * passing `limit` returns a 500 rather than a 400, and both `page` and `per_page` are required.
 */
export async function topSellers(
  phrase: string,
  opts: { minSales?: number; perPage?: number; category?: string } = {},
): Promise<EbListing[]> {
  if (!hasEverBee()) return [];
  try {
    const j = await get("/listings", {
      title_include: phrase,
      category_include: opts.category ?? "Clothing",
      est_mo_sales_min: opts.minSales ?? 10,
      order_by: "est_mo_sales",
      order_direction: "desc",
      per_page: opts.perPage ?? 10,
      page: 1,
    });
    return rows(j).map((r) => ({
      listingId: Number(r.listing_id ?? 0),
      title: String(r.title ?? ""),
      url: String(r.url ?? ""),
      // One URL, not a gallery: the field is a plain string and it is the cover.
      image: typeof r.Images === "string" && r.Images.startsWith("http") ? r.Images : null,
      price: r.price != null ? Number(r.price) : null,
      sales: r.est_mo_sales != null ? Number(r.est_mo_sales) : null,
      revenue: r.est_mo_revenue != null ? Number(r.est_mo_revenue) : null,
      conversion: r.conversion_rate != null ? Number(r.conversion_rate) : null,
      favorers: r.num_favorers != null ? Number(r.num_favorers) : null,
      tags: Array.isArray(r.tags) ? r.tags.map(String)
          : typeof r.tags === "string" ? r.tags.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [],
      shop: String(r.shop_name ?? ""),
      ageMonths: r.listing_age_in_months != null ? Number(r.listing_age_in_months) : null,
    })).filter((l) => l.listingId);
  } catch {
    return [];
  }
}
