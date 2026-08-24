import type { ReactNode } from "react";

/** Shared furniture for the playbook. Kept here so every section reads the same. */

export function Section({ id, kicker, title, lede, children }: {
  id: string; kicker: string; title: string; lede?: ReactNode; children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-10 first:border-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{kicker}</p>
      <h2 className="mt-1 text-xl font-semibold sm:text-2xl">{title}</h2>
      {lede && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-soft">{lede}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </div>
  );
}

/** The rule you can act on today, pulled out of the prose so it survives skimming. */
export function Rule({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "danger" | "ok" }) {
  const skin = {
    accent: "border-accent/25 bg-accent-soft",
    danger: "border-danger/25 bg-danger-soft",
    ok: "border-ok/25 bg-ok-soft",
  }[tone];
  return (
    <p className={`rounded-lg border ${skin} px-4 py-3 text-sm font-medium leading-relaxed text-ink`}>
      {children}
    </p>
  );
}

export function Table({ head, rows, dense = false }: {
  head: string[]; rows: ReactNode[][]; dense?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-sunken text-left">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line align-top">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-${dense ? "1.5" : "2.5"} ${j === 0 ? "font-medium" : "text-ink-soft"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Do this / not that — the shape most of his design and CRO advice actually takes. */
export function DoDont({ doTitle = "Yap", dontTitle = "Yapma", doItems, dontItems }: {
  doTitle?: string; dontTitle?: string; doItems: ReactNode[]; dontItems: ReactNode[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { t: doTitle, items: doItems, skin: "border-ok/25 bg-ok-soft", mark: "✓", ink: "text-ok" },
        { t: dontTitle, items: dontItems, skin: "border-danger/25 bg-danger-soft", mark: "✕", ink: "text-danger" },
      ].map((col) => (
        <div key={col.t} className={`rounded-lg border ${col.skin} p-4`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${col.ink}`}>{col.t}</p>
          <ul className="mt-2 space-y-1.5">
            {col.items.map((it, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink">
                <span className={`mt-0.5 shrink-0 text-xs ${col.ink}`}>{col.mark}</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Checklist({ items }: { items: [string, ReactNode][] }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {items.map(([label, why], i) => (
        <li key={i} className="flex gap-3 px-4 py-2.5">
          <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-[3px] border border-line-strong bg-raised" aria-hidden />
          <div>
            <p className="text-sm font-medium">{label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{why}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A quote-shaped callout for the handful of lines that carry the whole idea. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-2 border-accent/40 pl-4 text-sm italic leading-relaxed text-ink-soft">
      {children}
    </p>
  );
}

export function Cite({ v, t }: { v: keyof typeof VIDEOS; t?: string }) {
  const meta = VIDEOS[v];
  const href = t ? `${meta.url}&t=${t.split(":").reduce((a, b) => a * 60 + Number(b), 0)}s` : meta.url;
  return (
    <a href={href} target="_blank" rel="noreferrer"
       className="whitespace-nowrap text-[11px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
      {meta.short}{t ? ` ${t}` : ""}
    </a>
  );
}

/**
 * A frame from one of the streams, with our own reading of it underneath.
 *
 * The caption is the point — a screenshot of somebody else's dashboard means nothing on its own, so
 * every figure says what to look at and why it matters. Images are lazy so the page stays light, and
 * each one links back to the exact second it came from.
 */
export function Figure({ src, alt, look, v, t, tall = false }: {
  src: string; alt: string; look: ReactNode; v: keyof typeof VIDEOS; t: string; tall?: boolean;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-raised shadow-sm">
      <a href={`/resources/${src}`} target="_blank" rel="noreferrer"
         className="block bg-sunken" title="tam boyutta aç">
        <img
          src={`/resources/${src}`}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={1360}
          height={tall ? 782 : 854}
          className="h-auto w-full"
        />
      </a>
      <figcaption className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-line px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Ne görüyoruz</span>
        <Cite v={v} t={t} />
        <p className="w-full text-sm leading-relaxed text-ink-soft">{look}</p>
      </figcaption>
    </figure>
  );
}

/** Two frames side by side when the whole point is the difference between them. */
export function FigurePair({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 lg:grid-cols-2">{children}</div>;
}

export const VIDEOS = {
  ep3:     { short: "Bölüm 3",  title: "Print-on-Demand Brand Building — Ep. 3",  url: "https://www.youtube.com/watch?v=qLd-vEFM95Y", date: "9 Mar 2026",  len: "1s 10dk" },
  review1: { short: "İnceleme 1", title: "Reviewing Your POD Stores LIVE",          url: "https://www.youtube.com/watch?v=iY5PvO9vdQY", date: "29 Tem 2026", len: "1s 2dk" },
  scale:   { short: "Ölçekleme",  title: "Scaling Your POD Stores LIVE",            url: "https://www.youtube.com/watch?v=BYtlQ0AqcVQ", date: "5 Ağu 2026",  len: "1s 3dk" },
  review2: { short: "İnceleme 2", title: "Reviewing POD Stores LIVE + Q&A",         url: "https://www.youtube.com/watch?v=AAvz7DOqpgA", date: "17 Ağu 2026", len: "2s 40dk" },
  build:   { short: "Canlı kurulum", title: "Building POD Stores Live in Real Time", url: "https://www.youtube.com/watch?v=HmNgM84crpQ", date: "24 Ağu 2026", len: "2s 51dk" },
} as const;
