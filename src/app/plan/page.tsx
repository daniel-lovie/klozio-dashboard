import { redirect } from "next/navigation";
import Link from "next/link";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId } from "@/lib/shops";
import { buildWeeks, defaultWeek } from "@/lib/weeks";
import { money, dayKeyTZ, timeInShopTZ, TZ_LABEL } from "@/lib/fmt";
import { ContentApprove, BulkApprove } from "@/components/ContentApprove";

type Row = {
  pid: number; slug: string; slot: string; tree: string; niche: string;
  concept_no: number; variant: number; title: string; tags: string[];
  description: string; hook: string | null; visual_idea: string | null;
  personalised: boolean; price_cents: number;
  design_prompt: string | null; design_model: string | null;
  mockup_prompt: string | null; hero_colorway: string | null;
  mockup_prompt_hanging: string | null; mockup_prompt_model: string | null;
  content_status: "draft" | "approved" | "rejected"; content_note: string | null;
  scheduled_at: string; sched_status: string; image_count: number;
};

export default async function PlanPage({
  searchParams,
}: { searchParams: Promise<{ slot?: string; status?: string; week?: string }> }) {
  if (!(await isLoggedIn())) redirect("/login");
  const sp = await searchParams;

  const where: string[] = ["p.slot IS NOT NULL"];
  const params: any[] = [];
  if (sp.slot) { params.push(sp.slot); where.push(`p.slot = $${params.length}`); }
  if (sp.status) { params.push(sp.status); where.push(`p.content_status = $${params.length}`); }

  const shopId = await currentShopId();

  // Weeks come from this shop's own schedule, so the bar cannot drift out of date.
  const dayCounts = await q<{ day: string; n: number }>(
    `SELECT (s.scheduled_at AT TIME ZONE 'America/Chicago')::date::text AS day, count(*)::int AS n
       FROM schedule s JOIN products p ON p.id = s.product_id
      WHERE p.shop_id = ${shopId} AND p.slot IS NOT NULL
      GROUP BY 1 ORDER BY 1`);
  const today = new Date();
  const weeks = buildWeeks(dayCounts, today);
  // Default to the week containing today; if that week is empty, the nearest week that has rows — opening
  // on a week with nothing in it reads as "the plan is gone".
  const fallback = defaultWeek(weeks, today);
  const wantWeek = sp.week ?? (sp.slot || sp.status ? "all" : fallback?.key ?? "all");
  const wk = weeks.find((w) => w.key === wantWeek);
  if (wk) {
    params.push(wk.from, wk.to);
    where.push(`(s.scheduled_at AT TIME ZONE 'America/Chicago')::date
                BETWEEN $${params.length - 1}::date AND $${params.length}::date`);
  }

  const rows = await q<Row>(
    `SELECT p.id AS pid, p.slug, p.slot, p.tree, p.niche, p.concept_no, p.variant,
            p.title, p.tags, p.description, p.hook, p.visual_idea, p.personalised,
            p.design_prompt, p.design_model, p.mockup_prompt, p.hero_colorway,
            p.mockup_prompt_hanging, p.mockup_prompt_model,
            p.price_cents, p.content_status, p.content_note,
            s.scheduled_at, s.status AS sched_status,
            (SELECT count(*)::int FROM product_images i WHERE i.product_id = p.id) AS image_count
       FROM products p JOIN schedule s ON s.product_id = p.id
      WHERE p.shop_id=${shopId} AND ${where.join(" AND ")}
      ORDER BY s.scheduled_at, p.slot, p.concept_no, p.variant`, params);

  const totals = await q<{ content_status: string; n: number }>(
    `SELECT content_status, count(*)::int AS n FROM products WHERE slot IS NOT NULL AND shop_id=${shopId} GROUP BY 1`);
  const slots = await q<{ slot: string; niche: string; n: number; ok: number }>(
    `SELECT slot, min(niche) AS niche, count(*)::int AS n,
            count(*) FILTER (WHERE content_status='approved')::int AS ok
       FROM products WHERE slot IS NOT NULL AND shop_id=${shopId} GROUP BY slot
      ORDER BY left(slot,1), length(slot), slot`);

  const tally = Object.fromEntries(totals.map((t) => [t.content_status, t.n]));
  const days = [...new Set(rows.map((r) => dayKeyTZ(r.scheduled_at)))];

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">August plan — content review</h1>
          <p className="mt-1 text-sm text-muted">
            200 listings · 100 concepts × 2 title variants · 21 slots · 3–31 Aug ({TZ_LABEL}).
            Approving here marks the copy ready so artwork can be generated. It does <strong>not</strong> schedule
            or publish anything — launch still needs images and its own approval.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-emerald-900">
            approved {tally.approved ?? 0}
          </span>
          <span className="rounded-lg bg-espresso/10 px-3 py-1.5">draft {tally.draft ?? 0}</span>
          <span className="rounded-lg bg-red-100 px-3 py-1.5 text-red-900">rejected {tally.rejected ?? 0}</span>
          <Link href="/" className="rounded-lg border border-espresso/25 px-3 py-1.5">Calendar</Link>
        </div>
      </header>

      {/* week navigation */}
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {weeks.map((w) => (
          <Link key={w.key} href={`/plan?week=${w.key}`}
            className={`rounded-lg border px-3 py-1.5 ${
              wk?.key === w.key ? "border-espresso bg-espresso/10 font-medium" : "border-espresso/20"}`}>
            {w.current ? "bu hafta" : w.label}
            <span className="ml-1 text-muted">{w.current ? w.label : `${w.count}`}</span>
          </Link>
        ))}
        <Link href="/plan?week=all"
          className={`rounded-lg border px-3 py-1.5 ${
            !wk ? "border-espresso bg-espresso/10 font-medium" : "border-espresso/20"}`}>
          tüm haftalar <span className="text-muted">ağır</span>
        </Link>
      </nav>

      {/* slot filter + per-slot bulk approve */}
      <section className="mb-8 rounded-xl border border-espresso/15 bg-white/60 p-4">
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-sm font-medium">Slots</h2>
          <Link href="/plan" className="text-xs text-muted underline">clear filter</Link>
          <Link href="/plan?status=draft" className="text-xs text-muted underline">only un-reviewed</Link>
        </div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {slots.map((s) => (
            <div key={s.slot}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                s.ok === s.n ? "border-emerald-300 bg-emerald-50" : "border-espresso/15"}`}>
              <Link href={`/plan?slot=${s.slot}`} className="truncate">
                <span className="font-medium">{s.slot}</span>{" "}
                <span className="text-muted">{s.niche}</span>{" "}
                <span className="tabular-nums">{s.ok}/{s.n}</span>
              </Link>
              <BulkApprove slot={s.slot} label={s.slot} />
            </div>
          ))}
        </div>
      </section>

      {days.map((day) => {
        const dayRows = rows.filter((r) => dayKeyTZ(r.scheduled_at) === day);
        const d = new Date(`${day}T12:00:00Z`);
        return (
          <section key={day} className="mb-8">
            <div className="mb-2 flex flex-wrap items-center gap-3 border-b border-espresso/15 pb-1.5">
              <h2 className="text-base font-semibold">
                {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
              </h2>
              <span className="text-xs text-muted">{dayRows.length} listings</span>
              <BulkApprove date={day} label="this day" />
            </div>

            <div className="space-y-2">
              {dayRows.map((r) => (
                <details key={r.pid}
                  className={`group rounded-xl border bg-white/60 px-4 py-3 ${
                    r.content_status === "approved" ? "border-emerald-300"
                    : r.content_status === "rejected" ? "border-red-300" : "border-espresso/15"}`}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <span className="rounded bg-espresso/10 px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                        {r.slot} · c{r.concept_no} · v{r.variant}
                      </span>
                      <span className="text-xs text-muted">{timeInShopTZ(r.scheduled_at)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                      <span className="text-xs tabular-nums">{money(r.price_cents)}</span>
                      {r.personalised && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">
                          text personalised
                        </span>
                      )}
                      {r.image_count === 0 && (
                        <span className="text-[11px] text-muted">no artwork yet</span>
                      )}
                      <ContentApprove productId={r.pid} status={r.content_status} note={r.content_note} />
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-4 border-t border-espresso/10 pt-4 lg:grid-cols-2">
                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Line printed on the shirt
                      </h3>
                      <p className="mt-1 rounded-lg bg-espresso/5 px-3 py-2 font-medium">
                        {r.hook || <span className="text-muted">illustration only — no text</span>}
                      </p>

                      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Visual idea (for generation)
                      </h3>
                      <p className="mt-1 text-sm">{r.visual_idea}</p>

                      <details className="mt-3">
                        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Design prompt · {r.design_model} · cover on {r.hero_colorway}
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-espresso/5 px-3 py-2 font-sans text-[12px] leading-relaxed">{r.design_prompt}</pre>
                      </details>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Mockup 1 · cover flat lay ({r.hero_colorway})
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-espresso/5 px-3 py-2 font-sans text-[12px] leading-relaxed">{r.mockup_prompt}</pre>
                      </details>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Mockup 2 · hanging
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-espresso/5 px-3 py-2 font-sans text-[12px] leading-relaxed">{r.mockup_prompt_hanging}</pre>
                      </details>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Mockup 3 · on-model
                        </summary>
                        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-espresso/5 px-3 py-2 font-sans text-[12px] leading-relaxed">{r.mockup_prompt_model}</pre>
                      </details>

                      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Title · {r.title.length}/140 chars
                      </h3>
                      <p className="mt-1 text-sm">{r.title}</p>

                      <h3 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Tags · {r.tags.length}/13
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded bg-espresso/8 px-1.5 py-0.5 text-[11px]">{t}</span>
                        ))}
                      </div>

                      <p className="mt-4 text-[11px] text-muted">
                        {r.slot} · {r.niche} · {r.tree} · slug <code>{r.slug}</code>
                      </p>
                    </div>

                    <div>
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Description</h3>
                      <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-espresso/5 px-3 py-2 font-sans text-[13px] leading-relaxed">
{r.description}
                      </pre>
                      <p className="mt-2 text-[11px] text-muted">
                        Variant {r.variant} of 2 — same artwork and price, different title word order.
                        Both list; they catch different searches.
                      </p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}

      {rows.length === 0 && (
        <p className="rounded-xl border border-espresso/15 bg-white/60 p-6 text-sm text-muted">
          Nothing matches. Run <code>npm run db:plan</code> to load the August plan, or clear the filter.
        </p>
      )}
    </main>
  );
}
