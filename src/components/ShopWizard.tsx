"use client";
import { useState } from "react";

export default function ShopWizard() {
  const [shopId, setShopId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [f, setF] = useState({ shopify_domain: "", shopify_client_id: "", shopify_client_secret: "", printful_api_key: "", anthropic_api_key: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function createShop() {
    if (!name.trim()) { setMsg("Mağaza adı gerekli"); return; }
    setBusy(true);
    const res = await fetch("/api/shops", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "hata"); return; }
    setShopId(j.shop.id);
    setMsg(`✓ '${j.shop.name}' oluşturuldu (id ${j.shop.id})`);
  }

  async function saveCreds() {
    setBusy(true);
    const res = await fetch("/api/shops", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shopId, ...f }) });
    setBusy(false);
    setMsg(res.ok ? "✓ Kanal bilgileri kaydedildi" : "kaydetme hatası");
  }

  async function activate() {
    await fetch("/api/shops/switch", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shopId }) });
    location.href = "/";
  }

  const input = "w-full rounded-lg border border-espresso/20 bg-white/80 px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-espresso/15 bg-white/60 p-5">
        <h2 className="mb-3 font-semibold">1 · Mağaza adı</h2>
        <div className="flex gap-2">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="örn. MediterraSystem" disabled={!!shopId} />
          <button onClick={createShop} disabled={busy || !!shopId}
            className="whitespace-nowrap rounded-lg bg-espresso px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Oluştur
          </button>
        </div>
      </section>

      <section className={`rounded-xl border border-espresso/15 bg-white/60 p-5 ${!shopId ? "opacity-40 pointer-events-none" : ""}`}>
        <h2 className="mb-1 font-semibold">2 · Etsy&apos;yi bağla</h2>
        <p className="mb-3 text-xs text-muted">
          Mağaza sahibinin Etsy hesabıyla izin verilir; token + shop bilgisi otomatik kaydedilir.
        </p>
        <a href={shopId ? `/api/shops/${shopId}/etsy/connect` : "#"}
          className="inline-block rounded-lg bg-[#F1641E] px-4 py-2 text-sm font-medium text-white">
          Etsy ile Bağlan →
        </a>
      </section>

      <section className={`rounded-xl border border-espresso/15 bg-white/60 p-5 ${!shopId ? "opacity-40 pointer-events-none" : ""}`}>
        <h2 className="mb-1 font-semibold">3 · Shopify</h2>
        <p className="mb-3 text-xs text-muted">
          Mağazanın Dev Dashboard&apos;unda app oluştur (Klozio&apos;daki akışın aynısı), store&apos;a kur, bilgileri gir.
        </p>
        <div className="space-y-2">
          <input className={input} placeholder="xxx.myshopify.com" value={f.shopify_domain}
            onChange={(e) => setF({ ...f, shopify_domain: e.target.value })} />
          <input className={input} placeholder="Client ID" value={f.shopify_client_id}
            onChange={(e) => setF({ ...f, shopify_client_id: e.target.value })} />
          <input className={input} placeholder="Client Secret (shpss_...)" value={f.shopify_client_secret}
            onChange={(e) => setF({ ...f, shopify_client_secret: e.target.value })} />
        </div>
      </section>

      <section className={`rounded-xl border border-espresso/15 bg-white/60 p-5 ${!shopId ? "opacity-40 pointer-events-none" : ""}`}>
        <h2 className="mb-1 font-semibold">4 · Kendi AI anahtarların (opsiyonel — BYO)</h2>
        <p className="mb-3 text-xs text-muted">
          Boş bırakırsan platform kredisi kullanılır ve tüketim faturalanır. Kendi anahtarını girersen
          maliyet doğrudan sana yazar. (Higgsfield bağlantısı: yakında — şimdilik platform üzerinden.)
        </p>
        <input className={input} placeholder="Anthropic API key (sk-ant-..., opsiyonel)" value={f.anthropic_api_key}
          onChange={(e) => setF({ ...f, anthropic_api_key: e.target.value })} />
      </section>

      <section className={`rounded-xl border border-espresso/15 bg-white/60 p-5 ${!shopId ? "opacity-40 pointer-events-none" : ""}`}>
        <h2 className="mb-1 font-semibold">5 · Printful (opsiyonel — nakış hattı)</h2>
        <input className={input} placeholder="Printful API key" value={f.printful_api_key}
          onChange={(e) => setF({ ...f, printful_api_key: e.target.value })} />
      </section>

      <div className="flex items-center gap-3">
        <button onClick={saveCreds} disabled={busy || !shopId}
          className="rounded-lg border border-espresso/25 px-4 py-2 text-sm disabled:opacity-50">
          Bilgileri Kaydet
        </button>
        <button onClick={activate} disabled={!shopId}
          className="rounded-lg bg-espresso px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          Bu Mağazaya Geç →
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
