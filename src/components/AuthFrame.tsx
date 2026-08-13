import type { ReactNode } from "react";

/**
 * The first screen a paying customer sees, and it was a bare heading above a third-party form.
 *
 * Two columns on a laptop: what the product does on the left, the form on the right. One column on a
 * phone, form first — someone signing in on a phone wants the field, not the pitch.
 */
const POINTS = [
  ["Tasarımdan yayına", "Konsept, baskı dosyası ve ilan görselleri tek akışta üretilir."],
  ["Katalog sağlığı", "Marj, AI beyanı ve baskı çözünürlüğü sürekli ölçülür — sürpriz çıkmaz."],
  ["Sipariş takibi", "Ödenmiş ama gönderilmemiş sipariş, sen fark etmeden önce panelde görünür."],
];

export function AuthFrame({ title, subtitle, children }:
  { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-[1100px] items-center gap-10 px-6 py-12 lg:grid-cols-2 lg:gap-16">
      {/* Order flipped on small screens so the form is what loads into view first. */}
      <section className="order-2 lg:order-1">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight">Klozio</span>
          <span className="text-xs text-ink-faint">print-on-demand operasyonu</span>
        </div>
        <h1 className="mt-6 text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{subtitle}</p>
        <ul className="mt-8 space-y-4">
          {POINTS.map(([head, body]) => (
            <li key={head} className="flex gap-3">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div>
                <p className="text-sm font-medium">{head}</p>
                <p className="mt-0.5 max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="order-1 flex justify-center lg:order-2 lg:justify-end">{children}</section>
    </main>
  );
}
