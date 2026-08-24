/**
 * The daily trend run: read what people searched yesterday, keep only what we may legally draw, and
 * leave finished products waiting for one click.
 *
 * The operator's requirement is that everything is ready and a user only approves — so this writes the
 * row, the copy and the design brief, and the producer draws it. What it deliberately does NOT do is
 * approve: the schedule row is 'pending' and Etsy is never touched. That is rule 1 and it is also the
 * only thing standing between an automated pipeline and an automated mistake.
 *
 * Why so few products come out of it: measured across US, GB and CA on 2026-08-24, 30 trends yielded
 * ONE that could become a design without using somebody's name, face or mark. The rest were athletes,
 * celebrities, clubs, leagues and companies. A trend run that produced six products a day would be
 * producing six infringements a day, so the honest output of a good day is one or two.
 *
 * What is taken from a trend is the CATEGORY, never the subject. "Partial lunar eclipse this week"
 * becomes an astronomy design, not a picture of the eclipse coverage.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { draftProduct } from "./agent/draft-product";
import { q, logEvent } from "./db";

const run = promisify(execFile);

export type Trend = {
  geo: string; term: string; traffic: string; published: string;
  picture: string; verdict: "USABLE" | "REVIEW" | "BLOCKED"; reason: string;
  news: { title: string; source: string; url: string }[];
};

export async function scanTrends(geos = "US,GB,CA", hours = 24): Promise<Trend[]> {
  const { stdout } = await run("python3",
    ["scripts/trend_scan.py", "--geo", geos, "--hours", String(hours), "--json"],
    { timeout: 120_000, maxBuffer: 1 << 24 });
  return JSON.parse(stdout);
}

/** Words that turn a headline into a subject we can draw, mapped to what to draw. */
const CATEGORY: { test: RegExp; niche: string; subject: string; palette: string }[] = [
  { test: /eclipse|moon|lunar|meteor|aurora|comet|solstice|equinox|night sky|stargaz/i,
    niche: "astronomy", subject: "a large ringed moon with three small stars scattered around it",
    palette: "deep indigo, cream, mustard and dusty rose" },
  { test: /hurricane|storm|blizzard|snow|frost|heat wave|drought|wildfire/i,
    niche: "weather humour", subject: "a heavy rain cloud with three lightning shapes below it",
    palette: "charcoal, mustard, teal and cream" },
  { test: /recipe|sourdough|baking|bread|pizza|coffee|matcha|barbecue|harvest/i,
    niche: "food humour", subject: "a round loaf of bread with a scored cross on top beside a jar",
    palette: "warm tan, terracotta, sage green and cream" },
  { test: /garden|planting|seed|bloom|wildflower|pollinator|bee\b/i,
    niche: "garden humour", subject: "a terracotta pot with three tall seedlings and one open bloom",
    palette: "terracotta, sage green, mustard and cream" },
  { test: /whale|migration|bird|owl|fox|bear|deer|turtle|meerkat|otter/i,
    niche: "wildlife", subject: "a single wild animal seen side on with its head turned to the viewer",
    palette: "warm brown, sage green, cream and charcoal" },
  { test: /back to school|semester|exam|graduation|teacher/i,
    niche: "school humour", subject: "a stack of three books with a pencil resting across the top",
    palette: "mustard, deep teal, coral and cream" },
];

/** Turn a usable trend into a brief, or nothing if it maps to no category we draw. */
export function briefFor(t: Trend): { niche: string; prompt: string; slug: string } | null {
  const blob = `${t.term} ${t.news.map((n) => n.title).join(" ")}`;
  const hit = CATEGORY.find((c) => c.test.test(blob));
  if (!hit) return null;
  const slug = "trend-" + t.term.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 28)
             + "-v1";
  return {
    niche: hit.niche, slug,
    prompt: `${hit.subject}, drawn in ${hit.palette}, thick confident outlines and flat colour blocks, `
          + "no gradients, no shading, bold high-contrast illustration, the subject fills the frame, "
          + "centred composition sized for a chest print, transparent background.",
  };
}

const KW: Record<string, string[]> = {
  astronomy: ["astronomy lover tee", "star gazer gift", "moon lover shirt", "night sky tee",
    "space nerd gift", "celestial gift tee", "eclipse lover tee", "cosmos gift shirt",
    "lunar lover tee", "stargazing gift", "sky watcher tee", "moon phase gift", "astro fan tee"],
  "weather humour": ["weather lover tee", "storm chaser gift", "rainy day shirt", "cloud lover tee",
    "weather nerd gift", "forecast humor tee", "thunder lover tee", "cozy rain shirt",
    "storm humor gift", "weather fan tee", "rain lover gift", "grey sky tee", "wet weather tee"],
  "food humour": ["food lover tee", "baking gift shirt", "home cook gift", "kitchen humor tee",
    "bread lover tee", "foodie gift shirt", "cooking lover tee", "baker gift tee",
    "sourdough lover", "kitchen lover tee", "recipe lover gift", "comfort food tee", "food humor gift"],
  "garden humour": ["garden lover tee", "plant parent gift", "gardening gift tee", "green thumb shirt",
    "seedling lover tee", "garden humor tee", "plant lover gift", "grow your own",
    "potting shed tee", "gardener gift tee", "spring garden tee", "veg patch gift", "garden life tee"],
  wildlife: ["wildlife lover tee", "animal lover gift", "nature lover tee", "wild animal shirt",
    "conservation gift", "bird lover gift", "woodland gift tee", "animal fan tee",
    "wildlife fan gift", "outdoor lover tee", "nature nerd tee", "creature lover", "wild life gift"],
  "school humour": ["teacher gift tee", "school humor shirt", "classroom gift tee", "educator gift",
    "back to school tee", "study life shirt", "student gift tee", "school year tee",
    "teacher life gift", "learning gift tee", "classroom humor", "school days tee", "teach love tee"],
};

