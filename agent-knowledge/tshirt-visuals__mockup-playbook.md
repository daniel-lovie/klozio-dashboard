<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-visuals/references/mockup-playbook.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Mockup Playbook: Types, Tools, and AI Workflows

## Mockup Type Decision Table

| Criteria | Flat Lay | On-Model | Ghost Mannequin |
|----------|----------|----------|-----------------|
| What it shows | The design itself, clean | Fit, drape, movement, emotion | 3D garment shape without a model |
| Cost / speed | Cheapest, fastest | Most expensive, slowest | Middle |
| Best used for | Hero thumbnail, color variants, detail crops | Slots 5-6, ads, lifestyle context | Fit context when no model is available |
| Conversion role | Wins the click (design-focused) | Closes the sale (fit + emotion) | Adequate substitute for on-model |

Seller consensus rules: women's t-shirts need an on-model shot to sell; men's shirts sell on model or as a "floating" shirt; a design-led POD listing should lead with a clean folded flat lay and always include 1-2 on-model shots in the carousel. The hybrid approach is the default, never flat-lay-only.

## Consistency Meta

Pick 2-3 mockup styles (e.g., one flat-lay scene + one model + one hanging shot) and reuse them across every listing. Use the same model, same setting, same lighting shop-wide — this is what makes a shop look like a brand instead of a reseller. Avoid the exact stock model mockups every other shop uses; buyers recognize them and the shop reads as generic.

## The Comfort Colors / Garment-Dyed Meta

Comfort Colors (especially the 1717, garment-dyed 100% ring-spun cotton) dominates Etsy t-shirt bestsellers to the point that "comfort colors" is itself a high-volume search keyword. The muted, washed, vintage palette photographs better than flat generic blanks and signals premium quality.

- Bestselling colorways to feature in mockups: Ivory, Moss, Blue Jean, Berry, Butter, Pepper, Chalky Mint.
- Mockups must show the garment-dyed washed texture; a flat, plasticky Gildan-style mockup reads as cheap.
- Same-look alternatives if needed: LA Apparel 1801GD, Lane Seven LS16005, American Apparel 1301GD, AS Colour 5082/4082.

## Design Placement (must match the real print)

Mockups must show the design where the printer will actually place it, or reviews suffer.

| Placement | Position | Typical print size |
|-----------|----------|--------------------|
| Center chest (standard) | 3-3.5" below collar | 6x6" to 10x8"; 8x8" most common |
| Left chest / pocket | 3.5-4" from collar, 3-4" from center | 3.5x3.5" to 4x4" |
| Full front | Edge to edge | Up to 12x16" |
| Oversized streetwear | Slightly higher on chest | 11-12" wide |
| Back print | 3-4" below collar | Same widths as front |
| Sleeve | On upper sleeve | 3x3" to 4x4" |

Design files for print: transparent PNG, 300 DPI, typically 4500x5400px.

## Mockup Production Workflows

**Fast path (testing new designs):** design → transparent PNG → mockup generator (Placeit for casual tees, Canva/smartmockups for beginners, Creative Fabrica AI for vintage looks, Dynamic Mockups for batch) → Etsy. Use generator output for volume testing; upgrade proven sellers to polished hero mockups (premium PSD or custom photos).

**Differentiated path (proven designs / brand building):** shoot ONE session with blank shirts (the S0 sample from the producer, or blanks bought directly), then digitally apply each new design to your own photos with Dynamic Mockups or similar. This produces unique on-model mockups at scale — the single highest-impact upgrade for a shop stuck at "views but no sales." Even a few phone-shot lifestyle photos of a real sample measurably lift conversion.

**Virtual model path:** FASHN AI-style virtual try-on puts any garment on a consistent virtual model — same face and setting across the whole shop.

## AI Mockup Generation Rules

AI-generated imagery is allowed on Etsy when made from your own prompts, but AI use must be disclosed in the listing description, and the image must accurately represent the physical product.

Prompt requirements for photorealistic t-shirt mockups:
- Specify the garment honestly: "heavyweight garment-dyed cotton t-shirt in moss green, slightly faded washed texture, relaxed boxy fit" (match the actual blank being sold).
- Demand realism markers: natural window lighting, soft shadows, visible fabric weave and drape, subtle wrinkles at seams only — never a perfectly smooth synthetic surface. Buyers detect and distrust "too perfect."
- Composition: design area unobstructed (no hair, hands, jewelry, straps across the print), model facing forward, shirt filling ~80% of frame, quiet neutral background.
- Keep one consistent model/setting description saved and reuse it verbatim for every listing.

Critical color-calibration warning: the mockup color must match what actually ships. Color mismatch is the top cause of negative POD reviews. **Under this project's manual-producer model there is no POD platform swatch library** — verify against the **blank manufacturer's** official swatches (e.g. Comfort Colors' own color chart, stored in `assets/swatches/`) *and* the physical sample, since manufacturer swatches and dye lots both drift. Full procedure: `pod-fulfillment/SKILL.md#color-verification`. Never apply filters that shift garment color.

Once real orders ship, replace or supplement AI images with customer photos and review screenshots — real imagery in slots 9-10 raises trust that pure AI sets cannot.
