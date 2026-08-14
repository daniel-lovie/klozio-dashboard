<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/batch-production/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: batch-production
description: Producing listing-ready POD products in volume — the batch runner's QA gates, hand-set type, thread-palette control, correct-technique mockups, blank compositing, and the cost model that took a design from $8.50 to $0.03. Use whenever generating designs or listing images in bulk, writing or changing image prompts, choosing a garment colour or a mockup, or debugging why a product looks wrong.
---

# Batch production

Turns N concepts into publish-ready product folders and a blocking QA report, at $0.03 a design.
`scripts/batch_runner.py` is the implementation; this is what it knows and why.

Read `ai-design/SKILL.md` for authorship and disclosure, `listing-covers/SKILL.md` for cover
composition, and `printful-embroidery/SKILL.md` for thread and placement mechanics.

**Bir görsel üretim/yayın değişikliğine başlamadan önce `shipping-path/SKILL.md` oku.** Buradaki alan
bilgisi doğruydu ve yine de bütün katalog yanlış yayınlandı, çünkü kalibrasyon yayına giden yolun
okumadığı bir dosyada duruyordu ve compositing'in ikinci bir kopyası vardı. O dosya bu hata sınıfının
anatomisi.

## The one rule everything else serves

**What the listing shows must be what the buyer receives.** Every expensive mistake in this shop has
been a violation of it, and the gates exist to catch each one:

| Shown | Shipped | How it happened |
|---|---|---|
| Large centred print | 4-inch left-chest badge | mockup rendered at DTG `front` on an embroidery product |
| Bright gold thread | Tan brown thread | prompt described shape, model chose colour, snap mapped it |
| Charcoal Pepper tee | Ivory tee | mockup variant never followed `hero_colorway` |
| "[Name]'S DAD" | the literal brackets | placeholder set in type instead of filled |

## Cost model

Measured off the Higgsfield credit balance, not estimated:

| model | credits | note |
|---|---|---|
| **gpt_image_2 low** | **0.75** | default; drew the cleanest emblems in a side-by-side |
| nano_banana_2 / nano_banana_pro 2k | 2.00 | no advantage for flat vector emblems |
| nano_banana_pro 4k | 4.00 | what the first batch shipped with |
| recraft_v4_1 | ~2 | cheaper on paper, returned unusable art |

Two calls became one: background removal was a paid call for a background the generator **paints
itself** — a flat two-tone checkerboard. Keying it locally agrees with the paid call at 97-99.7% IoU.
Generate at **2k**: the cutout downsamples to 2048 regardless, and 2048 already exceeds both
placements (embroidery chest-left is a 1200px printfile, DTF front 1800px).

`$8.50 → $0.36 → $0.03 per design.` The first drop was moving product photos off image generation;
the second was the free local cutout and the right model.

## Ne satıyor — 40 kazanan ilanın ölçümü (2026-08-11)

EverBee ile aylık **150-1.300 satış** yapan, kişiselleştirilmemiş, IP içermeyen 40 Comfort Colors
tişörtünün *görselleri* incelendi (metadata değil, tasarımın kendisi). Beş formül çıktı:

| Formül | Kanıt | Mekanizma |
|---|---|---|
| **Ciddi illüstrasyon + sıradan/saçma metin** | Botanik levha + "ALL PLANTS ARE EDIBLE, SOME ONLY ONCE" (1313/ay, $21.9K); ölmekte olan zırhlı şövalye gravürü + "TUMMY HURTS" | Espri görselde değil, **görselin ciddiyeti ile metnin sululuğu arasındaki uçurumda** |
| **Koleksiyon ızgarası** | 9 sevimsiz hayvan, 9 protesto ikonu, okul malzemeleri | Bakılacak çok şey = yüksek algılanan değer |
| **Karakter + kulüp/arma** | Kokteyl tutan kedi "THE DESPERADO CLUB", bayrak+sosisli tutan rakun | Karaktere kimlik + kemerli başlık |
| **Tipografi tasarımın kendisi** | Çiçek dolgulu varsity "USA", groovy dalgalı "COUSIN CREW", "GOD IS GOOD" | Hiç illüstrasyon yok |
| **Minimal göğüs** | Küçük papatya + el yazısı, ufak nakış motifi | Garment rengi satıyor |

İki gözlem hepsinde ortak ve **bizim promptlarımızda yoktu**:

