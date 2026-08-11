"use client";
import { useEffect, useState } from "react";

/**
 * Multi-step shop onboarding.
 *
 * Shape follows one rule: nothing is required to start except a name. A shop can hold products,
 * generate designs and build listing images with no channel connected at all, so asking for an Etsy
 * developer account on step one turns a five-minute setup into a two-day wait. Every step after the
 * first can be skipped and completed later from the same screen.
 *
 * The AI-key step explains where each key comes from, because "paste your API key" is the step people
 * abandon — not for lack of willingness but for not knowing which of five pages on a vendor's site
 * has the thing.
 */

type Step = { id: string; title: string; optional?: boolean };

const STEPS: Step[] = [
  { id: "name", title: "Mağaza" },
  { id: "ai", title: "AI anahtarları", optional: true },
  { id: "etsy", title: "Etsy", optional: true },
  { id: "channels", title: "Kanallar", optional: true },
  { id: "done", title: "Bitti" },
];

const KEY_HELP: Record<string, { label: string; placeholder: string; what: string; how: string[]; cost: string }> = {
  anthropic_api_key: {
    label: "Anthropic (Claude)",
    placeholder: "sk-ant-...",
    what: "Ürün fikri, başlık, açıklama, etiket ve operasyon agent'ı bu anahtarla çalışır.",
    how: [
      "console.anthropic.com adresine gir, hesap aç",
      "Sol menüden API Keys → Create Key",
      "Anahtarı kopyala (bir daha gösterilmez) ve buraya yapıştır",
      "Billing → en az $5 kredi yükle, yoksa çağrılar reddedilir",
    ],
    cost: "Tipik kullanımda ürün başına birkaç sent.",
  },
  // Higgsfield deliberately has NO field here.
  //
  // The integration is OAuth against Higgsfield's MCP server, not an API key — there is no key a
  // customer could paste that we could use. This step used to collect one and store it, which was a
  // promise the product could not keep. Until a "Connect Higgsfield" flow exists, design generation runs
  // on the platform account, and worker/hf.ts falls back to it with a warning rather than silently
  // billing the operator.
};

