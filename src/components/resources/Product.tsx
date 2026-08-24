import { Section, Sub, Rule, Table, Note, Cite, DoDont, Checklist } from "./parts";

export function Product() {
  return (
    <>
      <Section
        id="katalog"
        kicker="Ürün"
        title="Katalog motordur, geri kalanı dekor"
        lede={<>Playbook&apos;un tek cümlelik özeti bu. Reklamlar, site, e-posta — hepsi tasarımı doğru kişinin
          önüne koymak için var. Kârlılığa giden en hızlı yol, istisnasız, katalogun hem sayısını hem
          kalitesini artırmak.</>}
      >
        <Rule>
          Yüz tasarıma ulaşmadan reklam açma. Katalogda 16 ürün varken bütçe artırmayı soran kişiye
          verdiği cevap tekti: reklamları kapat, 100&apos;e çık, sonra konuşuruz. <Cite v="build" t="01:38:00" />
        </Rule>

        <Table
          head={["Aşama", "Tasarım sayısı", "Ne yapılır"]}
          rows={[
            ["Lansman öncesi", "100", "Reklam yok. Araştırma + üretim."],
            ["Test", "100 – 200", "Katalog reklamı açık, tıklananları izle."],
            ["İterasyon", "200 – 350", "Kazananların altındaki duyguyu çoğalt."],
            ["Ölçekleme", "300 +", "Tasarım test kampanyası devreye girer."],
            ["Olgun", "2.000 +", "Kendi markasında bu seviyede; 6 ayda sıfır satan silinir."],
          ]}
        />

        <Sub title="Neden hacim gerçekten çalışıyor">
          <p>
            Print-on-demand&apos;in tek yapısal avantajı stoksuz olması. Depoda satılması gereken bir ürün
            yok, dolayısıyla &quot;bu tasarımı çalıştırmak zorundayız&quot; baskısı da yok. Çalışmayan tasarımı
            kesip yüz yenisini yapmanın maliyeti neredeyse sıfır. Topluluk içi gözlemi: yayınlanan
            tasarım sayısı ile satış arasında doğrudan korelasyon var — kalite sabitken.
          </p>
          <p>
            İlk ay bir tasarımın tutması normal beklenti. Kendi oranı: ilk 100 tasarımın <strong>%3–5&apos;i</strong>
            hedefi tutuyor. Üç tasarım yeterli, çünkü kazananın altındaki mekanizmayı çözünce onun
            etrafında yatay olarak açılabiliyorsun. <Cite v="ep3" t="00:13:30" />
          </p>
        </Sub>
      </Section>

      <Section
        id="uretim"
        kicker="Ürün"
        title="Yüz tasarımı parçalara böl"
        lede={<>&quot;100 tasarım yap&quot; felç edici. Yayında beyaz tahtaya çizdiği matris, hem felci çözüyor
          hem de kataloğun tek bir tada saplanmasını engelliyor. <Cite v="build" t="00:35:30" /></>}
      >
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Duygu ↓ / Biçim →</th>
                {["Sadece tipografi", "Tipografi + grafik", "Sadece grafik"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Mizah / iç şaka", "15", "15", "15"],
                ["Nostalji", "10", "10", "5"],
                ["Kimlik — “bu tam benim”", "10", "10", "5"],
              ].map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2.5 font-medium">{r[0]}</td>
                  {r.slice(1).map((c, j) => (
                    <td key={j} className="tabular px-3 py-2.5 text-ink-soft">{c} tasarım</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Note>
          Meg&apos;in benzetmesi: besin piramidi. Amaç dengeli bir katalog — siteyi açan herkesin nişin içinde
          kendine bir şey bulması. Matris olmadan herkes kendi zevkine sıkışıyor ve aynı insan cebine
          defalarca giriyor.
        </Note>

        <Sub title="Kendi zevkin kataloğu daraltır">
          <p>
            En sık gördüğü hata: marka sahibi sadece tipografi seviyorsa katalog tamamen tipografi
            oluyor. Sadece grafikli tişört giyen bir müşteri o siteye girdiğinde alacak bir şey bulamıyor.
            İki farklı zevk, aynı nişte, aynı tutkuyla — ikisini de kataloğa koymak zorundasın.
          </p>
        </Sub>

        <Sub title="Üretim akışı (yayında gösterdiği hâliyle)">
          <ol className="ml-4 list-decimal space-y-1.5">
            <li>Etsy, Pinterest, Redbubble&apos;da nişi tara; ekran görüntülerini topla.</li>
            <li>Görüntüleri üç kovaya ayır: tipografi stilleri, tasarım stilleri, sözler.</li>
            <li>Ekran görüntülerini Claude&apos;a ver, her kova için detaylı stil tanımı çıkart.</li>
            <li>Bu tanımları bir markdown dosyasına yaz, proje dosyalarına ekle — her sohbet onu referans alsın.</li>
            <li>Prompt&apos;ları toplu üret; görsel modele JSON biçimli prompt ver (tutarlılık ciddi artıyor).</li>
            <li>Çıktıları geri besle: &quot;bu iyiydi, bu kötüydü.&quot; İki turdan sonra çıktı kalitesi kıyaslanamaz oluyor.</li>
          </ol>
          <p>
            Kritik uyarı: <strong>süreci görsel üreticide başlatma.</strong> Ne yapmak istediğini bilerek
            gir, yoksa yargılayacak bir ölçütün olmadan rastgele çıktı toplarsın. <Cite v="scale" t="01:02:00" />
          </p>
        </Sub>

        <Rule tone="ok">
          Odaklanmış 2–3 saatte 20 tasarım gerçekçi hedef. Yaratıcı iş (ne yapacağına karar vermek) ile
          operasyonel iş (prompt yapıştır, arka plan sil, yükle) ayrı ayrı bloklanmalı — ikisini aynı
          oturumda karıştırmak ilerlemeyi öldürüyor.
        </Rule>
      </Section>

      <Section
        id="stil"
        kicker="Ürün"
        title="Konsept ile stil aynı şey değil"
        lede={<>Playbook&apos;un en yüksek getirili tek ayrımı bu. Konsept anlatılabilir; stil gösterilmesi
          gereken şeydir. İkisini karıştırmak, yüzlerce tasarımın neden hiçbir şey değiştirmediğini
          açıklıyor.</>}
      >
        <Rule>
          Her zaman konsept üzerinde iterasyon yap, stil üzerinde değil. On yılda hiçbir tasarımın sadece
          fontunu değiştirip patladığını görmedi. Patlayanlar, stili sabit tutup konsepti değiştirdiği
          tasarımlar. <Cite v="scale" t="00:59:00" />
        </Rule>

        <Sub title="Yanlış iterasyon, doğru iterasyon">
          <p>
            Bir tasarım tuttuğunda çoğu kişi aynı sözün on farklı font versiyonunu çıkarıyor. Bu, zaten
            elinde olan aynı küçük insan grubuna tekrar tekrar vurmak demek. Doğru hamle bir seviye
            derine inmek: <em>o tasarım hangi duyguyu tetikledi?</em> Mizah mı, nostalji mi, &quot;bu tam
            benim&quot; hissi mi? Sonra o duyguyu tamamen başka konseptlerle yatay olarak açıyorsun.
          </p>
          <p>
            Yayında canlı yaptığı hamle: kazanan tasarımın ekran görüntüsünü alıp modele veriyor,
            &quot;insanların neden aldığını çöz, altındaki mekanizmayı bul, sonra aynı nişte 20 yeni konsept
            üret&quot; diyor. Model işe yarar bir cevap verdiğinde — örneğin &quot;temiz bir kurulum, sonra ani
            bir kişilik kırılması&quot; — asıl kazanılan şey o mekanizma tarifi oluyor. <Cite v="review2" t="02:14:30" />
          </p>
        </Sub>

        <DoDont
          doTitle="Satan stil"
          dontTitle="Satmayan stil"
          doItems={[
            "Kumaşa gömülmüş, soluk, negatif alanı bol baskı.",
            "Az renk, düz alanlar, gölgesiz.",
            "Tasarım göğsün kenarlarına yaklaşan ölçekte.",
            "Elle dizilmiş hissi veren tipografi; dengeli ağırlık.",
            "12 saat boyunca giyilebilecek bir şey — çeneden 25 cm aşağıda duracak.",
          ]}
          dontItems={[
            "Tişörtün üstüne yapıştırılmış gibi duran mürekkep bloğu.",
            "Vektör/gradyan yığını, aşırı renk doygunluğu, bol gölge.",
            "Çıkartma gibi görünen her şey.",
            "AI'ın kendiliğinden ürettiği o çatlak/grunge doku — kenarı hep ıskalıyor.",
            "Tasarımın içinde marka adı — ilk milyon dolara kadar sadece yer kaplıyor.",
          ]}
        />

        <Note>
          Basitleştirme testi: tasarımdan bir şey çıkarmaya devam et, artık anlamsız hissettiren noktaya
          gel, sonra en son çıkardığını geri koy. Tatlı nokta orası.
        </Note>

        <Sub title="Marka adını tasarıma koyma">
          <p>
            Başlangıçta kimse markanı tanımıyor; insanlar tasarım için geliyor. Tişörtlerin üçte birinde
            marka adı olan bir mağazada bunu TBM&apos;nin yüksek olmasının doğrudan sebeplerinden biri olarak
            işaretledi. İlk bir milyon doları geçtikten sonra insanlar markayı temsil etmek için gelmeye
            başlıyor — o zaman düşünülür. <Cite v="review2" t="00:21:30" />
          </p>
        </Sub>

        <Sub title="Aynı sözü ikinci kez yapma">
          <p>
            Bir tipografi sözünü bir kez çıkar ve devam et. Tutacaksa zaten tutar. Aynı sözün beş
            varyasyonu kataloğun beş slotunu yiyor ve koleksiyona giren müşteriye &quot;burada tek bir fikir
            var&quot; hissi veriyor. Kendi deyişiyle bunu yüz aynı tasarımla koleksiyon doldurarak zor yoldan
            öğrenmiş.
          </p>
        </Sub>
      </Section>

      <Section
        id="mockup"
        kicker="Ürün"
        title="Mockup: tek seç, kilitle, bir daha dokunma"
        lede={<>Mockup her tasarımın üstüne biniyor, dolayısıyla TBM&apos;yi tek başına en çok etkileyen
          değişken. Yayında beş mağazadan üçünde birden fazla mockup dolaşıyordu; her seferinde ilk
          talimat aynıydı: testi yap, birini seç, hepsini ona çevir.</>}
      >
        <Checklist items={[
          ["Tişört karenin kenarlarına değsin", "Etrafta boş alan kalırsa akışta tasarım küçülür ve okunmaz. Fazla negatif alan doğrudan TBM'ye yazılıyor."],
          ["Objeler sadece alt tarafta olsun", "Altta duran objeler gözü yukarı sektirip tasarıma geri getiriyor. Üstte obje varsa göz tasarıma hiç ulaşmadan kayıyor."],
          ["Üç kademeli kontrast", "Meta akışının beyazı → mockup zemini → tişört → tasarım. Her geçişte belirgin kontrast olmalı; göz üç adımda tasarıma varmalı."],
          ["Gerçek gölge", "Tişörtün altında fotogerçekçi gölge yoksa göz 'sahte' diyor. Milisaniyede kaybediyorsun."],
          ["Yaka etiketi görünsün", "Comfort Colors 1717 etiketi satış argümanı. Bulanık olmasın — müşteri senin kadar dikkatli bakıyor."],
          ["Marka logosu / tescilli işaret taraması", "Görsel modeller futbol topuna lig logosu, içeceğe marka koyabiliyor. Yayında iki ayrı mağazada bu çıktı. Her mockup'ı ince dişli tarakla geç."],
          ["Koleksiyondaki renk = ürün sayfasındaki renk", "Koleksiyonda kahverengi tişörte tıklayıp siyah görmek küçük ama biriken bir uyumsuzluk."],
        ]} />

        <Rule tone="danger">
          Görsel modelle üretilen mockup&apos;larda tescilli marka riski gerçek ve yayında iki kez yakalandı.
          Modeller telifli görsellerle eğitildiği için topa, şişeye, forma logo koyabiliyorlar.
          Yayına almadan önce her mockup&apos;ı büyütüp kontrol et. <Cite v="review2" t="00:16:40" />
        </Rule>

        <Note>
          İyi mockup&apos;ın işareti: fark edilmemesi. Bir mağazayı incelerken mockup dikkatini hiç çekmediyse
          işini yapıyor demektir — gözü kendine değil tasarıma çekiyor.
        </Note>

        <Sub title="Blank seçimi">
          <p>
            Üçünden birini öner diyor: Gildan 64000, Bella+Canvas 3001, Comfort Colors 1717. En çok
            satan renkler sıkıcı olanlar — lacivert, siyah, antrasit, asker yeşili. Parlak renkler
            ekranda iyi görünüyor ama satmıyor; istisnalar tek bir tasarıma özel çıkıyor ve tahmin
            edilemiyor.
          </p>
        </Sub>
      </Section>
    </>
  );
}