1. **Neredeyse hepsinde yazı var.** Bizim tasarımlar yazısız amblemdi; bu yüzden yanlarında zayıf
   duruyorlardı. AI'ya yazı çizdirmiyoruz (çizemiyor) — ama artık kompozisyonda **yazı için yer
   ayırtıyoruz**, sonra PIL ile diziyoruz.
2. **Palet küçük ve mat**: 2-5 renk, toprak tonları ya da tek parlak vurgu; koyu garment-dyed üzerine
   sık sık krem mürekkep. Doku (gravür tarama, halftone, yıpranma) kural, temiz düz vektör istisna.

## Tek kuyruk yerine stil presetleri

Eski `PROMPT_TAIL` her tasarıma "flat vector emblem, bold outlines, no shading" diyordu — kazananların
çoğu bu değil. Artık `STYLE_TAILS` var: `engraving` (varsayılan), `plate`, `collection`, `character`,
`retro`, `minimal`. Her biri **yazı için boş alan** ister. Konseptte `style` (batch spec) veya
`design_params.style` (DB) ile seçilir.

A/B ölçümü, aynı konsept: eski düz vektör çıktı turkuaz bir daire içinde çıkartma gibi duruyordu; yeni
`engraving` çıktısı ince tarama, mat toprak paleti, koyu garment üzerinde basılmış gibi. Kesim kremi
yemedi (opak alanın %32-37'si açık ton kaldı) — beyaz zemin + krem mürekkep kombinasyonu belgelenmiş bir
tuzaktı, ölçerek doğrulandı.

## Prompts

- **AI never renders type.** Image models return malformed glyphs, dropped letters and invented
  punctuation. Every word we ship — a numeral, a personalisation token, a slogan — is hand-set in
  PIL afterwards. A catalogue whose prompts say `The design contains EXACTLY this text: "HUZZAH"`
  is a catalogue that cannot be produced as written.
- **State the palette.** A prompt that describes shape and leaves colour to the model gets the
  model's palette. Naming the exact thread hexes with plain-English names ("bright golden yellow
  #FFCC00") took undeclared colour coverage from 32% to under 2%.
- **A banner must be asked for as a solid filled shape.** "A ribbon banner" is drawn as a thin
  outlined scroll — four of one batch came back 0-26px tall against the 135px one that worked. No
  font size stitches a name into a 4px scroll.

## The gates

Each one exists because the defect it catches was shipped once.

- **G1 alpha** — the generator answers "transparent background" by *drawing* a grey checkerboard.
- **G2 threads** — every colour in the artwork must be a declared thread, or the digitiser guesses.
  Anti-alias fringe is excluded by erosion: a real element keeps a solid core, a 1-2px border
  vanishes. Absorbed colours are named in the message, never tolerated silently.
- **G7 personalise** — the token must exist in the artwork and be **alphanumeric**. The personalizer
  replaces one contiguous run of lettering; "MIA & LEO" gives it three runs to choose between.
- **G8 trademark** — a term tripwire, not a search. Never run a trademark search.

## Mockups and covers

- **Printful renders per technique.** `technique=embroidery` + `embroidery_chest_left` is a different
  garment from `technique=dtg` + `front`. Ask for the one you actually fulfil; the printfile endpoint
  gives the area (1200x1200 @300 for chest left).
- **Printful mockups are free**, including many colourways in a single task — which is all a
  "Comfort Colors color chart" listing image is. Nobody buys one.
- **The cover is always worn.** A macro of the stitching reads as a sock. The cover model is a
  choice, not an API ordering accident: Printful returns the men's group first, and the first
  women's model is shot full-length mid-stride, which leaves the print a thumbnail.
- **Blank compositing beats a render.** Two things make it read as printed rather than pasted: the
  design is warped into a per-photo quad so it leans with the body, and it is **multiplied by the
  garment's own luminance** so folds and shadows carry through. Automatic corner-finding was tried
  twice and abandoned — garment colour also matches hair, sleeves and bedding. One quad measured by
  eye transfers across photographs that share a framing.

## Garment colour

Contrast is **measured**, not assumed: a design whose luminance sits within 60 of the garment's
disappears into it. But maximising contrast is not a merchandising rule — white has the highest
luminance, so for any dark artwork it wins every time, and it chose white for 63 of 116 products.
Pick the **preferred** shade among those the design is legible on (≥75% of pixels standing clear).
Garment-dyed shades are what buyers come to Comfort Colors for; white and black are the fallback.

When the design does not read, **move the garment, not the artwork** — it is free, and regenerating
is not.

## When a cheap component looks broken, suspect the measurement

Two defects blamed on models were ours:

- The colour census thumbnailed with **LANCZOS before counting**, averaging neighbouring pixels into
  colours that exist in no thread and no design. It failed the gate on clean artwork. A census
  samples (NEAREST); it does not blend.
- The local cutout's "an enclosed pocket containing two tones is background" rule erased the white
  interior of every ribbon on a **plain white background**, where all three sampled tones are the
  same white. It looked exactly like a model failure — a banner measuring 1px — and was ours.

## Catalogue hygiene

- A niche named after somebody's published work is not a niche. The name need not appear in the copy
  for the design to point at the thing. Policy, not a legal finding.
- A slogan past ~40 characters drops under a readable size in an Etsy grid tile.
- `products.personalised` is not trustworthy on legacy rows; a bracket in the slogan is.
- The runner writes files; **files are not a listing**. `product_images` is what the Etsy publisher
  and the Shopify porter read, and a batch that skips it publishes 86 listings with no photographs.

## Mockups from our own photographs

Printful's generator is free and its placement is honest, but it is a 3D render on a headless ghost
and every Printful shop publishes the identical file. Licensed blank photographs, composited, are
what make a listing look like a shop.

**Placement is measured, never derived.** Detecting the garment centre, the collar, the body width
and a min-area rectangle were all tried, and each was visibly wrong on at least one photograph —
garment colour also matches hair, sleeves, bedding and a straw hat, and folded shirts are shot on two
framings. The reliable method is to obtain a real printed mockup of the same blank and diff it against
our copy: the difference IS the print rectangle, to the pixel. Edge difference under 2 confirms the
photographs are the same. One measured flat transfers to every flat from that shoot.

Three things make a composite read as printed rather than pasted, and none of them is shading:

- **Displacement.** The garment's blurred luminance gradient warps the artwork, so the print bends
  into folds. Shading alone paints a shadow over a shape that is still perfectly flat — which is
  exactly what "looks like paint" means.
- **Light, not darkness.** Normalise the multiply by the garment's own median, or a Pepper tee
  (luminance 65) multiplies the artwork by 0.39 and gold comes out olive. Normalise the texture
  amplitude by each garment's own standard deviation too: the same cloth grain is 0.7% of mean on
  Ivory and 22.9% on Pepper, so any shared multiplier leaves one clean and the other woven through.
- **Angle.** Every folded flat in one shoot sits at the same tilt (-8° here). A print laid square to
  the frame is visibly crooked on a shirt that is not. Worn shots are vertical — measuring them the
  same way picks up arms and hair and invents a tilt that is not there.

Size comes from one number. Each template carries px_per_inch measured from its own garment, so a
quad is derived from inches; changing the print size is a constant, not twenty-one rectangles. The
artwork must be cropped to its content first — 10 inches of canvas whose content fills 70% prints
seven.

## Embroidery is not a print with texture on it

An embroidery product needs **two assets**, and confusing them is why mockups read as DTF:

| asset | what it is for |
|---|---|
| `print_file` | flat, exact thread hexes, no texture. The digitiser reads colour, so texture in it gets stitched as colour. |
| `emb_render` | the same design generated as thread — satin fills, visible strands, sheen. The listing shows this. |

Procedural texture over the flat file was tried — banding, rim shadow, ragged edge — and never
convinced. The generator draws thread far better than a filter imitates it.

**Do not ask for a patch.** Asking for a patch produces one: a white backing disc with a satin border,
which is a separate object sewn onto a shirt. We stitch into the garment, so where there is no thread
the buyer sees their own shirt. Enclosed smooth regions must be opened for the same reason — and
thread can be told from backdrop without knowing which is which, because stitching has grain and the
generator's white does not. That also protects a personalisation ribbon's interior, which is textured.

The personalisation token has to be hand-set onto `emb_render` as well as `print_file`. An empty
ribbon in the listing tells a buyer nothing about what they can order.

## The white halo, and why eroding does not fix it

Zeroing alpha does not change RGB. Transparent pixels keep the white the artwork was drawn on, and
then the perspective warp, the displacement resample and the ink-bleed feather all mix it back in —
a pale line hugging the design on a dark shirt. **Fill the transparent region with its nearest opaque
colour** and those blends have nothing but design colour to blend with.

Separately, cut the anti-aliased ring: measuring inward from the boundary, 37% of edge pixels are
near-white, 1% at four pixels in, none at six. Five pixels comes off a 2048px canvas for nothing.

Both fixes belong in the cutout, and both have to reach every copy of the artwork — the database row
AND the file on disk. Fixing one and rebuilding from the other produces no visible change and looks
like the fix failed.

## Kumaş rengi seçimi: girdiden kestirme, çıktıyı ölç (AÇIK KUSUR)

İlan kareleri artık ölçülen kontrasta göre seçiliyor — koyu mürekkepli tasarım açık kumaşlarda, açık
mürekkepli koyularda gösteriliyor ve okunmayan kare atlanıyor. Sabit dört koyu kare (Bay/Navy/Yam/Black)
yüzünden koyu yazılı her tasarımda dört ilan görseli okunmuyordu; bu düzeldi.

Ama ölçüt **mürekkebin ortalama parlaklığı** ve bu iki tonlu bir gravürü özetleyemiyor:
`a1-c1-v1`'de illüstrasyon 96, yazı 43, ortalama 89 → Pepper'a (127) karşı kontrast 38 çıkıp "kabul"
alıyor. Kareye bakınca illüstrasyon okunuyor, **yazı kayboluyor**. Sayı 84 kontrast diyor, göz aksini
söylüyor: yazı ince konturlu olduğu için kompozitin gölge çarpımı ve 0.94 opaklık onu orantısız kaybediyor.
Kalınlık, tondan bağımsız bir değişken.

120 üründe ölçüm: 86'sında ikinci model karesi atlanıyor, **22'sinde sınırda tutuluyor**, 12'sinde net.
Yani ~5 üründe 1'inde ikinci kare zayıf yazıyla kalıyor (kapak ve düz kareler doğru).

**Doğru çözüm** ve nedeni: eşiği yükseltmek tahmin olur. Karar, kompozit **sonrası** ölçülmeli — basılan
karede tasarımın oturduğu dikdörtgenin parlaklık aralığı (p90-p10) alınıp, kumaşın hero karesindeki aynı
ölçüme oranlanır; belirli bir oranın altına düşen kare atılır. Bütün gün işleyen kural bu: çıktıya bak,
girdiden tahmin etme.

## Nakış ürünü iki dosyadır — ve ikisini karıştırmak ilanı bozar

`print_file` dijitizasyona gider (düz renk, tam iplik hex'leri, doku YOK — doku dijitizatör tarafından
renk okunur). `emb_render` alıcının gördüğüdür (satin dolgu, iplik parlaklığı). İlan görselleri
**yalnızca `emb_render`'dan** kompozit edilir. Buradan çıkan somut hatalar:

- **Yeniden üretim `print_file`'ı sıfırlar, `emb_render`'a dokunmaz.** Nakış ürünü yeni tasarım alır ama
  ilan görselleri eski render'dan basılır — tur o ürün için sessizce hiçbir şey değiştirmez. `emb_render`
  ayrı ve ücretli bir adımdır (`make_emb_render.py`), üretim hattında hiç çağrılmaz.
- **İkisi farklı tasarım gösterebilir.** Canlı `h-emb-c3-v1`'de baskı dosyası "mama + isimler", render ise
  yazısız bir aile motifiydi. Üretici, alıcının gördüğünden başka bir şey diker.
  Çözüm: render'ı üret, düz spesifikasyonu **ondan türet** (`stage_palette_snap` ile iplik paletine
  oturt). İki ayrı üretim asla birebir aynı tasarımı vermez; türetme verir. 2056'da sonuç: tam 4 renk,
  50px altı artık ada yok.
