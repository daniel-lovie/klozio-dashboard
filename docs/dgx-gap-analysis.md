# Spec'te ne eksik — dürüst döküm

Testler 28/28 geçiyor, ama testler yazdığım şeyleri ölçüyor. Spec'in istediği ama yapılmayanlar:

## En büyük eksik: yerel motor ürüne hiç bağlı değil

`src/lib/engines.ts` yazıldı, derleniyor, testleri geçiyor — ve **hiçbir yerden çağrılmıyor.** Ölü kod.

Somut olarak:

| spec diyor | gerçek |
|---|---|
| Sohbet ajanı iş kuyruğuna yazar | **yazmıyor** — `enqueue()` çağıran kimse yok |
| `produce_product.py` motor soyutlamasından geçer | **geçmiyor** — hâlâ doğrudan Higgsfield çağırıyor |
| Bayrak `off → internal → percent → default_on` | kod var, **hiçbir aşamada kullanılmıyor** |
| Bulut fallback işi devralır | worker `CLOUD_REQUEUE` işaretliyor, **onu tüketen kimse yok** |

Yani bugün Spark'ta üretim yapmak için işi elle kuyruğa atmam gerekiyor. Ürün akışı hâlâ %100 eski
yoldan çalışıyor. **Faz 3'ün uygulama yarısı yapılmadı** — worker yarısı yapıldı ve çalışıyor.

## Faz 3 kabul kriterleri — hangileri gerçekten test edildi

| | durum |
|---|---|
| AC1 "5 anime tişört, cumaya planla" uçtan uca | **hayır** — iş→worker test edildi, sohbet→iş değil |
| AC2 Ollama'yı öldür → `engine_text=sonnet` | **hayır** — bozuk workflow ile test ettim, Ollama'yı öldürmedim |
| AC3 Spark'ı fişten çek → tamamen bulutta biter | **hayır** — hiç denenmedi |
| AC4 bayrak `off` → bugünküyle aynı | doğru ama **test edilmedi** |
| 20 üretimlik A/B kalite kapısı | **yarısı** — metin 5 örnekle bakıldı, görsel A/B hiç yapılmadı |

Görsel A/B özellikle eksik: spec "10 en iyi Higgsfield çıktısına karşı" diyor. Ben yerel modelleri
**birbirleriyle** karşılaştırdım, Higgsfield referansıyla değil. Yani "yerel yeterince iyi mi"
sorusunun cevabı hâlâ yok.

## Faz 1 — Spark yamaları uygulanmadı

Spec `Triplany/comfyui-dgx-spark` yamalarını istiyor: cu130 PyTorch ve **çift-yükleme/64 GB bellek
muhasebesi düzeltmesi.** cu130'u kurdum, yamaları uygulamadım. Kabul kriteri "yamadan sonra
`nvidia-smi` çift model belleği göstermiyor" idi — bu makinede `nvidia-smi` bellek alanını `[N/A]`
döndürüyor, yani kriteri doğrulayamadım bile.

Pratikte sorun görmedik (modeller 128 GB'a rahat sığıyor) ama **yapılmadı ve doğrulanmadı.**

## Diğer eksikler

**Qwen-Image hiç test edilmedi.** Spec'in üç adayından biri ve "tipografi tişörtleri için en okunaklı
yazıyı üreten açık model" diye geçiyor. İndirmedim bile. (Bizim kuralımız zaten modelin yazı yazmasını
yasakladığı için önemi tartışılır, ama spec istedi, ben yapmadım.)

**İndirilen upscaler kullanılmıyor.** 4x-UltraSharp indirildi, art-işlem LANCZOS kullanıyor. Gerekçeyi
kodda yazdım (öğrenmeli upscaler düz sanata doku uyduruyor) ama bu bir sapma.

**`factory run --niche anime --count 10` yok.** `daily.sh` var ama niş filtresi yok — ve zaten
kuyrukta iş olmadığı için bugün hiçbir şey üretmez.

**Sonuçlar MacBook'a dönmüyor.** `sync.sh` tek yönlü: repo → Spark. Spec "rsync to MacBook or shared
dir" diyor, çıktılar Spark'ta kalıyor. Görselleri sana elle kopyaladım.

**`make daily` hedefi yok** — `daily.sh` var, Makefile yok.

**Faz 6 (LoRA)** — spec'te v2, bilerek yapılmadı.

## Riskler tablosundan yapılmayanlar

| risk | azaltma | durum |
|---|---|---|
| Ev cihazı üretim yükü taşıyor | UPS | **yok** (donanım) |
| DHCP adresi sessizce değişir | router'da rezervasyon | **yapılmadı** (router erişimi gerek) |
| Lisans bulaşması | model+lisans kaydı | ✅ kolon olarak var |
| SSH kopması uzun işi öldürür | tmux | ✅ |

## 100 kullanıcı hesabından çıkan, spec'te hiç olmayan eksikler

- **Kullanıcı başına adil kuyruk yok** — tek FIFO, 100 kullanıcıda sonuncusu saatlerce bekler
- **Nesne depolama yok** — görseller Postgres'te `bytea`, 1000/gün'de 3.8 GB/gün veritabanına
- **rembg CPU'da ve darboğaz** — üretimden uzun sürüyor, GPU'ya alınmadı, paralelleştirilmedi

## Özet

Çalışan: Spark kurulumu, modeller, iş akışları, worker, art-işlem, servisler, testler, karşılaştırma.

Çalışmayan: **yerel motorun ürüne bağlanması.** Faz 3'ün uygulama yarısı, yani asıl entegrasyon,
yapılmadı. Bugün Spark bir tezgâh; ürünün bir parçası değil.
