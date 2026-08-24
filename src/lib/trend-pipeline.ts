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
const CATEGORY: { test: RegExp; niche: string; draws: { subject: string; palette: string }[] }[] = [
  { test: /eclipse|moon|lunar|meteor|aurora|comet|solstice|equinox|night sky|stargaz/i,
    niche: "astronomy", draws: [
      { subject: "a large ringed moon with three small stars scattered around it",
        palette: "deep indigo, cream, mustard and dusty rose" },
      { subject: "a row of five moon phases above a low mountain ridge",
        palette: "charcoal, warm cream, burnt orange and pale blue" }] },
  { test: /hurricane|storm|blizzard|snow|frost|heat wave|drought|wildfire/i,
    niche: "weather humour", draws: [
      { subject: "a heavy rain cloud with three lightning shapes below it",
        palette: "charcoal, mustard, teal and cream" },
      { subject: "a wide sun half hidden behind two flat cloud banks",
        palette: "burnt orange, cream, deep teal and soft grey" }] },
  { test: /recipe|sourdough|baking|bread|pizza|coffee|matcha|barbecue|harvest/i,
    niche: "food humour", draws: [
      { subject: "a round loaf of bread with a scored cross on top beside a jar",
        palette: "warm tan, terracotta, sage green and cream" },
      { subject: "a tall coffee cup with three steam curls rising from it",
        palette: "deep brown, cream, mustard and dusty rose" }] },
  { test: /garden|planting|seed|bloom|wildflower|pollinator|bee\b/i,
    niche: "garden humour", draws: [
      { subject: "a terracotta pot with three tall seedlings and one open bloom",
        palette: "terracotta, sage green, mustard and cream" },
      { subject: "a watering can tipped forward with four falling drops beneath it",
        palette: "sage green, cream, warm tan and soft coral" }] },
  { test: /whale|migration|bird|owl|fox|bear|deer|turtle|meerkat|otter/i,
    niche: "wildlife", draws: [
      { subject: "a single wild animal seen side on with its head turned to the viewer",
        palette: "warm brown, sage green, cream and charcoal" },
      { subject: "a wild animal curled asleep inside a ring of leaves",
        palette: "deep teal, warm cream, rust and soft olive" }] },
  { test: /back to school|semester|exam|graduation|teacher/i,
    niche: "school humour", draws: [
      { subject: "a stack of three books with a pencil resting across the top",
        palette: "mustard, deep teal, coral and cream" },
      { subject: "an open notebook with a coffee cup set on its corner",
        palette: "cream, warm tan, deep navy and soft coral" }] },
];

/**
 * Turn a usable trend into a brief, or nothing if it maps to no category we draw.
 *
 * `variant` picks which of the category's two drawings to ask for. On most days exactly one trend is
 * drawable, so filling a two-a-day quota means two different pictures out of the same category rather
 * than the same picture twice.
 */
