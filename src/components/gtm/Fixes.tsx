import { Section, Sub, Rule, Table, Note, Checklist, DoDont } from "../resources/parts";

const YT = {
  scale:   "https://www.youtube.com/watch?v=BYtlQ0AqcVQ",
  review2: "https://www.youtube.com/watch?v=AAvz7DOqpgA",
  build:   "https://www.youtube.com/watch?v=HmNgM84crpQ",
} as const;

function At({ v, t, s }: { v: keyof typeof YT; t: string; s: number }) {
  return (
    <a href={`${YT[v]}&t=${s}s`} target="_blank" rel="noreferrer"
       className="whitespace-nowrap font-semibold text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent">
      {t}
    </a>
  );
}

export function Fixes() {
  return (
    <>
      <Section
        id="duzeltmeler"
        kicker="Düzeltme"
        title="Mağaza düzeltme listesi"
        lede={<>Heckman&apos;ın denetim listesi Klozio&apos;nun bugünkü hâline uygulanmış hâli. Sıra, hangi
          metriği oynattığına göre — çünkü her değişiklik bir sayıya yazılmalı, yoksa ölçemezsin.</>}
      >
        <Table
          head={["#", "Değişiklik", "Bugün", "Oynattığı metrik", "Öncelik"]}
          rows={[
            ["1", "Ürün başlıklarını 2–3 kelime + “T-Shirt” yap", "Ortalama 123 karakter, Etsy başlığı", "Sepete ekleme", "P1"],
            ["2", "Shop Pay / hızlı ödeme butonlarını kapat", "Ürün sayfasında açık", "Ödemeye ulaşma", "P1"],
            ["3", "Miktar seçiciyi kaldır", "Var", "Sepete ekleme", "P1"],
            ["4", "Sepete ekle butonunu siyahtan çıkar, funnel boyunca sabitle", "Tema varsayılanı", "Sepete ekleme", "P1"],
            ["5", "“Müşterilerimizin %1’inden azı garantiyi kullanıyor” satırını ekle", "Yok", "Sepete ekleme", "P1"],
            ["6", "Beden tablosu ekle", "Yok", "Sepete ekleme", "P1"],
            ["7", "Yorum uygulaması kur, yorumları en dibe al", "Hiç yok", "Sepete ekleme", "P1"],
            ["8", "$75 üstü ücretsiz kargo + altı $4.87, otomatik indirim", "Eşik kurulu değil", "Ödemeyi tamamlama", "P0"],
            ["9", "Kargo adını “Kargo ve işlem” yap", "“Standart”", "Ödemeyi tamamlama", "P2"],
            ["10", "Telefon alanının opsiyonel olduğunu doğrula", "Doğrulanmadı", "Ödemeyi tamamlama", "P1"],
            ["11", "Üç adımlı checkout’a geç", "Doğrulanmadı", "Ödemeyi tamamlama", "P2"],
            ["12", "Koleksiyon başlığını nişe göre adlandır", "“Products” / “Everything Else”", "Sepete ekleme", "P1"],
            ["13", "Sonsuz kaydırmayı kapat", "Açık", "Sepete ekleme", "P2"],
            ["14", "Marka bloğu ekle (kim olduğumuz + kalite)", "Yok", "Sepete ekleme", "P1"],
            ["15", "Renk sayısını 34’ten 6–8’e indir", "34 renk, ürün başına 147 varyant", "Sepete ekleme", "P2"],
            ["16", "Nakış ve şapkaları reklam kataloğundan çıkar", "Aynı koleksiyonda", "TBM", "P1"],
            ["17", "compare_at fiyatlarını yuvarla veya kaldır", "$35.70, $28.56 gibi hesaplanmış değerler", "Güven / uyum", "P1"],
            ["18", "products.gross_margin_pct tabanını düzelt", "Bileşenlerle tutmuyor", "İç karar kalitesi", "P1"],
            ["19", "shop 8 “Klozio Shopify” kaydını doldur veya sil", "0 ürün, boş ayarlar", "Operasyon", "P2"],
          ]}
        />

        <Rule tone="danger">
          17 numara sadece estetik değil. Kalıcı bir “indirim” ve hesaplanmış görünen çapa fiyatlar
          ($24.99 için $35.70) hem tüketici güvenini düşürüyor hem de Meta&apos;nın reklam denetiminde
          yanıltıcı fiyat gerekçesiyle red sebebi olabiliyor. Ya çapa gerçek bir dönemsel fiyat olmalı,
          ya da tamamen kalkmalı.
        </Rule>

        <Note>
          1 numara tek başına en yüksek getirili iş: 177 başlık toplu düzenlemeyle bir saatte değişir ve
          mobil koleksiyon sayfasında her karttan iki satır kazandırır. Etsy tarafındaki başlıklara
          dokunulmaz — orada uzun başlık aramanın yakıtı, burada sadece yer kaplıyor.
        </Note>
      </Section>

      <Section
        id="nis"
        kicker="Karar · P0"
        title="Niş — fikirle değil, ölçümle"
        lede={<>&quot;Havalı olanı değil satacak olanı bulalım&quot; dediniz. Bunun için 46 aday temayı EverBee
          üzerinden popülasyon ölçeğinde ölçtüm: her tema için Giyim kategorisindeki toplam ilan sayısı,
          ayda 100+ satan &quot;kazanan&quot; ilan sayısı ve — belirleyici olan — bu kazananların kaçının
          <strong> kişiselleştirmesiz</strong> olduğu. Sebebi şu: Shopify + Meta modelinde kişiselleştirme
          operasyonumuz yok, dolayısıyla bizim için tek anlamlı soru &quot;düz grafik tişört burada kazanabiliyor
          mu?&quot;</>}
      >
        <Rule tone="danger">
          İlk sonuç bir tuzağı ortaya çıkardı. En yüksek kazanan yoğunluğuna sahip temalar —
          <strong> dungeons (425/M), book, anime</strong> — kâğıt üstünde mükemmel görünüyor. Kazananlara
          tek tek baktığımda hepsinin <em>lisanssız hayran ürünü</em> olduğunu gördüm: Dungeon Crawler Carl
          karakterleri, Project Hail Mary, Murderbot, Spider-Man. Bunlar bize kapalı. Sadece sayılara
          bakıp TTRPG&apos;ye girseydik, doğrudan bu duvara çarpardık — ki geçen mesajda önerdiğim yön buydu.
          Ölçüm önerimi çürüttü.
        </Rule>

        <Sub title="Ölçüm sonuçları — kişiselleştirmesiz kazananlar">
          <Table
            head={["Tema", "Giyim ilanı", "Kazanan (100+/ay)", "Kişiselleştirmesiz", "Pay", "Bize uygun mu"]}
            rows={[
              ["teacher", "759.440", "51", "16", "%31",
                <span key="a" className="text-warn">Derin ama en doymuş · sezonu Q4 değil</span>],
              ["dungeons", "25.879", "11", "10", "%91",
                <span key="b" className="font-semibold text-danger">Hayır — Dungeon Crawler Carl IP</span>],
              ["book", "351.711", "10", "10", "%100",
                <span key="c" className="font-semibold text-danger">Hayır — kitap fandom IP</span>],
              ["anime", "676.316", "17", "9", "%53",
                <span key="d" className="font-semibold text-danger">Hayır — karakter IP</span>],
              ["faith", "350.177", "8", "8", "%100",
                <span key="e" className="font-semibold text-ok">Evet — jenerik ifadeler, IP yok</span>],
              ["botanical", "140.155", "9", "7", "%78",
                <span key="f" className="font-semibold text-ok">Evet</span>],
              ["cottagecore", "223.287", "8", "8", "%100",
                <span key="g" className="font-semibold text-ok">Evet</span>],
              ["garden", "139.871", "5", "4", "%80",
                <span key="h" className="font-semibold text-ok">Evet</span>],
              ["cat", "549.369", "13", "6", "%46",
                <span key="i" className="text-warn">Kısmen</span>],
              ["dad", "598.810", "54", "7", "%13",
                <span key="j" className="text-warn">Kişiselleştirme baskın</span>],
              ["dog", "671.095", "22", "3", "%14",
                <span key="k" className="text-warn">Kişiselleştirme baskın</span>],
              ["knitting", "305.803", "24", "1", "%4",
                <span key="l" className="text-danger">Hayır — düz grafik kazanmıyor</span>],
              ["coffee · gym · pickleball · autism", "—", "0", "0", "—",
                <span key="m" className="text-danger">Hayır — hiç kazanan yok</span>],
            ]}
          />
          <p className="text-xs text-ink-faint">
            Kaynak: EverBee Research API, Giyim kategorisi, 24 Ağustos 2026. Satış rakamları EverBee
            tahminidir; Etsy kesin veri yayınlamaz. Bu veri <em>tema talebini</em> ölçer, Meta reklam
            performansını değil.
          </p>
        </Sub>

        <Rule tone="ok">
          <strong>Önerim: bahçe / bitki insanları — botanik estetiğe oturmuş, kuru mizahlı bir marka.</strong>
          Test ettiğim temalar arasında kişiselleştirmesiz kazananların baskın olduğu <em>ve</em> IP
          sorunu bulunmayan tek küme bu (garden + botanical + cottagecore birlikte 22 kazanan, 19&apos;u
          kişiselleştirmesiz).
        </Rule>

        <Sub title="Neden bu küme">
          <ul className="ml-4 list-disc space-y-1.5">
            <li><strong>Düz grafik tişört burada gerçekten kazanıyor.</strong> Cottagecore&apos;da kazananların
              %100&apos;ü, botanikte %78&apos;i kişiselleştirmesiz. Bizim üretebildiğimiz şey tam olarak bu.</li>
            <li><strong>IP yükü yok.</strong> Çiçek, bitki ve bahçe mizahı kimsenin mülkü değil. Oyun ve
              kitap nişlerinde her tasarım bir hukuk riski taşıyor; burada taşımıyor.</li>
            <li><strong>Kitle kadın ağırlıklı</strong> — grafik tişört talebinin gerçekte olduğu yer.
              Geçen mesajda oyun için dile getirdiğim çekince burada tersine dönüyor.</li>
            <li><strong>Comfort Colors zaten kategori standardı.</strong> Kazanan ilanların başlıklarında
              tekrar tekrar geçiyor — mevcut blank&apos;imiz, baskı yöntemimiz ve mockup işimiz aynen geçerli.</li>
            <li><strong>İki kanıtlanmış tasarım şekli var, ikisi de bizim elimizde:</strong> kuru mizah
              tipografisi (en büyük kazanan tek ilan ayda 1.227 satışla bu şekilde — karanlık bir bahçe
              şakası, $16.68, Comfort Colors) ve vintage botanik illüstrasyon. Heckman&apos;ın
              tipografi / grafik / ikisi matrisine birebir oturuyor.</li>
            <li><strong>Fiyat bandı bizi destekliyor:</strong> kazananlar $16–33 arasında, yani $29.99
              hamlesi bandın içinde.</li>
          </ul>
        </Sub>

        <Sub title="Çekincelerim — bunları da bilin">
          <p>
            <strong>Derinlik daha az.</strong> Bahçe kümesinde 22 kazanan var; teacher&apos;da 51, dad&apos;de 54.
            Yani tavan muhtemelen daha düşük. Buna karşılık teacher&apos;ın sezonu ağustos ve mayıs — Q4 değil —
            ve 759 bin ilanla en doymuş pazar. Q4&apos;e on hafta kala bu ikisi ciddi dezavantaj.
          </p>
          <p>
            <strong>Estetik kalabalık.</strong> Cottagecore&apos;da 223 bin ilan var; botanik görünüm tek başına
            ayırt edici değil. Farkı mizah yaratacak, çiçek çizimi değil.
          </p>
          <p>
            <strong>Tek aykırı değere yaslanmayın.</strong> 1.227/ay tek bir ilan; kümenin ortalaması bu
            değil.
          </p>
          <p>
            <strong>Etsy verisi Meta değildir.</strong> Bu ölçüm temaya talep olduğunu kanıtlar, reklam
            ekonomisini değil. TBM&apos;yi ancak kampanya açınca öğreneceğiz.
          </p>
        </Sub>

        <Sub title="Yedek seçenek: faith">
          <p>
            İkinci sırada <strong>faith</strong> duruyor: 8 kazananın 8&apos;i de kişiselleştirmesiz, ifadeler
            jenerik (mezmur alıntıları, kalıplaşmış cümleler), IP yükü yok ve Q4 hediye niyeti bahçeden
            güçlü. Bahçeyi öne almamın sebebi mizah: Heckman&apos;ın motoru yorum ve paylaşım, o da şakayla
            geliyor. Faith daha çok kimlik ve samimiyet üstünden çalışıyor — yorum üretme gücü daha
            düşük ve ton hatasının bedeli ağır.
          </p>
        </Sub>

        <Sub title="Kararın kataloğa etkisi">
          <ul className="ml-4 list-disc space-y-1">
            <li>Mevcut 177 ürünün büyük kısmı bu nişe girmiyor — sitede kalabilir, reklam beslemesinin dışında.</li>
            <li>Sıfırdan 100 tasarım gerekiyor; bölme matrisiyle üretilecek (tipografi / grafik × kuru mizah / estetik / kimlik).</li>
            <li>Koleksiyon adı nişi söylemeli — &quot;Products&quot; ve &quot;Everything Else&quot; gidiyor.</li>
            <li>Nakış ve şapkalar sitede kalır, beslemenin dışında (verdiğiniz karar).</li>
          </ul>
        </Sub>
      </Section>

      <Section
        id="mockup"
        kicker="Karar · P0"
        title="Mockup spesifikasyonu"
        lede={<>Sorduğunuz şey buydu: evet, yeni mockup lazım — ve elde olanları kullanamayız. Aşağıdaki
          spesifikasyon Heckman&apos;ın kurallarının Klozio&apos;ya uygulanmış hâli. Bunu bir fotoğrafçıya ya da
          üretim akışına doğrudan verebilirsiniz.</>}
      >
        <DoDont
          doTitle="Yeni mockup'ta olacak"
          dontTitle="Mevcut mockup'ta olan ve çıkacak"
          doItems={[
            "Tişört karenin kenarlarına değsin — düz serilmiş (flat lay) çekim.",
            "Objeler yalnızca alt kenarda; üst yarı boş kalsın.",
            "Üç kademeli kontrast: beyaz akış → koyu/dokulu zemin → tişört → tasarım.",
            "Kahraman renk lacivert, siyah, antrasit veya asker yeşili.",
            "Comfort Colors yaka etiketi net ve okunur.",
            "Tasarım göğüs genişliğinin çoğunu kaplasın.",
            "Tek bir mockup, tüm katalogda aynı.",
          ]}
          dontItems={[
            "Kırmızı “FREE SHIPPING” damgası — dikkati tasarımdan çalıyor ve eşik kurulu değilken yanlış beyan.",
            "“COMFORT COLORS / IVORY” rozeti — Etsy'ye ait, Meta'da yer kaplıyor.",
            "Üst köşelerdeki ayna ve bitki — gözü tasarımdan uzağa sektiriyor.",
            "Krem tişörtün krem zeminde durması — kontrast neredeyse sıfır.",
            "Model çekimi: çenede kesilen, tişörtü kenarlara değmeyen kadraj.",
            "Ürün başına farklı sahne.",
        ]}
        />

        <Sub title="Chris'in beğendiği mockup'lar — gidip bakabileceğiniz kaynaklar">
          <p>
            Aşağıdaki dört mağazayı yayında tek tek açıp mockup&apos;ını övdü. Bağlantılar videonun tam
            saniyesine gidiyor; mağaza adreslerini de ekran görüntülerinden aldım.
          </p>
          <Table
            head={["Mağaza", "Niş", "Dakika", "Ne dediği"]}
            rows={[
              [<a key="a" href="https://pulseprintstees.com" target="_blank" rel="noreferrer"
                  className="font-semibold text-accent underline decoration-accent/30 underline-offset-2">pulseprintstees.com</a>,
               "Hemşirelik",
               <At key="a2" v="scale" t="13:30 – 15:30" s={810} />,
               "En detaylı anlatım. Kenarlara değme, üç kademeli kontrast ve objelerin neden sadece altta durması gerektiğini burada tek tek açıklıyor."],
              [<a key="b" href="https://throttlejunkies.store" target="_blank" rel="noreferrer"
                  className="font-semibold text-accent underline decoration-accent/30 underline-offset-2">throttlejunkies.store</a>,
               "Motokros",
               <At key="b2" v="review2" t="2:34:00 – 2:36:00" s={9240} />,
               "“Ders kitabı gibi” dediği örnek. Mockup'ı fark etmemiş olması onun için en iyi işaret."],
              [<a key="c" href="https://knotoriousanglers.com" target="_blank" rel="noreferrer"
                  className="font-semibold text-accent underline decoration-accent/30 underline-offset-2">knotoriousanglers.com</a>,
               "Balıkçılık",
               <At key="c2" v="review2" t="1:11:30" s={4290} />,
               "$0.37 TBM'li mağaza — “çok temiz mockup”. Ucuz tıklamanın mockup'la ilişkisini en net gösteren örnek."],
              ["Chalk and Chapel", "Tebeşir/inanç",
               <At key="d2" v="build" t="1:38:00 ve 2:29:00" s={5880} />,
               "“Mockup çok temiz.” Tişört kenarlara değiyor; tek düzeltmesi köşedeki kalemlerin alta alınması."],
              [<a key="e" href="https://lotlegends.shop" target="_blank" rel="noreferrer"
                  className="font-semibold text-accent underline decoration-accent/30 underline-offset-2">lotlegends.shop</a>,
               "Taylgeyt",
               <At key="e2" v="review2" t="11:00 – 16:40" s={660} />,
               "Karışık örnek: asfalt zeminli olanı beğendi ama üç farklı mockup kullanmasını ve toptaki lig logosunu eleştirdi."],
            ]}
          />
          <p>
            Kendi markaları da referans: <strong>Sloth Hiking Club</strong> ve <strong>History Tees</strong>
            (<At v="build" t="2:17:30" s={8250} />). Bunlar onun kendi işlettiği mağazalar, yani kurallarını
            kendi üstünde uyguladığı yerler.
          </p>
        </Sub>

        <Rule tone="ok">
          Örnekleri siz göndereceksiniz — süper. — işim kolaylaşır. En faydalısı: <strong>Meta akışında
          reklam olarak gördüğünüz</strong> kareler ve/veya yukarıdaki mağazalardan beğendikleriniz.
          Etsy&apos;de beğendiğiniz kapaklar işe yaramaz; ikisinin fiziği farklı. Gönderdiğinizde her birini
          altı kurala göre puanlar, hangisini kopyalayacağımızı netleştiririm.
        </Rule>

        <Note>
          Mockup değişikliği katalogdaki tüm ürünlerin görsellerinin yeniden üretilmesi demek. Bu iş
          <code className="mx-1 rounded bg-sunken px-1 text-[12px]">scripts/</code> altındaki mevcut
          üretim akışıyla toplu yapılabilir; elle 177 ürün güncellenmez.
        </Note>
      </Section>

      <Section
        id="olcum-kurulum"
        kicker="Düzeltme · P0"
        title="Ölçüm kurulumu — sırayla"
        lede="Bu liste bitmeden kampanya açılmaz. Her adımın sonunda bir doğrulama var; doğrulanmayan adım yapılmamış sayılır."
      >
        <Checklist items={[
          ["Facebook & Instagram kanalını Shopify'a kur", "Kanal, piksel ve katalog beslemesini birlikte getiriyor. Doğrulama: kanal 'connected' görünüyor."],
          ["Pikseli bağla ve Conversions API'yi aç", "Tarayıcı tarafı tek başına yetmiyor; iOS ve reklam engelleyiciler olayların bir kısmını yutuyor. Doğrulama: Events Manager'da CAPI 'active'."],
          ["Test siparişiyle olay akışını doğrula", "ViewContent, AddToCart, InitiateCheckout, Purchase — dördü de düşmeli. Doğrulama: Events Manager Test Events ekranında dört olay da görünüyor."],
          ["Katalog beslemesini yayınla ve ürünleri onaylat", "Katalog reklamının yakıtı bu. Doğrulama: Commerce Manager'da ürünler 'Active', reddedilen yok."],
          ["Meta sistem token'ına business_management izni ekle", "Dashboard katalog ve pikseli API'den göremiyor; bu izin olmadan otomatik doğrulama yazılamaz. Doğrulama: /me/businesses çağrısı hata vermiyor."],
          ["GA4 kur", "Meta'nın kendi raporuna ikinci bir kaynak. Doğrulama: gerçek zamanlı raporda oturum görünüyor."],
          ["Shopify Analytics'te bot filtresini varsayılan yap", "Filtresiz dönüşüm oranı on kata kadar düşük görünüyor. Doğrulama: huni raporu 'Human' filtresiyle kayıtlı."],
          ["shop 8 kaydını gerçek ayarlarla doldur", "Fiyat, kargo eşiği ve para birimi dashboard'da yaşamalı ki analiz ve otomasyon Shopify'ı da görsün. Doğrulama: settings boş değil."],
        ]} />
      </Section>
    </>
  );
}
