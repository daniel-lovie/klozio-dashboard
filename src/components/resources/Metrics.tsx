import { Section, Sub, Rule, Table, Note, Cite, DoDont } from "./parts";
import { LeakyBucket } from "./LeakyBucket";

export function Metrics() {
  return (
    <>
      <Section
        id="model"
        kicker="Model"
        title="İşin tamamı üç sayıya iniyor"
        lede={<>Heckman on yıldır Shopify üzerinde markalı print-on-demand tişört satıyor. Beş yayının
          tamamında aynı iskeleti kuruyor: trafiği ne kadara alıyorsun, gelenlerin kaçı satın alıyor,
          alanlar ne kadar bırakıyor. Reklam ayarları, tema, e-posta — hepsi bu üç sayıdan birini
          oynatmak için var.</>}
      >
        <Rule>
          ROAS = dönüşüm oranı × ortalama sepet ÷ tıklama başı maliyet. Üç girdiden hangisinin
          bozulduğunu söyleyemiyorsan, mağazada yaptığın hiçbir değişikliğin ölçüsü yok.
        </Rule>

        <Sub title="Neden bu üçü">
          <p>
            Her yayında ilk açtığı ekran reklam hesabı, ilk baktığı satır <strong>tıklama başı maliyet</strong>.
            Sebebi şu: TBM tek başına en çok değişkeni içine alan sayı. Niş doğru mu, mockup çalışıyor mu,
            tasarımlar insanları durduruyor mu — hepsi TBM&apos;ye düşüyor. Doktorun odaya girip önce tansiyon
            ölçmesine benzetiyor; teşhis değil ama nereye bakacağını söylüyor. <Cite v="scale" t="00:05:10" />
          </p>
          <p>
            50–75 sent aralığında bir TBM gördüğü anda tasarım ve mockup tartışmasını kapatıp doğrudan
            siteye geçiyor, çünkü o rakam &quot;insanlar tasarımları beğeniyor&quot; demenin ölçülebilir hâli.
            2–3 dolar görürse siteye hiç bakmıyor, sorun yukarıda.
          </p>
        </Sub>

        <Table
          head={["Metrik", "Hedef bandı", "Ne söyler", "Bozuksa nereye bakılır"]}
          rows={[
            ["Tıklama başı maliyet", <span key="a" className="tabular font-semibold text-ink">$0.50 – $0.75</span>,
              "Niş + mockup + tasarım kalitesi", "Mockup testi, tasarım stili, niş genişliği"],
            ["Sepete ekleme", <span key="b" className="tabular font-semibold text-ink">%6 – %8</span>,
              "Koleksiyon ve ürün sayfası", "Koleksiyon sayfası, ürün sayfası, sepete ekle butonu"],
            ["Ödemeye ulaşma", <span key="c" className="tabular font-semibold text-ink">%5 – %6</span>,
              "Sepet çekmecesi", "Shop Pay, buton rengi/yuvarlaklığı, sepetteki gürültü"],
            ["Ödemeyi tamamlama", <span key="d" className="tabular font-semibold text-ink">%2.5 – %3</span>,
              "Checkout sayfası", "Kargo profili, telefon zorunluluğu, logo, buton rengi"],
            ["Ortalama sepet", <span key="e" className="tabular font-semibold text-ink">$45 – $55</span>,
              "Katalog derinliği", "Daha çok tasarım, önerilen ürünler"],
            ["ROAS", <span key="f" className="tabular font-semibold text-ink">1.80 – 2.50</span>,
              "Bütün sistemin çıktısı", "Yukarıdakilerden hangisi banda düşükse o"],
          ]}
        />

        <Note>
          %40 ürün + kargo maliyetinde matematiksel başabaş ROAS 1.67. Sahada &quot;1.8–2.0 başabaş&quot;
          demesinin sebebi, iade ve diğer giderler için pay bırakması. 2.0&apos;ın üstü ölçekleme bölgesi.
        </Note>
      </Section>

      <Section
        id="hesap"
        kicker="Araç"
        title="Delik kova hesabı"
        lede={<>Yayınlarda ekranda tuttuğu hesap makinesinin çalışan bir kopyası. Kaydırıcıları oynat;
          küçük bir dönüşüm artışının aynı bütçede ne kadar ciro getirdiğini görmek, bu playbook&apos;un
          tamamının neden CRO etrafında döndüğünü açıklıyor. <Cite v="scale" t="00:08:10" /></>}
      >
        <LeakyBucket />
      </Section>

      <Section
        id="teshis"
        kicker="Yöntem"
        title="Teşhis sırası — asla atlanmıyor"
        lede={<>Beş yayında dokuz mağazayı aynı sırayla açtı. Sıranın kendisi yöntemin yarısı: çoğu kişi
          birinci adımı atlayıp doğrudan rastgele şeyleri düzeltmeye başlıyor.</>}
      >
        <ol className="space-y-3">
          {[
            ["Reklam hesabı, tek satır: TBM", "Banda giriyorsa tasarım tartışması kapanır. Girmiyorsa siteye hiç bakma — sorun tasarım/mockup/niş."],
            ["Dönüşümü boyla, bot filtresini aç", "Shopify varsayılanı botları sayıyor. Filtresiz %0.1 gören insanlar her şeyin bozuk olduğunu sanıyor; filtreyle aynı mağaza %2.26 çıkıyor."],
            ["Dönüşümü üçe böl", "Sepete ekleme / ödemeye ulaşma / ödemeyi tamamlama. Bu üç sayı sana hangi sayfayı açacağını söyler."],
            ["Sadece o sayfayı aç, mobilde", "Trafiğin %80'i mobil. Chrome'da sağ tık → İncele → mobil görünüm. Masaüstünde bakmak zaman kaybı."],
            ["Tek metriği hedefleyerek değiştir", "'Bu değişiklik hangi sayıyı oynatacak' sorusuna cevabın yoksa değişikliği yapma."],
            ["Değiştir, sonra ölç", "Tahmin değil. Değişiklikten sonra aynı üç sayıya geri dön."],
          ].map(([t, d], i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-line bg-raised px-4 py-3">
              <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{t}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{d}</p>
              </div>
            </li>
          ))}
        </ol>

        <Rule tone="danger">
          Bot filtresi kapalıyken dönüşüm oranına bakmak, beş yayında gördüğü en yaygın öz-sabotaj.
          Meta siteni taramak için bot gönderiyor; o trafiği saymak dönüşümü on kata kadar düşük gösteriyor.
          <Cite v="review2" t="01:08:00" />
        </Rule>

        <Sub title="ROAS düştüğünde sorulacak tek soru">
          <p>
            &quot;ROAS bugün kötü&quot; diye bir şey yok. Üç sayıdan biri kesin olarak değişti: trafik
            pahalılaştı (→ yeni tasarım lazım), gelenler almıyor (→ sitede ne değişti), ya da sepet küçüldü.
            Perakende dükkânı benzetmesini kullanıyor: aynı sayıda insan giriyor ama kimse almıyorsa,
            dükkânda ne bozuldu diye sorarsın — kapılardan biri kilitli kalmıştır.
          </p>
        </Sub>

        <DoDont
          doTitle="Kötü bir günde"
          dontTitle="Kötü bir günde asla"
          doItems={[
            "Son 7 güne bak — trend yukarıysa o gün istatistik gürültüsü, dokunma.",
            "Üç sayıyı kontrol et, hangisi kaydı onu bul.",
            "Kontrol edebildiğin girdilere dön: yeni tasarım, e-posta.",
          ]}
          dontItems={[
            "Tek günün düşüşüne bakıp bütçeyi kapatmak.",
            "Algoritmayı çözmeye çalışmak — çıktısı yok, kendi kabul ediyor.",
            "Ürün tipi eklemek, sağlayıcı değiştirmek, temayı baştan kurmak.",
          ]}
        />
      </Section>
    </>
  );
}