- **Nakışta yazı dizilmez.** `produce_product` `set_type`'ı teknikten bağımsız çağırıyordu; nakış hook'ları
  slogan değil tarif cümlesidir ("a stone dice tower crowned as a guild badge"), dizilse fabrikaya
  dikilecek bir paragraf gider ve ilan görselinde de görünmez. Teknik kapısı eklendi.
- **Nakışta tişörtte yazı ancak modelin çizdiği kadar olabilir.** Başlık "isimler işlenmiş" vaat ederken
  render yazısızsa ilan tıklanır ama favorilenmez: `Mama` ilanı 949 görüntülenme / 0 favori. Kısa
  kelimeleri (`mama`, `EMMA`, `NOAH`) model temiz çiziyor — ama imlayı **her seferinde gözle doğrula**.

## Arka plan bir tercih değil, kesimin dayanağı — ANAHTAR RENK

Kesim, arka planı tahmin etmek zorunda kaldığı sürece kaybeder. Kanıt: bir konseptin promptu
"isolated on a plain solid uniform background — the background colour must not appear anywhere in the
artwork" diyor ama **rengi hiç söylemiyor**. Konu dokuz **beyaz** ördekti; model beyaz zemin seçti.
Beyaz özneyi beyaz zeminden ayıracak algoritma yoktur — ürün koyu tişörtte beyaz lekelerle çıktı ve
"kenardan taşır, kapalı cepleri koru, nötr-açık lekeleri at" gibi bütün sezgiler bu vakada çaresiz.

