import { Section, Sub, Rule, Table, Note, Cite, Checklist, DoDont, Figure, FigurePair, VIDEOS } from "./parts";

export function Growth() {
  return (
    <>
      <Section
        id="reklam"
        kicker="Reklam"
        title="İki kampanya, hepsi bu"
        lede={<>Meta hesabının tamamı iki kampanyadan ibaret ve altı haneli aylık harcamada da aynı yapı
          duruyor. Karmaşıklık buraya değil kataloğa gidiyor. <Cite v="build" t="01:33:00" /></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              t: "1 · Katalog kampanyası",
              sub: "Her zaman açık",
              body: [
                "Tek kampanya → tek reklam seti → tek katalog reklamı.",
                "Herkes buradan başlar; en basit ve en verimli olan.",
                "Meta koleksiyondaki kazananları kendisi buluyor ve harcamayı oraya kaydırıyor.",
                "$25/gün ile başla.",
              ],
            },
            {
              t: "2 · Tasarım test kampanyası",
              sub: "Kazananlar netleştikten sonra",
              body: [
                "Tek reklam seti, içinde 3–4 statik reklam.",
                "Katalogda ucuz tıklama alan tasarımlar buraya taşınıyor.",
                "Açık hedefleme, $25/gün.",
                "24–48 saat izle; biri tutar, gerisi söner.",
              ],
            },
          ].map((c) => (
            <div key={c.t} className="rounded-lg border border-line bg-raised p-4 shadow-sm">
              <p className="text-sm font-semibold">{c.t}</p>
              <p className="text-[11px] uppercase tracking-wide text-accent">{c.sub}</p>
              <ul className="mt-2 space-y-1.5">
                {c.body.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-ink-soft">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />{b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <FigurePair>
          <Figure
            src="kampanya-yapisi.jpg"
            alt="Beyaz tahtada iki kampanyadan oluşan reklam hesabı yapısı"
            v="build" t="01:33:00"
            look={<>Altı haneli aylık harcamayı yöneten yapının tamamı. Üst sıra her zaman açık kalan
              katalog kampanyası: tek kampanya, tek reklam seti, tek katalog reklamı. Alt sıra ise
              kazananları ayrıca beslediği tasarım test kampanyası.</>}
          />
          <Figure
            src="reklam-seti.jpg"
            alt="Tasarım test kampanyasının içindeki tekil reklamlar"
            v="build" t="01:35:00"
            look={<>Test kampanyasının içi: tek reklam setinde üç dört statik reklam. Katalogda ucuz
              tıklama alan tasarımlar buraya taşınıyor, açık hedeflemeyle günlük 25 dolar veriliyor ve
              24–48 saat izleniyor. Genelde biri tutuyor, gerisi sönüyor.</>}
          />
        </FigurePair>

        <Sub title="Ölçekleme karar ağacı">
          <ol className="ml-4 list-decimal space-y-1.5">
            <li>Katalogda 100+ tasarım var mı? Yoksa dur, reklamı kapat, tasarım yap.</li>
            <li>ROAS 1.8&apos;in altında → harcamayı azalt, tasarıma dön.</li>
            <li>ROAS 1.8–2.0 → başabaş. Siteyi optimize et, kazananları izle.</li>
            <li>ROAS 2.0 üstü → 2–3 günde bir bütçeyi %15–20 artır.</li>
            <li>$25–100/gün aralığında daha hızlı çık (25 → 50 gibi); %20&apos;yle 100&apos;e varmak bir yıl sürer.</li>
          </ol>
          <p>
            Medya alımının %80&apos;i bundan ibaret: çalışıyorsa daha çok harca, çalışmıyorsa daha az.
            İnsanların takıldığı yer karar kriterinin olmaması.
          </p>
        </Sub>

        <Sub title="Reklamı ne zaman kesersin">
          <p>
            $5–10 harcamada karar veriyor ama rakam mutlak değil. Bakılan şey sinyal: TBM bandın çok
            üstündeyse hemen kapat. TBM iyiyse, yorum/beğeni/paylaşım geliyorsa ilk 20 dolarda satış
            olmasa bile daha uzun ip veriyor. Reklamı durdurmak başarısızlık değil — yeni başlayanların
            en pahalı psikolojik hatası bunu öyle görmek.
          </p>
        </Sub>

        <Rule>
          Katalog reklamının başlangıçta pahalı olması normal. Meta önce yüz tahminin yarısını elemek
          zorunda ve bunun için harcama yapması gerekiyor. Zamanla ucuzluyor. Toplam katalog TBM&apos;sine
          değil, <strong>ürün kırılımındaki tekil tasarım TBM&apos;lerine</strong> bak — Meta&apos;da kırılım →
          ürün kimliği.
        </Rule>

        <Sub title="Bütçe gerçekleri">
          <p>
            Başlangıç için ayrılmış <strong>$1.000</strong> ve devam eden <strong>$300–400/ay</strong>
            yeterli. Hafta sonu başına $50–100 harcıyorlar. Kredi kartı limiti dert değil; düşük limitle
            başlanır, harcama ölçeklendikçe limit büyür.
          </p>
        </Sub>

        <Note>
          Yorum kutusu tesadüf değil, hedef. Tasarımları özellikle yorum/paylaşım alacak şekilde
          seçiyorlar çünkü Meta&apos;nın işi insanları platformda tutmak; etkileşim alan reklam daha ucuz
          dağıtılıyor. &quot;Bu tasarımın altına insanlar ne yazar&quot; sorusuna cevabın yoksa tasarım muhtemelen
          zayıf. <Cite v="scale" t="01:00:00" />
        </Note>

        <Figure
          src="ads-library.jpg"
          alt="Facebook reklam kütüphanesinde bir markanın aktif reklamları"
          v="build" t="01:29:30"
          look={<>Facebook Ads Library, gösterime göre sıralanmış. En çok gösterim alan reklam en çok
            bütçe alan reklamdır — yani markanın kazananı. Burada hem hangi tasarımın taşıdığını hem de
            reklam metninin kurgusunu (hitap, mağaza bağlantısı, garanti satırı) doğrudan görebiliyorsun.
            Herhangi bir marka için çalışıyor.</>}
        />

        <Sub title="Rakip reklamlarını görme">
          <p>
            Facebook Ads Library&apos;de marka adını ara, gösterime göre sırala. En çok gösterim alan reklam,
            en çok harcama alan reklamdır — yani onların kazananı. Herhangi bir marka için çalışıyor.
            <Cite v="build" t="01:26:15" />
          </p>
        </Sub>
      </Section>

      <Section
        id="eposta"
        kicker="Pazarlama"
        title="E-posta: cironun yaklaşık üçte biri"
        lede={<>Kendi markasında e-posta Q3&apos;te cironun %31&apos;i, Q4&apos;te %29&apos;u. Yıllarca hafife aldıklarını
          ve bunun en pahalı hatalarından biri olduğunu söylüyor.</>}
      >
        <Table
          head={["", "Q3 2025", "Q4 2025", "Değişim"]}
          rows={[
            ["Kampanya cirosu", "$50k", "$98k", <span key="a" className="font-semibold text-ok">+%96</span>],
            ["Otomasyon (flow) cirosu", "$50k", "$136k", <span key="b" className="font-semibold text-ok">+%173</span>],
            ["Gönderilen kampanya", "49", "59", "+%20"],
            ["Kampanya başı ciro", "$1.021", "$1.661", <span key="c" className="font-semibold text-ok">+%63</span>],
            ["Teslim edilen e-posta", "2,3M", "3,5M", "+%51"],
            ["Abonelikten çıkan", "17.434", "11.684", <span key="d" className="font-semibold text-ok">−%33</span>],
          ]}
        />

        <Figure
          src="eposta-q3-q4.jpg"
          alt="E-postanın çeyrekler arası karşılaştırması"
          v="build" t="00:20:30"
          look={<>Tablonun can alıcı satırı en altta ve kırmızıyla çevrelenmiş: gönderim %51 artarken
            abonelikten çıkanlar <strong>üçte bir azalmış</strong>. &quot;Fazla e-posta insanları kaçırır&quot;
            sezgisinin verilerle çeliştiği yer burası.</>}
        />

        <Rule tone="ok">
          Daha çok gönderdiler, kampanya başına daha çok kazandılar ve abonelikten çıkma <em>düştü</em>.
          Q4&apos;te insanlar e-posta bekliyor. &quot;Rahatsız etmeyeyim&quot; refleksi verilerle çelişiyor.
        </Rule>

        <Sub title="En çok kazandıran kampanya tipi karmaşık değil">
          <p>
            Kara Cuma haftası dışında en iyi performansı veren e-posta &quot;yeni tasarımlar eklendi&quot;
            duyurusu. Yapısı: nişe uygun emojili konu satırı, isimle hitap, koleksiyonun arkasındaki
            motivasyonu anlatan tek cümle, ne eklendiğini söyleyen bir cümle, tek bağlantılı çağrı ve
            kişisel imza. Bunu binlerce kez göndermişler. İşe yaramasının sebebi sade ve kişisel
            durması. <Cite v="build" t="00:44:30" />
          </p>
        </Sub>

        <Sub title="Ay ay kadans (kendi markası, 2025)">
          <Table
            head={["Ay", "Kampanya", "Kampanya cirosu"]}
            rows={[
              ["Temmuz", "13", "$16k"],
              ["Ağustos", "22", "$21k"],
              ["Eylül", "14", "$13k"],
              ["Ekim", "15", "$13k"],
              ["Kasım", "21", "$35k"],
              ["Aralık", "23", "$49k"],
            ]}
          />
          <p>
            Kara Cuma haftasında tek başına 13 kampanya, $33k — sekiz günde Q4 kampanya cirosunun
            %34&apos;ü. Otomasyonlar eylülde $10k iken aralıkta $63k; trafik iki katına çıkınca kendi
            başlarına ölçekleniyorlar, o yüzden erken kurulmaları gerekiyor.
          </p>
        </Sub>

        <Figure
          src="eposta-ay-ay.jpg"
          alt="Aylık kampanya sayısı ve kampanya cirosu grafikleri"
          v="build" t="00:42:45"
          look={<>Solda gönderilen kampanya sayısı, sağda getirdiği ciro. Eylülden aralığa gönderim
            yaklaşık 1,6 kat artmış ama ciro <strong>4 kat</strong>. Yani kazancın çoğu &quot;daha çok
            gönderdik&quot;ten değil, aynı gönderimin Q4&apos;te çok daha fazla karşılık bulmasından geliyor —
            bu yüzden kasım başında başlamak gerekiyor.</>}
        />

        <Rule>
          Birinci günden e-posta topla. Toplanan adreslerin %99&apos;u iki yerden geliyor: pop-up ve checkout.
        </Rule>
      </Section>

      <Section
        id="q4"
        kicker="Sezon"
        title="Q4 gerçekte nasıl görünüyor"
        lede={<>Kendi markasının 2025 Q4 verisi. Tek marka, tek örneklem — ama sektörde bu kırılımı
          paylaşan kimse yok ve varsayımların çoğunu çürütüyor. <Cite v="build" t="00:10:00" /></>}
      >
        <Table
          head={["", "Q3 2025", "Q4 2025", "Değişim"]}
          rows={[
            ["Ciro", "$322k", <span key="a" className="font-semibold">$814k</span>, "2,5×"],
            ["Sipariş", "6.167", "16.183", "2,6×"],
            ["Oturum", "281.300", "582.703", "2,1×"],
            ["Dönüşüm oranı", "%2,12", "%2,72", <span key="b" className="font-semibold text-ok">+%28</span>],
            ["Ortalama sepet", "$52,29", "$50,31", "−%4"],
            ["İade oranı", "%1,4", "%1,5", "sabit"],
          ]}
        />
        <Figure
          src="q4-skorbord.jpg"
          alt="Üçüncü ve dördüncü çeyreğin karşılaştırma tablosu"
          v="build" t="00:11:00"
          look={<>Kendi markasının çeyrek karşılaştırması. Sağ sütun kırmızıyla çevrelenmiş: ciro 2,5
            kat, sipariş 2,6 kat, oturum yalnızca 2,1 kat. Trafik ile siparişin arasındaki fark
            dönüşüm oranı — Q4&apos;te %2,12&apos;den %2,72&apos;ye çıkmış.</>}
        />

        <Note>
          Oturum 2,1× arttı ama sipariş 2,6×. Aradaki fark dönüşüm oranı — yani site üzerinde yapılan
          işin tam olarak karşılığı. Q4&apos;e girerken CRO&apos;yu bitirmiş olmanın değeri burada görünüyor.
        </Note>

        <Sub title="Ciro takvime nasıl dağıldı">
          <div className="space-y-2">
            {[
              ["Ekim", "%14", 14, "pist — ısınma"],
              ["1–23 Kasım", "%22", 22, "Kara Cuma öncesi teklifler, e-posta hızlanıyor"],
              ["Kara Cuma haftası (24–30 Kasım)", "%13", 13, "en iyi tek gün: 29 Kasım Cumartesi, $24k"],
              ["1–15 Aralık", "%31", 31, "asıl zirve — 11, 12, 13 Aralık günlerinin her biri $21k üstü"],
              ["16–31 Aralık", "%21", 21, "kargo son tarihinden sonra reklam kısıldı, e-posta devam etti"],
            ].map(([label, pct, w, note]) => (
              <div key={label as string} className="flex items-center gap-3">
                <span className="w-56 shrink-0 text-sm font-medium">{label}</span>
                <div className="h-2 flex-1 rounded-full bg-sunken">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${(w as number) * 3}%` }} />
                </div>
                <span className="tabular w-10 shrink-0 text-right text-sm font-semibold">{pct}</span>
                <span className="hidden w-72 shrink-0 text-xs text-ink-soft lg:block">{note}</span>
              </div>
            ))}
          </div>
          <Figure
            src="q4-takvim.jpg"
            alt="Dördüncü çeyrek cirosunun dönemlere dağılımı"
            v="build" t="00:12:15"
            look={<>Aynı dağılımın orijinali. Kara Cuma haftası yalnızca %13; asıl zirve 1–15 Aralık
              aralığında %31. Yeşil çubukların uzunluğu tek başına anlatıyor: hazırlığını sadece Kara
              Cuma&apos;ya göre yapan biri çeyreğin sekizde birine hazırlanmış oluyor.</>}
          />

          <p className="mt-3">
            Kara Cuma dört günlük bir olay değil; kasım başından aralık ortasına uzanan bir maraton.
            Sitesi ve e-postası sadece Kara Cuma&apos;ya hazır olan biri çeyreğin %13&apos;üne hazır demektir.
          </p>
        </Sub>

        <Rule tone="ok">
          Q4&apos;te satılan tasarımların <strong>%77&apos;si Q3&apos;ten önce</strong> yayına girmişti; sadece %14&apos;ü
          Q4&apos;te üretilmişti. Q4 birimlerinin yalnızca <strong>%1,1&apos;i</strong> tatil temalı tasarımlardı.
          Q4 top 20&apos;nin 16&apos;sı zaten Q3 top 50 içindeydi.
        </Rule>

        <FigurePair>
          <Figure
            src="q4-katalog.jpg"
            alt="Dördüncü çeyrekte satan tasarımların yayın tarihine göre dağılımı"
            v="build" t="00:15:00"
            look={<>Q4&apos;te satan tasarımların %77&apos;si Q3&apos;ten önce yayına girmişti. Alt kutular daha da
              çarpıcı: Q4 top 20&apos;nin 16&apos;sı zaten Q3 top 50 içindeydi ve birimlerin yalnızca %1,1&apos;i
              tatil temalı tasarımlardan geldi.</>}
          />
          <Figure
            src="q4-yeni-tasarimlar.jpg"
            alt="Çeyreğin en çok satanları ve ilk satış tarihleri"
            v="build" t="00:17:20"
            look={<>Madalyonun diğer yüzü: 12 Kasım&apos;da yayına giren bir tasarım çeyreği üçüncü sırada
              bitirmiş. Yani &quot;eski katalog satıyor&quot; demek &quot;Q4&apos;te üretmeyi bırak&quot; demek değil — ikisi
              birden doğru.</>}
          />
        </FigurePair>

        <DoDont
          doTitle="Q4 hazırlığı"
          dontTitle="Q4 efsaneleri"
          doItems={[
            "Eylül–ekimde evergreen katalog derinleştir; Q4 zaten inşa ettiğin kataloğu ödüllendiriyor.",
            "Q4 boyunca tasarım yayınlamaya devam et — 12 Kasım'da çıkan bir tasarım çeyreği 3. sırada bitirdi.",
            "1 Kasım'da e-posta kampanyalarını başlat.",
            "Otomasyonları önceden kur; trafikle birlikte kendiliğinden ölçekleniyorlar.",
            "Perakende zincirlerini takip et — reyonu ne zaman değiştirdikleri senin sinyalin.",
          ]}
          dontItems={[
            "Bütün ekim–kasımı tatil temalı tasarım üretmeye harcamak.",
            "Kara Cuma'ya kilitlenip aralığın ilk yarısını kaçırmak.",
            "'İnsanları e-postayla bunaltırım' diye göndermeyi azaltmak.",
            "Sezon bitince eski tasarımları koleksiyonun üstünde bırakmak.",
          ]}
        />

        <Figure
          src="q4-tisort-orani.jpg"
          alt="Aylara göre satılan birimlerde tişörtün payı"
          v="build" t="00:18:30"
          look={<>Kışın ortasında bile satılan birimlerin %94&apos;ü tişört. Sweatshirt ve crewneck birlikte
            aralık birimlerinin yalnızca %2,3&apos;ü. Kazanan tasarımların sıcak varyantını sunmakta sakınca
            yok, ama Q3&apos;ü kataloğu kışlık ürünler etrafında yeniden kurmaya harcamak boşa emek.</>}
        />

        <Note>
          Q4&apos;te kataloğun %94&apos;ü tişört olarak kaldı. Kışın ortasında bile insanlar tişört alıyor —
          altına giyilecek bir şey lazım ve tişört hediye edilebilir. Sweatshirt/hoodie eklemek Q4&apos;ü
          kurtarmıyor.
        </Note>
      </Section>

      <Section
        id="odak"
        kicker="Disiplin"
        title="Ne yapmadığı — playbook'un yarısı bu"
        lede={<>&quot;Bugün baştan başlasan neden daha hızlı başarılı olurdun&quot; sorusuna verdiği cevap:
          yaptıklarım aynı, yapmadıklarım farklı.</>}
      >
        <Rule tone="danger">
          Bir şey çalışmadığında yeni bir şey denemek, aslında sıfırdan yeni bir yarışa girmektir.
          Maraton antrenmanı ilk gün sonuç vermedi diye halter, bisiklet ve jimnastiğe başlamak gibi.
          Yarışları üst üste koymak şansını artırmıyor, iyi olman gereken şeylerin sayısını artırıyor.
        </Rule>

        <Figure
          src="etki-efor-matrisi.jpg"
          alt="Etki ve efor eksenlerine yerleştirilmiş iş listesi"
          v="build" t="01:21:30"
          look={<>Bir mağazada ne yapacağına karar verirken kafasından geçen şey. Dikey eksen etki,
            yatay eksen efor. Sol üst kutu — yüksek etki, düşük efor — önce yapılacaklar; sağ alt
            &quot;nankör&quot; kutusu ise çok emek isteyip hiçbir sayıyı oynatmayan işler. Aşağıdaki tablo bu
            matrisin POD&apos;a uygulanmış hâli.</>}
        />

        <Table
          head={["Cazip kaçış", "Gerçek etkisi", "Onun yerine"]}
          rows={[
            ["Sweatshirt / hoodie / kupa eklemek", "TBM'ye sıfır etki. Zamanı ve odağı bölüyor.", "Aynı nişte 25 tasarım daha"],
            ["Printify → Gelato/Printful geçişi", "Hiçbir metriği oynatmıyor", "Kazanan tasarımın altındaki duyguyu çöz"],
            ["Temayı baştan kurmak", "Dönüşüm listesi zaten belli, o kadar", "Listedeki 10 maddeyi bir saatte uygula"],
            ["Meta algoritmasını çözmeye çalışmak", "Getirisi yok, kendi söylüyor", "Kontrol edebildiğin girdileri besle"],
            ["Erkek/kadın, çocuk bedeni, 5XL talepleri", "Aylık 20–30k'ya kadar dikkat dağıtıcı", "Talebi not al, nazikçe ertele"],
            ["Koleksiyonları alt kategorilere bölmek", "İlk birkaç milyon dolara kadar gereksiz", "Tek koleksiyon, tek akış"],
          ]}
        />

        <Sub title="Kâr-zarar tablosunu ilk günden tut">
          <p>
            Kendi markasında ilk üç-dört yıl P&amp;L tutmamış. Agresif ölçeklendikleri bir dönemde günlük
            on binlerce dolar ciro yaparken banka hesabında para olmadığını fark etmişler — sebebi
            genel giderlerin (işe alım, yazılım) üstel büyümesiymiş. Bilgisayara bile gerek yok: bir
            kâğıda ne girdi ne çıktı yaz.
          </p>
        </Sub>

        <Sub title="Zaman blokla">
          <p>
            Haftada 15 saat fazlasıyla yeterli — ama odaklanmış saat olmak şartıyla. Beş saatlik dağınık
            çalışma, kulaklık takılı 45 dakikanın yanında hiçbir şey. En keskin olduğun saati markaya
            ayır ve oturmadan önce ne üreteceğini belirle: &quot;bu iki saatte 20 tipografi tasarımı&quot;.
          </p>
        </Sub>
      </Section>

      <Section
        id="vakalar"
        kicker="Saha"
        title="Dokuz mağaza incelemesi, tek tabloda"
        lede="Beş yayında açtığı mağazalar, gerçek metrikleri ve tespit ettiği tek büyük kaçak."
      >
        <Table
          head={["Mağaza / niş", "TBM", "Durum", "Bulunan asıl kaçak"]}
          rows={[
            ["Loose Terrain · dağ bisikleti", "$0,58", "ROAS 0,65", "Checkout'ta telefon numarası zorunlu + katalog 65 tasarımda"],
            ["Mending My Faith · inanç", "$0,81", "ROAS 1,7", "Sepet çekmecesindeki gürültü; tasarımlar zaten iyiydi"],
            ["Carly · ebeveynlik", "~$0,80", "Dönüşüm %2,26", "Ürünler yanlış kargo profilinde — checkout'ta şok fiyat"],
            ["Pulse Prints · hemşirelik", "$0,76", "ROAS 1,4", "Mobilde pop-up çubuğu + tişörtün üstüne oturan baskı stili"],
            ["Lot Legends · taylgeyt", "~$1,30", "ROAS 0,88", "Mockup'ta lig logosu; tasarımların çoğunda marka adı; üç farklı mockup"],
            ["Notorious Anglers · balıkçılık", "$0,37", "Dönüşüm %1,5", "Sepete ekle butonu siyah ve ekranın altında; checkout'ta mavi buton"],
            ["Snarky Pup · köpek", "$0,80", "Dönüşüm %2,5", "Tek stile saplanmış katalog; $30,99 fiyat; $85 kargo eşiği"],
            ["Odd Chef · mutfak", "yüksek hacim", "Dönüşüm %1,95", "Üç tişörte $12 kargo — Printify profil hatası"],
            ["Floating Bobber · balıkçılık", "$0,70", "Dönüşüm %1,35", "Sepet $32 — ya kargo profili ya tek kahraman ürün uyumsuzluğu"],
          ]}
        />
        <Note>
          Dokuz mağazanın altısında asıl kaçak <strong>ya kargo profili ya da bir buton</strong>. Hiçbirinde
          sorun &quot;reklam ayarları&quot; değildi. Bu tablo playbook&apos;un en dürüst özeti.
        </Note>
      </Section>

      <Section
        id="klozio"
        kicker="Bize uyarlama"
        title="Bunun ne kadarı Klozio'da geçerli"
        lede={<>Heckman açıkça Etsy karşıtı: müşteri verisini ve markayı sahiplenme argümanıyla Shopify
          savunuyor. Playbook&apos;u olduğu gibi kopyalamak hata olur — hangi parçanın taşındığını ayırmak
          gerekiyor.</>}
      >
        <Table
          head={["Parça", "Etsy (Klozio)", "Not"]}
          rows={[
            ["Konsept ≠ stil ayrımı", <span key="a" className="font-semibold text-ok">Aynen geçerli</span>,
              "Platformdan bağımsız. Kazananın altındaki duyguyu çoğalt, fontu değil."],
            ["Tasarım hacmi ve çeşitlilik matrisi", <span key="b" className="font-semibold text-ok">Aynen geçerli</span>,
              "Etsy'de de katalog derinliği görünürlüğü besliyor."],
            ["Mockup kuralları (kenara değme, alt objeler, kontrast)", <span key="c" className="font-semibold text-ok">Aynen geçerli</span>,
              "Etsy arama sonucu da bir akış; thumbnail aynı fiziği izliyor."],
            ["Tescilli marka taraması", <span key="d" className="font-semibold text-ok">Daha da kritik</span>,
              "Etsy'de takedown doğrudan mağaza riski."],
            ["Basit, gömülü, negatif alanlı baskı stili", <span key="e" className="font-semibold text-ok">Geçerli</span>,
              "Bizim mevcut standardımızla çakışmıyor; DTF tam renk basabiliyor ama düzlük kuralı aynı."],
            ["Sepete ekle / checkout CRO listesi", <span key="f" className="font-semibold text-warn">Kısmen</span>,
              "Etsy'de sayfa bizim değil. MOTIFLY/Shopify tarafında birebir uygulanabilir."],
            ["Kargo profili tuzağı", <span key="g" className="font-semibold text-warn">Kısmen</span>,
              "Etsy'de kargo ürün fiyatına gömülü. Shopify tarafında birebir."],
            ["Meta katalog reklamı yapısı", <span key="h" className="font-semibold text-warn">Kısmen</span>,
              "Etsy'ye Pixel kuramıyoruz; meta-campaign-ops zaten bunu ele alıyor."],
            ["TBM'yi tasarım kalitesi göstergesi olarak kullanmak", <span key="i" className="font-semibold text-danger">Doğrudan geçmez</span>,
              "Etsy'de karşılığı arama görüntülenme → tıklama oranı. Aynı mantık, farklı metrik."],
            ["E-posta listesi", <span key="j" className="font-semibold text-danger">Etsy'de yok</span>,
              "Etsy müşteri verisini vermiyor. Shopify tarafının en büyük yapısal avantajı bu."],
            ["$29.99 fiyat + $75 kargo eşiği", <span key="k" className="font-semibold text-danger">Bizde farklı</span>,
              "Klozio $24.99, kargo ürüne gömülü, $25 üstü ücretsiz kargo bandı."],
          ]}
        />

        <Rule>
          Etsy&apos;de TBM&apos;nin yerini <strong>arama gösteriminden tıklamaya dönüşüm</strong> alıyor. &quot;Tasarımlarım
          iyi mi&quot; sorusunun cevabı orada — düşük tıklama oranı, aynı Heckman&apos;ın pahalı TBM&apos;si gibi,
          tasarım veya kapak görseli sorununu işaret ediyor. Teşhis sırası aynen taşınabilir: önce
          tıklama oranı, sonra ilan sayfası, sonra fiyat.
        </Rule>

        <Note>
          Q4 verisi bizim için doğrudan kullanılabilir: aralığın ilk yarısı zirve, tatil temalı tasarım
          payı küçük, satan şey zaten var olan katalog. Bu, mevcut &quot;zirveden 6–8 hafta önce yayınla&quot;
          kuralımızla tutarlı ve onu keskinleştiriyor.
        </Note>
      </Section>

      <Section
        id="kaynak"
        kicker="Kaynak"
        title="Videolar"
        lede="Sayfadaki her iddia bu beş yayının transkriptinden ve ekran görüntülerinden çıkarıldı. Toplam 8 saat 46 dakika."
      >
        <div className="space-y-2">
          {(Object.keys(VIDEOS) as (keyof typeof VIDEOS)[]).map((k) => {
            const v = VIDEOS[k];
            return (
              <a key={k} href={v.url} target="_blank" rel="noreferrer"
                 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-line bg-raised px-4 py-3 shadow-sm transition hover:bg-sunken">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">{v.short}</span>
                <span className="text-sm font-medium">{v.title}</span>
                <span className="ml-auto text-xs text-ink-faint">{v.date} · {v.len}</span>
              </a>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-ink-faint">
          Kanal: Chris Heckman (eşi Meg ile birlikte). Model: Shopify üzerinde markalı print-on-demand,
          %93–94 tişört, tek trafik kaynağı Meta, arkada e-posta. Mağaza incelemeleri kendi topluluğunun
          üyelerinden geliyor. Sayfadaki tüm sayılar onun kendi markasının paylaştığı verilerdir ve
          tek-marka örneklemidir.
        </p>
      </Section>
    </>
  );
}
