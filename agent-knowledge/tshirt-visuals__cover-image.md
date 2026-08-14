<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-visuals/references/cover-image.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Cover image — the single highest-value asset

**User directive (2026-07-30): "cover img en önemli olanı. onu çok iyi yapmamız lazım."**

The cover image is the most important thing in a listing. Not the title, not the tags. It is the only
asset that decides whether a buyer ever sees the rest of the work. Budget effort accordingly: **if the
cover is mediocre, stop and redo it before touching anything else.**

This file supersedes the older "hero" guidance on styling. The Hero rule in `../SKILL.md` still governs
the *legibility* constraint; this file governs *quality and appeal*.

## What the reference bestseller actually does

From `research/competitor-teardowns/hilariousteezz-texas.md` — a listing converting at **6.19%** on a
2-month-old shop. Its cover is:

1. **A styled flat lay**, not a bare mockup. Folded shirt, front panel flat, slight overhead angle.
2. **Props that frame without covering.** Tan felt cowboy hat top-left, dried palm frond right, a fine
   silver necklace draped over the collar. Nothing crosses the print.
3. **The Comfort Colors neck label deliberately visible.** It proves the blank brand the title is selling.
4. **The colorway name in a corner**, one word, casual script — e.g. *"Espresso"*.
5. **A large, colourful, high-detail design** filling most of the chest.
6. **A warm, cohesive editorial grade.** Light neutral surface, soft daylight.

## ⛔ How mockups must be produced — standing user directive (2026-07-30)

> *"higgsfield'de her şeyi yapman gerekiyor, çıkarıp kendin bir şeyler yapmaya çalışma."*

**Generate the mockup WITH the design already on the garment, in higgsfield, using the print file as a
reference image.** Do not generate a blank shirt and composite the artwork yourself.

```
1. media_upload  -> PUT the bytes -> media_confirm      (returns media_id for final.png)
2. generate_image  model: nano_banana_pro  resolution: 2k
     medias: [{role: "image", value: "<media_id>"}]
     prompt: garment + scene + explicit PLACEMENT RULES (below)
```

**Placement rules that must appear verbatim-ish in every mockup prompt** — these exist because
hand-compositing produced inconsistent scale and one image where the artwork spilled off the shirt:

- *"PRINT THE SUPPLIED REFERENCE ARTWORK onto the shirt's front chest panel, reproduced EXACTLY as supplied
  with no changes to its colours, shapes or proportions"*
- *"centred horizontally on the folded chest panel"*
- *"a clear empty gap of fabric between the bottom of the collar ribbing and the top of the artwork"*
- *"the artwork occupies roughly 65 percent of the visible folded panel width"*
- *"fully contained inside the shirt with generous fabric margin on the left, right and bottom, and NEVER
  touches or crosses the shirt's edges, collar or the fold lines"*
- *"looks like real soft DTF ink absorbed into the cotton weave, following the fabric's subtle folds and
  shadows, matte, not a glossy sticker"*

For colorway consistency, reuse the **identical prompt** and change only the garment colour phrase.

**Why hand-compositing is banned.** It was tried and failed three ways: panel-width detection returned
different values per photo (1184 px vs 1632 px) so a "constant ratio" still produced varying scale; the
"3.25 in below collar" figure doesn't translate to a folded presentation; and the detail crop ended up
showing the artwork past the shirt edge. Photo recolouring failed separately — see `pipeline/LEARNINGS.md`.

**Narrow exception: exact-data cards.** Size charts and spec cards are generated deterministically, because
AI text rendering is unreliable and a garbled measurement actively misleads a buyer. Garment photography →
higgsfield. Exact numbers → generated text.

## Rules

### Non-negotiable
- **Design legible at 300×300.** The 2-second test. Everything else is worthless if this fails.
- **Nothing crosses the print** — no hair, hands, jewellery chain, straps, or prop overlapping the artwork.
- **2000px+, square (1:1), sRGB.** Same aspect ratio across every slot.
- **No generic bare mockup.** A shirt floating on white is the single clearest "views but no sales" cause.
- **Colours must match what actually ships.** See `../SKILL.md#color-verification`.

### Do
- **Style the scene.** 2–3 props that signal the buyer's world: for outdoors → a felt hat, dried grasses,
  a worn leather journal, a enamel mug; for pickleball → a paddle edge, a ball, a towel.
- **Show the neck label** when the blank is a selling point. Comfort Colors is in our titles, so prove it.
- **Put the colorway name in a corner**, one word, small, script or clean sans. This is a deliberate
  exception to the no-text-overlay rule — see the tension note below.
- **Grade warm and consistent.** Same light direction, same surface, same white balance shop-wide. This is
  what makes a shop read as a brand rather than a reseller.
- **Fill the frame** — shirt at ~80–85% of the image.
- **Let the fold do work.** A folded flat lay makes the print flat and fully legible, which an on-model
  shot often cannot.

### Don't
- Bare mockup on plain white
- Props overlapping the design
- Badges, starbursts, "SALE", "BESTSELLER", arrows, borders, or multi-image collages
- Mixed aspect ratios or inconsistent grade across slots
- Wrinkles or shadows falling across the print
- Colour filters that shift the garment away from the real colorway

## The text-overlay tension — resolved

Etsy's own guidance says **no text overlay on the first photo**, and our earlier rules repeated it.
Category bestsellers put the **colorway name** in a corner anyway and convert at 6%+.

**Resolution:** one word, corner-placed, small, naming the colorway is acceptable and recommended. That is
the entire allowance. It is not a licence for promotional text of any kind. If in doubt, leave it off —
the cost of omitting it is small; the cost of a cluttered cover is not.

## Flat lay vs on-model for the cover

Both work. Choose on legibility first, appeal second:

| Use a **styled flat lay** when | Use **on-model** when |
|---|---|
| The design is detailed/colourful and needs to be read | The design is simple and the *vibe* is the product |
| You want the neck label visible | Fit and drape are the selling point |
| You need total consistency across many colorways | You have one or two hero colorways |
| **Default for our catalogue** | Slot 2 or 3 |

The reference bestseller uses a styled flat lay for the cover and reserves on-model for later slots. Our
earlier default was on-model-first; for detailed colourful designs, **flat-lay-first is the better call**
because the print stays fully legible.

## Colorway coverage — cap removed

Our old rule capped colorways at ~7 "because each needs its own mockup." The reference shop runs **17+
colorways with ~12 mocked**.

**New rule: offer as many colorways as you can produce a consistent styled mockup for.** The cap is
production capacity, not an arbitrary number. Every offered colorway still needs its own image — a
colorway with no photo does not sell.

## Production checklist

- [ ] Styled flat lay (or justified on-model), 2000px+, 1:1, sRGB
- [ ] 2–3 props framing, none overlapping the print
- [ ] Neck label visible if the blank is a selling point
- [ ] Colorway name, one word, corner, small
- [ ] Design fills most of the chest, legible at 300×300
- [ ] Garment colour verified against the real colorway
- [ ] Same light, surface and grade as every other slot
- [ ] No badges, no collage, no promo text
- [ ] Print free of wrinkles and cast shadows

Any unchecked box → redo the cover. It is the highest-leverage rework in the whole pipeline.