**Çözüm üç parçalı ve üçü birlikte gerekli:**

1. **Boru hattı rengi dayatır, konsept yazmaz.** `strip_background_talk()` konudaki tüm arka plan
   cümlelerini siler, `key_clause()` tek doğru cümleyi ekler. İkisini bırakmak çelişki olur ve çelişki
   rastgele çözülür. Renk **macenta #E6007E**, çünkü palet neonu yasaklar: tasarımda asla geçmez.
   `PROMPT_TAIL_COMMON` ve stil kuyruklarındaki "transparent background" ifadeleri de kaldırıldı —
   üretici şeffaflık çizemez, bir şey boyar; ne boyayacağını söylemezsen beyaz boyar.
2. **Anahtar renge göre kes (`key_cutout`).** Renk tasarımda hiç geçmediği için kenardan taşmaya, kapalı
   cep kurallarına, nötrlük sezgilerine gerek yok: nerede olursa olsun o renk arka plandır. Karışım
   halkası 5 px erozyonla alınır, renk dışa taşınır.
3. **Ölç ve geçirme.** `key_cutout` rapor döndürür: zemin oranı, opak oran, kalan anahtar piksel.
   Zemin %15'in altındaysa üretici rengi çizmemiştir; kalan anahtar piksel >200 ise temizlenememiştir.
   İkisinde de dosya **yayına verilmez** — üretim bir kez daha dener, sonra hata verir. Model rengi
   çoğunlukla uygular, her seferinde değil: aynı promptla bir denemede macenta çizdi, diğerinde çizmedi.

