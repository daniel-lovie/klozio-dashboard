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
        title="Niş: verilmesi gereken tek stratejik karar"
        lede={<>Katalog bugün altı ayrı kitleye aynı anda konuşuyor. Reklam bunu yapamaz — Heckman&apos;ın
          deyişiyle mağaza bir kitleye ait hissettirmeli. Aşağıda üç yol var; üçü de savunulabilir ama
          biri diğerlerinden hızlı.</>}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            {
              t: "A · Oyun & masaüstü RPG",
              n: "33 ürün hazır",
              pro: ["Katalogda zaten en tutarlı küme (RPG 12, TTRPG 9, FPS 6, MMORPG 6).",
                    "Tutkulu, iç şakası bol, yorum bırakan kitle — Meta için ideal.",
                    "Hediye niyeti yüksek, Q4'e uygun."],
              con: ["100 tasarıma çıkmak için ~70 yeni tasarım gerekiyor.",
                    "Marka/lisans ihlali riski yüksek; her tasarım taranmalı."],
              rec: true,
            },
            {
              t: "B · Statement / mizah tişörtleri",
              n: "46 ürün hazır",
              pro: ["En büyük hazır küme.",
                    "Heckman'ın 'sonsuz ölçeklenebilir' dediği evergreen kalıplara en yakın alan."],
              con: ["Niş değil, format. Kitle tanımı yok — bu tam da bugünkü sorun.",
                    "Rekabet en yoğun ve en jenerik alan."],
            },
            {
              t: "C · Nakış & kişiselleştirme",
              n: "42 ürün hazır",
              pro: ["Belirgin şekilde daha yüksek marj (%44–53 net).",
                    "Farklılaşma kolay, kopyalanması zor."],
              con: ["Heckman'ın modeli değil — üretim süresi uzun, iade riski yüksek.",
                    "Katalog reklamı ve hızlı iterasyon mantığı burada çalışmıyor."],
            },
          ].map((o) => (
            <div key={o.t} className={`rounded-lg border p-4 shadow-sm ${o.rec ? "border-accent/40 bg-accent-soft" : "border-line bg-raised"}`}>
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold">{o.t}</h3>
                {o.rec && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink">ÖNERİ</span>}
              </div>
              <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-faint">{o.n}</p>
              <ul className="mt-2 space-y-1">
                {o.pro.map((x, i) => (
                  <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink"><span className="text-ok">+</span>{x}</li>
                ))}
                {o.con.map((x, i) => (
                  <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-ink-soft"><span className="text-danger">−</span>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Rule tone="ok">
          <strong>Karar verildi: A — oyun.</strong> Tek bir daraltma öneriyorum: mızrağın ucu
          <strong> masaüstü rol yapma (TTRPG)</strong> olsun, geniş anlamda &quot;oyun&quot; değil. Gerekçe
          aşağıda; FPS ve MMORPG açılış hamlesi olarak en zayıf dilim.
        </Rule>

        <Sub title="Neden TTRPG önce — ve dürüst çekincelerim">
          <p>
            <strong>Lehine:</strong> Katalogun ağırlık merkezi zaten burada — etiketlerde
            &quot;nerdy gift&quot; 20, &quot;gamer gift for him&quot; 15, &quot;gaming shirt&quot; 14 ürün. Heckman&apos;ın motoru
            iç şaka yoğunluğu: masaüstü kültürünün ortak kelime dağarcığı çok geniş (zar, parti, seans,
            oyun gecesi) ve bu dil <em>tek bir yayıncıya ait değil</em>. Mizahı sözel olduğu için
            onun en iyi performans veren şekli olan tipografi-öncelikli tasarıma doğal oturuyor. Hediye
            niyeti de yüksek: masaüstünde hediyeyi alan kişi çoğu zaman oyun arkadaşı veya eş — yani
            reklamla ulaşılabilir ayrı bir alıcı.
          </p>
          <p>
            <strong>Çekincelerim, saklamadan:</strong> Birincisi, grafik tişört talebi genel olarak
            kadın ağırlıklı, oyun ise erkek ağırlıklı. Heckman&apos;ın kazanan örnekleri (hemşirelik, inanç,
            annelik, köpek, balıkçılık, ekşi maya) çoğunlukla kadın veya karma kitle. Dönüşüm ve sepetin
            bandın alt ucunda oturmasını beklemek gerçekçi — Klozio&apos;nun ekonomisi zaten dar olduğu için
            bu önemli. İkincisi, FPS ve MMORPG dilimleri hem ince (6&apos;şar ürün) hem de mizahı tek bir
            oyuna bağlı; o oyunu oynamayan kişiye hiçbir şey ifade etmiyor. Üçüncüsü, oyun görselleri
            tanınabilir karakter ve logolara ekşi mayadan çok daha kolay kayıyor — mevcut görsel QA
            kuralımız (üretilen işte logo, marka işareti, karakter olmayacak) burada daha çok iş yapacak.
          </p>
          <p>
            <strong>Sonuç:</strong> TTRPG ile aç, kâr eden bir TBM yakaladıktan sonra &quot;genel oyuncu
            hayatı&quot;na yatay genişle. Anime&apos;yi (13 ürün) ayrı tut — farklı alıcı, farklı sanat dili.
          </p>
        </Sub>

        <Note>
          Eski öneri gerekçesi aynen geçerli: Heckman&apos;ın
          modeli “nişin içinden biri olmak”la çalışıyor, oyun nişinde iç şaka üretmek en kolay ve
          yorum/paylaşım en yüksek. B bir format, niş değil; C ise farklı bir iş modeli ve bu playbook&apos;a
          oturmuyor. C&apos;yi kapatmaya gerek yok — sitede kalmaya devam etsin, Shopify reklamının konusu olmasın.
        </Note>

        <Sub title="Niş seçildikten sonra katalogda ne olur">
          <ul className="ml-4 list-disc space-y-1">
            <li>Seçilen nişin ürünleri tek ana koleksiyona toplanır ve koleksiyon nişin adını alır.</li>
            <li>Diğerleri silinmez — sadece reklamın gördüğü katalog beslemesinden çıkarılır.</li>
            <li>Katalog 100&apos;e tamamlanır; bölme matrisiyle üretilir (tipografi / grafik × mizah / nostalji / kimlik).</li>
            <li>DB&apos;de duran ama Shopify&apos;a taşınmamış ~61 ürün gözden geçirilir, nişe uyanlar taşınır.</li>
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
