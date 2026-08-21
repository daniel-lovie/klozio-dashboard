# DGX — iş sırası

Değere göre sıralı. Model kararı **verilmedi ve verilmesi beklenmiyor**: hangi checkpoint'in
kullanılacağı bir konfigürasyon satırı, kodda sabit değil. Karar ekibin oylarıyla verilecek.

## 1. Yerel motoru üretime bağla  ← ŞU AN

`produce_product.py:generate()` tek bir Higgsfield çağrısı yapıyor (satır 188). O çağrı bir motor
seçiciden geçecek: bayrak `off` ise bugünkü yol, `internal`/`percent`/`default_on` ise ve Spark canlıysa
ComfyUI. Başarısızlıkta otomatik Higgsfield.

Bu bittiğinde Spark tezgâh olmaktan çıkıp ürünün parçası olur ve AC1–AC4 gerçekten koşulabilir.

**Model burada seçilmiyor** — hangi workflow/checkpoint kullanılacağı `local_engine_config` satırından
okunuyor.

## 2. Kabul kriterlerini gerçekten koş
AC1 sohbet→iş, AC2 Ollama'yı öldür, AC3 Spark'ı fişten çek, AC4 bayrak kapalı. Dördü de test edilmedi.

## 3. Görsel kalite kapısı — ekibin oyuyla
Spec 20 üretimlik A/B istiyor. Bunu ölçüyle değil **ekibin gözüyle** yapacağız: bake-off çıktıları
`design_feedback`'e girer, Gasol/Burcin/Halide/Ömer oylar, `design_winners.py` zaten kurulu Rasch
modeliyle kazananı çıkarır. Model kararı buradan gelir, benim ölçtüğüm düzlük/palet rakamlarından değil
— onlar sadece "basılabilir mi" sorusunu cevaplıyor.

## 4. rembg'yi GPU'ya al ve paralelleştir
Darboğaz burası: 11.4 sn/görsel, üretimden uzun, CPU'da. 1000 tasarım/günde 3.17 saat.

**Yarısı 2026-08-19'da yapıldı — ama planlandığı sebeple değil.** Kesim artık Spark'ta, worker'ın
içinde (`scripts/factory_worker.py`), çünkü web konteynerinde rembg yok ve yerel motor açılınca her
tasarım `ModuleNotFoundError` ile öldü. Ölçülen: kesim 12.5 sn, yazı kapısı 8.8 sn — ikisi de hâlâ
CPU'da ve birlikte üretimin (28 sn) %75'i kadar. GPU'ya alma kısmı duruyor.

**Yazı kapısı GPU'ya alındı (2026-08-19): 8.8 sn → 0.8 sn.** easyocr'ın reader'ı `gpu=True` ile
kuruluyor ve süreç başına bir kez yaratılıyor.

**rembg GPU'ya alınamıyor, ve ucuz kısayolu yok — ölçüldü.** Spark'taki `onnxruntime` 1.29 yalnızca
`CPUExecutionProvider` sunuyor; aarch64 + CUDA 13 için hazır `onnxruntime-gpu` tekerleği yok.
Akla gelen kısayol da işe yaramıyor: u2net girdiyi zaten içeride 320×320'ye indirdiği için 3200 px
yerine 1600 px kopyadan maske çıkarmak **11.0 sn → 10.8 sn** yapıyor (eşikten sonra maskeler %99.9
aynı). Yani maliyet çözünürlükte değil, CPU çıkarımında. Gerçek çözüm arka plan silmeyi ComfyUI
grafiğinin içine bir GPU düğümü olarak (BiRefNet/RMBG) almak; bu bir öğleden sonralık iş, kısayol değil.

## 4b. Arka plaka ("sticker" defekti) — çözüldü, ama KAPIYLA DEĞİL

**Belirti:** model konunun arkasına istenmemiş dolu bir şekil çiziyor (D&D ejderhası pembe disk üstünde,
`dnd-c1-v1`, 2026-08-21). Tişörte yapıştırılmış sticker gibi basılıyor ve önizlendiği renk dışındaki
her colorway'de yanlış duruyor. `nano_banana_pro` aynı davranış yüzünden bırakılmıştı.

**Çözüm: negatif prompt.** `scripts/image_engine.py` NEGATIVE'ine sticker/badge/disc/frame terimleri
eklendi. Aynı prompt, aynı seed ile A/B: çizimin en büyük tek-renk bitişik bloğu **%77.9 → %40.7**.
Ayrıca `draft_product` artık badge/emblem/circle isteyen prompt'u reddediyor.

**Kapı KOYULMADI, ve sebebi ölçüldü — tekrar denemeyin.** İki aday metrik, ikisi de ayırmıyor:

| metrik | katalog medyanı | kötü örnek | sonuç |
|---|---|---|---|
| en baskın tek renk payı (n=140) | %39.6 | %35.2 | medyanın **altında** — sinyal yok |
| en büyük tek-renk bitişik blok (n=45) | %28.1 · p95 %77.7 | %77.9 | tam p95'te, ama orada meşru işler var |

İkinci metrikte %70 eşiği `vibe-pixelpet-v1` (%100), `vibe-tokens-v1` (%93) ve `spiritual-m1-v1`
(%73.6) tasarımlarını reddederdi — hepsi kasıtlı minimal/tek renk işler ve mağazanın stili bu.
Yani kapı, önlediğinden fazla iyi işi reddeder. Plaka, düz renk stilinden *ölçüyle* ayrılamıyor;
ayıran şey şeklin **geometrik** olması (disk/dikdörtgen), ve bunu ölçmek için şekil analizi gerekir —
yapılabilir ama bu bulguyla başlanmalı, sıfırdan değil.

`produce_product.py`'deki `pale_field` kapısı (krem plaka) duruyor ve **onarıldı**: yerel kesim yolu
`pale_field_frac`'i sabit `0.0` döndürüyordu, yani o kapı yerel çizilen her tasarım için — ki artık
hepsi — kapalıydı.

## 5. Kullanıcı başına adil kuyruk
Tek FIFO. 100 kullanıcıda sonuncusu saatlerce bekler.

## 6. Nesne depolama
Görseller Postgres'te `bytea`. 1000/gün'de 3.8 GB/gün veritabanına.

## 7. Kalanlar
Spark bellek yamaları · Qwen-Image adayı · `--niche` toplu komut · sonuçların MacBook'a dönmesi ·
DHCP rezervasyonu · UPS · Faz 6 LoRA (v2)