Ölçülen sonuç: ördek tasarımı zemin %54.3 / kalan 0 ile temiz çıktı; nakış render'ı (beyaz iplikli
`mama`) zemin %83.8 / kalan 0. İkisinde de koyu ve kiremit kumaşta hale ve leke yok.

**Nakış tarafı da aynıydı:** dikiş cümlesi "isolated on a plain pure white background" diyordu, yani
beyaz satin iplikli her tasarım aynı çıkmazdaydı. O da anahtar renge geçti.

## Görsel doğrulama: RGBA dosyasına bakmak yalan söyler

Bugün üç kez aynı tuzağa düştüm. Görüntüleyici alfayı yok sayıp şeffaf bölgenin **altındaki RGB'yi**
boyuyor; `convert("RGB")` ile JPEG'e kaydetmek de aynı şeyi yapıyor. Sırayla "baskı dosyasına yeşil
dikdörtgen gömülü", "kesim ışınları silememiş", "spesifikasyon ışın dolu" diye üç yanlış teşhis koydum;
üçü de yoktu.

**Kural:** çıktı kumaş renginin üzerine `alpha_composite` ile düzleştirilip bakılır, ya da ölçülür
(opak oran, opak alandaki ayrı renk sayısı, kenara değen bileşen). Ham PNG'ye bakıp "bozuk" demek yok.

## Negatif prompt bir nesneyi çağırabilir

"no sunburst, no rays, no starburst" eklemek ışınları **büyüttü**. Yasak listesi büyütmek yerine ya
pozitif tarif ("arka plan düz, dokusuz, tek renk") ya da deterministik son işlem kullan.

Buna karşılık **çelişkiyi kaldırmak** çalıştı: dikiş cümlesi "NO text" derken `--head` yazı istiyordu.
Cümle ikiye ayrılıp (`stitch_clause(with_text)`) çelişki kalkınca isim bandı dolu gri yamadan iki ince
çizgiye dönüştü — hem daha güzel hem daha az dikiş. Model çelişkiyi rastgele çözer; çelişkiyi kaldır.

## Kapak küçük resimde okunmuyorsa ilan çalışmaz

