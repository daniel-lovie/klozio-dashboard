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
CPU'da ve birlikte üretimin (28 sn) %75'i kadar. GPU'ya alma ve paralelleştirme kısmı duruyor;
şimdi kazanç daha da büyük çünkü aynı makinede iki CPU işi var.

## 5. Kullanıcı başına adil kuyruk
Tek FIFO. 100 kullanıcıda sonuncusu saatlerce bekler.

## 6. Nesne depolama
Görseller Postgres'te `bytea`. 1000/gün'de 3.8 GB/gün veritabanına.

## 7. Kalanlar
Spark bellek yamaları · Qwen-Image adayı · `--niche` toplu komut · sonuçların MacBook'a dönmesi ·
DHCP rezervasyonu · UPS · Faz 6 LoRA (v2)
