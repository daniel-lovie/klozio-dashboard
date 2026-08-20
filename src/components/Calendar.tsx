"use client";
import { useEffect, useMemo, useState } from "react";
import { STATUS_STYLE, money, dayKey, dayKeyTZ, timeInShopTZ, TZ_LABEL } from "@/lib/fmt";

type Row = {
  id: number;
  scheduled_at: string;
  status: string;
  last_error: string | null;
  product_id: number;
  slug: string;
  title: string;
  price_cents: number;
  colorways: string[];
  sizes: string[];
  seo_score: number | null;
  net_margin_pct: string | null;
  etsy_listing_id: string | null;
  etsy_state: string | null;
  cover_image_id: number | null;
  image_count: string;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function Calendar() {
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const monthParam = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/schedule?month=${monthParam}`, { cache: "no-store" });
    if (res.status === 401) { location.href = "/login"; return; }
    const j = await res.json();
    setRows(j.rows ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [monthParam]);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = dayKeyTZ(r.scheduled_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [rows]);

  // Monday-first grid
  const first = new Date(ym.y, ym.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(ym.y, ym.m, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayKey = dayKey(today);
  const isCurrentMonth = ym.y === today.getFullYear() && ym.m === today.getMonth();

  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});

  async function approve(id: number, on: boolean) {
    const res = await fetch(`/api/schedule/${id}/approve`, { method: on ? "POST" : "DELETE" });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || "Failed");
    else setMsg(null);
    load();
  }

  /**
   * Move a launch to another day, keeping its time of day.
   *
   * The endpoint already resets approval when a row moves, which is the behaviour we want and the reason
   * dragging is safe to offer: a launch that changes date is a launch the operator re-confirms. Only the
   * DATE comes from the drop; the hour stays where it was, because the stagger across a day was chosen
   * deliberately and a drop target has no hour in it.
   */
  async function moveTo(scheduleId: number, day: Date) {
    const r = rows.find((x) => x.id === scheduleId);
    if (!r) return;
    if (r.status === "published") { setMsg("Published launches cannot be moved."); return; }
    const from = new Date(r.scheduled_at);
    const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
                        from.getHours(), from.getMinutes(), 0, 0);
    if (to.getTime() === from.getTime()) return;
    // Optimistic: the card follows the cursor immediately and the reload confirms it. A drag that only
    // moves after a round trip feels broken even when it works.
    setRows((cur) => cur.map((x) => x.id === scheduleId
      ? { ...x, scheduled_at: to.toISOString(), status: "pending" } : x));
    const res = await fetch(`/api/schedule/${scheduleId}/reschedule`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduled_at: to.toISOString() }),
    });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || "Move failed");
    else setMsg(`${r.slug} moved to ${to.toLocaleDateString()} — approval reset`);
    load();
  }

  async function runNow() {
    setMsg("Running scheduler…");
    const res = await fetch("/api/cron/publish", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? `Scheduler: claimed ${j.claimed ?? 0}` : j.error || "Failed");
    load();
  }

  const shift = (d: number) => {
    const nd = new Date(ym.y, ym.m + d, 1);
    setYm({ y: nd.getFullYear(), m: nd.getMonth() });
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {MONTHS[ym.m]} {ym.y}
        </h1>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
          times in {TZ_LABEL}
        </span>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="rounded border border-line px-2 py-1 text-sm hover:bg-sunken">←</button>
          <button onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })}
                  className="rounded border border-line px-2 py-1 text-sm hover:bg-sunken">Today</button>
          <button onClick={() => shift(1)} className="rounded border border-line px-2 py-1 text-sm hover:bg-sunken">→</button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(STATUS_STYLE).map(([k, s]) =>
            counts[k] ? (
              <span key={k} className={`rounded-full border px-2 py-0.5 ${s.bg} ${s.text}`}>
                {s.label}: {counts[k]}
              </span>
            ) : null
          )}
          <a href="/portfolio" className="rounded border border-line px-3 py-1.5 hover:bg-sunken">Portfolio</a>
          <button onClick={runNow} className="rounded bg-espresso px-3 py-1.5 text-ivory hover:opacity-90">
            Run scheduler now
          </button>
          <button onClick={() => fetch("/api/logout", { method: "POST" }).then(() => (location.href = "/login"))}
                  className="rounded border border-line px-3 py-1.5 hover:bg-sunken">Sign out</button>
        </div>
      </header>

      {msg && <div className="mb-4 rounded-lg border border-amber/40 bg-warn-soft px-3 py-2 text-sm">{msg}</div>}

      {/* Month grid from sm up. On a 375px phone seven columns give ~50px per day, which fits a date and
          nothing else — so the phone gets the same cards in a vertical list of the days that have work. The
          card itself is ONE component used by both, or the two views drift apart. */}
      <div className="hidden grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-sunken sm:grid">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} className="bg-ivory px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted">{d}</div>
        ))}
        {cells.map((d, i) => {
          const k = d ? dayKey(d) : `x${i}`;
          // The calendar opens on today and the days behind it are not shown. Everything before now is
          // either published or abandoned; either way it is history, and it was pushing the only rows
          // that can still be acted on off the first screen. Stepping back a month with ← still shows
          // that month in full — the past is hidden, not unreachable.
          const past = Boolean(d) && isCurrentMonth && dayKey(d!) < todayKey;
          const items = d && !past ? byDay.get(k) ?? [] : [];
          const isToday = d && dayKey(d) === todayKey;
          const isDropTarget = Boolean(d) && !past && dragId !== null;
          return (
            <div key={k}
              className={`min-h-[132px] p-1.5 transition-colors ${d ? "" : "opacity-40"} `
                + (past ? "bg-sunken/40 " : "bg-ivory ")
                + (overKey === k && isDropTarget ? "ring-2 ring-inset ring-espresso/50 " : "")}
              onDragOver={(e) => { if (isDropTarget) { e.preventDefault(); setOverKey(k); } }}
              onDragLeave={() => setOverKey((cur) => (cur === k ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setOverKey(null);
                if (isDropTarget && dragId !== null && d) moveTo(dragId, d);
                setDragId(null);
              }}>
              {d && (
                <div className={`mb-1 text-xs ${isToday ? "font-bold text-warn" : past ? "text-muted/40" : "text-muted"}`}>
                  {d.getDate()}
                </div>
              )}
              <div className="space-y-1">
                {items.map((r) => (
                  <ItemCard key={r.id} r={r} approve={approve}
                            onDragStart={() => setDragId(r.id)} onDragEnd={() => { setDragId(null); setOverKey(null); }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 sm:hidden">
        {cells.filter((d): d is Date => !!d)
              .filter((d) => (byDay.get(dayKey(d)) ?? []).length > 0)
              .map((d) => {
          const items = byDay.get(dayKey(d)) ?? [];
          const isToday = dayKey(d) === dayKey(today);
          return (
            <section key={dayKey(d)} className="rounded-lg border border-line bg-ivory p-2">
              <div className={`mb-2 flex items-center gap-2 text-sm ${isToday ? "font-bold text-warn" : "text-muted"}`}>
                <span>{d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })}</span>
                {isToday && <span className="rounded-full bg-warn/20 px-2 py-0.5 text-[11px]">bugün</span>}
                <span className="ml-auto text-[11px]">{items.length} ürün</span>
              </div>
              <div className="space-y-2">
                {items.map((r) => <ItemCard key={r.id} r={r} approve={approve} />)}
              </div>
            </section>
          );
        })}
        {!loading && rows.length > 0 && cells.filter((d) => d && (byDay.get(dayKey(d)) ?? []).length).length === 0 && (
          <p className="text-sm text-muted">Bu ayda planlanmış ürün yok.</p>
        )}
      </div>

      {loading && <p className="mt-4 text-sm text-muted">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          Nothing scheduled this month. Seed products with <code className="rounded bg-raised px-1">npm run db:seed</code>.
        </p>
      )}
    </div>
  );
}

/** One scheduled product, as shown in both the month grid and the phone list. Two copies of this markup
 *  would drift: a fix applied to the grid would silently miss the view most operators use on the road. */
function ItemCard({ r, approve, onDragStart, onDragEnd }: {
  r: Row; approve: (id: number, ok: boolean) => void;
  onDragStart?: () => void; onDragEnd?: () => void;
}) {
  const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
  // A published launch has a live Etsy listing behind it; moving its row would say something untrue
  // about a thing that already happened, so it does not lift.
  const movable = r.status !== "published";
  return (
    <div
      draggable={movable}
      onDragStart={(e) => { if (movable) { e.dataTransfer.effectAllowed = "move"; onDragStart?.(); } }}
      onDragEnd={() => onDragEnd?.()}
      title={movable ? "Drag to another day" : "Published — cannot be moved"}
      className={`rounded-lg border p-1.5 ${s.bg} ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}>
      <a href={`/product/${r.product_id}?s=${r.id}`} className="flex gap-1.5">
        {r.cover_image_id ? (
          <img src={`/api/images/${r.cover_image_id}`} alt=""
               className="h-11 w-11 flex-none rounded object-cover" />
        ) : (
          <div className="grid h-11 w-11 flex-none place-items-center rounded bg-raised text-[9px] text-muted">no img</div>
        )}
        <div className="min-w-0">
          <div className={`truncate text-[11px] font-medium leading-tight ${s.text}`}>{r.title}</div>
          <div className="text-[10px] text-muted">
            {timeInShopTZ(r.scheduled_at)}{" · "}{money(r.price_cents)}
          </div>
          <div className={`text-[10px] ${s.text}`}>{s.label}</div>
        </div>
      </a>
      {r.status === "pending" && (
        <button onClick={() => approve(r.id, true)}
                className="mt-1 w-full rounded bg-ok px-1 py-0.5 text-[10px] font-medium text-white hover:opacity-90">
          Approve
        </button>
      )}
      {r.status === "approved" && (
        <button onClick={() => approve(r.id, false)}
                className="mt-1 w-full rounded border border-line-strong px-1 py-0.5 text-[10px] hover:bg-sunken">
          Un-approve
        </button>
      )}
      {r.status === "failed" && r.last_error && (
        <div className="mt-1 line-clamp-3 text-[9px] text-danger">{r.last_error}</div>
      )}
    </div>
  );
}
