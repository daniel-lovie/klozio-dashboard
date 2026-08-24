import { Section, Sub, Rule, Table, Note, DoDont } from "../resources/parts";
import { UnitEconomics } from "./UnitEconomics";

/** Link into the playbook page so every judgement here is traceable to the rule behind it. */
function P({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <a href={`/resources#${id}`}
       className="whitespace-nowrap text-[11px] font-medium text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
      {children} ↗
    </a>
  );
}

function Sev({ level }: { level: "P0" | "P1" | "P2" }) {
  const skin = { P0: "border-danger/30 bg-danger-soft text-danger",
                 P1: "border-warn/30 bg-warn-soft text-warn",
                 P2: "border-line bg-sunken text-ink-soft" }[level];
  return <span className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${skin}`}>{level}</span>;
}

export function Audit() {
  return (
    <>
      <Section
        id="karar"
        kicker="Karar"
        title="Bugün reklam açmayın"
        lede={<>24 Ağustos 2026 itibarıyla klozio.io canlı, 177 ürünü ve çalışan bir ödeme akışı var.
          Buna rağmen Heckman&apos;ın sistemini bugün üstüne kuramazsınız: sistemin okuduğu sayıların
          hiçbirini üretemiyor ve birim ekonomi ödediğiniz trafiği kaldırmıyor.</>}
      >
        <Rule tone="danger">
          Üç şey aynı anda eksik: <strong>ölçüm yok</strong> (mağazada Meta pikseli kurulu değil),
          <strong> matematik tutmuyor</strong> ($24.99&apos;a $15.00 maliyet = başabaş ROAS 2.79) ve
          <strong> mockup&apos;lar Etsy için yapılmış</strong> (Meta akışında çalışmazlar). Bu üçü
          çözülmeden harcanan her dolar, öğrenme değil kayıp üretir.
        </Rule>

        <Table
          head={["Heckman'ın ön koşulu", "Klozio bugün", "Durum"]}
          rows={[
            ["Satış hedefli reklam için piksel", "Sadece Printful pikseli kurulu", <span key="a" className="font-semibold text-danger">Yok</span>],
            ["100+ tasarım", "177 ürün canlı", <span key="b" className="font-semibold text-ok">Var</span>],
            ["Tek ürün tipi", "Tişört + nakış gömlek + şapka", <span key="c" className="font-semibold text-warn">Karışık</span>],
            ["Tanımlı niş", "Oyun, astronomi, nakış, kişiselleştirme bir arada", <span key="d" className="font-semibold text-danger">Yok</span>],
            ["Ödenebilir başabaş ROAS", "2.79 (bandın çok üstünde)", <span key="e" className="font-semibold text-danger">Tutmuyor</span>],
            ["Beyaz zemin", "#ffffff", <span key="f" className="font-semibold text-ok">Var</span>],
            ["E-posta toplama", "Sadece footer'daki yerleşik form", <span key="g" className="font-semibold text-danger">Yok</span>],
            ["Yorum / sosyal kanıt", "Hiçbir uygulama kurulu değil", <span key="h" className="font-semibold text-danger">Yok</span>],
            ["Ücretsiz kargo eşiği", "Sitede hiçbir yerde geçmiyor", <span key="i" className="font-semibold text-danger">Yok</span>],
            ["Reklam hesabı", "Aktif, $23.9k ömürlük harcama", <span key="j" className="font-semibold text-ok">Var</span>],
          ]}
        />

        <Note>
          İyi haber: eksiklerin hemen hepsi ayar seviyesinde, yeniden inşa gerektirmiyor. Katalog,
          tema, ödeme ve tedarik zaten ayakta. Aşağıdaki liste üç haftada bitirilebilir bir liste.
        </Note>
      </Section>

      <Section
        id="olcum"
        kicker="Kanıt"
        title="Ne ölçtüm, nasıl ölçtüm"
        lede="Aşağıdaki her yargı doğrudan ölçümden geliyor; hiçbiri tahmin değil. Tekrar üretilebilmesi için yöntemi de yazdım."
      >
        <Table
          head={["Ölçüm", "Yöntem", "Sonuç"]}
          rows={[
            ["Katalog büyüklüğü ve yapısı", "products.json, 250'lik sayfalama",
              "177 ürün · 154 tişört, 16 nakış gömlek, 7 şapka"],
            ["Yayın tarihleri", "published_at dağılımı",
              "Tamamı 3–17 Ağustos 2026 · son bir haftada yeni ürün yok"],
            ["Başlık uzunluğu", "177 başlığın karakter sayımı",
              "Ortalama 123 · en kısa 77 · en uzun 140 · 177/177 tanesi 40+"],
            ["Fiyatlama", "Tüm varyantların price / compare_at değerleri",
              "25 ayrı fiyat, $19.99–$47.99 · compare_at = fiyat ÷ 0.7"],
            ["Varyant hacmi", "Seçenek ve varyant sayımı",
              "34 renk · ürün başına ortalama 146.6 varyant, en yüksek 176"],
            ["Kurulu pikseller", "Sayfa kaynağındaki webPixelsConfigList",
              "Tek kayıt: Printful. Meta, GA4, TikTok yok"],
            ["Uygulama izleri", "4 sayfada Klaviyo/Judge.me/Loox/Okendo taraması",
              "E-posta aracı yok · yorum uygulaması yok"],
            ["Ürün sayfası öğeleri", "Ürün sayfası kaynağı",
              "Shop Pay açık · miktar seçici var · beden tablosu ve garanti satırı yok"],
            ["Reklam hesabı", "Meta Marketing API, salt okuma",
              "act_…674 aktif · ömürlük $23.9k · son 90 gün $74.32 · 6 kampanyanın hepsi duraklatılmış"],
            ["Kampanya hedefi", "Kampanya objective alanı",
              "İki POD kampanyası da OUTCOME_TRAFFIC · ikisi de HillsByElgin'e ait"],
            ["Birim ekonomi", "Veritabanı: pod_cost_cents + label_cost_cents",
              "Tişört: $9.50 blank + $5.50 etiket = $15.00 inen maliyet"],
            ["Dashboard bağlantısı", "shops ve products tabloları",
              "shop 8 “Klozio Shopify”: 0 ürün, boş ayarlar · shop_daily_stats tamamen boş"],
            ["Kurulu tek piksel kimin", "webPixelsConfigList içeriği",
              "Printful — ama sipariş karşılayan Printinly. Piksel yanlışlıkla duruyor, kaldırılmalı"],
          ]}
        />

        <Rule tone="danger">
          <strong>Tedarik netleşti: tüm siparişleri Printinly karşılıyor, şimdilik elle.</strong> Bu,
          mağazada kurulu tek web pikselinin — Printful&apos;ın — orada <em>yanlışlıkla</em> durduğu anlamına
          geliyor. Kullanmadığınız bir tedarikçiye her sayfa görüntülemesini ve satın almayı gönderiyor.
          Kaldırılması gereken bir ayar, öncelikli. Ayrıca maliyet modeli doğrulandı: $9.50 blank +
          $5.50 etiket = $15.00 — yukarıdaki bütün hesap bu rakamlar üstüne kurulu.
        </Rule>

        <Sub title="Elle karşılamanın getirdiği tavan">
          <p>
            Heckman kâr eden bir kampanyanın bütçesini 2–3 günde bir %15–20 artırıyor. Elle karşılanan
            bir operasyonda bu artışın bir tavanı var: reklamı ölçeklemeden önce günde kaç siparişi
            rahatça çıkarabileceğinizi bilmeniz gerekiyor. Yol haritasına bunu ayrı bir geçiş şartı
            olarak ekledim — kapasiteyi bilmeden ölçeklemek, kazanan kampanyayı teslimat gecikmesiyle
            boğmanın en hızlı yolu.
          </p>
          <p>
            İkinci sonuç: Etsy tarafında kargo etiketi Etsy arayüzünden alınıyor. Shopify&apos;da bu akış
            farklı — etiket Shopify Shipping&apos;ten veya Printinly tarafından alınacak. Faz 0&apos;da netleşmesi
            gereken operasyonel bir ayrıntı.
          </p>
        </Sub>

        <Sub title="Doğrulayamadıklarım">
          <p>
            Dürüst olmak gerekirse iki şeyi buradan göremedim. Bir: Meta sistem token&apos;ında
            <code className="mx-1 rounded bg-sunken px-1 text-[12px]">business_management</code> izni
            yok, bu yüzden Business Manager&apos;daki katalog ve piksel <em>nesnelerini</em> listeleyemedim —
            ama mağazada piksel <em>ateşlenmediği</em> kesin, çünkü sayfa kaynağındaki piksel listesinde
            yalnızca Printful var. İki: kargo profili ayarlarını ve ücretsiz kargo eşiğini yönetim
            panelinden görmem gerekiyor; vitrinde eşikle ilgili tek kelime geçmiyor, bu da eşiğin
            kurulu olmadığına güçlü işaret ama kanıt değil.
          </p>
        </Sub>
      </Section>

      <Section
        id="ekonomi"
        kicker="Engel · P0"
        title="Asıl mesele fiyat, dönüşüm değil"
        lede={<>Heckman&apos;ın delik kova hesabı birim ekonominin zaten tuttuğunu varsayar — kendi markası
          %40 maliyetle çalışıyor. Klozio oradan başlamıyor ve bu farkı hiçbir CRO çalışması kapatmaz.</>}
      >
        <Table
          head={["Senaryo", "Sipariş cirosu", "Maliyet oranı", "Başabaş ROAS", "Değerlendirme"]}
          rows={[
            ["Bugünkü hâli — $24.99, kargo bedava", "$24.99", "%64,1",
              <span key="a" className="font-semibold text-danger">2.79</span>, "Ödenemez"],
            ["Kargo tahsil et — $24.99 + $4.87", "$29.86", "%54,1",
              <span key="b" className="font-semibold text-warn">2.18</span>, "Sınırda"],
            ["Fiyatı yükselt — $29.99 + $4.87", "$34.86", "%46,8",
              <span key="c" className="font-semibold text-ok">1.88</span>, "Ödenebilir"],
            ["Hedef — $29.99 × 2, $75 üstü bedava", "$59.98", "%44,2",
              <span key="d" className="font-semibold text-ok">1.79</span>, "Heckman'ın şekli"],
          ]}
        />

        <Rule>
          Yol açık: <strong>fiyatı $29.99&apos;a çek, eşik altı kargoyu $4.87 olarak tahsil et, $75 üstünü
          bedava yap.</strong> Bu üç ayar başabaşı 2.79&apos;dan 1.79&apos;a indiriyor — yani reklam matematiğini
          imkânsızdan ödenebilire taşıyan şey, tek bir dönüşüm iyileştirmesi değil, fiyat kurgusu.
        </Rule>

        <UnitEconomics />

        <Sub title="Yan bulgu: veritabanındaki marj alanları tutmuyor">
          <p>
            Bileşenlerden hesaplanan brüt marj ($24.99&apos;a karşı $15.00 maliyet) %40 civarı çıkıyor, ama
            <code className="mx-1 rounded bg-sunken px-1 text-[12px]">products.gross_margin_pct</code>
            aynı satırlar için %30.8 diyor. İkisi aynı tabana oturmuyor. Bu alanlara bakarak fiyat kararı
            veriliyorsa yanlış tabandan veriliyor — düzeltme listesine aldım.
          </p>
          <p>
            Ayrıca CLAUDE.md&apos;deki <strong>brüt %55 / net %40</strong> marj tabanları bugünkü Shopify
            fiyatlamasıyla zaten sağlanmıyor. Ya taban Shopify için ayrı tanımlanmalı ya da fiyat
            yükselmeli.
          </p>
        </Sub>
      </Section>

      <Section
        id="engeller"
        kicker="Engel · P0"
        title="Reklamdan önce kapatılacak dört engel"
        lede="Bunlar sıralı değil, paralel yürüyebilir — ama dördü bitmeden kampanya açılmaz."
      >
        <div className="space-y-3">
          {[
            {
              s: "P0" as const,
              t: "Meta pikseli ve Conversions API kurulu değil",
              body: <>Mağazadaki tek web pikseli Printful&apos;ın. Piksel olmadan satın alma hedefli kampanya
                açılamaz, katalog reklamı çalışmaz, kitle oluşmaz ve Heckman&apos;ın okuduğu huninin reklam
                tarafı hiç doğmaz. <strong>Yapılacak:</strong> Shopify&apos;a Facebook &amp; Instagram kanalını
                kur, pikseli bağla, Conversions API&apos;yi aç, katalog beslemesini yayınla, sonra Events
                Manager&apos;da ViewContent / AddToCart / InitiateCheckout / Purchase olaylarının düştüğünü
                test siparişiyle doğrula.</>,
              why: "reklam",
            },
            {
              s: "P0" as const,
              t: "Birim ekonomi ödenebilir değil",
              body: <>$24.99&apos;a $15.00 inen maliyet başabaşı 2.50&apos;nin üstüne çıkarıyor.
                <strong> Yapılacak:</strong> tişört fiyatını $29.99&apos;a al, eşik altı kargoyu $4.87 yap,
                $75 üstü ücretsiz kargoyu otomatik indirim olarak kur. Nakış ve şapkaların maliyeti
                farklı — onları ayrı fiyatla veya kampanya dışında tut.</>,
              why: "ekonomi",
            },
            {
              s: "P0" as const,
              t: "Mockup'lar Etsy için üretilmiş",
              body: <>Aynı model, aynı poz, her üründe tekrar; üstünde kırmızı “FREE SHIPPING” damgası ve
                “COMFORT COLORS / IVORY” rozeti. Tişört karenin kenarlarına değmiyor, objeler
                <em> üstte</em> duruyor ve krem tişört krem zeminde kayboluyor — Heckman&apos;ın üç kademeli
                kontrast kuralının tam tersi. Ayrıca sitede ücretsiz kargo eşiği kurulu değilken damganın
                kendisi yanlış beyan. <strong>Yapılacak:</strong> Meta için tek bir yeni mockup seti.</>,
              why: "mockup",
            },
            {
              s: "P0" as const,
              t: "Niş tanımlı değil",
              body: <>Katalogda masaüstü rol yapma, FPS, MMORPG, anime, astronomi, “statement tees”,
                kişiselleştirilmiş hediye ve nakış şapka bir arada. Ana koleksiyonun adı “Everything
                Else” ve 196 ürün içeriyor; koleksiyon başlığı “Products”. Bu bir marka değil, bir
                depo. Reklam bir kitleye konuşmak zorunda. <strong>Yapılacak:</strong> aşağıdaki niş
                kararını ver.</>,
              why: "nis",
            },
          ].map((b) => (
            <div key={b.t} className="rounded-lg border border-line bg-raised p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Sev level={b.s} />
                <h3 className="text-sm font-semibold">{b.t}</h3>
                <span className="ml-auto"><P id={b.why}>playbook</P></span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{b.body}</p>
            </div>
          ))}
        </div>

        <DoDont
          doTitle="Bu üç hafta içinde"
          dontTitle="Bu üç hafta içinde asla"
          doItems={[
            "Piksel + CAPI kur ve test siparişiyle doğrula.",
            "Fiyat, kargo eşiği ve mockup setini değiştir.",
            "Nişi seç, kataloğu ona göre sırala.",
            "E-posta aracını kur ve toplamaya başla.",
          ]}
          dontItems={[
            "Kampanya açmak — ölçüm yokken harcanan para öğrenme üretmiyor.",
            "Yeni ürün tipi eklemek (kupa, hoodie, poster).",
            "Temayı baştan kurmak — mevcut tema yeterli.",
            "Etsy tarafındaki fiyat ve mockup'ları bozmak; iki mağaza ayrı kurgular.",
          ]}
        />
      </Section>
    </>
  );
}
