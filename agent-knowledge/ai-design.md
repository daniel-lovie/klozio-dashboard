<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/ai-design/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: ai-design
description: AI-generated t-shirt artwork pipeline and Etsy AI-compliance gate — turning trend/keyword research into print-ready designs via image generation, upscaling, and background removal, with the provenance archive and disclosure required by Etsy's January 2026 AI policy. Use whenever generating or preparing a design, writing image prompts, upscaling or cleaning AI output, or answering anything about AI disclosure, "Designed by" attribution, or proving original authorship.
---

# AI design pipeline

Turns an approved research brief into a print-ready file — and, just as importantly, into a **defensible
claim of authorship.** Under this project's model, designs are AI-generated from our own trend research
and then uploaded to the shop. That is exactly the profile Etsy is enforcing against hardest, so
compliance is not a footnote here; it's the first gate.

Read `../../../instructions.md` and `tshirt-visuals/references/print-file-spec.md` alongside this.

## ⚠️ Etsy AI compliance — the highest-severity risk in this project

**Etsy began enforcing generative-AI disclosure on 14 January 2026.** In Q1 2026 alone Etsy removed
roughly **12,000 listings** and issued about **8,500 warnings** for missing or incorrect disclosure — and
**POD sellers using AI artwork (t-shirts, mugs, posters, stickers, prints) took the largest share.**
Consequences reported include immediate account suspension with funds held.

AI art is **allowed**. Undisclosed or unprovable AI art is not.

### Three requirements — all mandatory, all per listing

**1. Clear disclosure in the description.**
"Clear" means a buyer scrolling the listing would reasonably notice it. **Not** buried at the bottom,
**not** in light gray, **not** hidden behind the "read more" fold. Put it high in the description.

Suggested wording (adapt, keep it plain):
> *This design was created by me using AI image-generation tools as part of my design process, then
> refined and prepared for print by hand.*

**2. Attribution set to "Designed by."**
Etsy requires the listing attribution read *Designed by*. This is not a free-standing checkbox — it's what
Etsy displays when **`who_made = i_did`** *and* **a production partner is assigned to the listing**. Both
are settable via the API (`production_partner_ids` in `createDraftListing`/`updateListing`), so no manual UI
step is needed here — but the partner must first be **registered** in Shop Manager, which is UI-only.

Disclosure text and attribution are separate requirements; one does not substitute for the other.

**3. Provable original authorship.**
Etsy's POD rules require meeting the *"Designed by a seller"* bar, which means being able to **prove you
are the original designer** — source files, design layers, or other verifiable evidence of creation.
An assertion is not evidence. See the provenance archive below.

### The provenance archive — non-negotiable

**Every design gets an archive folder.** No archive, no publish. This is the evidence that answers a
suspension appeal, and it can only be produced *at creation time* — never reconstructed afterward.

```
pipeline/<niche-slug>/designs/<design-slug>/
  final.png                 ← approved print-ready file
  PROVENANCE.md             ← from templates/provenance.md
  raw/                      ← original generation outputs, unedited
  work/                     ← upscaled / background-removed / layered intermediates
  source.<psd|ai|afdesign>  ← layered working file (especially for typography)
```

`PROVENANCE.md` records: every prompt verbatim, the tool and model, dates, which raw output was chosen
and why, every edit and upscale step, fonts used with their licenses, and the human design decisions
made. **The edit trail is the authorship claim** — "I typed a prompt" is weak; "I directed, selected,
composed, re-typeset, and prepared" is strong.

Never delete `raw/`. It is the timestamped proof the work is yours.

## Text must not be AI-rendered

The single most important craft rule here.

- AI image generators render text unreliably — malformed letters, invented glyphs, broken kerning
- **Minimalist typography is ~28% of the Etsy t-shirt market.** Most of our best niches are text-led
- Illegible or subtly-wrong text is unsellable, and worse, invisible to you until it prints

**Therefore:** set all type in a design tool with a **commercially licensed** font. Use AI for
illustration, texture, background, and ornament — never for the words. Compose the two by hand.

This also strengthens the authorship claim: hand-set typography over an AI-assisted element is
demonstrably your design, and the layered source file proves it.

## The technical chain

AI output is not a print file. The gap is bigger than it looks.

