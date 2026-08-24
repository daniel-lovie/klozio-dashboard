import { Section, Sub, Rule, Table, Note, Cite, Checklist, DoDont } from "./parts";

export function Store() {
  return (
    <>
      <Section
        id="cro"
        kicker="Mağaza"
        title="Dönüşüm optimizasyonu: bin küçük kesik"
        lede={<>Tek bir sihirli değişiklik yok. Yayınlarda tekrar tekrar söylediği şey: müşteri siteye
          güvenip güvenmeyeceğine milisaniyeler içinde karar veriyor ve ona sorsan sebebini
          söyleyemiyor. Optimizasyonun çıtası bu — fark edilmeyecek kadar küçük şeylerin toplamı.</>}
      >
        <Rule>
          Her sayfada tek soru: <em>bunun burada olması şart mı?</em> Cevap kesin evet değilse çıkar.
          Az her zaman daha çok. Varsayılan Shopify temasıyla %3–4 dönüşüm yapan mağazalar var.
        </Rule>

        <Sub title="Mobilde bak, masaüstünde değil">
          <p>
            Trafiğin %80&apos;i Facebook ve Instagram üzerinden, yani telefondan geliyor. Chrome&apos;da sağ tık →
            İncele → mobil görünüm. Yayında masaüstü görünümünde bakıp &quot;temiz&quot; dediği hiçbir sayfa yok.
          </p>
        </Sub>

        <Sub title="İki sayfa geri kalanların hepsinden önemli">
          <p>
            <strong>Koleksiyon sayfası</strong> ve <strong>ürün sayfası</strong>. Tüm reklam trafiğini
            koleksiyona yolluyor, dolayısıyla koleksiyonun üst bandı sitedeki tek garantili gösterim
            alanı — reklama tıklayan herkes onu görüyor. Ana sayfa neredeyse hiç önemli değil; ürün
            listesi, kısa bir misyon cümlesi ve SSS varsa yeterli.
          </p>
        </Sub>
      </Section>

      <Section
        id="cro-liste"
        kicker="Mağaza"
        title="Sayfa sayfa denetim listesi"
        lede="Beş yayında dokuz mağazada verdiği düzeltmelerin tamamı, hangi metriği oynattıklarına göre gruplanmış hâli."
      >
        <Sub title="Koleksiyon sayfası — sepete ekleme oranını oynatır">
          <Checklist items={[
            ["Zemin beyaz olsun", "Beyaz zemin diğer bütün renklerden yüksek dönüşüyor; büyük ölçekli testlerle sabit."],
            ["Sonsuz kaydırmayı kapat", "Test ettiler: sonsuz kaydırma dönüşümü düşürüyor. İnsanlar sayfanın bittiğini görmek istiyor."],
            ["Başlık nişi tekrarlasın", "'Ürünler' değil — 'Kamp Tişörtleri' + küçük bir emoji. Reklamda tıklanan şeyi teyit et, sonra yoldan çekil."],
            ["Ürün adları 2–3 kelime + 'T-Shirt'", "Kimse isme bakarak alışveriş yapmıyor. Uzun isim iki satıra taşıp ekranı aşağı itiyor."],
            ["Üst banttaki metni tek mesaja indir", "'4 al 1 bedava' + '75$ üzeri kargo bedava' + emoji yığını = okunmuyor. Tek teklif bırak."],
            ["Sıralamada çeşitlilik olsun", "İlk ekranda bir tipografi, bir grafik, bir karma tasarım. Aynı stilden duvar örme."],
            ["Tişört renklerini serpiştir", "Kenarda üst üste beş kırmızı, mobilde 2x2 görülen bir ızgarada monotonluk yaratıyor."],
            ["Sezonu geçmiş tasarımları dibe at", "Perakende mağazalarının reyonu bir gecede değiştirmesinin sebebi var: sezon bitince satış sıfırlanıyor."],
          ]} />
        </Sub>

        <Sub title="Ürün sayfası — sepete ekleme oranını oynatır">
          <Checklist items={[
            ["Sepete ekle butonu ekranın üst bandında (above the fold)", "Kaydırmadan görünmesi gereken tek buton. Çoğu Shopify teması onu aşağı gömüyor."],
            ["Buton tam genişlik, yazısı büyük", "Küçük yazılı dar buton, altındaki rozetlerden daha az dikkat çekiyor."],
            ["Buton rengi siyah değil", "Siyah metne karışıyor. Yeşil veya kırmızı — ve funnel boyunca aynı renk."],
            ["Üç madde, daha fazlası değil", "İkonlu 'garanti / iade / kargo' bloklarını üçe indir. Metinleri açılır menüye taşı, kimse açmayacak varsay."],
            ["İkonlar aynı renk ve niş temalı", "Hafif farklı iki siyah tonu bile fark ediliyor. Noun Project / Flaticon'dan nişe uygun ikon al, jenerik olanları at."],
            ["'Müşterilerimizin %1'inden azı iade garantisini kullanıyor'", "Bu tek satır sepete ekleme oranını ciddi artırdı. Sadece 'para iade garantisi' yazmak ters etki yapıyor — ürünün iade edilebilir olduğunu ima ediyor."],
            ["'Ücretsiz beden değişimi' yazma", "Müşteriye 'beden tutmayacak' diye okuyor. Faydaymış gibi duran bir uyarı."],
            ["Yorumları en dibe al", "İnsanlar yorum için kaydırmaya razı. Amazon yedi kat önerilen ürünün arkasına koyuyor; sen de arada marka bloklarını göster."],
            ["Marka bloğu koy: kim olduğun + kalite", "Mümkünse yüzün. 'Alibaba'dan mı geliyor' sorusunu öldüren tek şey. Uzun paragraf değil, iki cümle."],
            ["Adet seçiciyi kaldır", "Aynı tasarımı, aynı bedende, aynı renkte iki kez alan neredeyse yok. İnsanlar varyantı değiştiriyor."],
            ["Yakınlaştırılmış/uzun ürün fotoğrafını düzelt", "Yanlış en-boy oranı sepete ekle butonunu ekranın dışına itiyor."],
          ]} />
        </Sub>

        <Sub title="Sepet çekmecesi — ödemeye ulaşma oranını oynatır">
          <Checklist items={[
            ["Shop Pay'i kapat", "Shopify hızlı ödeme logosunu tam ödeme butonunun üstüne koyuyor. Orası senin en değerli alanın, onların işine yarıyor."],
            ["Ödeme butonu, sepete ekle butonuyla aynı renk", "Renk izolasyonu: müşteriyi 'bu renk = aksiyon' diye koşullandırıyorsun. Funnel boyunca sabit kalmalı."],
            ["Buton köşe yuvarlaklığı ve yazı boyutu da aynı", "Delilik gibi görünüyor; farkı bilinçaltı yakalıyor. Apple'ın köşe yuvarlaklığına harcadığı zaman boşuna değil."],
            ["Tekrar eden garanti metinlerini sil", "Ürün sayfasında zaten gördü. Sepette tekrar etmek gözü ödeme butonundan uzaklaştırıyor."],
            ["Boşlukları kapat", "Butonun altındaki ölü alan gözü aşağı çekiyor."],
          ]} />
        </Sub>

        <Sub title="Checkout — ödemeyi tamamlama oranını oynatır">
          <Checklist items={[
            ["Kargo profilini kontrol et — en büyük tek kaçak", "Printify/Printful oranları elle ayarladıklarının yerine geçebiliyor ve periyodik olarak sıfırlanıyor. Yayında üç ayrı mağazada bu çıktı; birinde üç tişörte 12$ kargo çıkıyordu."],
            ["0–75$ arası kargo $4.87", "5$'ın üstü dönüşümün düştüğü eşik. Yuvarlak olmayan rakam ('4.99' değil) daha az 'seçilmiş' duruyor."],
            ["75$ üzeri ücretsiz kargo, otomatik indirim", "85$ çok yüksek — aynı sayıda tişört gerekiyor ama kulağa daha büyük geliyor. Kod girdirme."],
            ["Kargo adı 'Standart' değil 'Kargo ve işlem'", "'Standart' hiçbir şey vaat etmiyor. Süre yazma; POD çoğu zaman aynı gün kargoluyor zaten."],
            ["Telefon numarasını zorunlu yapma", "Yayında bulduğu en büyük tek dönüşüm katili. Tek ayar."],
            ["Checkout logosunu küçült", "Bir mağazada logo ekranın üçte birini kaplıyordu."],
            ["Logo her sayfada aynı sürüm olsun", "Ürün sayfasındaki ile checkout'taki logo farklıysa müşteri bilinçli fark etmiyor ama güven düşüyor."],
            ["'Siparişi tamamla' butonu da aynı renk", "Shopify checkout'ta sınırlı özelleştirme veriyor ama bu değiştirilebiliyor. Mavi bırakmak funnel'ın son adımını kırıyor."],
            ["Üç adımlı checkout kullan", "Tek adımlıya göre belirgin şekilde yüksek dönüşüyor."],
          ]} />
        </Sub>

        <Rule tone="danger">
          Ekranın altına yapışan &quot;Sınırlı süre %15 indirim&quot; çubuğu. Klaviyo ve benzeri her e-posta
          uygulaması bunu varsayılan açık getiriyor. Masaüstünde zararsız, mobilde kaydırırken en değerli
          alanı — parmağın olduğu yeri — kapatıyor. Beş yayının dördünde ayrı ayrı çıktı ve her seferinde
          ilk düzeltme oldu. <Cite v="build" t="00:26:45" />
        </Rule>

        <Note>
          Yazılım sağlayıcıları kötü niyetli değil; sadece kendi metriklerini optimize ediyorlar. E-posta
          uygulaması birkaç abone daha kazandırıyor, bunun karşılığında sitenin bütün dönüşümünü yiyor.
          Widget var diye onun senin lehine olduğunu varsayma.
        </Note>
      </Section>

      <Section
        id="popup"
        kicker="Mağaza"
        title="E-posta pop-up'ı: anket, doğrudan e-posta değil"
        lede={<>Kendi markalarında pop-up tamamlanma oranını %1–2&apos;den <strong>%6–8</strong>&apos;e çıkaran değişiklik.</>}
      >
        <DoDont
          doTitle="Çalışan kurgu"
          dontTitle="Çalışmayan kurgu"
          doItems={[
            "Önce tek bir basit soru, butonlarla: 'Kimin için alıyorsun — kendim / başkası'.",
            "Soru nişi hiç bilmeyen birinin de cevaplayabileceği kadar basit olmalı.",
            "Emoji kullan, kontrastı yükselt, kapatma çarpısı belirgin olsun.",
            "İkinci veya üçüncü sayfa görüntülemesinde tetikle.",
            "Tek metrik izle: pop-up tamamlanma oranı.",
          ]}
          dontItems={[
            "İlk saniyede e-posta kutusunu suratına dayamak (Klaviyo varsayılanı).",
            "Nişe hâkim olmayı gerektiren soru sormak ('ne tür bir angler'sın').",
            "Pop-up'ta iki teklif birden — iki şey sıfır kayıt demek.",
            "Kapatma yolu bırakmamak; müşteri kapana kısılmış hissediyor.",
          ]}
        />
        <p className="text-sm leading-relaxed text-ink-soft">
          Arkasındaki mantık kademeli bağlılık: birine butona tıklatmak, yazı yazdırmaktan kolay.
          Tıklayan kişi zaten yatırım yapmış oluyor ve e-posta adımına geldiğinde tamamlama olasılığı
          yükseliyor. <Cite v="scale" t="00:34:00" />
        </p>
      </Section>

      <Section
        id="fiyat"
        kicker="Mağaza"
        title="Fiyat ve sepet"
        lede="Yayınlarda gördüğü mağazaların hemen hepsi aynı bantta duruyor."
      >
        <Table
          head={["Kalem", "Değer", "Gerekçe"]}
          rows={[
            ["Tişört fiyatı", "$29.99", "Sahada gördüğü standart. $30.99 'arada' kalıyor — ya $29.99 ya $32.99."],
            ["Çapa fiyat", "$39.99 – $42.99", "Üstü çizili karşılaştırma fiyatı. Kalıcı bırakılamaz, dönemsel kaldırılıyor."],
            ["Ücretsiz kargo eşiği", "$75", "Üç tişört. $85 aynı adet ama kulağa yüksek geliyor."],
            ["Eşik altı kargo", "$4.87", "$5 üstü dönüşümün kırıldığı nokta."],
            ["Ortalama sepet hedefi", "$45 – $55", "Katalog derinleştikçe kendiliğinden yükseliyor."],
            ["Büyük bedenler", "Zamlı", "Printify 2XL+ maliyeti artıyor; fiyat yansıtılmazsa marj eriyor."],
          ]}
        />
        <Note>
          Kol/sırt baskısı gibi ek baskılar sessizce marj yiyor — Printify&apos;da ekstra baskı başına
          yaklaşık 4$. Bir mağaza bunu farkında olmadan yüksek kargo ücretiyle telafi ediyordu; kargo
          düzelince marj sorunu ortaya çıkacaktı.
        </Note>
      </Section>
    </>
  );
}