4 inçlik bir göğüs baskısı, boy model karesinde genişliğin ~%10'u. Galeri küçük resminde alıcı ne
yazdığını okuyamaz — vaat yazının kendisi olduğunda bu ölümcül. `produce_images` artık 2. sıraya
**yakın çekim** koyuyor: kırpma `placement_quad()` ile aynı yerleşim hesabından alınır (ikinci bir kopya
maths, kataloğu yanlış ölçekte yayınlayan hatanın kaynağıydı), `pad=0.22` ile tasarım kareyi doldurur.

## Yasak, konuyu yasaklamamalı

Boş kurdele/şerit sorununu çözmek için kuyruğa "no banners, no ribbons" eklemek, konusu **zaten** bayrak
olan konseptlerle ("a guild banner carrying the guild name") çelişir — düzeltmeye çalıştığın hatanın
aynısı. `style_tail(..., subject=...)` konuda banner/ribbon/crest/badge geçiyorsa yasağı düşürür.

## Yeniden üretim turunda çıkan yedi tuzak (2026-08-11)

Katalog yeni stillerle baştan üretilirken bunların hepsi 145 ürünlük turu boşa çıkaracaktı. Turu üç kez
durdurup düzelttim; her biri ancak **çıktıya bakınca** görünüyordu.

- **Kayıtlı `design_prompt` tam bir prompttur, kuyruk dahil.** `stage_seed` `c["_prompt"]`'i saklıyor,
  konu satırını değil. Üstüne yeni stil kuyruğu eklemek "dokusuz düz vektör" ile "ince tarama gravürü"nü
  aynı cümlede istemek demek; 264 promptun 128'i böyleydi. `subject_of()` konuyu ve konseptin **kendi
  paletini** korur, eski stil bloğunu atar.
- **Mekanik ayıklama her promptu kurtarmaz.** 17'sinde (çoğu nakış) konu kayboldu — biri "5mm. Isolated on
  a plain solid green background" diye ortadan başlıyordu. Dönüşemeyeni **sessizce bozmak yerine** eski
  promptla üret ve "konsept yeniden yazılmalı" diye işaretle. Hiçbir şeyin tasarımı, eski stildeki
  tasarımdan kötüdür.
- **Hook'lardaki yer tutucular doldurulmalı.** 67 hook `{SURNAME}`, `{GRADE}`, `{YEAR}` taşıyordu; olduğu
  gibi dizilse tişörtte literal `{SURNAME}` yazardı — 22 ürünün "[Name]'S DAD" ile yayınlandığı hatanın
  aynısı. İlan görselinde alıcı ne alacağını görmeli: örnek değer koy ("THE MILLER HAUNT — EST. 2026").
- **Kumaş ve yazı rengi TEK karardan çıkmalı.** Yazıyı tasarımın baskın rengine, kumaşı ortalama
  parlaklığına göre seçmek krem yazı + Ivory kumaş üretti. Gravür iki kutupludur (geniş krem dolgu +
  yoğun koyu tarama), iki istatistik zıt cevap verir. Doğrusu: kumaşı tasarımın kumaşa karşı okunuşundan
  seç, yazıyı **o kumaşın** zıddına diz. Yazı rengi bizim serbest seçimimiz, okunurluğa hizmet eder.
- **Yazı bandı tüm yazı için sınırlanır, satır başına değil.** Satır başına %10.5 vermek üç satırlık bir
  hook'ta tuvalin üçte birini yiyor ve illüstrasyonu küçültüyordu. Kazananlar tersi: görsel baskın, yazı
  altta sakin bir şerit. Satırlar bandı paylaşıp küçülür.
- **Sunucu üreticisi ile yerel parti aynı kuyruğu yer.** Deploy edilmiş producer `approved + görselsiz`
  ürünleri claim ediyor; yerel tur görselleri silince o da kapıyor ve **eski kodla** üretiyor. Toplu
  yeniden üretimden önce `ENABLE_PRODUCER=false`.
- **Font paketi kurmak yetmez, yol doğru olmalı.** Alpine'da Liberation `/usr/share/fonts/liberation` ve
  `/usr/share/fonts/liberation-sans-narrow` altındadır. PIL, yol bulunamazsa dosya adından arar — o örtük
  davranışa güvenmek kırılgan; gerçek yolu yaz ve jenerik yedeğe düşünce **uyarı bas**.

