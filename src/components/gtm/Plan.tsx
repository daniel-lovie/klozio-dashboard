import { Section, Sub, Rule, Table, Note, Checklist } from "../resources/parts";

const PHASES = [
  {
    w: "Faz 0", d: "24–30 Ağustos", t: "Ölçüm ve karar",
    items: ["Yeni reklam hesabını ve Business Manager'ı kur", "klozio.io alan adını doğrula",
            "Piksel + CAPI kur, test siparişiyle doğrula", "Printful pikselini kaldır",
            "Katalog beslemesini yayınla (nakış/şapka hariç)", "Fiyatı $29.99 + kargo eşiğine geçir",
            "Printinly ile günlük sipariş kapasitesini yaz"],
    gate: "Dört olay da düşüyor · fiyat yayında · günlük kapasite rakamı belli",
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
        id="hesap"
        kicker="Kurulum"
        title="Yeni reklam hesabı — sıfırdan doğru kurmak"
        lede={<>Ayrı hesap açma kararınız doğru: mevcut “Omer-US” hesabında hukuk bürosu kampanyaları ve
          HillsByElgin geçmişi var, bunlar raporlamayı ve öğrenmeyi kirletiyor. Sıra önemli — piksel ve
          alan adı doğrulaması reklamdan önce gelmeli.</>}
      >
        <Checklist items={[
          ["Business Manager altında yeni reklam hesabı aç", "Adı markayla aynı olsun. Para birimi USD, saat dilimi mağazanın saat dilimiyle aynı — sonradan değiştirilemiyor."],
          ["klozio.io alan adını doğrula", "Domain verification olmadan Aggregated Event Measurement'ta olay önceliklendiremezsiniz ve iOS trafiğinde ölçüm kaybı büyür."],
          ["Yeni piksel oluştur, Shopify'a bağla", "Etsy tarafındaki eski pikselle karıştırmayın. Tek mağaza, tek piksel."],
          ["Conversions API'yi aç", "Tarayıcı tarafı tek başına yetmiyor. Shopify'ın Facebook kanalı ikisini birlikte kuruyor."],
          ["Olay önceliklendirmesini ayarla", "Purchase en üstte; sonra InitiateCheckout, AddToCart, ViewContent."],
          ["Ödeme yöntemi ve harcama limiti tanımla", "Günlük değil hesap seviyesinde limit; kontrolü kaybetmemek için."],
          ["Kampanya adlandırmasını sabitle", "KLZ | niş | hedef | ay — böylece HillsByElgin ve eski kampanyalarla asla karışmaz."],
          ["Katalog beslemesini bu hesaba bağla", "Nakış ve şapkalar beslemenin dışında kalsın; farklı maliyet ve teslim süresi TBM'yi bozuyor."],
        ]} />
        <Note>
          Eski hesabı kapatmayın — ömürlük harcama geçmişi ve ödeme itibarı orada duruyor. Sadece Klozio
          kampanyalarını yeni hesapta çalıştırın.
        </Note>
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
              ["Günlük sipariş", "Printinly kapasitesinin %80'i", "Bütçe artışını durdur — teslimat gecikmesi yorumları öldürür"],
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
        title="Kararlar"
        lede="Dördü verildi, dördü açık. Verilenleri plana işledim."
      >
        <Table
          head={["Karar", "Cevap", "Plana etkisi"]}
          rows={[
            ["Niş", "Yeniden ölçüldü → bahçe / bitki (öneri)",
              "Oyun ölçümde elendi: yüksek görünen temaların kazananları lisanssız hayran ürünü. Onayınız bekleniyor"],
            ["Tedarik", "Printinly, şimdilik elle",
              "Maliyet modeli doğrulandı · Printful pikseli kaldırılıyor · kapasite geçiş şartı eklendi"],
            ["Nakış ve şapkalar", "Sitede kalıyor",
              "Kalıyor ama reklam katalog beslemesinin dışında"],
            ["Reklam hesabı", "Yeni hesap açılacak",
              "Faz 0'a temiz kurulum listesi eklendi"],
          ]}
        />

        <div className="space-y-2.5">
          {[
            ["Niş onayı", "Bahçe/bitki kümesi mi, yedek olarak faith mi?",
             "Ölçüm bahçeyi işaret ediyor; kataloğun tamamı bu karara bağlı."],
            ["Fiyat", "Tişört $24.99 → $29.99, $75 üstü ücretsiz kargo, altı $4.87. Onaylıyor musunuz?",
             "Açık kalan tek P0 karar. Onaysız reklam matematiği kurulmuyor; Etsy tarafı etkilenmiyor."],
            ["compare_at", "Kalıcı indirim görüntüsü kalsın mı?",
             "Hesaplanmış çapa fiyatlar ($35.70) güven ve reklam uyumu açısından riskli. Önerim: kaldır veya gerçek dönemsel indirime çevir."],
            ["Kapasite", "Printinly ile günde kaç sipariş rahat çıkar?",
             "Elle karşılamada bu rakam ölçekleme tavanı. Bilinmeden bütçe artırılmaz."],
            ["İcra", "Hangi fazdan başlayalım?",
             "Onay verdiğiniz fazı uygulayıp doğrulamasını da yaparım. Canlı mağazaya henüz dokunmadım."],
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
