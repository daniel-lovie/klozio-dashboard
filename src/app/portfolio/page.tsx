import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId } from "@/lib/shops";
import { AddNiche, StageSelect } from "@/components/NicheControls";

const MAX_SLOTS = Number(process.env.MAX_NICHE_SLOTS || 3);

const STAGE: Record<string, { bg: string; text: string; label: string }> = {
  candidate:  { bg: "bg-neutral-100 border-neutral-300", text: "text-neutral-700", label: "Candidate" },
  validating: { bg: "bg-amber-100 border-amber-300",     text: "text-amber-900",   label: "Validating" },
  scaling:    { bg: "bg-emerald-100 border-emerald-300", text: "text-emerald-900", label: "Scaling" },
  harvesting: { bg: "bg-espresso/10 border-espresso/30", text: "text-espresso",    label: "Harvesting" },
  retired:    { bg: "bg-red-50 border-red-200",          text: "text-red-800",     label: "Retired" },
};

export default async function Portfolio() {
  if (!(await isLoggedIn())) redirect("/login");

  const shopId = await currentShopId();
  // Filtered by shop: the portfolio is this shop's decision record, and the table used to be keyed on slug
  // alone so a second shop would have seen the first one's niches as its own.
  const niches = await q<any>(`
    SELECT n.*,
           (SELECT count(*) FROM products p WHERE p.niche = n.slug AND p.shop_id=${shopId}) AS products,
           (SELECT count(*) FROM products p WHERE p.niche = n.slug AND p.shop_id=${shopId} AND p.etsy_state='active') AS live
      FROM niches n
     WHERE n.shop_id=${shopId}
     ORDER BY CASE n.stage WHEN 'scaling' THEN 0 WHEN 'validating' THEN 1 WHEN 'candidate' THEN 2
                           WHEN 'harvesting' THEN 3 ELSE 4 END, n.family, n.slug`);

  // What the catalogue is ALREADY doing. The page asked the operator to choose a niche while 47 of them
  // were in use and none were registered; the answer to "how do I choose" is mostly "adopt what exists".
  const used = await q<{ niche: string; products: number; live: number }>(`
    SELECT p.niche, count(*)::int AS products,
           count(*) FILTER (WHERE p.etsy_state='active')::int AS live
      FROM products p
     WHERE p.shop_id=${shopId} AND p.niche IS NOT NULL AND btrim(p.niche) <> ''
       AND NOT EXISTS (SELECT 1 FROM niches n WHERE n.shop_id=${shopId} AND n.slug = p.niche)
     GROUP BY 1 ORDER BY live DESC, products DESC, 1`);

  const inFlight = niches.filter((n) => n.stage === "validating" || n.stage === "scaling");
  const free = MAX_SLOTS - inFlight.length;
  const families = [...new Set(niches.map((n) => n.family))];

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
      <a href="/" className="mb-4 inline-block text-sm text-muted hover:text-espresso">← Calendar</a>
      <h1 className="text-2xl font-semibold tracking-tight">Niche portfolio</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Niches are grouped by <strong>family</strong> — a shared buyer, not a shared style. Cross-sell, the
        $30 free-shipping threshold and repeat purchases only work inside a family. The slot budget is the
        actual discipline: a new niche cannot start until one is promoted or killed.
      </p>

      {niches.length === 0 && (
        <div className="mt-5 rounded-xl border border-amber/50 bg-amber/10 px-4 py-4">
          <div className="text-lg font-semibold">Portföyde henüz niş yok</div>
          <p className="mt-1 max-w-3xl text-sm">
            Bu bir karar kaydı: hangi nişte kaç slot harcadığını burada tutuyorsun. Aşağıda kataloğun
            <strong> zaten kullandığı</strong> nişler var — birini seçip aşamasıyla portföye ekle. Slot
            bütçesi ({MAX_SLOTS}) burada uygulanır, sadece anlatılmaz.
          </p>
        </div>
      )}

      <div className={`mt-5 rounded-xl border px-4 py-3 ${niches.length === 0 ? "hidden" : free > 0 ? "border-espresso/20 bg-white/60" : "border-amber/50 bg-amber/10"}`}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-lg font-semibold">
            Slots: {inFlight.length} / {MAX_SLOTS}
          </span>
          <span className="text-sm">
            {free > 0
              ? `${free} free — a candidate may be promoted to validating`
              : "FULL — promote or kill something before starting a new niche"}
          </span>
        </div>
        {inFlight.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-sm text-muted">
            {inFlight.map((n) => (
              <li key={n.slug}>
                slot {n.slot ?? "—"}: <span className="font-medium text-espresso">{n.slug}</span>{" "}
                [{n.family}] · {n.live}/{n.products} live
                {n.decision_due && <> · decision due {new Date(n.decision_due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {families.map((fam) => (
        <section key={fam} className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {fam} <span className="ml-2 font-normal normal-case">
              — {niches.filter((n) => n.family === fam).length} niche(s), cross-sell allowed within this family
            </span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {niches.filter((n) => n.family === fam).map((n) => {
              const s = STAGE[n.stage] ?? STAGE.candidate;
              return (
                <div key={n.slug} className={`rounded-xl border p-3 ${s.bg}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{n.slug}</div>
                    <span className={`whitespace-nowrap rounded-full border border-current/20 px-2 py-0.5 text-[11px] ${s.text}`}>
                      {s.label}{n.slot ? ` · slot ${n.slot}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {n.live}/{n.products} live
                    {n.stage === "validating" && <> · target 5–10 to validate</>}
                    {n.stage === "scaling" && <> · target 15–20</>}
                  </div>
                  {n.notes && <p className="mt-2 text-[12px] leading-snug">{n.notes}</p>}
                  <StageSelect slug={n.slug} family={n.family} stage={n.stage} />
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {used.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            Kataloğun kullandığı, portföyde olmayan nişler
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-muted">
            Ürünler bu nişlerle üretilmiş ama karar kaydı yok. Aşamasını seçip ekle: aday ise slot
            harcamaz, doğrulanıyor/büyütülüyor ise slot bütçesine girer.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {used.map((u) => (
              <div key={u.niche} className="rounded-xl border border-espresso/15 bg-white/60 p-3">
                <div className="font-medium">{u.niche}</div>
                <div className="mt-1 text-xs text-muted">{u.live}/{u.products} canlı</div>
                <AddNiche slug={u.niche} family={u.niche} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 rounded-xl border border-espresso/15 bg-white/60 p-4 text-sm">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Gates</h2>
        <ul className="list-inside list-disc space-y-1">
          <li><strong>Enter validating</strong> — S1 research passed, named family, 5–10 print-ready designs, cover styling defined, <em>and a slot is free</em>.</li>
          <li><strong>Promote to scaling</strong> (assess at 30–60 days, never earlier) — a High views/High sales listing, or ≥2% conversion on ≥300 views, plus ≥1 review and margin held at the real label cost.</li>
          <li><strong>Kill</strong> — 60 days, ≥500 views, 0 sales; or &lt;1% conversion after the cover has already been rebuilt once. Killing frees a slot.</li>
        </ul>
        <p className="mt-3 text-muted">
          Full reasoning, including what is mechanically true vs merely claimed about shop-level “topical
          authority”, is in <code className="rounded bg-white px-1">.claude/skills/etsy-growth/references/niche-portfolio.md</code>.
        </p>
      </section>
    </main>
  );
}