Ayrıca kataloğun en büyük tek kusuru buradan çıktı: **98 promptta** `"The design contains EXACTLY this
text, spelled letter-for-letter"` talebi vardı (33'ü canlı). Model harf çizemez, üstelik aynı promptun
kuyruğu "NO letters" diyordu — prompt kendisiyle çelişiyor, model çelişkiyi rastgele çözüyordu. Yayınlanmış
bir ilanın "kişiselleştirilmiş isim" vaadinin görselde hiç görünmemesinin sebebi buydu.

## Two production paths is the defect (this cost a whole catalogue)

Every listing image on the shop was built at twenty-eight times the calibrated fold shading, in a
square print area a third too small and offset from where the print lands, with the artwork stretched
to fill it. Nothing was wrong with the measurements — they were sitting in `pipeline/blanks/templates.json`,
which the shipping path never read. `produce_images.py` read `mockup_blanks`, and that table had never
been synced: square quads, no `print_box`, no `px_per_inch`, no `angle`, `shade` 0.85 against a
calibrated 0.03. The same file also carried its own copy of the warp-and-light maths, so a fix verified
in `mockup_composite` was not the fix that shipped.

- **One implementation.** If two files can composite an image, they will disagree, and the one you did
  not test is the one the customer sees. `scripts/sync_blank_calibration.py` keeps the table and the
  calibration file in step; run it whenever a template is measured.
- **Calibrated constants belong where the shipping path reads them.** A measurement in a file the
  deployed producer cannot open is not a measurement, it is a note.
- **Render before you publish.** `produce_images.py <id> --out DIR` writes the JPEGs and touches
  nothing else. Until this existed, the only way to see a mockup was to publish it — which is why four
  separate defects reached live listings and were found by the operator on the shop page.

## Minification is not resampling

`Image.transform` samples the source through a small kernel with no mip-mapping. A 3600px design
squeezed into a 940px quad is therefore point-sampled at roughly every fourth pixel: flat shapes only
soften, but the **halftone dot screens these designs are built from alias catastrophically** — a pink
dotted face collapses into a dark clump and the whole print reads as a muddy smear. Reduce with an
AREA filter (`resize(..., LANCZOS)`) to about the destination size *before* warping.

## Never normalise texture by standard deviation alone

`grain = (lum - ref) / max(sd, 1.0)` looks principled and blacks out prints. A cleanly lit Ivory tee
has sd ≈ 1.7 levels, so an ordinary five-level ripple becomes grain = -3; multiplied by shade 0.85 the
factor goes NEGATIVE and clips to zero — the garment's own sensor noise punches holes through the ink.
Floor the divisor at a few percent of the garment's brightness AND bound the final modulation
(-0.45 … +0.30). Ink in a deep fold loses about half its value; anything beyond that is not a shaded
print, it is a hole.

## Platform limits that decide product structure

- **Etsy allows exactly two variation properties.** Ours are Size and Colour, both used. A third
  choice — placement, technique — cannot be a variation on Etsy at all, and has to be a
  personalisation field or a separate listing.
- **Adding a Shopify option regenerates every variant id.** Fulfilment integrations map to those ids,
  so a mapped product loses its mapping. This is why embroidered and printed versions of one design
  are two linked products rather than one product with a Technique option.

## Stil katmanı renge karışırsa palet katmanı boşa gider (2026-08-12, ölçüldü)

`STYLE_TAILS["engraving"]` içinde "single ink colour" vardı ve `PALETTE_HINT` aynı promptta "two to five
colours" istiyordu. Varsayılan stil engraving olduğu için bu çelişki **290 ürünün 209'unda** vardı (74
açıkça engraving + 135 stilsiz, varsayılana düşen). Model çelişkiyi ortalıyor: reddettiğimiz solgun
görüntü buradan geliyordu.

Kural: **renk tek yerde kararlaştırılır — palet katmanında.** Stil katmanı yalnızca ORTAMI tarif eder.
Cross-hatching monokrom bir teknik değil; tek-mürekkep kalkınca aynı promptta 9 farklı ton ölçüldü
(krem ana şekil, olive önlük, pas rengi kıvılcım aksanı) ve gravür karakteri bozulmadı.

## Baskı çözünürlüğü: doğru soru "10 inçte kaç PPI" değil (2026-08-12, ölçüldü)

`key_cutout` girdiyi 2048'e küçültüyordu → 10 inçlik baskıda **205 PPI**, kendi standardımızın (300) beşte
biri altında. Katalogdaki 145 ürün böyle. Cap artık `PRINT_MAX_PX = 3000` (300 × 10 inç).

