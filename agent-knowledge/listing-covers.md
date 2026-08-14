<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/listing-covers/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: listing-covers
description: Etsy/e-com kapak görseli formülü — kapak bir reklam panosudur, mood fotoğrafı değil. Yeni ürün kapağı üretirken, mevcut kapakları güncellerken veya thumbnail CTR sorunu görüldüğünde kullan.
---

# Listing Cover Formülü (2026-08-03, kanıta dayalı)

Kaynak: 6 veteran mağazanın en çok satan 18 listing'inin kapakları bizimkilerle yan yana
analiz edildi (SchmidtsTees 504s, NextDayCustomTees 1002s, UpTopNorth 1397s, ModPaws 885s...).
Bizim ilk nesil kapaklar "güzel editoryal fotoğraf"tı; kazananlarınki "ilan panosu".

## Kural: kapak thumbnail savaşını kazanmak için var
Etsy aramasında kapak ~90-160px görünür. O boyutta karar veren 3 şey:
1. **Teklif yazısı görselin ÜSTÜNDE** — üst bant: kişiselleştirme/değer vaadi
   ("PERSONALIZED WITH YOUR NAMES", "REAL EMBROIDERY · NOT A PRINT"), alt bant: spec
   ("COMFORT COLORS 1717 · 22 COLORS · S-4XL").
2. **Tasarım kadrajı doldurur** — sıkı crop (üst %12, yanlar %7 at), parlaklık +%12.
3. **Yazı PIL'de basılır, asla görüntü modelinde üretilmez** — model yazısı thumbnail'de
   yumuşar; PIL pixel-net kalır.

## Yapma (eski hatalarımız)
- Loş/karanlık sahne, tasarımı küçük gösteren geniş kadraj, prop kalabalığı (kupa/kitap/saksı)
- Bütün ürünlerde birebir aynı kompozisyon (portföy tekdüzeliği = mağaza vitrini ölü görünür)
- Kapakta kanıtlanamayan iddia (SHIPS FAST vb. — sadece doğrulanabilirse)

## Araçlar
- `dashboard/scripts/make_cover.py in.jpg out.jpg --banner "..." --strip "..."` — tek kapak
- `dashboard/scripts/update_covers_bulk.py [--only slug]` — canlı listingleri toplu günceller
  (Etsy rank1 overwrite + DB'ye label='ad-style cover' ile rank1 insert; guard bu label'a bakar)
- Banner/strip metin eşlemesi: `worker/producer.ts coverTexts()` ve bulk script `texts()` —
  İKİSİ DE güncellenmeli, çift kaynak (bilinçli: python bulk lokal, TS agent'ta çalışır)

## Otomasyon (yeni ürünler — dokunma, çalışıyor)
- Producer agent attach: rank1 mockup otomatik `make_cover.py`'dan geçer (label 'ad-style cover'),
  rank4 renk kartelası + rank5 CC1717 size chart (assets/cc1717-size-chart.png) eklenir.
- Publish: CC1717 ürünlerine try-on video (assets/cc1717-tryon-720.mp4) otomatik yüklenir
  (best-effort; video hatası yayını bloklamaz). Etsy video: 5-15s, tek video/listing.

## Etsy API tuzakları
- Image upload'da rank default=1 — rank vermezsen KAPAĞI EZER. Ek görseller için rank açıkça ver
  (size chart rank=10).
- rank=1 + overwrite=true mevcut kapağı değiştirir, diğerlerini korur.
- Video upload alanları: multipart `video` + `name`; tekrar yükleme mevcut videoyu değiştirir.

## Banner metni yazarken
Dil İngilizce, ≤42 karakter (bant tek satır), alıcının aradığı değer önce:
kişiselleştirilmişse kişiselleştirme vaadi > teknik özellik. Nakışta "REAL/NOT A PRINT"
ayrıştırıcısı kullan. Alt bantta blank adı + renk sayısı + beden aralığı sabit kalıbı.

## A/B ölçümü
Etsy'de native A/B yok. Kapak değişikliği sonrası Etsy Stats'ta arama gösterimi→ziyaret
oranını değişiklik öncesi 2 haftayla karşılaştır; portföy genelinde tek seferde değiştirdiysen
tarih bazlı önce/sonra oku (2026-08-03 = v1→v2 geçiş günü, 19 listing).

## 🔴 ETSY ANA GORSELI HER YANDAN ~%10 KIRPIYOR (2026-08-07, canli vaka)
Kapak karede yuklenir ama listing sayfasinda **dikey** cerceveye kirpilir; her yandan ~%10 gider.
`make_cover.py` yaziyi genisligin %93'une yayiyordu, sonuc canli bir listingde
"CUSTOM EMBROIDERY · YOUR NAMES STITCHED" → **"STOM EMBROIDERY … STI"** olarak okundu.

**Kural: gorsele gomulen HER yazi merkezin %74-80'i icinde kalmali.** Bantlar tam genislikte
devam edebilir, sadece kelimeler kisitlanir. `make_cover.py` artik SAFE=0.74 kullaniyor.
Kontrol: yukledigin gorselde yazinin x araligi `[0.10W, 0.90W]` icinde mi?

## 🔴 KAPAK KURALI: HER ZAMAN GIYIMLI MOCKUP (kullanici karari, 2026-08-07)
Etsy kapagi **her zaman urunun bir insanin uzerinde** oldugu fotograf olacak. Katlanmis urun,
serili urun ya da yakin cekim yama fotografi kapak OLMAZ.

**Ikinci kural — makro yakin cekim kullanma.** Baskiyi/nakisi cok yakindan gosteren kareler
urunu tisort gibi gostermiyor; kullanicinin ifadesiyle "corap gibi duruyor". Kumas dokusu
gorunuyor ama giysinin ne oldugu kaybolyor. Bu kareler listingden cikarildi.

Kabul edilen kare tipleri:
1. **Giyimli** (omuzdan asagi, yuz yok) — kapak ve 2. gorsel
2. **Tam giysi** (yaka, kollar, etek ucu karede) — duz serili olabilir, yeter ki tisort okunsun
3. Bilgi kartlari (nasil kisiselleştirilir / nakis-baski farki / kalip-bakim)
4. Renk karti

Nakisli urunlerde tasarim gogus uzerinde kucuk kaliyor; cozum makro cekim DEGIL, giyimli kare +
tam giysi karesi. Detay gerekiyorsa orta mesafe (yaka ve omuz karede) kullan.
