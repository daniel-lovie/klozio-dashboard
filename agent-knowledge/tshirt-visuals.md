<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-visuals/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: tshirt-visuals
description: Etsy t-shirt listing visuals playbook distilled from best-selling shops — mockup selection, image carousel sequencing, thumbnail optimization, design styles that sell, color psychology, typography, and AI mockup workflows. Use when creating or reviewing t-shirt listing images/mockups, planning a photo carousel, generating mockup briefs, choosing shirt colors or design styles for a t-shirt listing, or auditing why a t-shirt listing gets views but no sales.
---

# T-Shirt Visuals (Etsy POD)

Playbook for creating t-shirt listing images that convert, based on analysis of best-selling Etsy t-shirt shops (including a CA$1.4M shop with 2.9% conversion), Etsy's official Seller Handbook, and top-seller consensus.

## Core Principles (memorize these)

1. **The thumbnail sells before the title does.** Buyers decide in ~0.5 seconds. Design must be readable at 300x300px on mobile. Always run the 2-second test: view the thumbnail at small size — can you tell what the design says? Would you click?
2. **Clarity beats realism.** Clean shirt shape, clear design area, quiet background, no clutter. Mobile-first.
3. **Consistency beats variety.** Pick 2-3 mockup styles/angles/models and repeat across ALL listings. A random mockup mix looks amateur; a consistent one looks like a brand.
4. **Every color needs its own mockup.** No photo of a color = no sales of that color. Label each color mockup with the color name in a corner.
5. **No negatives in photos.** Never put disclaimers ("colors may vary", "no refunds") in images. Photos stay 100% positive; caveats go in the description.
6. **Generic default mockups kill conversion.** "Tons of views, no sales" is the classic symptom of obvious stock POD mockups. Differentiate: custom scenes, consistent virtual model, or own photos of samples.

## Workflows

### A. Plan a listing image carousel (new t-shirt listing)

Use this proven 10-slot sequence (Etsy allows up to 20 images; 8-10 purposeful ones beat 20 repetitive ones):

| Slot | Image | Key rules |
|------|-------|-----------|
| 1 | **Hero: on-model / lifestyle mockup** (see Hero rule below) | Design centered so it survives BOTH 4:3 and 1:1 crops; no wrinkles, nothing blocking design; no text overlay |
| 2-4 | Color variations | One mockup per color, color name labeled in corner. **No cap on colorway count** — offer as many as you can mock up consistently (the old ~7 cap is withdrawn; the reference bestseller runs 17+) |
| 5-6 | On-model / lifestyle | Model faces forward, design front and center; scene matches target buyer aesthetic |
| 7 | Size chart | S-3XL with length/width in inches (US market) |
| 8 | Fit guide | Same model wearing each size side by side (shows regular vs oversized fit; cuts returns) |
| 9 | Quality/refund card | "Love it or your money back", "We'll make any print issue right" |
| 10 | Benefits/review card | "Prints & ships from the US", "Soft garment-dyed cotton", or 5-star review screenshot |

➡️ **The cover image has its own playbook and it is the priority asset:
`references/cover-image.md`.** Read it before producing slot 1. Standing user directive: a mediocre cover
means stop and redo. The rule below governs *legibility*; that file governs *quality and appeal*, and for
detailed colourful designs it changes the default to **styled flat-lay first**.

**Hero rule (legibility constraint):**

Slot 1 is the search photo, so it must do two jobs at once: show the design legibly *and* give lifestyle
context. Order of preference:

1. **On-model / lifestyle mockup — default.** Lifestyle mockups outperform basic flat mockups on both
   CTR and conversion (reported ~27% higher CTR / ~15% more conversions in seller testing; treat as
   directional, not exact). Requirement: the design must be large, unobstructed, and pass the 300×300
   thumbnail test *in that photo*.
2. **Clean flat lay — fallback.** If no on-model shot can deliver a legible design at thumbnail size,
   use a folded flat lay in slot 1 and move on-model to slot 2. **A legible flat lay beats an
   illegible lifestyle shot** — legibility is the constraint, lifestyle is the preference.

Never leave slot 1 as a generic stock POD mockup; that's the classic "tons of views, no sales" cause.

Then read `references/image-specs-and-carousel.md` for full technical specs, alt text formulas, and the video strategy.

### B. Choose mockup type and generate mockup briefs

Decide flat lay vs on-model vs ghost mannequin using the decision table in `references/mockup-playbook.md`, then write the mockup brief (or AI image generation prompt). Quick defaults: **styled flat lay for the cover when the design is detailed/colourful** (see `references/cover-image.md`), on-model when the vibe is the product; folded flat lay for color variants and design detail, 1-2 additional on-model shots for fit context; women's tees need on-model to sell; use the SAME model/setting across the shop. Prefer the garment-dyed Comfort Colors look (Ivory, Moss, Blue Jean, Berry, Butter, Pepper) over flat generic Gildan-style mockups.

### C. Choose design style, colors, and typography for a new design

Read `references/design-styles-that-sell.md`. Quick rules: simple + bold + legible at thumbnail size always wins; retro/vintage (groovy wavy text, distressed textures, 70s sunsets) and niche-interest designs are the top sellers; high contrast between ink and shirt color is mandatory; max 3 fonts; pair one bold display font with one clean support font.

### D. Audit an underperforming listing's visuals

Symptom-based diagnosis:
- **Low clicks (bad CTR)** → thumbnail fails the 2-second test: design too small/off-center, cluttered background, text overlay noise, or fails the square crop. Fix slot 1 first.
- **Clicks but no sales** → mockups look fake/generic, missing color mockups, no on-model shot, no size chart/fit guide, or disclaimers in photos. Rebuild carousel per Workflow A.
- Check technical basics: first photo 2000px+, sRGB, under 1MB, horizontal or square orientation, all photos same aspect ratio.

### E. Generate mockups with AI

When generating mockup images (via image generation tools), follow the prompt patterns and color-calibration warnings in `references/mockup-playbook.md`. Non-negotiables: realistic fabric texture and natural shadows (buyers detect synthetic perfection), design placement matching real print placement (center chest 3-3.5" below collar, ~8x8" for standard prints), and disclosure of AI use in the listing description per Etsy policy.

## Reference Files

- **`references/cover-image.md` — the cover image playbook. THE priority asset. Read first for slot 1.**
- `references/print-file-spec.md` — print file requirements, the authority on file specs and the S2 gate.
- `references/image-specs-and-carousel.md` — Etsy technical image requirements, thumbnail optimization rules (80% rule, 70% no-text rule), full carousel strategy, trust cards, alt text, video strategy. Read for Workflows A and D.
- `references/mockup-playbook.md` — mockup type decision table, flat lay vs on-model, Comfort Colors/garment-dyed meta, AI mockup tools and workflow, design placement measurements. Read for Workflows B and E.
- `references/design-styles-that-sell.md` — bestselling design styles by niche, color psychology, typography guide, trend directions. Read for Workflow C.