export default function ShopWizard() {
  const [i, setI] = useState(0);
  const [shopId, setShopId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [f, setF] = useState({
    anthropic_api_key: "",
    shopify_domain: "", shopify_client_id: "", shopify_client_secret: "",
    printful_api_key: "",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [etsyOk, setEtsyOk] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const e = p.get("etsy");
    const sid = p.get("shop");
    if (sid) setShopId(Number(sid));
    if (e === "connected") { setEtsyOk(true); setMsg("Etsy bağlandı."); setI(3); }
    else if (e) { setMsg(`Etsy bağlanamadı: ${e}`); setI(2); }
  }, []);

  async function createShop() {
    if (!name.trim()) { setMsg("Mağaza adı gerekli"); return; }
    setBusy(true);
    const res = await fetch("/api/shops", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "hata"); return; }
    setShopId(j.shop.id);
    setMsg("");
    setI(1);
  }

  async function save(next: number) {
    if (!shopId) { setI(next); return; }
    setBusy(true);
    const res = await fetch("/api/shops", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shopId, ...f }),
    });
    setBusy(false);
    if (!res.ok) { setMsg("kaydedilemedi"); return; }
    setMsg("");
    setI(next);
  }

  async function activate() {
    await fetch("/api/shops/switch", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: shopId }),
    });
    location.href = "/";
  }

  const input = "w-full rounded-lg border border-espresso/20 bg-white/80 px-3 py-2 text-sm";
  const primary = "rounded-lg bg-espresso px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
  const ghost = "rounded-lg border border-espresso/25 px-4 py-2 text-sm disabled:opacity-40";
  const step = STEPS[i];

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {STEPS.map((s, n) => (
          <li key={s.id} className={`rounded-full px-3 py-1 ${
            n === i ? "bg-espresso text-white"
            : n < i ? "bg-espresso/15 text-espresso" : "bg-espresso/5 text-muted"}`}>
            {n + 1}. {s.title}{s.optional ? " ·" : ""}
          </li>
        ))}
      </ol>

      {step.id === "name" && (
        <section className="rounded-xl border border-espresso/15 bg-white/60 p-5">
          <h2 className="mb-1 font-semibold">Mağaza adı</h2>
          <p className="mb-3 text-xs text-muted">
            Tek zorunlu adım bu. Kanalları bağlamadan ürün üretebilir, tasarım çıkarabilir, ilan
            görselleri hazırlayabilirsin — satış kanalını istediğin zaman eklersin.
          </p>
          <div className="flex gap-2">
            <input className={input} value={name} onChange={(e) => setName(e.target.value)}
              placeholder="örn. MediterraSystem" disabled={!!shopId} />
            <button onClick={createShop} disabled={busy || !!shopId} className={primary}>
              {shopId ? "Oluşturuldu" : "Oluştur"}
            </button>
          </div>
          {shopId && <button onClick={() => setI(1)} className={`mt-3 ${ghost}`}>Devam →</button>}
        </section>
      )}

      {step.id === "ai" && (
        <section className="space-y-4">
          <div className="rounded-xl border border-espresso/15 bg-white/60 p-5">
            <h2 className="mb-1 font-semibold">Kendi AI anahtarların</h2>
            <p className="text-xs text-muted">
              Kendi anahtarını girersen kullanım doğrudan sana faturalanır ve limitler senin.
              Boş bırakırsan platform kredisi kullanılır, tüketim Kullanım sayfasında görünür.
            </p>
          </div>
          {Object.entries(KEY_HELP).map(([k, h]) => (
            <div key={k} className="rounded-xl border border-espresso/15 bg-white/60 p-5">
              <h3 className="font-medium">{h.label}</h3>
              <p className="mt-1 text-xs text-muted">{h.what}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted">
                {h.how.map((line) => <li key={line}>{line}</li>)}
              </ol>
              <p className="mt-2 text-xs text-muted"><strong>Maliyet:</strong> {h.cost}</p>
              <input className={`${input} mt-3`} type="password" autoComplete="off"
                placeholder={h.placeholder}
                value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={() => save(2)} disabled={busy} className={primary}>Kaydet ve devam →</button>
            <button onClick={() => setI(2)} className={ghost}>Şimdilik atla</button>
          </div>
        </section>
      )}

      {step.id === "etsy" && (
        <section className="rounded-xl border border-espresso/15 bg-white/60 p-5">
          <h2 className="mb-1 font-semibold">Etsy bağlantısı</h2>
          <p className="mb-3 text-xs text-muted">
            Etsy <strong>sadece yayınlamak</strong> için gerekli. Ürün üretmek, tasarım çıkarmak ve
            görsel hazırlamak için gerekmez — istediğin zaman dönüp bağlayabilirsin.
          </p>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>Aşağıdaki düğme Etsy&apos;ye götürür, mağaza sahibinin hesabıyla izin verilir</li>
            <li>Token ve mağaza bilgisi otomatik kaydedilir, elle anahtar girmen gerekmez</li>
            <li>Developer hesabı yoksa bu adımı atla — yayın gününe kadar zamanın var</li>
          </ol>
          {etsyOk
            ? <p className="text-sm">Etsy bağlı.</p>
            : <a href={shopId ? `/api/shops/${shopId}/etsy/connect` : "#"}
                className="inline-block rounded-lg bg-[#F1641E] px-4 py-2 text-sm font-medium text-white">
                Etsy ile Bağlan →
              </a>}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setI(3)} className={ghost}>Şimdilik atla</button>
          </div>
        </section>
      )}

      {step.id === "channels" && (
        <section className="space-y-4">
          <div className="rounded-xl border border-espresso/15 bg-white/60 p-5">
            <h2 className="mb-1 font-semibold">Shopify</h2>
            <p className="mb-3 text-xs text-muted">
              Kendi sitende satmak istersen. Shopify admin → Settings → Apps → Develop apps → app
              oluştur, Admin API izinlerini ver, store&apos;a kur, Client ID ve Secret&apos;ı buraya gir.
            </p>
            <div className="space-y-2">
              <input className={input} placeholder="xxx.myshopify.com" value={f.shopify_domain}
                onChange={(e) => setF({ ...f, shopify_domain: e.target.value })} />
              <input className={input} placeholder="Client ID" value={f.shopify_client_id}
                onChange={(e) => setF({ ...f, shopify_client_id: e.target.value })} />
              <input className={input} type="password" autoComplete="off"
                placeholder="Client Secret (shpss_...)" value={f.shopify_client_secret}
                onChange={(e) => setF({ ...f, shopify_client_secret: e.target.value })} />
            </div>
          </div>
          <div className="rounded-xl border border-espresso/15 bg-white/60 p-5">
            <h2 className="mb-1 font-semibold">Üretici</h2>
            <p className="mb-3 text-xs text-muted">
              Printful: Dashboard → Settings → Stores → API → token oluştur. Başka bir üretici
              kullanıyorsan bu adımı atla; sipariş panoya düşer, üretimi sen yönlendirirsin.
            </p>
            <input className={input} type="password" autoComplete="off"
              placeholder="Printful API key" value={f.printful_api_key}
              onChange={(e) => setF({ ...f, printful_api_key: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => save(4)} disabled={busy} className={primary}>Kaydet ve bitir →</button>
            <button onClick={() => setI(4)} className={ghost}>Şimdilik atla</button>
          </div>
        </section>
      )}

      {step.id === "done" && (
        <section className="rounded-xl border border-espresso/15 bg-white/60 p-5">
          <h2 className="mb-1 font-semibold">Hazır</h2>
          <p className="mb-4 text-xs text-muted">
            Mağaza kuruldu. Atladığın adımları Mağazalar sayfasından tamamlayabilirsin. Yayınlamayı
            denediğinde Etsy bağlı değilse hangi adımın eksik olduğunu söyleyeceğim.
          </p>
          <button onClick={activate} disabled={!shopId} className={primary}>Bu mağazaya geç →</button>
        </section>
      )}

      {msg && <p className="text-sm text-muted">{msg}</p>}
      {i > 0 && i < 4 && (
        <button onClick={() => setI(i - 1)} className="text-xs text-muted underline">← geri</button>
      )}
    </div>
  );
}
