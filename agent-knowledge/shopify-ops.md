<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/shopify-ops/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: shopify-ops
description: Shopify Admin API entegrasyonu ve mağaza operasyonu — auth (client-credentials), katalog portu (productSet + staged uploads), kişiselleştirme alanı (tema bloğu), fiyat/koleksiyon yönetimi. Shopify'da ürün oluşturma/güncelleme, mağaza kurulumu veya DB→Shopify senkronu gerektiğinde kullan.
---

# Shopify Ops (2026-08 doğrulanmış)

Klozio mağazası: `zzsvpu-dx.myshopify.com` (Basic, USD). App: Dev Dashboard'da `daniella`.
Kod: `dashboard/src/lib/shopify.ts` (TS client), `dashboard/scripts/shopify_port.py` (katalog portu).

## Auth — client-credentials (yeni akış)
Eski "custom app → Admin API token" akışı **Dev Dashboard'a taşındı**. Doğru yol:
1. Mağaza admin → Settings → Apps → "Build apps in Dev Dashboard"
2. App oluştur → **scopes** (write_products, write_files, write_inventory, write_publications,
   read_locations, write_orders, write_fulfillments, write_discounts, write_themes) → Release
3. App'i mağazaya **INSTALL et** (kurulmadan token alınamaz → `app_not_installed`)
4. Settings → Credentials: **Client ID + Secret** (`shpss_...`)

Token üretimi (24 saatlik, saklanmaz — her seferinde basılır):
```
POST https://{shop}/admin/oauth/access_token   (FORM-encoded! JSON 400 verir)
grant_type=client_credentials&client_id=...&client_secret=...
```
TS tarafında `src/lib/shopify.ts` bunu bellekte 5 dk marjla cache'ler. Etsy'deki gibi çürüyen
refresh token yok — bu yüzden Shopify tarafı bakım istemez.

## Ürün oluşturma — productSet (GraphQL, REST YOK)
Yeni app'lerde REST product API kapalı. `productSet` kullan:
- `≤100 varyant` → `synchronous: true`, doğrudan `product.id` döner
- `>100 varyant` → async; `productSetOperation.id` ile poll et.
  ⚠️ `productOperation` sorgusunda `userErrors` **inline değil**: `... on ProductSetOperation { userErrors { message } }`
- Seçenekler `productOptions: [{name, position, values:[{name}]}]`, varyantlar
  `optionValues:[{optionName, name}]` ile eşlenir (tişört = 22 renk × 7 beden = 154 varyant).
- `inventoryPolicy: "CONTINUE"` (POD'da stok tutmuyoruz, satış hiç durmasın).

## Görsel yükleme (3 adım)
`stagedUploadsCreate` → dönen S3 hedefine **multipart POST** (parametreleri sırayla forma ekle,
`file` en sonda) → `productCreateMedia(originalSource: resourceUrl)`. Sıra = DB rank sırası.

## Yayınlama
Ürün oluşturmak vitrine koymaz: `publishablePublish` ile Online Store publication'a bas.
`publications(first:10)` içinde adı "Online Store" olanı bul.

## Fiyatlama kalıbı (bizim modelimiz)
`price` = efektif (Etsy anchor × 0.7), `compareAtPrice` = anchor → üstü çizili indirim görüntüsü
(Red First/Gerbera taktiği). Beden farkı efektif+anchor ikilisi olarak ayrı ayrı hesaplanır.
Toplu fiyat değişimi: `productVariantsBulkUpdate` (250 varyanta kadar tek çağrı).

## Kişiselleştirme alanı (Etsy'nin personalization karşılığı)
Radiant/Horizon ailesi temalarda **native blok var**: `product-custom-property`.
1. `templates/product.json`'u oku (⚠️ dosya başında `/* ... */` yorum bloğu var, JSON.parse
   öncesi strip et), **iç içe blok yapısı**: `main → blocks['product-details'] → blocks{}`
2. Yeni blok ekle (`property_key: "Personalization"`, `required: true`, `max_length: 250`) ve
   `block_order`'a buy-buttons'tan ÖNCE koy
3. `themeFilesUpsert` ile **ayrı bir şablon** olarak yaz: `templates/product.personalized.json`
4. Kişiselleştirilmiş ürünlere `templateSuffix: "personalized"` ata (+ tag `personalized`)
Alıcının yazdığı metin siparişe **line item property "Personalization"** olarak düşer →
sipariş senkronunda `item.properties` okunmalı.

## Tuzaklar
- Token endpoint FORM-encoded ister; JSON gönderirsen `400` HTML döner.
- App kurulmadan token: `app_not_installed`.
- `productByIdentifier(identifier:{handle:...})` var-mı kontrolü için en ucuz sorgu;
  `mediaCount { count }` ile "yarım kalmış ürün" (görselsiz) tespiti yapılır → idempotent port.
- Shopify örnek ürünleri (`vendor: 'My Store'`) yeni mağazada duruyor → DRAFT'a çek.
- Mağaza şifre korumalıyken (pre-launch) her şey çalışır, sadece dışarıdan görünmez.

## Katalog portu
`python3 scripts/shopify_port.py [--only slug] [--limit N]` — DB'deki görselli ürünleri
Shopify'a taşır, koleksiyonlara atar (slot→koleksiyon eşlemesi script içinde), yayınlar.
Handle = bizim slug. Var olan handle'ı atlar; görseli eksikse tamamlar ("HEALED").
