/**
 * The active shop's connections, and the way back into them.
 *
 * The wizard at /shops/new could only ever connect the shop it had just created — it holds the new id in
 * component state, so a shop created yesterday had no route to "connect Etsy" at all. MOTIFLY was made
 * before its Etsy app existed and then had nowhere to go, which is the ordinary case rather than the
 * exception: the API application is approved on Etsy's schedule, not ours.
 *
 * Read-only apart from the connect link. Changing credentials still belongs to the wizard; this page
 * exists to say what the state IS and to start OAuth again.
 */
import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { currentShopId, NO_SHOP } from "@/lib/shops";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ShopSettingsPage() {
  if (!(await isLoggedIn())) redirect("/login");
  const shopId = await currentShopId();
  if (shopId === NO_SHOP) redirect("/shops/new");

  const shop = await one<any>(
    `SELECT s.id, s.name, s.slug, s.creds, s.settings,
            (SELECT expires_at FROM etsy_tokens t WHERE t.shop_id = s.id) AS token_expires
       FROM shops s WHERE s.id = $1`, [shopId]);
  if (!shop) redirect("/shops/new");

  const creds = shop.creds ?? {};
  const st = shop.settings ?? {};
  const hasKey = Boolean(creds.etsy_api_key && creds.etsy_shared_secret);
  const token = shop.token_expires ? new Date(shop.token_expires) : null;
  const live = Boolean(token && token.getTime() > Date.now());

  const rows: [string, string][] = [
    ["Sürekli indirim", st.sale_pct != null ? `%${st.sale_pct}` : "—"],
    ["Alıcı fiyatı", st.buyer_price_usd != null ? `$${Number(st.buyer_price_usd).toFixed(2)}` : "—"],
    ["Digital PNG", st.digital_png === false ? "kapalı"
      : st.digital_buyer_price_usd != null ? `$${Number(st.digital_buyer_price_usd).toFixed(2)}` : "—"],
    ["Baskı", st.print_inches != null ? `${st.print_inches}" · ${st.print_placement ?? "center_chest"}` : "—"],
    ["Teknikler", Array.isArray(st.techniques) ? st.techniques.join(", ") : "—"],
    ["Kapak damgası", st.free_shipping_stamp === false ? "yok" : "FREE SHIPPING"],
  ];

  return (
    <main className="mx-auto max-w-[720px] px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-1 text-2xl font-semibold">{shop.name}</h1>
      <p className="mb-6 text-sm text-muted">Mağaza ayarları ve kanal bağlantıları.</p>

      <section className="mb-6 rounded-lg border border-line bg-raised p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Etsy</h2>
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">Uygulama anahtarı</dt>
          <dd>{hasKey ? "girildi" : "yok"}</dd>
          <dt className="text-muted">Bağlantı</dt>
          <dd>
            {live ? `bağlı — yenileme ${token!.toLocaleString()}`
                  : token ? `süresi doldu — ${token.toLocaleString()}`
                  : "bağlı değil"}
          </dd>
          <dt className="text-muted">Etsy mağaza no</dt>
          <dd>{creds.etsy_shop_id || "—"}</dd>
        </dl>
        {hasKey ? (
          <a href={`/api/shops/${shop.id}/etsy/connect`}
             className="inline-block rounded bg-espresso px-3 py-1.5 text-sm text-ivory hover:opacity-90">
            {live ? "Etsy'yi yeniden bağla" : "Etsy'ye bağlan"}
          </a>
        ) : (
          <p className="text-sm text-muted">
            Önce <a href="/shops/new" className="underline">sihirbazdan</a> keystring ve shared secret girin.
          </p>
        )}
        {/* The one failure this page cannot fix, said plainly rather than left to a 403 during OAuth. */}
        <p className="mt-3 text-xs text-muted">
          Etsy uygulaması “Pending Approval” durumundayken anahtar API’ye kabul edilmez ve bağlanma
          adımı hata verir. Onay geldikten sonra tekrar deneyin.
        </p>
      </section>

      <section className="rounded-lg border border-line bg-raised p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Ticari kurallar</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Bu kurallar <code>shops.settings</code> içinde durur ve fiyat, baskı boyu, damga ve
          Digital PNG kararlarını yönetir.
        </p>
      </section>
    </main>
  );
}
