# Web Agent — Spec (2026-08-04)

## Amaç
Dashboard'daki TÜM pipeline adımları (fikir üretimi → içerik onayı → görsel üretim → görsel onay →
schedule → yayın → sipariş/fulfillment) Claude Code'a ihtiyaç duymadan web UI'dan yürütülebilsin.
Bunun için web app'e, operatörün chat ekranından konuştuğu, tam yetkili bir agent eklenir.

## Mimari
- **Çekirdek:** Next.js API route içinde Anthropic Messages API tool-use döngüsü (model: claude-opus-5,
  env PERSONALIZER_MODEL ile override). SSE ile stream. Web servisinde çalışır (tüm env orada).
- **Araçlar (tam erişim):**
  1. `sql` — Postgres'e serbest SQL (SELECT/INSERT/UPDATE/DELETE). Tüm pipeline bayrakları buradan.
  2. `etsy` — imzalı Etsy v3 çağrısı (method/path/body). Token rotasyonu lib'de.
  3. `shopify` — Admin GraphQL (query/variables). Client-credentials token cache lib'de.
  4. `printful` — Printful API (store-scoped).
- **Görsel üretim:** chat agent HF'yi doğrudan çağırmaz; `design_state`/`redo_note`/`content_status`
  bayraklarını set eder, Railway'deki producer agent üretir (mevcut, kanıtlı yol). Kişiselleştirilmiş
  siparişleri personalizer halleder.
- **Bilgi:** sistem promptu = damıtılmış know-how (DB şeması, pipeline durum makineleri, copy-playbook,
  arketipler, fiyatlama/COGS, Etsy/Printful/Shopify tuzakları, kapak formülü). `src/lib/agent/prompt.ts`.
- **Kalıcılık:** `agent_chats` tablosu (tek thread, id=1, messages jsonb, son 40 mesaj yüklenir).
  Tool çağrıları events tablosuna loglanır (`agent_tool` tipi).
- **UI:** `/chat` — mesaj akışı, canlı stream, araç aktivite çipleri ("sql ▸ 12 satır"), Enter=gönder,
  Temizle butonu. Nav'a "Agent" eklenir.

## Güvenlik/politika
- Login zorunlu (mevcut session).
- Para harcayan / dışa dönük aksiyonlar (Etsy publish/activate, Printful confirm, fiyat değişikliği,
  Shopify yayını) SADECE kullanıcı chat'te açıkça istediyse yapılır; agent kendiliğinden yapmaz.
- Her tool çağrısı loglanır. SQL'de sınır yok (operatör tam yetki istedi) ama sistem promptu
  "önce SELECT ile doğrula, sonra yaz" disiplinini şart koşar.
- Maks 25 tool adımı/tur; SSE 300s.

## Kabul kriterleri
1. Chat'ten "X nişi için 5 konsept üret" → products tablosuna copy-playbook uyumlu satırlar
   (title/desc/tags/design_prompt/mockup_prompt, content_status='draft') → /plan'da görünür.
2. Chat'ten "p2030'u onayla" → content_status='approved' → producer üretime alır.
3. Chat'ten "şu ürünü redo yap: <not>" → design_state='redo' + redo_note.
4. Chat'ten "cuma 10:00'a schedule'la ve onayla" → schedule satırı approved.
5. Chat'ten durum soruları (kuyruk, siparişler, kâr) → SQL ile canlı cevap.
6. Anthropic kredisi yokken UI net hata gösterir; kredi gelince kod değişikliği gerekmez.

## Bilinen bağımlılık
ANTHROPIC_API_KEY'de kredi yok (console.anthropic.com — kullanıcı aksiyonu). Kod kredi geldiği an çalışır.
