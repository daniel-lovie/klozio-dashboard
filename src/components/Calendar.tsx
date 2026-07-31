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

  const counts = rows.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});

  async function approve(id: number, on: boolean) {
    const res = await fetch(`/api/schedule/${id}/approve`, { method: on ? "POST" : "DELETE" });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error || "Failed");
    else setMsg(null);
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
        <span className="rounded-full border border-espresso/20 px-2 py-0.5 text-[11px] text-muted">
          times in {TZ_LABEL}
        </span>
        <div className="flex gap-1">
          <button onClick={() => shift(-1)} className="rounded-md border border-espresso/20 px-2 py-1 text-sm hover:bg-white">←</button>
          <button onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })}
                  className="rounded-md border border-espresso/20 px-2 py-1 text-sm hover:bg-white">Today</button>
          <button onClick={() => shift(1)} className="rounded-md border border-espresso/20 px-2 py-1 text-sm hover:bg-white">→</button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(STATUS_STYLE).map(([k, s]) =>
            counts[k] ? (
              <span key={k} className={`rounded-full border px-2 py-0.5 ${s.bg} ${s.text}`}>
                {s.label}: {counts[k]}
              </span>
            ) : null
          )}
          <a href="/portfolio" className="rounded-md border border-espresso/20 px-3 py-1.5 hover:bg-white">Portfolio</a>
          <button onClick={runNow} className="rounded-md bg-espresso px-3 py-1.5 text-ivory hover:opacity-90">
            Run scheduler now
          </button>
          <button onClick={() => fetch("/api/logout", { method: "POST" }).then(() => (location.href = "/login"))}
                  className="rounded-md border border-espresso/20 px-3 py-1.5 hover:bg-white">Sign out</button>
        </div>
      </header>

      {msg && <div className="mb-4 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm">{msg}</div>}

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-espresso/15 bg-espresso/10">
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
          <div key={d} className="bg-ivory px-2 py-1.5 text-center text-xs font-medium uppercase tracking-wide text-muted">{d}</div>
        ))}
        {cells.map((d, i) => {
          const k = d ? dayKey(d) : `x${i}`;
          const items = d ? byDay.get(k) ?? [] : [];
          const isToday = d && dayKey(d) === dayKey(today);
          return (
            <div key={k} className={`min-h-[132px] bg-ivory p-1.5 ${d ? "" : "opacity-40"}`}>
              {d && (
                <div className={`mb-1 text-xs ${isToday ? "font-bold text-amber" : "text-muted"}`}>
                  {d.getDate()}
                </div>
              )}
              <div className="space-y-1">
                {items.map((r) => {
                  const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
                  return (
                    <div key={r.id} className={`rounded-lg border p-1.5 ${s.bg}`}>
                      <a href={`/product/${r.product_id}?s=${r.id}`} className="flex gap-1.5">
                        {r.cover_image_id ? (
                          <img src={`/api/images/${r.cover_image_id}`} alt=""
                               className="h-11 w-11 flex-none rounded object-cover" />
                        ) : (
                          <div className="grid h-11 w-11 flex-none place-items-center rounded bg-white/60 text-[9px] text-muted">no img</div>
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
                                className="mt-1 w-full rounded bg-emerald-700 px-1 py-0.5 text-[10px] font-medium text-white hover:opacity-90">
                          Approve
                        </button>
                      )}
                      {r.status === "approved" && (
                        <button onClick={() => approve(r.id, false)}
                                className="mt-1 w-full rounded border border-espresso/25 px-1 py-0.5 text-[10px] hover:bg-white">
                          Un-approve
                        </button>
                      )}
                      {r.status === "failed" && r.last_error && (
                        <div className="mt-1 line-clamp-3 text-[9px] text-red-800">{r.last_error}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {loading && <p className="mt-4 text-sm text-muted">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-4 text-sm text-muted">
          Nothing scheduled this month. Seed products with <code className="rounded bg-white px-1">npm run db:seed</code>.
        </p>
      )}
    </div>
  );
}