### The DPI trap
Most AI tools output RGB at 72–150 DPI, commonly **1024×1024 px**. At 300 DPI that's only about
**3.4 inches** — for a 10-inch chest print the same file is roughly **100 DPI**, which prints visibly
soft.

Always compute effective DPI at the intended print size:
```
effective DPI = pixel width ÷ print width in inches
```
Target: **3000 px on the longest side at 300 DPI** — exactly 10 inches, the widest a Comfort Colors 1717
front takes. This is the number the code enforces (`PRINT_MAX_PX` in `batch_runner.py`): it is both the
ceiling (a larger file is bytes the DTF software resamples away) and the floor (smaller prints soft).
Upscaling to reach it is mandatory, not optional.

> An earlier version of this line said "~4500 × 5400 px (12 × 18 in)", which was wrong twice: 4500 px at
> 300 DPI is **15** inches, not 12, and 15 inches does not fit the garment. Corrected 2026-08-14.

### Steps

1. **Generate** — prompt per the rules below. Produce several variants; selection is part of authorship.
2. **Select & log** — record which raw output you chose and why, in `PROVENANCE.md`.
3. **Upscale** — to 3000 px on the longest side. Never simply stretch; use a real upscaler.
4. **Remove background** — must end fully transparent. **No white fill, no colored fill, no off-white
   halo.** A halo is invisible on screen and obvious on a printed garment.
5. **Clean edges** — AI output tends to soft, feathered edges. Harden them, especially for DTF.
6. **Compose type** — hand-set, licensed fonts, layered source saved.
7. **Export** — PNG, transparent, flattened. **Never JPG.**
8. **Validate** — run the full S2 gate in `tshirt-visuals/references/print-file-spec.md`.

### Tooling available in this environment
The **higgsfield MCP** covers this chain directly: `generate_image`, `upscale_image`,
`remove_background`, `outpaint_image`. Prefer it over describing a manual workflow the user then has to
perform elsewhere. Common external equivalents: Topaz Gigapixel or Real-ESRGAN for upscale, remove.bg or
Photoshop for background.

## Placement and print size — ASK, do not assume

A big centre-chest print and a small left-chest patch are **not the same design**. They need different
detail density, different silhouettes, and they sell to different buyers. Before compiling a prompt, ask
the operator which one this is — the answer is not inferable from the concept.

Size is not fixed at 10 x 10 either. **10 inches is the CEILING**, not the target: 3 x 9, 2 x 10 and 4 x 4
are all legitimate print shapes, and forcing a square wastes most of the envelope on a tall or wide idea.
Set `design_params.placement` (`center_chest` | `left_chest`), `print_inches` (the LONGER side) and
`aspect_ratio` together — the prompt compiler reads all three, and a left-chest print is capped at 5
inches because a bigger one lands off the shoulder.

## Design direction — colourful and eye-catching is the target

**User directive (2026-07-30): "baskıları da renkli falan yapabilirsin, güzel ve ilgi çekici baskılar
lazım."** Colourful, appealing prints. Minimal one-colour line art is *a* style, not the default.

This corrects an earlier over-correction. Two constraints pushed us toward austere single-colour work:
DTF's dislike of gradients, and the no-AI-text rule. Neither actually requires minimalism.

**DTF prints full colour natively.** It handles many flat colours in one pass with no registration cost and
no colour limit — so a 12-colour flat illustration prints as easily as a 1-colour one. What DTF punishes is
**soft transitions**, not colour count. Flat + colourful is fully DTF-safe.

The reference bestseller (`research/competitor-teardowns/hilariousteezz-texas.md`, 6.19% conversion) is a
**maximalist colourful collage** — and its reviews literally say *"Cute pink shirt and colorful"* and
*"The graphic design is good quality."* Buyers are praising the colour.

### The winning shape

| Do | Avoid |
|---|---|
| Many **flat** colours — 6–15 is fine | Gradients, soft glows, airbrush fades |
| Rich warm nostalgic palettes | Muddy or washed-out palettes |
| Collage / sticker-sheet / charm-bracelet composition | Sparse compositions that read as empty at thumbnail |
| High detail that rewards a closer look | Detail so fine it breaks at 2 pt |
| Bold silhouette so it still reads at 300×300 | Detail with no overall shape |
| Identity symbols stacked together (boots, flowers, landmarks, local objects) | **Any real brand logo, product, mascot, or franchise mark** |