export function briefFor(t: Trend, variant = 0): { niche: string; prompt: string; slug: string } | null {
  const blob = `${t.term} ${t.news.map((n) => n.title).join(" ")}`;
  const hit = CATEGORY.find((c) => c.test.test(blob));
  if (!hit) return null;
  const draw = hit.draws[variant % hit.draws.length];
  // Named after what we are DRAWING, never after the trend. The trend is only the reason we picked the
  // category; putting its term in the slug drags a town, a person or a title into our own data (and into
  // file names) for a design that has nothing to do with it.
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const slug = `trend-${hit.niche.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${day}-v${variant + 1}`;
  return {
    niche: hit.niche, slug,
    prompt: `${draw.subject}, drawn in ${draw.palette}, thick confident outlines and flat colour blocks, `
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

function titleFor(keywords: string[], variant = 0): string {
  const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  // Rotate which keyword leads. Two variants in one shop under one niche would otherwise carry the same
  // title and the same first-40-characters, which is two of our listings chasing one query.
  const lead = variant % keywords.length;
  const kw = [...keywords.slice(lead), ...keywords.slice(0, lead)];
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
 * One round across every enabled shop. Scans once, then fills the day's quota.
 *
 * The operator's requirement is two products a day, ready to go. Usable trends are scarcer than that —
 * most days exactly one survives the IP and harm filters — so the quota is filled by taking a SECOND
 * drawing from the same category rather than by loosening a filter. Two pictures, two lead keywords,
 * one trend. On a day where nothing survives, the honest output is fewer than two and the log says so.
 *
 * A trend-drawing goes to ONE shop and the next one starts from the next shop in the ring. The category
 * map is shop-agnostic, so letting every shop draft the same trend would put the same illustration under
 * the same title in two of our own Etsy shops, splitting one query between listings we both own.
 */
export async function runTrendRound(
  shopIds: number[],
  opts: { perDay?: number; geos?: string } = {},
) {
  const target = opts.perDay ?? 2;
  const trends = await scanTrends(opts.geos ?? "US,GB,CA");
  const usable = trends.filter((t) => t.verdict === "USABLE");
  const review = trends.filter((t) => t.verdict === "REVIEW");

  // Variant 1 of every usable trend first, then variant 2 of each. A second trend beats a second drawing
  // of the first one, but a second drawing beats an empty slot.
  const work: { t: Trend; variant: number }[] = [
    ...usable.map((t) => ({ t, variant: 0 })),
    ...usable.map((t) => ({ t, variant: 1 })),
  ];

  const made: { shopId: number; slug: string; niche: string; term: string }[] = [];
  const skipped: { term: string; why: string }[] = [];
  let turn = 0;

  for (const w of work) {
    if (made.length >= target) break;
    const b = briefFor(w.t, w.variant);
    if (!b) {
      if (w.variant === 0) skipped.push({ term: w.t.term, why: "cizdigimiz bir kategoriye oturmadi" });
      continue;
    }

    let target_shop: number | null = null;
    for (let i = 0; i < shopIds.length; i++) {
      const id = shopIds[(turn + i) % shopIds.length];
      // Same drawing twice is a duplicate; the same NICHE on an earlier day is self-competition, since
      // two astronomy trends a fortnight apart produce the same thirteen tags. Today's own variants are
      // allowed to share a niche — that is what makes two-a-day possible at all.
      const dup = await q(
        `SELECT 1 FROM products
          WHERE shop_id = $1
            AND (slug = $2
                 OR (niche = $3 AND slug LIKE 'trend-%'
                     AND created_at < date_trunc('day', now() AT TIME ZONE 'America/Chicago')))
          LIMIT 1`, [id, b.slug, b.niche]);
      if (dup.length) continue;
      target_shop = id;
      break;
    }
    if (target_shop === null) {
      skipped.push({ term: w.t.term, why: "bu kategori acik magazalarda zaten var" });
      continue;
    }
    turn = (shopIds.indexOf(target_shop) + 1) % shopIds.length;

    try {
      // Tomorrow, not today: the design has to be drawn before anyone can look at it, and a slot that
      // has already passed makes the operator approve something they have not seen.
      const when = new Date(Date.now() + 24 * 3600_000);
      when.setUTCHours(15, 0, 0, 0);
      const out = await draftProduct({
        slug: b.slug, niche: b.niche, technique: "dtf",
        title: titleFor(KW[b.niche], w.variant), description: AI_NOTE + BODY, tags: KW[b.niche],
        design_prompt: b.prompt, scheduled_at: when.toISOString(),
      }, target_shop);
      // The plan page groups by slot; without one these products used to be invisible on the only screen
      // built for approving them. TR is their own bucket.
      await q(`UPDATE products SET slot = 'TR' WHERE id = $1`, [out.id]);
      made.push({ shopId: target_shop, slug: out.slug, niche: b.niche, term: w.t.term });
    } catch (e: any) {
      skipped.push({ term: w.t.term, why: String(e.message).slice(0, 90) });
    }
  }

  const short = made.length < target
    ? ` · HEDEFIN ${target - made.length} ALTINDA (cizilebilir trend yok)` : "";
  await logEvent("trend_run", {
    detail: `${trends.length} trend · ${usable.length} cizilebilir · ${made.length}/${target} urun · `
          + `${shopIds.length} magaza · ${review.length} insan bakmali${short}`,
  });
  return { scanned: trends.length, usable: usable.length, target, shops: shopIds, made, skipped,
           review: review.map((t) => ({ term: t.term, geo: t.geo, headline: t.news[0]?.title ?? "" })) };
}

/** Shops that asked for the daily run. Opt-in, so a new shop never wakes up to a batch it didn't order. */
export async function trendShops(): Promise<number[]> {
  const rows = await q<{ id: number }>(
    `SELECT id FROM shops WHERE coalesce(settings->>'trend_daily','') = 'true' ORDER BY id`);
  return rows.map((r) => r.id);
}

/** One shop, on demand — the manual entry point behind /api/cron/trends?shop=N. */
export async function runTrendDay(shopId: number, opts: { perDay?: number; geos?: string } = {}) {
  return runTrendRound([shopId], opts);
}
