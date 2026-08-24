/**
 * The daily trend run: watch what people are searching all day, keep only what we may legally and
 * decently draw, and leave finished products waiting for one click.
 *
 * SEPARATE THE WATCHING FROM THE DRAWING. That split is the whole redesign. The old version scanned
 * once a night, and the feed it scanned holds ten items per geo on a rolling window — two reads a
 * MINUTE apart shared only 25 of 30 terms. One nightly read therefore saw a sliver of the day and had
 * no way of knowing what it missed. Now `recordScan()` runs on every scheduler tick and writes what it
 * sees; `runTrendRound()` runs once, at 19:00 America/Chicago, and draws from everything recorded.
 *
 * What is taken from a trend is never its subject. No person, no character, no team, no mark. The
 * category is taken and the drawing is written from the trend within that category — so a Perseid
 * night draws meteors rather than the same ringed moon every astronomy day drew before.
 *
 * Nothing here approves and nothing here touches Etsy: every product lands on a `pending` schedule
 * row. That is rule 1 of this project, and the only thing between an automated pipeline and an
 * automated mistake.
 */
import { draftProduct } from "./agent/draft-product";
import { q, logEvent } from "./db";
import { scan, hasSerpApi, type RawTrend } from "./trends/sources";
import { judge, type Judged } from "./trends/classify";
import { CATEGORIES, categoryFor, subjectFor, promptFrom } from "./trends/design";

const GEOS = () => (process.env.TREND_GEOS || "US").split(",").map((s) => s.trim()).filter(Boolean);

/** How long a niche is off-limits in a shop after it has been drawn there. */
const COOLDOWN_DAYS = () => Number(process.env.TREND_NICHE_COOLDOWN_DAYS || 60);

const AI_NOTE =
  "ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part of my "
  + "design process, then refined and prepared for print by hand. Original illustration.";
const BODY =
  "\n\nPrinted onto a soft cotton tee — full colour, no cracking, no stiff patch. Unisex fit, true to "
  + "size, sizes S through 4XL. Made to order and shipped from the US.";

