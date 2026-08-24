import { Section, Sub, Rule, Table, Note, Checklist } from "../resources/parts";

const PHASES = [
  {
    w: "Faz 0", d: "24–30 Ağustos", t: "Ölçüm ve karar",
    items: ["Piksel + CAPI kur, test siparişiyle doğrula", "Katalog beslemesini yayınla",
            "Fiyat kararını ver ($29.99 + kargo eşiği)", "Niş kararını ver"],
    gate: "Events Manager'da dört olay da düşüyor ve fiyat kurgusu yayında",
  },
  {
    w: "Faz 1", d: "31 Ağustos – 6 Eylül", t: "Mağaza düzeltmeleri",
    items: ["Başlıkları toplu kısalt (177 ürün)", "Shop Pay ve miktar seçiciyi kapat",
            "Garanti satırı, beden tablosu, marka bloğu ekle", "Koleksiyonu nişe göre adlandır ve sırala"],
    gate: "Düzeltme listesindeki P0 ve P1 maddeleri kapalı",
  },
  {
    w: "Faz 2", d: "7–13 Eylül", t: "Mockup yeniden üretimi",
    items: ["Tek mockup seç ve kilitle", "Katalogdaki tüm görselleri toplu yeniden üret",
            "Kahraman rengi lacivert/siyaha çevir", "Tescilli marka taraması"],
    gate: "Tüm ürünlerde tek mockup, damgasız, kontrast kuralına uygun",
  },
  {
    w: "Faz 3", d: "14–20 Eylül", t: "Katalog ve e-posta",
    items: ["Nişte 100 tasarıma tamamla", "Klaviyo kur, anket tipi pop-up aç",
            "Hoş geldin + sepet terk otomasyonlarını kur", "Yorum uygulamasını kur"],
    gate: "Nişte 100+ ürün, e-posta toplanıyor, otomasyonlar canlı",
  },
  {
    w: "Faz 4", d: "21–27 Eylül", t: "İlk kampanya",
    items: ["Katalog kampanyası, $25/gün, satış hedefli", "İlk 72 saat sadece izle, dokunma",
            "TBM'yi tekil ürün kırılımında oku"],
    gate: "TBM okunabiliyor; hedef $0.50–0.75",
  },
  {
    w: "Faz 5", d: "28 Eylül – 11 Ekim", t: "İterasyon",
    items: ["Tıklanan tasarımların altındaki mekanizmayı çöz", "Haftada 25 yeni tasarım",
            "Huni kırılımını haftalık oku", "Tasarım test kampanyasını aç"],
    gate: "TBM banda indi ve ROAS 1.8'e yaklaştı",
  },
  {
    w: "Faz 6", d: "12 Ekim – 1 Kasım", t: "Q4 hazırlık",
    items: ["Kazananları ölçekle (2–3 günde bir %15–20)", "Evergreen kataloğu derinleştir",
            "Q4 e-posta takvimini kur", "Stok/üretim kapasitesini üretici ile teyit et"],
    gate: "1 Kasım'da ROAS 2.0+ ve katalog 150+",
  },
  {
    w: "Faz 7", d: "1 Kasım – 15 Aralık", t: "Q4 icrası",
    items: ["1 Kasım'da e-posta kampanyaları başlar", "Kara Cuma haftası yoğun gönderim",
            "1–15 Aralık zirvesi — bütçe burada", "Q4 boyunca tasarım yayınlamaya devam"],
    gate: "—",
  },
];

