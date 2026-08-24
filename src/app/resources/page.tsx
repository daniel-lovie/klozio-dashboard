import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { me, clerkConfigured } from "@/lib/user";
import { Metrics } from "@/components/resources/Metrics";
import { Product } from "@/components/resources/Product";
import { Store } from "@/components/resources/Store";
import { Growth } from "@/components/resources/Growth";

export const metadata: Metadata = {
  title: "Kaynaklar — POD Playbook",
  description: "Chris Heckman'ın beş canlı yayınından çıkarılmış print-on-demand playbook'u",
};

/**
 * Admin-only reference: the whole of Heckman's POD method, distilled from five live streams
 * (8h46m of transcript plus the frames where he was pointing at real numbers on screen).
 *
 * It is a reading page, not an operator screen, so it deliberately does not follow the dashboard's
 * card-grid shape — a sticky contents rail and one long column is what a reference actually needs.
 * The one interactive piece is the leaky-bucket calculator, because his whole diagnostic method is
 * "feel how much a tenth of a point of conversion rate is worth" and a static table cannot do that.
 */

const NAV: { id: string; label: string; group: string }[] = [
  { id: "model",     label: "Üç sayı",              group: "Temel" },
  { id: "hesap",     label: "Delik kova hesabı",    group: "Temel" },
  { id: "teshis",    label: "Teşhis sırası",        group: "Temel" },
  { id: "katalog",   label: "Katalog motordur",     group: "Ürün" },
  { id: "uretim",    label: "100 tasarımı böl",     group: "Ürün" },
  { id: "stil",      label: "Konsept ≠ stil",       group: "Ürün" },
  { id: "mockup",    label: "Mockup",               group: "Ürün" },
  { id: "cro",       label: "CRO mantığı",          group: "Mağaza" },
  { id: "cro-liste", label: "Denetim listesi",      group: "Mağaza" },
  { id: "popup",     label: "E-posta pop-up'ı",     group: "Mağaza" },
  { id: "fiyat",     label: "Fiyat ve sepet",       group: "Mağaza" },
  { id: "reklam",    label: "Reklam yapısı",        group: "Büyüme" },
  { id: "eposta",    label: "E-posta",              group: "Büyüme" },
  { id: "q4",        label: "Q4 gerçeği",           group: "Büyüme" },
  { id: "odak",      label: "Ne yapmadığı",         group: "Büyüme" },
  { id: "vakalar",   label: "Dokuz mağaza",         group: "Saha" },
  { id: "klozio",    label: "Klozio'ya uyarlama",   group: "Saha" },
  { id: "kaynak",    label: "Videolar",             group: "Saha" },
];

export default async function ResourcesPage() {
  // The route refuses, rather than merely being unlinked. A page protected only by not appearing in
  // the nav is not protected — same rule as /users.
  if (clerkConfigured()) {
    const u = await me();
    if (!u) redirect("/sign-in");
    if (!u.isAdmin) redirect("/");
  }

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-10">
      <header className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          Kaynaklar · yalnızca admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">Print-on-demand playbook</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Chris Heckman&apos;ın beş canlı yayınının tamamı — 8 saat 46 dakika — tek referansa indirildi.
          Marka kurma bölümü, üç canlı mağaza incelemesi ve Q4 verilerinin paylaşıldığı yayın. Sayılar
          ekranda gösterdiği gerçek hesap verilerinden alındı; her bölüm ilgili dakikaya bağlanıyor.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Yayın", "5"],
            ["Kayıt", "8s 46dk"],
            ["İncelenen mağaza", "9"],
            ["Model", "Shopify POD"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-raised px-4 py-3 shadow-sm">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{k}</dt>
              <dd className="tabular mt-1 text-xl font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-10 gap-10 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Contents. Plain anchors and CSS sticky: a scroll-spy would need a client component and
            buys nothing on a page the operator reads top to bottom once. */}
        <nav aria-label="İçindekiler" className="mb-8 lg:sticky lg:top-20 lg:mb-0 lg:self-start">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">İçindekiler</p>
          <div className="mt-2 space-y-3">
            {groups.map((g) => (
              <div key={g}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-accent">{g}</p>
                <ul className="mt-1 space-y-0.5">
                  {NAV.filter((n) => n.group === g).map((n) => (
                    <li key={n.id}>
                      <a href={`#${n.id}`}
                         className="block rounded px-2 py-1 text-sm text-ink-soft transition hover:bg-sunken hover:text-ink">
                        {n.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-10">
          <Metrics />
          <Product />
          <Store />
          <Growth />
        </div>
      </div>
    </main>
  );
}
