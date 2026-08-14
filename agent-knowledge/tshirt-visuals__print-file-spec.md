<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-visuals/references/print-file-spec.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Print file spec — the authority

Single source of truth for the print-ready artwork. Previously these specs were scattered across
`mockup-playbook.md` and `design-styles-that-sell.md`; this file supersedes both on file requirements.

The pipeline's **S2 Design** stage cannot pass its gate until every check here passes.

## File requirements

| Property | Value |
|---|---|
| Format | **PNG with transparent background** |
| Resolution | **300 DPI** |
| Dimensions | **3000 px longest side** (10 inches at 300 DPI — the garment's widest print area) |
| Color mode | RGB (POD providers convert; do not pre-convert to CMYK) |
| Background | Fully transparent — no white box, no off-white halo |
| Layers | Flattened on export; keep the layered source separately |

Never *stretch* a low-resolution source to hit 3000 px. Naively-scaled artwork prints soft and the
review will say so — use a real upscaler.

## AI-generated source — extra requirements

Designs in this project are AI-generated. `ai-design` owns that pipeline; these are the file-level
consequences.

**The DPI trap.** AI tools typically output RGB at 72–150 DPI, commonly **1024×1024 px**. At 300 DPI
that's about **3.4 inches** — for a 10-inch chest print the same file is roughly **100 DPI**. Always
compute:

```
effective DPI = pixel width ÷ print width in inches
```

Upscaling to 3000 px on the longest side is mandatory for any AI source, not optional.

**Halo check.** AI output plus automated background removal frequently leaves a faint off-white or
feathered fringe. It is nearly invisible on screen and obvious on a printed garment. Inspect the edge at
100% zoom against a dark background before approving.

**Edge hardness.** AI edges tend to be soft. Harden them — critical for DTF, which punishes soft
transitions.

**No AI-rendered text.** All type is hand-set in a commercially licensed font. AI text rendering is
unreliable, and typography-led designs are ~28% of this market. See `ai-design#text-must-not-be-ai-rendered`.

## Print method variants

The producer's print method changes what the file may contain.
✅ **Klozio's producer prints DTF** (confirmed 2026-07-30). Design to the DTF column.

| | DTF (film transfer) | DTG (direct to garment) |
|---|---|---|
| Gradients / soft transitions | **Avoid** — they band and break | Tolerated |
| Photographic detail | Poor | Acceptable |
| Edges | Must be hard and clean | Slightly more forgiving |
| Fine lines | High risk | Risky on garment-dyed cotton |
| Dark garments | Handled by the film | Needs a **white underbase** |
| Best suited to | Flat, bold, vector-style graphics | Illustrative, tonal work |

**DTF rules apply (confirmed):** flat solid colors, **no gradients or soft transitions**, hard clean
edges, bold shapes, no hairlines. Upside: **DTF prints white ink natively**, so light-on-dark designs need
no underbase and single-color light artwork on dark garments is the most reliable combination available.

## Sizing to the actual print area

The canvas is not the print size. Get the real print area from
`pod-fulfillment/references/cost-model.md` (recorded during provider setup), then size the artwork to
it. A design built for the wrong print area gets cropped by the printer.

| Placement | Position on garment | Typical print size |
|---|---|---|
| Center chest (standard) | 3–3.5" below collar | **Klozio standard: 9.5" wide max** (user directive 2026-07-31: oversized DTF reads cheap — "çok büyük DTF dandik oluyor"). 6×6" to 10×8" market range |
| Left chest / pocket | 3.5–4" from collar, 3–4" from center | 3.5×3.5" to 4×4" |
| Full front | edge to edge | up to 12×16" |
| Oversized streetwear | slightly higher on chest | 11–12" wide |
| Back print | 3–4" below collar | same widths as front |
| Sleeve | upper sleeve | 3×3" to 4×4" |

The mockup must show the design where the printer will actually place it. Placement mismatch generates
returns and bad reviews even when the print itself is perfect.

## The two survival tests

Artwork has to survive two very different reductions. Most failed designs pass one and fail the other.

**1. Thumbnail test (digital).** View the design at **300×300 px**. Can you read the message in ~2
seconds? Would you click? If the text is illegible or the graphic reads as noise, the design fails —
simplify, don't enlarge the canvas.

**2. Print test (physical).** Line weights and text strokes must be thick enough to survive DTG/DTF
printing on textured, garment-dyed fabric. Hairline strokes, tiny serifs, and fine gradients on
garment-dyed cotton break up. Rule of thumb: no stroke thinner than ~2 pt at final print size.

A design that passes both is publishable. One that passes only the thumbnail test will generate
"looks nothing like the photo" reviews.

## Contrast requirement

High contrast between ink and garment color is **non-negotiable** — it drives both tests at once.
Highest-contrast pairings: black+white, red+yellow, blue+orange. Check the design against **every**
colorway you plan to offer; a design that reads on Ivory may vanish on Pepper. If it fails on a
colorway, drop that colorway for that design rather than shipping an illegible print.

## Originality and disclosure

- **Original artwork only.** No purchased designs, templates, or clip art you didn't create. Etsy's
  handmade policy requires you be involved in the design process.
- **AI-generated artwork is allowed, but since 14 January 2026 Etsy enforces disclosure.** Three things
  are required per listing: a clear disclosure high in the description, the listing attribution set to
  **"Designed by"**, and **provable authorship** (source files, layers, generation record). Q1 2026:
  ~12,000 listings removed, ~8,500 warnings — POD sellers using AI took the largest share. Full
  procedure and the provenance archive: **`ai-design`**.
- Fonts need a commercial-use license. Free-for-personal-use fonts on a sold shirt is an infringement
  exposure the trademark check won't catch.
- The phrase itself must have cleared `etsy-tshirt-research/references/trademark-ip.md` before design
  work started.

## S2 Design gate checklist

- [ ] Transparent PNG, 300 DPI, 3000 px longest side, flattened
- [ ] **Effective DPI checked at the intended print size** (px width ÷ print inches ≥ 300)
- [ ] Sized to the recorded print area, not just the canvas
- [ ] **No halo** — edge inspected at 100% zoom against a dark background
- [ ] Edges hardened
- [ ] Conforms to the producer's print method (or the safe DTF/DTG intersection if unknown)
- [ ] Passes the 300×300 thumbnail test
- [ ] Passes the print test — no stroke under ~2 pt at final size
- [ ] High contrast verified against **every** offered colorway
- [ ] Max 3 fonts (2 better), all commercially licensed, **hand-set — no AI-rendered text**
- [ ] **Output image** checked for unintended logos/marks/likenesses (phrase search is not a gate)
- [ ] Layered source file archived alongside the export
- [ ] **`PROVENANCE.md` complete and `raw/` retained** (`ai-design/templates/provenance.md`)
- [ ] **AI disclosure line drafted + "Designed by" attribution flagged** for the listing stage

Any unchecked box stops the stage. Do not proceed to mockups with artwork that will need to be redone —
every mockup built on a rejected file is wasted work.