`hf` çağrısı `"resolution": "2k"` geçiyordu; `"4k"` bu modelde **2880²** döndürüyor — 4096 değil. Yani
hiçbir üretim "10 inçte 300 PPI" testini geçemez ve o eşik her üretimde uyarı basar, uyarıyı da öğrenip
görmezden geliriz. Ölçülebilir soru: **300 PPI'da kaç inç basılabilir?** 2880 px = 9.6 inç (yeterli),
2048 px = 6.8 inç (yetersiz). Taban `PRINT_MIN_IN = 9.5`. `thumbnail` yalnız küçültür, yani küçük kaynak
sahte büyütülmez — eksik kalırsa raporlanır.

## Kenara değen tasarım ölçülebilir bir ölümcül hatadır

Matte canvas'ı kenardan kenara doldurduğu için, kenar bandında opak piksel = ya kompozisyon dışarı taştı
ya matte orada bozuldu. Ham karede görünmez, tişörtte kanat ya da bot düz bir çizgide biterek görünür.
`key_cutout` raporuna `edge_contact` eklendi, kapı %2'de. Yayındaki 30 dosyada ölçüm: **0 temas** — yani
kapı mevcut işi reddetmiyor, sadece yeni hatayı yakalıyor.

## Dizgide satır aralığı: bandı doldurup band kadar ilerlemek = sıfır boşluk (2026-08-12, ölçüldü)

`typeset.compose`'un caption/small kolu her satırı `band_h` yüksekliğine kadar büyütüyor, sonra `y`'yi tam
`band_h` kadar ilerletiyordu. Sonuç: harf kutuları birbirine değiyor. `MAIN CHARACTER ENERGY` ölçümü tek
blok, 285 px (= 3 × 95). Kural: **harf yüksekliği bandın %70'i, kalan %30 boşluk**, ve satır bandın içinde
dikey ortalanır. Düzeltme sonrası: üç ayrı blok, 66 px, aralar eşit 29 px.

İkinci hata aynı döngüdeydi: `_fit` her satır için ayrı çağrılıyordu, yani kısa kelime büyüyor uzun kelime
küçülüyordu. Bir cümle tek puntoyla dizilir — blok, satırlarından hangisi en küçük puntoyu gerektiriyorsa
onu alır.

## Stil preseti KONU ya da RENK söylerse konseptle çakışır (2026-08-12)

Layer 4 sadece ortam/çizgi/doku/dönem tarif eder. Kataloğa üç ihlal sızmıştı:
- `engraving`: "single ink colour" → palet katmanının "two to five colours"'uyla çelişti, **209/290 ürün**.
- `retro`: "sun-ray or horizontal band motif" → ışın istemeyen konsepte ışın ekledi. Işınlar, yasaklayınca
  büyüyen o nesnenin ta kendisi.
- `plate`: "aged **paper** texture" → sanatın arkasına kâğıt yaması davet eder; koyu kumaşta krem plaka.

## minimal bir YERLEŞİMDİR, sadece bir stil değil

`minimal` preseti "reads clearly at three inches" diyor — sol göğüs baskısı. Kompozitör yine de 10 inç
göğüs ortasına basıyordu, otakulife serisinin yedi ürünü bu yüzden dev klipart göründü. `produce_images`
artık `design_params.placement` / `print_inches` okuyor, yokluğunda `STYLE_SPOT` stilin kendi ölçeğini
veriyor (minimal → left_chest 4"). 10 inç bir TAVAN; 3x9, 2x10, 4x4 hepsi geçerli ve PPI kapısı beyan
edilen boyuta göre ölçer.

## nano_banana_pro düşürülebilir bir alternatif değil (2026-08-12, ölçüldü)

Çizgi kalitesi gpt_image_2'den iyi, ama: (1) tasarımın çevresine **die-cut sticker taban plakası** çiziyor
— opak alanın %53.8'i soluk krem alan, Pepper/Black'te koca bir sticker olarak basılır; (2) "no sticker, no
die-cut outline, no backing shape" eklemek **hiçbir şeyi değiştirmedi** (%52.4 → %53.8); (3) anime göz
promptunu iki kez **nsfw** diye reddetti. Ayrıca `gpt_image_2` quality low ile high arasında görünür fark
yok — kalite kademesi bu işin kaldıracı değil, brief öyle.
