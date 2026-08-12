/** Week bar for the plan page — derived from the schedule, never hardcoded.
 *
 * The plan page used to carry four literal August dates with the default pinned to the first one, so from
 * 10 August the page opened on a week that had already passed. Dates written into source rot silently;
 * these come from the shop's own schedule. Kept in its own module so the arithmetic can be tested without
 * rendering a page.
 */
export type Week = { key: string; label: string; from: string; to: string; count: number; current: boolean };

export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Monday of the week containing d, in UTC. Week boundaries only need to be stable, not timezone-exact. */
export function monday(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const shift = (x.getUTCDay() + 6) % 7;            // Mon=0 … Sun=6
  x.setUTCDate(x.getUTCDate() - shift);
  return x;
}

export function buildWeeks(days: { day: string; n: number }[], today: Date): Week[] {
  const counts = new Map(days.map((d) => [d.day, d.n]));
  const thisMon = monday(today);
  // The current week is always present even with nothing scheduled in it: an empty week the operator can
  // see is information, a week missing from the bar looks like a broken page.
  const first = days.length ? monday(new Date(days[0].day + "T00:00:00Z")) : thisMon;
  const last = days.length ? monday(new Date(days[days.length - 1].day + "T00:00:00Z")) : thisMon;
  const start = new Date(Math.min(first.getTime(), thisMon.getTime()));
  const end = new Date(Math.max(last.getTime(), thisMon.getTime()));
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const out: Week[] = [];
  for (const m = new Date(start); m <= end; m.setUTCDate(m.getUTCDate() + 7)) {
    const from = new Date(m);
    const to = new Date(m); to.setUTCDate(to.getUTCDate() + 6);
    let count = 0;
    for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) count += counts.get(iso(d)) ?? 0;
    out.push({ key: iso(from), from: iso(from), to: iso(to), count,
               label: `${fmt(from)}–${fmt(to)}`, current: iso(from) === iso(thisMon) });
  }
  return out;
}

/** Which week the page should open on: the current one, else the nearest week that actually has rows. */
export function defaultWeek(weeks: Week[], today: Date): Week | undefined {
  return weeks.find((w) => w.current && w.count > 0)
    ?? weeks.filter((w) => w.count > 0)
            .sort((a, b) => Math.abs(+new Date(a.from) - +today) - Math.abs(+new Date(b.from) - +today))[0]
    ?? weeks.find((w) => w.current);
}
