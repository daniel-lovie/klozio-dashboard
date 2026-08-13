import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { q, one } from "@/lib/db";
import { money, fmtDateTime, STATUS_STYLE } from "@/lib/fmt";
import Approve from "@/components/Approve";

export default async function ProductPage(
  { params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }
) {
  if (!(await isLoggedIn())) redirect("/login");
  const { id } = await params;
  const { s } = await searchParams;

  const p = await one<any>(`SELECT * FROM products WHERE id=$1`, [Number(id)]);
  if (!p) return <main className="p-8">Product not found.</main>;

  const imgs = await q<any>(
    `SELECT id, rank, role, label, filename, width, height FROM product_images WHERE product_id=$1 ORDER BY rank`,
    [Number(id)]
  );
  const sched = await q<any>(
    `SELECT * FROM schedule WHERE product_id=$1 ORDER BY scheduled_at`, [Number(id)]
  );
  const active = s ? sched.find((r) => String(r.id) === String(s)) : sched[0];
  const events = await q<any>(
    `SELECT kind, detail, created_at FROM events WHERE product_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [Number(id)]
  );

  const st = active ? STATUS_STYLE[active.status] ?? STATUS_STYLE.pending : null;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <a href="/" className="mb-4 inline-block text-sm text-muted hover:text-espresso">← Calendar</a>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">{p.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {p.slug} · {p.blank ?? "—"} · {p.print_method ?? "—"}
            {p.etsy_listing_id ? (
              <> · <a className="underline" target="_blank"
                     href={`https://www.etsy.com/listing/${p.etsy_listing_id}`}>listing {p.etsy_listing_id}</a>
                 {" "}({p.etsy_state})</>
            ) : " · not on Etsy yet"}
          </p>
        </div>
        {st && active && (
          <div className={`rounded-lg border px-4 py-3 ${st.bg}`}>
            <div className={`text-xs font-medium ${st.text}`}>{st.label}</div>
            <div className="text-sm">{fmtDateTime(active.scheduled_at)}</div>
          </div>
        )}
      </div>

      {active && <Approve scheduleId={active.id} status={active.status}
                          scheduledAt={active.scheduled_at} lastError={active.last_error} />}

      {/* ---- images ---- */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Images ({imgs.length}) — rank 1 is the cover
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {imgs.map((im) => (
            <figure key={im.id} className="overflow-hidden rounded-lg border border-line bg-raised">
              <img src={`/api/images/${im.id}`} alt={im.label ?? im.filename} className="aspect-square w-full object-cover" />
              <figcaption className="flex items-center justify-between px-2 py-1.5 text-[11px] text-muted">
                <span>#{im.rank} {im.role ?? ""} {im.label ? `· ${im.label}` : ""}</span>
                <span>{im.width}×{im.height}</span>
              </figcaption>
            </figure>
          ))}
          {imgs.length === 0 && <p className="text-sm text-danger">No images — Etsy requires at least one.</p>}
        </div>
      </section>

      {/* ---- details ---- */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-raised p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Listing</h2>
          <dl className="space-y-2 text-sm">
            <Row k="Price" v={money(p.price_cents)} />
            <Row k="Quantity" v={String(p.quantity)} />
            <Row k="Taxonomy" v={String(p.taxonomy_id)} />
            <Row k="Colorways" v={(p.colorways ?? []).join(", ") || "—"} />
            <Row k="Sizes" v={(p.sizes ?? []).join(", ")} />
            <Row k="Variations" v={String((p.colorways?.length || 1) * (p.sizes?.length || 0))} />
            <Row k="SEO score" v={p.seo_score ? `${p.seo_score}/100` : "—"} />
            {/* Against the floor, not bare. "47.5%" reads as healthy until you remember the floor is 55,
                and every margin in this shop was NULL until it was measured — so the page showed a dash
                while most of the catalogue sold under its own stated minimum. */}
            <Row k="Gross margin" v={pct(p.gross_margin_pct)} floor={55} value={p.gross_margin_pct} />
            <Row k="Net margin" v={pct(p.net_margin_pct)} floor={40} value={p.net_margin_pct} />
            <Row k="POD cost" v={money(p.pod_cost_cents)} />
            <Row k="Label cost" v={money(p.label_cost_cents)} />
            <Row k="Print file" v={p.print_file_name ? `${p.print_file_name} · ${p.print_file_w}×${p.print_file_h} @ ${p.print_dpi}dpi` : "—"} />
          </dl>
          <div className="mt-4">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Tags ({(p.tags ?? []).length}/13)</div>
            <div className="flex flex-wrap gap-1">
              {(p.tags ?? []).map((t: string) => (
                <span key={t} className="rounded-full border border-line bg-raised px-2 py-0.5 text-[11px]">{t}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-raised p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Description</h2>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{p.description}</pre>
          {!/AI image-generation tools/i.test(p.description ?? "") && (
            <p className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">
              ⚠️ No AI disclosure sentence detected in the description. Etsy has enforced this since 14 Jan 2026.
            </p>
          )}
        </div>
      </section>

      {/* ---- history ---- */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">History</h2>
        <ul className="space-y-1 text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-40 flex-none text-muted">{fmtDateTime(e.created_at)}</span>
              <span className="font-medium">{e.kind}</span>
              <span className="text-muted">{e.detail}</span>
            </li>
          ))}
          {events.length === 0 && <li className="text-muted">Nothing yet.</li>}
        </ul>
      </section>
    </main>
  );
}

function pct(v: unknown): string {
  return v === null || v === undefined ? "—" : `${v}%`;
}

function Row({ k, v, floor, value }: { k: string; v: string; floor?: number; value?: unknown }) {
  const n = value === null || value === undefined ? null : Number(value);
  const under = floor !== undefined && n !== null && Number.isFinite(n) && n < floor;
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-1">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right font-medium ${under ? "text-danger" : ""}`}>
        {v}{under && <span className="ml-1 font-normal text-danger">· taban %{floor}</span>}
      </dd>
    </div>
  );
}