const AI_NOTE =
  "ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my "
  + "design process, then refined and prepared for print by hand. Original illustration.";
const BODY =
  "\n\nPrinted onto a soft cotton tee — full colour, no cracking, no stiff patch. Unisex fit, true to "
  + "size, sizes S through 4XL. Made to order and shipped from the US.";

function titleFor(kw: string[]): string {
  const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  let t = `${cap(kw[0])} Shirt`;
  for (const k of kw.slice(1)) {
    if (t.length >= 125) break;
    const next = `${t}, ${cap(k)}`;
    if (next.length > 140) continue;
    t = next;
  }
  return t;
}

/**
 * One round across every enabled shop. Scans once, then hands each trend to ONE shop.
 *
 * The rotation is the point. The category map is shop-agnostic, so letting every shop draft the same
 * trend would put the same illustration under the same title in two of our own Etsy shops, splitting
 * one query between two of our listings. A trend belongs to a single shop; the next one starts from the
 * next shop in the ring.
 *
 * The duplicate check is on NICHE, not just slug, for the same reason: two different astronomy trends
 * produce the same title and the same thirteen tags, so a second one in the same shop would compete
 * with the first.
 */
export async function runTrendRound(
  shopIds: number[],
  opts: { max?: number; geos?: string } = {},
) {
  const maxPerShop = opts.max ?? 2;
  const trends = await scanTrends(opts.geos ?? "US,GB,CA");
  const usable = trends.filter((t) => t.verdict === "USABLE");
  const review = trends.filter((t) => t.verdict === "REVIEW");

  const made: { shopId: number; slug: string; term: string }[] = [];
  const skipped: { term: string; why: string }[] = [];
  const drawn = new Map<number, number>(shopIds.map((id) => [id, 0]));
  let turn = 0;

  for (const t of usable) {
    const b = briefFor(t);
    if (!b) { skipped.push({ term: t.term, why: "cizdigimiz bir kategoriye oturmadi" }); continue; }

    let target: number | null = null;
    for (let i = 0; i < shopIds.length; i++) {
      const id = shopIds[(turn + i) % shopIds.length];
      if ((drawn.get(id) ?? 0) >= maxPerShop) continue;
      const dup = await q(
        `SELECT 1 FROM products
          WHERE shop_id = $1 AND (slug = $2 OR (niche = $3 AND slug LIKE 'trend-%'))
          LIMIT 1`, [id, b.slug, b.niche]);
      if (dup.length) continue;
      target = id;
      break;
    }
    if (target === null) {
      skipped.push({ term: t.term, why: "bu kategori acik magazalarda zaten var" });
      continue;
    }
    turn = (shopIds.indexOf(target) + 1) % shopIds.length;

    try {
      // Tomorrow, not today: the design has to be drawn before anyone can look at it, and a slot that
      // has already passed makes the operator approve something they have not seen.
      const when = new Date(Date.now() + 24 * 3600_000);
      when.setUTCHours(15, 0, 0, 0);
      const out = await draftProduct({
        slug: b.slug, niche: b.niche, technique: "dtf",
        title: titleFor(KW[b.niche]), description: AI_NOTE + BODY, tags: KW[b.niche],
        design_prompt: b.prompt, scheduled_at: when.toISOString(),
      }, target);
      made.push({ shopId: target, slug: out.slug, term: t.term });
      drawn.set(target, (drawn.get(target) ?? 0) + 1);
    } catch (e: any) {
      skipped.push({ term: t.term, why: String(e.message).slice(0, 90) });
    }
  }

  await logEvent("trend_run", {
    detail: `${trends.length} trend · ${usable.length} cizilebilir · ${made.length} urun · `
          + `${shopIds.length} magaza · ${review.length} insan bakmali`,
  });
  return { scanned: trends.length, usable: usable.length, shops: shopIds, made, skipped,
           review: review.map((t) => ({ term: t.term, geo: t.geo, headline: t.news[0]?.title ?? "" })) };
}

/** Shops that asked for the daily run. Opt-in, so a new shop never wakes up to a batch it didn't order. */
export async function trendShops(): Promise<number[]> {
  const rows = await q<{ id: number }>(
    `SELECT id FROM shops WHERE coalesce(settings->>'trend_daily','') = 'true' ORDER BY id`);
  return rows.map((r) => r.id);
}

/** One shop, on demand — the manual entry point behind /api/cron/trends?shop=N. */
export async function runTrendDay(shopId: number, opts: { max?: number; geos?: string } = {}) {
  return runTrendRound([shopId], opts);
}
