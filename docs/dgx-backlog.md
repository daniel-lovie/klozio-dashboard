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

## 5. Kullanıcı başına adil kuyruk
Tek FIFO. 100 kullanıcıda sonuncusu saatlerce bekler.

## 6. Nesne depolama
Görseller Postgres'te `bytea`. 1000/gün'de 3.8 GB/gün veritabanına.

## 7. Kalanlar
Spark bellek yamaları · Qwen-Image adayı · `--niche` toplu komut · sonuçların MacBook'a dönmesi ·
DHCP rezervasyonu · UPS · Faz 6 LoRA (v2)
