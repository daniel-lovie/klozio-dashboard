# DGX Spark — ölçülen performans

Donanım: NVIDIA GB10, 128 GB birleşik bellek, aarch64, sürücü 580.159.03.
PyTorch 2.13.0+cu130. Bütün rakamlar 45 üretimlik karşılaştırmadan ve doğrudan ölçümden geliyor.

## Görsel üretimi — 1024×1024, 28 adım

| model | n | min | medyan | maks | std | bellek |
|---|---|---|---|---|---|---|
| SDXL base 1.0 | 15 | 26.2 s | **26.5 s** | 40.1 s | 3.4 s | 4.9 GB + 1.6 GB CLIP |
| Juggernaut XL v9 | 15 | 26.1 s | **26.4 s** | 38.1 s | 2.9 s | 4.9 GB + 1.6 GB CLIP |
| FLUX.2 klein 4B | 15 | 74.1 s | **74.1 s** | 90.1 s | 4.0 s | 7.4 GB + 7.7 GB TE |

**Maksimumlar ilk üretim.** Ağırlıkların yüklenmesi bir kereye mahsus:

| model | ilk üretim | sonraki 14'ün ortalaması | yükleme maliyeti |
|---|---|---|---|
| SDXL base | 40.1 s | 26.5 s | ~14 s |
| Juggernaut | 38.1 s | 26.4 s | ~12 s |
| klein | 90.1 s | 74.5 s | ~16 s |

Yani "klein 2.8 kat yavaş" doğru ama tamam değil: fark yükleme değil, örnekleme. Model değiştirmenin
kendisi sadece 12–16 saniye.

## Metin üretimi — Qwen3 30B-A3B (MoE, 45 GB)

| | süre |
|---|---|
| Soğuk başlangıç (ağırlık yükleme + ilk cevap) | **115.3 s** |
| Sıcak çağrı (model bellekte) | **8.7 s** |

Soğuk maliyet, `TEXT_TIMEOUT_S`'i 90'dan 240 saniyeye çıkarmamın sebebi — 90'da her soğuk başlangıç,
başarmak üzere olan bir çağrıyı Sonnet'e düşürürdü.

## Ham hesap gücü

| ölçüm | sonuç |
|---|---|
| fp16 matmul 8192³ | **96.7 TFLOP/s** |
| bf16 matmul 8192³ | **98.4 TFLOP/s** |
| fp32 doğruluk sapması | 1.4e-04 (sm_120 çekirdekleri sm_121'de doğru çalışıyor) |

İlk ölçümüm 8 TFLOP/s vermişti; ısınma turu koymadığım için ortalama ilk çağrının PTX JIT
derlemesiyle şişmişti. Gerçek rakam yukarıdaki.

## Günlük hedefe göre ne demek

Hedef 10 tasarım/gün. Her tasarım bir görsel + bir listing metni.

| senaryo | görsel | metin | toplam |
|---|---|---|---|
| SDXL/Juggernaut + Sonnet | 10 × 26.5 s = **4.4 dk** | bulut, ~saniyeler | **~5 dk** |
| klein + Sonnet | 10 × 74.5 s = **12.4 dk** | bulut, ~saniyeler | **~13 dk** |
| klein + yerel Qwen | 12.4 dk | 115 s soğuk + 9 × 8.7 s = **3.2 dk** | **~16 dk** |

Üçü de günlük 30 dakikalık bütçenin çok altında. **Hız bu ölçekte model seçiminde bir kriter değil**
— 100/gün'de olurdu.

## Sıralılık zorunlu, ve bu bir maliyet

Difüzyon ve LLM aynı anda yaşayamıyor: Qwen 45 GB, ComfyUI kendi checkpointlerini tutuyor, ikisi
birlikte 128 GB'lık makineyi **110 GB dolu / 0 boş**a getirdi. Belirti OOM değil, metin aşamasının
zaman aşımıydı.

Worker artık her aşamadan önce diğerini tahliye ediyor. Bellek 110 GB'den **34 GB**'ye düştü. Bedeli
her geçişte bir model yüklemesi — görsele dönüşte ~15 s, metne dönüşte ~115 s. Günde bir kez metin
partisi, bir kez görsel partisi çalıştırmak bu maliyeti bire indirir; tasarım başına dönüşümlü
çalışmak 10 tasarımda ~20 dakika ek yükler.

## Maliyet

Higgsfield'da görsel başına ödenen ücret vardı ve oturum süresi doluyordu. Yerelde marjinal maliyet
**sıfır** ve dolacak oturum yok. Elektrik hariç tek maliyet, kurulumun kendisi: 28 GB görsel modeli +
18 GB metin modeli, bir kerelik.
