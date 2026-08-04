# Multi-Shop — Spec (2026-08-04)

## Amaç
Tek dashboard'dan birden fazla mağaza (Klozio, MediterraSystem, arkadaş mağazaları...) yönetmek.
Nav'daki mağaza seçicisiyle bağlam değişir; ürün/plan/schedule/sipariş/agent her şey seçili
mağazaya göre çalışır. Yeni mağaza onboarding wizard'ı ile eklenir (API anahtarları toplanır).

## Veri modeli
- `shops(id serial, slug, name, creds jsonb, settings jsonb, created_at)` — Klozio = id 1 (backfill).
  creds jsonb anahtarları: shopify_domain, shopify_client_id, shopify_client_secret, printful_api_key,
  etsy_shop_id, etsy_shipping_profile_id, etsy_return_policy_id, etsy_readiness_state_id,
  etsy_production_partner_ids. (Etsy OAuth token'ları etsy_tokens tablosunda shop_id ile.)
- `shop_id int NOT NULL DEFAULT 1 REFERENCES shops` kolonları: products, fulfillment_orders,
  agent_chats, events, etsy_tokens (PK id→(shop_id)). schedule shop'a product üzerinden bağlı.
- Kimlik çözümleme: `getShopCreds(shopId)` — shop 1 için eksik alanlar env'den düşer (geri uyumluluk).

## Etsy bağlantısı (yeni mağaza)
Aynı Etsy app'i (bizim ETSY_CLIENT_ID) kullanılır — Etsy OAuth çoklu mağaza destekler:
arkadaş kendi Etsy hesabıyla consent verir → token + etsy_shop_id bizde saklanır.
Akış: wizard'da "Etsy'yi Bağla" → /api/shops/{id}/etsy/connect (PKCE, state=shop) →
Etsy consent → /api/etsy/callback → token kaydı + shop defaults çekimi (shipping profile,
return policy, readiness state otomatik GET'lenir, creds'e yazılır).
⚠️ KULLANICI AKSİYONU: Etsy app ayarlarına redirect URI eklenecek:
https://web-production-c9b31.up.railway.app/api/etsy/callback

## Shopify bağlantısı (yeni mağaza)
Her mağaza kendi Dev Dashboard app'ini kurar (Klozio'daki 'daniella' akışının aynısı):
wizard 3 alan ister: myshopify domain, client_id, client_secret (client-credentials grant).

## Fazlar
### Faz 1 (BU TESLİMAT)
- shops tablosu + shop_id kolonları + Klozio backfill
- Nav'da mağaza seçici (cookie: shop_id) + /shops/new onboarding wizard (isim → Etsy connect →
  Shopify alanları → Printful key, hepsi opsiyonel/sonradan tamamlanabilir)
- Etsy OAuth connect/callback rotaları (PKCE)
- Sayfa filtreleri: takvim, /plan, /portfolio, /orders seçili mağazaya göre
- GÜVENLİK KİLİDİ: publish ticker + producer + personalizer + order poll SADECE shop 1 için çalışır
  (yeni mağazalar yanlışlıkla Klozio kimlikleriyle işlem görmesin). Web agent'a shop bağlamı verilir.
### Faz 2
- lib/etsy.ts, shopify.ts, printful.ts, publish.ts, orders.ts → shop-context parametreli
  (env yerine getShopCreds); ticker tüm mağazalar için döner.
- Agent'lar (producer/personalizer) tüm mağazaların işlerini claim eder (creds shop'tan).
- Shopify port scripti --shop parametresi.
### Faz 3
- Kullanıcı/rol (arkadaşlar kendi mağazasını görsün): users tablosu, shop_members, magic-link login.
- Mağaza bazlı ayarlar sayfası (creds düzenleme, sale oranı, fiyat kuralları).

## Kabul (Faz 1)
1. Nav'da Klozio görünür, seçici çalışır, yeni mağaza wizard'dan eklenir.
2. MediterraSystem seçiliyken tüm sayfalar boş/kendi verisini gösterir; Klozio verisi sızmaz.
3. Klozio akışları (yayın, producer, siparişler) aynen çalışmaya devam eder.
4. Yeni mağazada Etsy connect butonu OAuth'u başlatır (redirect URI kayıtlıysa uçtan uca tamamlar).
