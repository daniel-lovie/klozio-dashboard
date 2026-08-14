<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/printful-embroidery/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: printful-embroidery
description: Printful ile nakış (embroidery) fulfillment — varyant eşleme, iplik renkleri, draft/confirm akışı, maliyetler. Nakışlı ürün siparişi, Printful entegrasyonu veya nakış maliyet/marj hesabı gerektiğinde kullan.
---

# Printful Embroidery Fulfillment (2026-08 doğrulanmış)

Kod: `dashboard/src/lib/printful.ts` (client), `printful-fulfill.ts` (sipariş akışı).
Blank'ler: **CC1717 tişört = catalog product 586**, **Yupoong 6245CM dad hat = 206**.

## Auth ve store
- `Authorization: Bearer {api_key}` (Printful panelinden).
- **Sipariş endpoint'leri `X-PF-Store-Id` ZORUNLU** — yoksa `400 "This endpoint requires store_id!"`.
  Store yoksa hesapta hiç sipariş açılamaz; `GET /stores` boş dönerse panelden store aç.
- Token'ın store erişimi ayrı yetki: hiç store görünmüyorsa developers.printful.com → token →
  **All stores** seç. (Klozio store id `18561101`, Etsy bağlantılı.)
- Multi-shop: `shopCtx().printfulApiKey` — mağaza kendi anahtarını girmezse platform anahtarı.

## Varyant eşleme (bizim isimler → Printful)
Runtime'da `GET /products/{id}` ile çözülür, in-process cache'lenir. Normalizasyon şart:
`Gray→Grey`, `2X→2XL`, `3X→3XL`, `4X→4XL`, `OS→One size`, **şapkada `Tan→Khaki`**
(Printful'da Tan yok, Khaki aynı fiziksel şapka).

## Nakış siparişi — kritik alanlar
```
POST /orders  { external_id, recipient, items:[{ variant_id, quantity,
                files:[{type: <placement>, url}], options:[...] }], confirm:false }
```
- **Placement**: tişört `embroidery_chest_center` | `embroidery_chest_left`,
  şapka `default` (ön panel). Ürün bazında `products.printful_placement`.
- **İplik renkleri ZORUNLU** (yoksa 400). Option adı placement'a göre değişir:
  tişört `thread_colors_chest_center` / `thread_colors_chest_left`, şapka düz `thread_colors`.
  Şapkada ayrıca `embroidery_type: "flat"`.
- İzinli palet 15 renk: `#FFFFFF #000000 #96A1A8 #A67843 #FFCC00 #E25C27 #CC3366 #CC3333
  #660000 #333366 #005397 #3399FF #6B5294 #01784E #7BA35A`.
  Tasarımdan otomatik seçim: `dashboard/scripts/thread_colors.py` (≥%3 kaplama, max 6 iplik)
  → `products.thread_colors`.
- **Tasarım dosyasını Printful ÇEKER** → public URL gerekir. Bizde HMAC imzalı
  `/api/pf-file/[productId]?sig=...` (imza `PRINTFUL_API_KEY` ile türetilir). Şapkaların kendi
  print_file'ı yok → aynı `concept_no`'lu EMB kardeşin dosyası kullanılır (mağaza-scoped!).

## Akış (asla otomatik para harcamaz)
sipariş düşer → `sendOrderToPrintful` **draft** açar (`confirm:false`) → `/orders`'da operatör
"Printful'a Onayla" → `POST /orders/{id}/confirm` → bizde `status='sent_to_producer'`.
Hata → `printful_status='failed'` + `printful_error`, UI'dan retry.
Test draft'ları `DELETE /orders/{id}` ile temizlenir (ücret yok).

## Maliyet (2026-08)
| | Ürün | Kargo | Toplam |
|---|---|---|---|
| CC1717 nakış tişört | $20.09 | $4.75 | **$24.84** |
| Yupoong dad hat | $14.65 | $4.49 | **$19.14** |

- İlk siparişte tasarım başına bir kerelik **digitization** ücreti çıkabilir (~$3-6.50).
- Etsy sales tax topluyorsa Printful'a **resale certificate** yükle (Billing) — çift vergi gitmesin.
- Satış fiyatlarımız: Etsy nakış tişört anchor $49.99 (efektif $34.99), şapka $35.70 ($24.99);
  Shopify nakış tişört $42.99 / compareAt $61.99.

## Uyarılar
- Printful'da Etsy store bağlıysa **Settings → Orders → otomatik onayı KAPAT** (kendi kendine
  confirm edip para çekmesin) ve **DTF ürünlerini Printful'da sync ETME** (onlar Printinly'de basılıyor,
  çifte üretim riski).