**The composition test:** a good colourful design has *both* a bold readable silhouette at thumbnail size
*and* detail that rewards zooming in. The bestseller's collage reads as one warm circular mass at 300×300
and resolves into a dozen objects at full size. Aim for that.

### Trademark warning, sharpened

The maximalist collage style is **the highest trademark-risk style there is** — the reference listing packs
in Dr Pepper, H-E-B, Buc-ee's and Whataburger marks with no licence. Copy the *composition*, never the
marks. Build the same density out of generic regional symbols: bluebonnets, boots, a state outline, a
skyline silhouette, local flora, food *types* rather than food *brands*.

Re-check the output image every time — see `#trademark-re-check-on-the-output-not-just-the-phrase`.

## Prompting for print

Printable and pretty are different targets. Print constraints, not aesthetic ones, drive the prompt.

**Ask for:**
- `flat vector illustration`, `bold graphic`, `screen-print style` — clean separable shapes
- **`flat solid colors, no gradients`** — this is the DTF constraint, and it is the *only* colour constraint
- `rich warm retro palette` / name 5–10 actual colours — colourful is the goal
- `sticker sheet composition` / `collage` / `charm bracelet arrangement` — the bestselling density
- `centered composition` — standard chest placement
- `hard clean edges`
- `bold overall silhouette that reads at small size` — forces thumbnail legibility
- `transparent background` or a flat single-colour background that keys out cleanly

**Avoid:**
- **Gradients, soft transitions, airbrush fades, outer glow, drop shadows** — the real DTF killers
- Photorealistic textures, watercolour washes
- Fine hairlines and delicate filigree — they break up on garment-dyed cotton
- Detail with no overall shape — busy *and* shapeless fails the thumbnail test
- **Any text**
- **Any brand name, logo, mascot, franchise, team or celebrity reference in the prompt**

**Print method is confirmed DTF.** DTF prints **full colour natively with no colour limit** — so use
colour freely. The constraint is *flatness*, not palette size. "Limited palette" was earlier guidance
written while the method was unknown; it no longer applies.

## Trademark re-check — on the output, not just the phrase

No phrase search is run (standing user decision 2026-07-30). What matters here is the **image**: AI can
independently reproduce recognizable logos, brand marks, character likenesses, distinctive trade dress, or a
living artist's signature style. This visual check costs nothing and stays.

So after generation, before publishing:

1. Look at the actual image for anything recognizable — logos, mascots, characters, brand shapes
2. If a real brand, team, or franchise is even faintly evoked, regenerate. Don't negotiate with it
4. Never prompt in the style of a named living artist
5. Never prompt with a brand, character, franchise, or team name

An AI-produced infringement is still our infringement.

## Gate — before the design leaves S2

- [ ] `PROVENANCE.md` complete: prompts verbatim, tool/model, dates, selection rationale, edit trail
- [ ] `raw/` retained, unedited
- [ ] Layered source file saved
- [ ] All type hand-set in a commercially licensed font — **no AI-rendered text**
- [ ] Font licenses recorded
- [ ] 3000 px longest side, 300 DPI, effective DPI checked at the intended print size
- [ ] Fully transparent background — no fill, no halo
- [ ] Edges hardened
- [ ] Passes the 300×300 thumbnail test
- [ ] Passes the print test (no stroke under ~2 pt at final size)
- [ ] Contrast verified against **every** offered colorway
- [ ] Output visually checked for unintended trademarks
- [ ] Output image checked for logos/marks/likenesses (phrase search is **not** a gate — user decision 2026-07-30)
- [ ] **AI disclosure line drafted for the description** (goes high, plainly worded)
- [ ] **`who_made=i_did` + production partner assignment flagged for the listing stage** (this is what
      produces the "Designed by" attribution)

Any unchecked box stops the stage. The compliance items are not softer than the technical ones — they
carry the higher penalty.

## References

| File | Read when |
|---|---|
| `templates/provenance.md` | Every design. Copy into its archive folder at generation time |
| `tshirt-visuals/references/print-file-spec.md` | File requirements and the full S2 gate |
| `tshirt-visuals/references/design-styles-that-sell.md` | Style direction, color psychology, typography |
| `etsy-tshirt-research/references/trademark-ip.md` | Any recognizable element in the output |
