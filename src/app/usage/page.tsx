/** Per-shop provider usage: Anthropic tokens + Higgsfield jobs — future credit-billing base. */
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { q } from "@/lib/db";
import { currentShopId, getShop } from "@/lib/shops";

export default async function UsagePage() {
  if (!(await isLoggedIn())) redirect("/login");
  // Scoped to the active shop. This page grouped by shop name with no filter, so every operator saw
  // every other company's token spend and cost — the one page where that is least acceptable, since
  // it is the billing base.
  const shopId = await currentShopId();
  const shop = await getShop(shopId);

  const agg = await q<any>(`
    SELECT s.name AS shop, u.provider,
           count(*) FILTER (WHERE u.created_at >= date_trunc('day', now()))::int AS ev_today,
           count(*) FILTER (WHERE u.created_at >= date_trunc('month', now()))::int AS ev_month,
           sum(u.input_tokens) FILTER (WHERE u.created_at >= date_trunc('month', now()))::bigint AS in_month,
           sum(u.output_tokens) FILTER (WHERE u.created_at >= date_trunc('month', now()))::bigint AS out_month,
           sum(u.units) FILTER (WHERE u.created_at >= date_trunc('month', now()))::numeric AS units_month,
           sum(u.cost_usd) FILTER (WHERE u.created_at >= date_trunc('month', now()))::numeric AS cost_month,
           sum(u.cost_usd)::numeric AS cost_total, sum(u.units)::numeric AS units_total
      FROM usage_events u JOIN shops s ON s.id = u.shop_id
     WHERE u.shop_id = $1
     GROUP BY s.name, u.provider ORDER BY u.provider`, [shopId]);

  const recent = await q<any>(`
    SELECT s.name AS shop, u.provider, u.kind, u.model, u.input_tokens, u.output_tokens,
           u.units, u.cost_usd, to_char(u.created_at, 'MM-DD HH24:MI') AS at
      FROM usage_events u JOIN shops s ON s.id = u.shop_id
     WHERE u.shop_id = $1
     ORDER BY u.id DESC LIMIT 25`, [shopId]);

  const num = (v: any) => (v == null ? "—" : Number(v).toLocaleString("en-US"));

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-1 text-2xl font-semibold">Kullanım</h1>
      <p className="mb-6 text-sm text-muted">
        {shop?.name ?? "Bu mağaza"} — sağlayıcı tüketimi. Anthropic = token & tahmini USD (Opus $15/$75 per MTok varsayımı);
        Higgsfield = iş adedi (kredi karşılığı eklenecek). Credit-bazlı faturalamanın temeli.
      </p>

      <table className="mb-8 w-full rounded-xl border border-espresso/15 bg-white/60 text-sm">
        <thead><tr className="text-left text-xs text-muted">
          <th className="p-3">Mağaza</th><th className="p-3">Sağlayıcı</th>
          <th className="p-3">Bugün (event)</th><th className="p-3">Bu ay (event)</th>
          <th className="p-3">Ay token in/out</th><th className="p-3">Ay iş</th>
          <th className="p-3">Ay maliyet</th><th className="p-3">Toplam maliyet</th>
        </tr></thead>
        <tbody>
          {agg.length === 0 && <tr><td className="p-4 text-muted" colSpan={8}>Henüz kayıt yok — ilk agent/üretim çağrısıyla dolmaya başlar.</td></tr>}
          {agg.map((r, i) => (
            <tr key={i} className="border-t border-espresso/10">
              <td className="p-3 font-medium">{r.shop}</td>
              <td className="p-3">{r.provider}</td>
              <td className="p-3">{r.ev_today}</td>
              <td className="p-3">{r.ev_month}</td>
              <td className="p-3">{num(r.in_month)} / {num(r.out_month)}</td>
              <td className="p-3">{num(r.units_month)}</td>
              <td className="p-3">${Number(r.cost_month ?? 0).toFixed(2)}</td>
              <td className="p-3 font-medium">${Number(r.cost_total ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 font-semibold">Son 25 olay</h2>
      <table className="w-full rounded-xl border border-espresso/15 bg-white/60 text-xs">
        <thead><tr className="text-left text-muted">
          <th className="p-2">Zaman</th><th className="p-2">Mağaza</th><th className="p-2">Sağlayıcı</th>
          <th className="p-2">Tip</th><th className="p-2">Model</th><th className="p-2">in/out</th>
          <th className="p-2">İş</th><th className="p-2">USD</th>
        </tr></thead>
        <tbody>
          {recent.map((r, i) => (
            <tr key={i} className="border-t border-espresso/10">
              <td className="p-2">{r.at}</td><td className="p-2">{r.shop}</td>
              <td className="p-2">{r.provider}</td><td className="p-2">{r.kind}</td>
              <td className="p-2">{r.model ?? "—"}</td>
              <td className="p-2">{num(r.input_tokens)}/{num(r.output_tokens)}</td>
              <td className="p-2">{num(r.units)}</td>
              <td className="p-2">${Number(r.cost_usd).toFixed(4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
