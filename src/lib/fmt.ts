export const money = (cents?: number | null) =>
  cents == null ? "—" : `$${(cents / 100).toFixed(2)}`;

/** Everything in the dashboard is shown in the SHOP's timezone (producer + buyers are US Central),
 *  never the viewer's. A launch calendar that shifts when you travel is worse than useless. */
export const SHOP_TZ = process.env.NEXT_PUBLIC_SHOP_TIMEZONE || "America/Chicago";

const partsIn = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) if (p.type !== "literal") o[p.type] = p.value;
  return o;
};

/** YYYY-MM-DD of an instant *as seen in the shop timezone* — used to bucket calendar cells. */
export const dayKeyTZ = (iso: string | Date) => {
  const p = partsIn(iso);
  return `${p.year}-${p.month}-${p.day}`;
};

/** Local-date key for a Date already constructed in local terms (calendar grid cells). */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const timeInShopTZ = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { timeZone: SHOP_TZ, hour: "numeric", minute: "2-digit" });

export const TZ_LABEL = SHOP_TZ.split("/")[1].replace("_", " ");

export const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:    { bg: "bg-amber-100 border-amber-300",   text: "text-amber-900",  label: "Needs approval" },
  approved:   { bg: "bg-emerald-100 border-emerald-300", text: "text-emerald-900", label: "Approved" },
  publishing: { bg: "bg-blue-100 border-blue-300",     text: "text-blue-900",   label: "Publishing…" },
  published:  { bg: "bg-espresso/10 border-espresso/30", text: "text-espresso",  label: "Live" },
  failed:     { bg: "bg-red-100 border-red-300",       text: "text-red-900",    label: "Failed" },
  cancelled:  { bg: "bg-neutral-100 border-neutral-300", text: "text-neutral-600", label: "Cancelled" },
};

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: SHOP_TZ,
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }) + ` ${TZ_LABEL}`;
}
