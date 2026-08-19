# Kapasite: 100 kullanıcı × 10 tasarım/gün

SDXL base varsayılan alındı (insan geri bildirimi bu yönde). Bütün rakamlar ölçüm, tahmin değil.

## Önce bir düzeltme

Performans raporunda görsel başına **26.5 saniye** yazmıştım. O rakam karşılaştırmadan geliyordu ve
karşılaştırma modeller arasında geçiş yapıyordu — yani her ölçüme model yükleme payı binmişti.

Tek model bellekte kalınca gerçek rakam:

| | süre/görsel |
|---|---|
| tek tek üretim, ısınmış | **12.0 sn** |
| batch 4 | 9.0 sn |
| batch 8 | **8.5 sn** |

Yani kapasiteyi iki kattan fazla düşük hesaplamışım. Toplu üretimi hiç denememiştim; SDXL 6.5 GB
kullanıyor ve makinede 128 GB var, sekizi birden üretmemek için sebep yokmuş.

## 1000 tasarım/gün ne kadar sürer

| aşama | süre | nerede |
|---|---|---|
| Görsel (batch 8) | **2.36 saat** | GPU |
| Arka plan silme (rembg) | **3.17 saat** | CPU |
| Metin (yerel Qwen) | 2.45 saat | GPU |

| kurulum | toplam | doluluk |
|---|---|---|
| Hepsi sıralı | 7.97 saat | %33 |
| rembg GPU ile paralel | **5.61 saat** | %23 |
| Metin de buluta (Sonnet) | **3.17 saat** | %13 |

**Darboğaz üretim değil, arka plan silme.** rembg görsel üretiminden uzun sürüyor ve CPU'da çalışıyor —
yani GPU boşta beklerken. İki şey yapılabilir: GPU'lu onnxruntime'a geçirmek, ve GPU üretimiyle
eşzamanlı çalıştırmak. İkisi de yapılmadı; yukarıdaki "paralel" satırı bunun potansiyeli.

## Tavan nerede

16 saatlik pencerede, batch 8 + paralel rembg ile:

| pencere | kapasite | kullanıcı |
|---|---|---|
| 8 saat | 2.526 tasarım | ~250 |
| 16 saat | 5.053 tasarım | ~500 |
| 20 saat | 6.316 tasarım | ~630 |

**100 kullanıcı hesap gücü açısından sorun değil.** Sınır donanımda değil.

## Sınır burada — ve bunlar ciddi

**1. FIFO kuyruğunda son kullanıcı saatlerce bekler.** 1000 iş sırayla işlenirse günün son kullanıcısı
5–8 saat bekliyor. Kullanıcı başına adil sıralama (round-robin) şart; bugünkü worker `ORDER BY run_at`
ile tek kuyruk işletiyor ve 100 kullanıcıda bu ürünü bitirir.

**2. Tek ev cihazı, yedeği yok.** DHCP adresi, UPS yok, gelen port yok, sudo yok. 100 ödeyen kullanıcı
bir dairedeki makineye bağlıysa elektrik kesintisi tüm kuyruğu durdurur. Bulut fallback var ama
Higgsfield görsel başına ücretli — 1000 görsel/gün oraya düşerse fatura ciddi olur.

**3. Görseller Postgres'te bytea olarak duruyor.** Şemamız böyle. 1000 × 3.8 MB = **3.8 GB/gün**
veritabanına. Bu ölçekte tutmaz; nesne depolamaya (S3/R2) taşınması gerekir — spec bunu zaten
öngörmüş, biz henüz yapmadık.

**4. Disk.** Ham + baskı dosyası 5.2 GB/gün. 14 günlük saklamayla 72 GB, sorun değil. 3.4 TB ancak
657 günde dolar.

**5. Eşzamanlılık kuralı hâlâ geçerli.** Difüzyon ve LLM aynı anda yaşayamıyor. Metin yerelde kalırsa
her geçiş ~115 sn; günde tek metin partisi bunu bire indirir ama tasarım başına dönüşümlü çalışmak
1000 işte saatler ekler. 100 kullanıcıda metnin Sonnet'te kalması ayrıca bu yüzden doğru.

## Özet

Donanım 100 kullanıcıyı rahat kaldırır — %13–23 dolulukta, ~500 kullanıcıya kadar başı sıkışmaz.
Yapılması gerekenler hesap gücüyle değil, **mimariyle** ilgili: kullanıcı başına adil kuyruk, nesne
depolama, rembg'yi GPU'ya alıp paralelleştirmek, ve tek cihaz riskine bir cevap.
