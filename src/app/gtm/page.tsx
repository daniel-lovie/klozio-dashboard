import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { me, clerkConfigured } from "@/lib/user";
import { Audit } from "@/components/gtm/Audit";
import { Fixes } from "@/components/gtm/Fixes";
import { Plan } from "@/components/gtm/Plan";

export const metadata: Metadata = {
  title: "GTM Yol Haritası — Klozio Shopify",
  description: "klozio.io denetimi ve pazara çıkış planı",
};

/**
 * The Shopify store measured against the playbook on /resources, and the plan that follows from it.
 *
 * Every number on this page came from a live measurement on 2026-08-24 — the storefront's own JSON,
 * the page source, the Meta Marketing API and our database — not from an estimate. The audit date is
 * stated in the header because a store audit rots: re-run the measurements before trusting it later.
 */

const NAV = [
  { id: "karar",         label: "Karar",              group: "Denetim" },
  { id: "olcum",         label: "Ne ölçtüm",          group: "Denetim" },
  { id: "ekonomi",       label: "Birim ekonomi",      group: "Denetim" },
  { id: "engeller",      label: "Dört engel",         group: "Denetim" },
  { id: "duzeltmeler",   label: "Düzeltme listesi",   group: "Düzeltme" },
  { id: "nis",           label: "Niş kararı",         group: "Düzeltme" },
  { id: "mockup",        label: "Mockup spesi",       group: "Düzeltme" },
  { id: "olcum-kurulum", label: "Ölçüm kurulumu",     group: "Düzeltme" },
  { id: "takvim",        label: "Faz planı",          group: "Plan" },
  { id: "hesap",         label: "Reklam hesabı",      group: "Plan" },
  { id: "gtm",           label: "GTM planı",          group: "Plan" },
  { id: "q4",            label: "Q4 takvimi",         group: "Plan" },
  { id: "kararlar",      label: "Sizden gerekenler",  group: "Plan" },
];

export default async function GtmPage() {
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
          GTM · yalnızca admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">klozio.io yol haritası</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Shopify mağazasının <a href="/resources" className="text-accent underline decoration-accent/30 underline-offset-2">Heckman
          playbook&apos;una</a> göre denetimi, düzeltme listesi ve pazara çıkış planı. Sayfadaki her sayı
          24 Ağustos 2026&apos;da canlı ölçümden geldi: mağazanın kendi JSON&apos;u, sayfa kaynağı, Meta
          Marketing API ve veritabanı. Tahmin yok; doğrulayamadıklarımı ayrıca yazdım.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Canlı ürün", "177"],
            ["Kurulu piksel", "0"],
            ["Başabaş ROAS", "2.79"],
            ["1 Kasım'a", "10 hafta"],
          ].map(([k, v], i) => (
            <div key={k} className="rounded-lg border border-line bg-raised px-4 py-3 shadow-sm">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{k}</dt>
              <dd className={`tabular mt-1 text-xl font-semibold ${i === 1 || i === 2 ? "text-danger" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="mt-10 gap-10 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
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
          <Audit />
          <Fixes />
          <Plan />
        </div>
      </div>
    </main>
  );
}