export function Plan() {
  return (
    <>
      <Section
        id="takvim"
        kicker="Plan"
        title="Faz planı — bugünden Q4'e"
        lede={<>Bugün 24 Ağustos. Heckman&apos;ın verisine göre Q4 cirosunun %31&apos;i 1–15 Aralık&apos;ta,
          %22&apos;si kasım başında gerçekleşiyor. Reklamın kazananları bulması 4–6 hafta aldığı için
          <strong> 1 Kasım&apos;da çalışır durumda olmak zorundasınız</strong> — bu da geriye doğru sayınca
          on hafta demek. Plan buna göre sıkıştırıldı.</>}
      >
        <div className="space-y-2.5">
          {PHASES.map((p, i) => (
            <div key={p.w} className="rounded-lg border border-line bg-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="rounded bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">{p.w}</span>
                <h3 className="text-sm font-semibold">{p.t}</h3>
                <span className="ml-auto text-xs text-ink-faint">{p.d}</span>
              </div>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {p.items.map((x, j) => (
                  <li key={j} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />{x}
                  </li>
                ))}
              </ul>
              {p.gate !== "—" && (
                <p className="mt-2 rounded border border-ok/25 bg-ok-soft px-3 py-1.5 text-xs text-ink">
                  <strong>Geçiş şartı:</strong> {p.gate}
                </p>
              )}
            </div>
          ))}
        </div>

        <Rule tone="danger">
          Geçiş şartı sağlanmadan sonraki faza geçilmez. Heckman&apos;ın beş yayında tekrarladığı tek hata
          buydu: ölçüm hazır olmadan reklam açmak, sonra neyin bozuk olduğunu anlayamamak.
        </Rule>
      </Section>

      <Section
        id="gtm"
        kicker="GTM"
        title="Pazara çıkış planı"
        lede="Kampanya yapısı, bütçe ve kararların hangi sayıya bakılarak verileceği."
      >
        <Sub title="Kampanya yapısı">
          <Table
            head={["Kampanya", "Hedef", "Yapı", "Bütçe", "Ne zaman"]}
            rows={[
              ["Katalog", "Satış (Purchase)", "1 kampanya → 1 reklam seti → 1 katalog reklamı, açık hedefleme", "$25/gün", "Faz 4"],
              ["Tasarım testi", "Satış (Purchase)", "1 reklam seti → 3–4 statik reklam", "$25/gün", "Faz 5"],
              ["Yeniden pazarlama", "Satış", "Site ziyaretçisi + sepet terk", "$10/gün", "Faz 6"],
            ]}
          />
          <p>
            Mevcut iki POD kampanyası <strong>Traffic</strong> hedefli ve HillsByElgin&apos;e ait. Traffic
            hedefi ucuz ama niyetsiz tıklama alır — son 90 günde görülen $0.087 TBM bu yüzden
            Heckman&apos;ın 50–75 sent bandıyla <em>kıyaslanamaz</em>. Klozio kampanyaları sıfırdan, satış
            hedefiyle açılmalı ve adlandırma <code className="rounded bg-sunken px-1 text-[12px]">KLZ | …</code>
            önekiyle ayrılmalı.
          </p>
        </Sub>

        <Sub title="Bütçe">
          <Table
            head={["Kalem", "Tutar", "Not"]}
            rows={[
              ["Başlangıç rezervi", "$1.000", "Heckman'ın önerdiği taban; test için ayrılmış para"],
              ["Aylık reklam", "$750", "$25/gün · Faz 4'ten itibaren"],
              ["Klaviyo", "$0–20/ay", "İlk 250 abonede ücretsiz"],
              ["Yorum uygulaması", "$0–15/ay", "Judge.me ücretsiz katmanı yeterli"],
              ["Mockup üretimi", "tek seferlik", "Mevcut üretim akışıyla iç kaynak"],
              ["Eylül–Aralık toplam", "≈$3.000–3.500", "Q4 sonuna kadar reklam + araçlar"],
            ]}
          />
        </Sub>

        <Sub title="Karar eşikleri">
          <Table
            head={["Sinyal", "Eşik", "Aksiyon"]}
            rows={[
              ["TBM (tekil tasarım)", "$1.50 üstü", "Reklamı durdur; tasarım/mockup sorunu"],
              ["TBM", "$0.50–0.75", "Bandın içinde — siteye geç"],
              ["ROAS", "1.8 altı", "Bütçeyi azalt, tasarıma dön"],
              ["ROAS", "1.8–2.0", "Başabaş; CRO ve sepet üstünde çalış"],
              ["ROAS", "2.0 üstü", "2–3 günde bir bütçeyi %15–20 artır"],
              ["Sepete ekleme", "%6 altı", "Koleksiyon ve ürün sayfasına bak"],
              ["Ödemeye ulaşma", "%5 altı", "Sepet çekmecesine bak"],
              ["Ödemeyi tamamlama", "%2.5 altı", "Kargo profili ve checkout'a bak"],
              ["Tekil reklam", "$10 harcama, sinyal yok", "Durdur — pahalı değil, sadece işe yaramıyor"],
            ]}
          />
        </Sub>

        <Note>
          Ölçülecek asıl şey ilk 6 haftada ciro değil, <strong>TBM&apos;nin haftadan haftaya düşüp
          düşmediği</strong>. Heckman&apos;ın anlattığı ilerleme tam olarak bu: haftada 25 tasarım, her hafta
          birkaç sent daha ucuz trafik. Ciro bunun sonucu.
        </Note>
      </Section>

      <Section
        id="q4"
        kicker="Sezon"
        title="Q4 takvimi"
        lede="Heckman'ın kendi markasının dağılımı, Klozio'nun takvimine oturtulmuş hâli."
      >
        <Table
          head={["Dönem", "Cironun payı", "Klozio'da ne yapılır"]}
          rows={[
            ["Ekim", "%14", "Katalog derinleşiyor, reklam ölçekleniyor, e-posta listesi büyüyor"],
            ["1–23 Kasım", "%22", "Kampanya e-postaları başlar; teklifler devreye girer"],
            ["Kara Cuma haftası (24–30 Kasım)", "%13", "Yoğun gönderim; bütçe artışı"],
            ["1–15 Aralık", "%31", "Asıl zirve — bütçenin en büyük dilimi burada"],
            ["16–31 Aralık", "%21", "Kargo son tarihinden sonra reklam kısılır, e-posta devam eder"],
          ]}
        />
        <Rule>
          Q4&apos;te satan şey büyük ölçüde <strong>zaten var olan katalog</strong> — onun verisinde Q4
          birimlerinin yalnızca %1,1&apos;i tatil temalı tasarımlardı. Yani eylül ve ekimde tatil tasarımı
          üretmek değil, evergreen kataloğu derinleştirmek doğru hamle.
        </Rule>
      </Section>

      <Section
        id="kararlar"
        kicker="Sıradaki"
        title="Sizden gereken kararlar"
        lede="Bunlar cevaplanmadan Faz 0 kapanmıyor. Hiçbirini sizin adınıza varsaymadım."
      >
        <div className="space-y-2.5">
          {[
            ["Niş", "A (oyun/RPG), B (statement) veya C (nakış) — hangisi? Önerim A.",
             "Katalog, koleksiyon adı ve reklam beslemesi buna göre kuruluyor."],
            ["Fiyat", "Tişört $24.99 → $29.99 ve $75 üstü ücretsiz kargo, altı $4.87. Onaylıyor musunuz?",
             "Onaysız reklam matematiği kurulmuyor. Etsy tarafı bundan etkilenmiyor."],
            ["Tedarik", "Shopify siparişlerini kim karşılıyor — Printful mü, Printinly mi?",
             "Mağazada Printful pikseli kurulu ama veritabanı 'printinly' diyor. Maliyet modeli buna göre değişiyor."],
            ["Nakış ve şapkalar", "Shopify'da kalsın mı, yoksa reklam kataloğu dışına mı alınsın?",
             "Farklı maliyet ve teslim süresi; aynı kampanyada TBM'yi bozuyorlar. Önerim: sitede kalsın, katalog beslemesinden çıksın."],
            ["Mockup", "Beğendiğiniz Meta reklam örneklerini gönderecek misiniz?",
             "Gönderirseniz spesifikasyonu onlara göre kilitlerim; göndermezseniz kurallardan üretirim."],
            ["Reklam hesabı", "Klozio için ayrı bir reklam hesabı mı, mevcut 'Omer-US' mu?",
             "Aynı hesap çalışır; adlandırma ayrımı yeterli. Ayrı hesap raporlamayı temizler."],
            ["compare_at", "Kalıcı indirim görüntüsü kalsın mı?",
             "Hesaplanmış çapa fiyatlar ($35.70) güven ve reklam uyumu açısından riskli. Önerim: kaldır veya gerçek dönemsel indirime çevir."],
          ].map(([t, q, why]) => (
            <div key={t} className="rounded-lg border border-line bg-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{t}</span>
                <p className="text-sm font-medium">{q}</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{why}</p>
            </div>
          ))}
        </div>

        <Rule tone="ok">
          Canlı mağazada hiçbir değişiklik yapmadım — bu sayfa plan, icra değil. Onay verdiğiniz fazı
          söyleyin, o fazı uygulayıp doğrulamasını da yapayım.
        </Rule>
      </Section>
    </>
  );
}