- Paket fişinde store adı görünür: ikinci mağaza için ayrı Printful store açıp
  `shops.creds.printful_store_id` set edilmeli, yoksa fişte ilk store'un adı yazar.

## ⚠️ KİŞİSELLEŞTİRİLMİŞ NAKIŞ: digitization HER SİPARİŞTE (2026-08-06 dersi)
Digitization "tasarım başına tek seferlik" — ama **kişiselleştirilmiş üründe her siparişte isim
değişir, yani her sipariş yeni bir dosyadır** → her seferinde $6.50. CC1717'de kaçış yolu YOK:
ürünün option listesi sadece `thread_colors_*` (multi_select) + `notes` + `lifelike`; Printful'ın
kendi fontlarıyla text-embroidery opsiyonu bu blank'te bulunmuyor (API'den doğrulandı).

Gerçek birim ekonomi (Etsy, %30 mağaza indirimi sonrası, kargo $5 tahsil):
| Ürün | Eski efektif | Net | Yeni efektif | Yeni net |
|---|---|---|---|---|
| Kişiselleştirilmiş nakış tişört | $34.99 | $5.71 | **$41.99** (anchor $59.99) | **$12.05** |
| Kişiselleştirilmiş nakış şapka | $24.99 | **−$0.85 ZARAR** | **$34.99** (anchor $49.99) | **$8.20** |
| Sabit tasarımlı nakış (AK, terminal) | $34.99 | $12.26 | değişmedi | — |

Kural: **kişiselleştirilmiş nakış fiyatlanırken COGS'a $6.50 digitization DAİMA eklenir**;
sabit tasarımda sadece ilk satışta sayılır. Repricing aracı:
`dashboard/scripts/reprice_personalized_emb.py` (DB + canlı Etsy inventory PUT, beden ek ücretleri korunur).

Sabit tasarımda tekrar ödememek için: `printful_files(design_md5, is_hat) -> file_id` cache'i
(Printful dosya hash'i = içerik MD5) ve siparişte `files:[{type, id}]` kullanımı. Aynı Printful
hesabı iki mağazada da kullanıldığı için dosya paylaşılır. NOT: draft, tasarım gerçekten
dijitalleştirilene (ilk sipariş CONFIRM edilene) kadar ücreti yine de teklifte gösterir.

## 🔴 TASARIM RENKLERI IPLIK PALETINE "EN YAKIN" ESLENINCE SURPRIZ CIKIYOR (2026-08-07)
`thread_colors.py` her rengi Printful'un 15 renkli paletindeki en yakina esler. Ama "en yakin"
gorsel olarak yakin demek degil:
- dusty blue (74,96,124) → **#6B5294 MOR** (navy #333366 degil — mor matematiksel olarak daha yakin)
- muted gold (214,169,88) → **#A67843 KAHVERENGI** (altin gibi gorunen #FFCC00 degil)
Dikilen urun fotografa benzemez, iade/kotu yorum gelir.

**Kural: nakis dosyasini DOGRUDAN iplik hexleriyle ciz.** DTF baski dosyasi ayri tutulur ve
orijinal yumusak paleti korur — DTF renk siniri tanimaz. Iki ayri dosya, iki ayri mockup seti.

**Ikinci tuzak:** `thread_colors.py` %3 kapsama esiginin altindaki rengi listeden atiyor. Kucuk ama
onemli bir oge (ornegin kirmizi bir yildiz) bildirilmezse digitizer onu baska renge esler. Kucuk
ogenin rengini ELLE ekle (6 = ust sinir).