function titleFor(keywords: string[], variant = 0): string {
  const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  // Rotate which keyword leads. Two variants under one niche would otherwise carry the same title and
  // the same first forty characters, which is two of our listings chasing one query.
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
 * Look, judge, remember. Safe to call as often as the scheduler ticks.
 *
 * `first_seen` is never moved on conflict — a trend that keeps reappearing must keep its original age,
 * or a widened window would always find it "fresh" and the escalation would never really reach back.
 * `last_seen` moves instead, which is what tells us a trend is still running.
 */
export async function recordScan(hours = 24): Promise<{ seen: number; fresh: number; source: string; note: string }> {
  const res = await scan(GEOS(), hours);
  const judged = await judge(res.trends, { useModel: process.env.TREND_MODEL_JUDGE !== "false" });
  let fresh = 0;
  for (const t of judged) {
    const rows = await q<{ id: number }>(
      `INSERT INTO trend_seen (geo, term, verdict, reason, headlines, traffic, source, volume,
                               increase_pct, categories, breakdown, judged_by, last_seen)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (geo, term) DO UPDATE
         SET last_seen = now(),
             volume    = greatest(coalesce(trend_seen.volume, 0), coalesce(EXCLUDED.volume, 0)),
             verdict   = CASE WHEN trend_seen.judged_by = 'model' THEN trend_seen.verdict
                              ELSE EXCLUDED.verdict END
       RETURNING (xmax = 0) AS inserted, id`,
      [t.geo, t.term, t.verdict, t.reason, t.headlines.join(" · "), t.volume ? String(t.volume) : "",
       t.source, t.volume, t.increasePct, t.categories.join(", "), t.breakdown.join(" · "), t.judgedBy]);
    if ((rows[0] as any)?.inserted) fresh++;
  }
  return { seen: judged.length, fresh, source: res.source, note: res.note };
}

/** Stored trends we may still draw, biggest first, within a lookback window. */
async function drawable(hours: number): Promise<Judged[]> {
  const rows = await q<any>(
    `SELECT geo, term, coalesce(headlines,'') headlines, coalesce(categories,'') categories,
            coalesce(breakdown,'') breakdown, volume, increase_pct, source, reason
       FROM trend_seen
      WHERE verdict = 'USABLE' AND used_at IS NULL
        AND first_seen > now() - ($1 || ' hours')::interval
      ORDER BY coalesce(volume, 0) DESC, first_seen DESC`, [String(hours)]);
  return rows.map((r) => ({
    source: r.source, geo: r.geo, term: r.term, volume: r.volume, increasePct: r.increase_pct,
    categories: r.categories ? r.categories.split(", ").filter(Boolean) : [],
    breakdown: r.breakdown ? r.breakdown.split(" · ").filter(Boolean) : [],
    headlines: r.headlines ? r.headlines.split(" · ").filter(Boolean) : [],
    startedAt: null, verdict: "USABLE" as const, reason: r.reason ?? "", judgedBy: "rule" as const,
  }));
}

/** Shops that asked for the daily run. Opt-in, so a new shop never wakes up to a batch it didn't order. */
export async function trendShops(): Promise<number[]> {
  const rows = await q<{ id: number }>(
    `SELECT id FROM shops WHERE coalesce(settings->>'trend_daily','') = 'true' ORDER BY id`);
  return rows.map((r) => r.id);
}

export type DrawRequest = { trend: Judged; variant: number };

/**
 * Draft one product from one trend, into the first shop in the ring that can take it.
 *
 * Two things make a shop unable to take it: the same title already there — the actual harm being
 * prevented is two of our own listings chasing one query — or the same niche drawn there inside the
 * cooldown. The cooldown is a WINDOW, not "ever": blocking a niche forever gave the system a hard
 * ceiling of one product per category per shop, after which it ran every night and produced nothing.
 */
async function draftOne(
  req: DrawRequest, shopIds: number[], turn: number,
): Promise<{ ok: true; shopId: number; slug: string; niche: string; from: string; turn: number }
         | { ok: false; why: string }> {
  const cat = categoryFor(req.trend);
  if (!cat) return { ok: false, why: "cizdigimiz bir kategoriye oturmadi" };

  const { subject, from } = await subjectFor(req.trend, cat, req.variant,
    { useModel: process.env.TREND_MODEL_SUBJECT !== "false" });
  const title = titleFor(cat.tags, req.variant);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // Named after what we are DRAWING, never after the trend: putting a town's or a person's name in the
  // slug drags it into our data and file names for a picture that has nothing to do with them.
  const slug = `trend-${cat.niche.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${day}-v${req.variant + 1}`;

  for (let i = 0; i < shopIds.length; i++) {
    const id = shopIds[(turn + i) % shopIds.length];
    const dup = await q(
      `SELECT 1 FROM products
        WHERE shop_id = $1
          AND (slug = $2 OR title = $3
               OR (niche = $4 AND slug LIKE 'trend-%'
                   AND created_at > now() - ($5 || ' days')::interval
                   AND created_at < date_trunc('day', now() AT TIME ZONE 'America/Chicago')))
        LIMIT 1`, [id, slug, title, cat.niche, String(COOLDOWN_DAYS())]);
    if (dup.length) continue;

    try {
      // Tomorrow, not today: the design has to be drawn before anyone can look at it, and a slot that
      // has already passed makes the operator approve something they have not seen.
      const when = new Date(Date.now() + 24 * 3600_000);
      when.setUTCHours(15, 0, 0, 0);
      const out = await draftProduct({
        slug, niche: cat.niche, technique: "dtf", title,
        description: AI_NOTE + BODY, tags: cat.tags,
        design_prompt: promptFrom(subject, cat, req.variant), scheduled_at: when.toISOString(),
      }, id);
      // The plan page groups by slot; without one these products were invisible on the only screen
      // built for approving them. TR is their own bucket.
      await q(`UPDATE products SET slot = 'TR' WHERE id = $1`, [out.id]);
      await q(`UPDATE trend_seen SET used_at = now() WHERE geo = $1 AND term = $2`,
              [req.trend.geo, req.trend.term]);
      return { ok: true, shopId: id, slug: out.slug, niche: cat.niche, from,
               turn: (shopIds.indexOf(id) + 1) % shopIds.length };
    } catch (e: any) {
      return { ok: false, why: String(e.message).slice(0, 90) };
    }
  }
  return { ok: false, why: `bu kategori acik magazalarda ${COOLDOWN_DAYS()} gun icinde cizilmis` };
}

/**
 * One night's drawing.
 *
 * The window escalates 24 → 48 → 72 → 96 only when the shorter one is empty, and a night that has to
 * reach back draws ONE instead of two: yesterday's leftovers are staler and thinner than today's, and
 * taking two of them would dress a quiet day up as a normal one.
 *
 * With a paid provider the escalation asks the SOURCE for the wider window as well as our own store,
 * because the source actually has history. On the free feed only the store can answer, which is
 * exactly why the store exists.
 */
export async function runTrendRound(shopIds: number[], opts: { perDay?: number } = {}) {
  const fullTarget = opts.perDay ?? 2;
  const WINDOWS = [24, 48, 72, 96];

  // Always look and always record, even on a night we end up drawing from the store: today's trends
  // have to be written down or tomorrow's widened window has nothing to widen into.
  const first = await recordScan(WINDOWS[0]);

  let usable = await drawable(WINDOWS[0]);
  let hours = WINDOWS[0];
  for (const h of WINDOWS.slice(1)) {
    if (usable.length) break;
    // A paid provider can be asked for the wider window directly; the free one cannot, and re-reading
    // it would return the same ten rows for the same cost in time.
    if (hasSerpApi()) await recordScan(h);
    usable = await drawable(h);
    hours = h;
  }
  const widened = hours > WINDOWS[0] && usable.length > 0;
  const target = widened ? 1 : fullTarget;

  // Variant 1 of every trend first, then variant 2 of each. A second trend beats a second drawing of
  // the first one, but a second drawing beats an empty slot.
  const work: DrawRequest[] = [
    ...usable.map((trend) => ({ trend, variant: 0 })),
    ...usable.map((trend) => ({ trend, variant: 1 })),
  ];

  const made: { shopId: number; slug: string; niche: string; term: string; from: string }[] = [];
  const skipped: { term: string; why: string }[] = [];
  let turn = 0;
  for (const w of work) {
    if (made.length >= target) break;
    const r = await draftOne(w, shopIds, turn);
    if (r.ok) { turn = r.turn; made.push({ ...r, term: w.trend.term }); }
    else if (w.variant === 0) skipped.push({ term: w.trend.term, why: r.why });
  }

  const bits = [
    `${first.seen} trend (${first.fresh} yeni)`,
    `kaynak: ${first.source}`,
    `${usable.length} cizilebilir (${hours}s)`,
    `${made.length}/${target} urun`,
    `${shopIds.length} magaza`,
  ];
  if (widened) bits.push(`${hours}s penceresine genisletildi, hedef 1`);
  if (made.length < target) bits.push(`HEDEFIN ${target - made.length} ALTINDA`);
  await logEvent("trend_run", { detail: bits.join(" · ") });

  return { scanned: first.seen, fresh: first.fresh, source: first.source, note: first.note,
           usable: usable.length, hours, widened, target, shops: shopIds, made, skipped };
}

/** One shop, on demand — the manual entry point behind /api/cron/trends?shop=N. */
export async function runTrendDay(shopId: number, opts: { perDay?: number } = {}) {
  return runTrendRound([shopId], opts);
}

/** Draw a specific stored trend on the operator's say-so, from the review screen. */
export async function drawTrend(trendId: number, shopId: number, variant = 0) {
  const rows = await q<any>(
    `SELECT geo, term, coalesce(headlines,'') headlines, coalesce(categories,'') categories,
            coalesce(breakdown,'') breakdown, volume FROM trend_seen WHERE id = $1`, [trendId]);
  if (!rows.length) throw new Error("trend bulunamadi");
  const r = rows[0];
  const trend: Judged = {
    source: "rss", geo: r.geo, term: r.term, volume: r.volume, increasePct: null,
    categories: r.categories ? r.categories.split(", ").filter(Boolean) : [],
    breakdown: r.breakdown ? r.breakdown.split(" · ").filter(Boolean) : [],
    headlines: r.headlines ? r.headlines.split(" · ").filter(Boolean) : [],
    startedAt: null, verdict: "USABLE", reason: "operator", judgedBy: "rule",
  };
  const out = await draftOne({ trend, variant }, [shopId], 0);
  if (!out.ok) throw new Error(out.why);
  await q(`UPDATE trend_seen SET verdict='USABLE', used_at=now(), judged_by='operator' WHERE id=$1`, [trendId]);
  return out;
}

export { CATEGORIES };
export type { Judged, RawTrend };
