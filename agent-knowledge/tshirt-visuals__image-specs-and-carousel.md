<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-visuals/references/image-specs-and-carousel.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Image Specs, Thumbnail Rules, and Carousel Strategy

## Etsy Technical Requirements (official)

| Spec | Requirement |
|------|-------------|
| File types | .jpg, .png, .gif, .svg, .heic — NO animated GIFs; transparent PNG areas render BLACK |
| Resolution | 2000px+ on both dimensions recommended; 3000x2250 (4:3) is the working standard; first photo minimum 635px wide or it ranks lower |
| File size | Keep under 1MB (files over 1MB may fail to upload); JPEG for photos |
| Color profile | sRGB only — CMYK or wrong profiles shift colors on site |
| Orientation | First photo horizontal (landscape) or square; first photo dictates crop shape of ALL following photos — keep every photo the same aspect ratio |
| Framing | Shoot/compose with generous negative space; keep the design centered so it survives square, portrait, and landscape crops; verify with Etsy's thumbnail adjustment tool |

Etsy compresses images for mobile, so always start from the highest resolution. A CA$1.4M shop's exact working spec: 2700x2025px (4:3), with rulers used in Canva to verify the design is fully visible in both the 4:3 rectangle and the center 1:1 square.

## Thumbnail Optimization Rules (from $1M+ sellers)

The thumbnail has roughly half a second to earn a click, and CTR feeds Etsy's ranking algorithm, so fix photos before adding more listings.

1. **80% rule** — the shirt must fill at least 80% of the frame. Zoom in; do not let lifestyle context shrink the product.
2. **70% no-text rule** — about 70% of a shop's thumbnails should carry no text overlay at all. Clean reads as premium. Add text only when it communicates something the image cannot (free personalization, fast shipping), never to caption the obvious ("blue shirt").
3. When text is used: readable at small size, modern fonts (Montserrat, Open Sans, Quicksand, Playfair — never default Arial/Anton), background shapes sized to the message.
4. Neutral background, natural light, simple composition; identical composition style across the whole shop equals visual branding.
5. **2-second test**: view at 300x300px for two seconds. If what the design says is not instantly clear, redo it.
6. Warm background tones (cream, amber, terracotta) signal handmade/cozy; cool tones (white, gray, light blue) signal clean/modern. Match to the shop's positioning.
7. No watermarks, no heavy filters that misrepresent the true shirt color.

## Full Carousel Strategy (10 slots)

Listings with 5+ photos get about 2.3x more clicks; use at least 8-10 purposeful images. The proven bestseller sequence:

| Slot | Content | Execution details |
|------|---------|-------------------|
| 1 | Hero mockup | Folded flat lay or forward-facing model; no wrinkles, no hair/jewelry blocking the print, design never cut off; centered for both crops; no text overlay |
| 2-4 | Color variation mockups | One dedicated mockup per offered color; color name text label in a top corner ("Ivory", "Moss") so the buyer connects photo to dropdown; **no cap on colorway count** — the ~7 "decision fatigue" limit is withdrawn; the reference bestseller offers 17+ with ~12 mocked. Constraint is mockup production capacity |
| 5-6 | On-model shots | Model facing forward, design front and center; setting matches the target buyer's aesthetic; shows drape and fit that flat lays cannot |
| 7 | Size chart | Table graphic: S-3XL with garment length and width in inches; US sizing |
| 8 | Visual fit guide | The SAME model wearing every size side by side (S → XL) — communicates regular vs oversized fit and measurably cuts returns |
| 9 | Quality guarantee / refund card | "Love it or your money back — free refunds and exchanges", "Printing issue? Send a photo and we'll make it right" |
| 10 | Benefits or review card | "Prints & ships from the US • High-quality DTF printing • Carefully selected soft garments • Quick delivery", or a screenshot of a 5-star review praising softness/print/shipping |

The "no negatives" rule applies to every slot: disclaimers like "color may not be accurate on your screen" or "no refunds" never appear in images — they suppress conversion. Put unavoidable caveats in the description.

If more slots are available (Etsy allows up to 20), add: design close-up showing print texture, back/side view, packaging shot, styled group shot cross-selling other designs from the shop, and a discount/email-list CTA card as the final image.

## Alt Text

Etsy's algorithm reads alt text and Google Images indexes it. Formula: [material] + [what it is] + [distinguishing details] + [what this photo shows]. Keep each 100-150 characters (max 250) and unique per photo. Example: "Garment-dyed cotton comfort colors t-shirt with retro groovy 'Dog Mama' design, folded flat lay showing moss green colorway."

## Video Strategy

Etsy auto-plays the listing video on hover in search results, so the video is effectively a second thumbnail.

- DO: build a slideshow of the color mockups in Canva (1-1.5 seconds per slide), export MP4, 5-15 seconds, loop-friendly. The hovering buyer sees the design cycling through every color.
- DO NOT: use a size chart or info card as the video — on hover it hides the design and causes scroll-past.

## Buyer-Psychology Ordering Logic

The carousel mirrors an in-store experience: see it from across the room (hero), check the color options (variations), imagine wearing it (on-model), check whether it fits (size chart + fit guide), and remove the last doubts (guarantee + social proof). Each image must answer a different buyer question; two images answering the same question waste a slot.
