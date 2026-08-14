<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/ai-design/references/prompt-engineering.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Prompt engineering for print designs and mockups — the framework

Written 2026-07-31 for the August plan (100 designs, 200 listings). This file is the reasoning; the
generated prompts live in `output/deep/listings.json` (`design_prompt`, `mockup_prompt` fields) and in the
dashboard. Grounded in: `ai-design/SKILL.md`, `tshirt-visuals/references/{print-file-spec,cover-image,
mockup-playbook,image-specs-and-carousel}.md`, `pipeline/LEARNINGS.md`, and higgsfield `models_explore`
output (checked live 2026-07-31).

The core idea: **a design prompt and a mockup prompt are different instruments solving different physics
problems.** The design prompt fights the *printer* (flatness, edges, contrast, text integrity). The mockup
prompt fights the *thumbnail* (2-second legibility, placement fidelity, brand consistency). Mixing the two
vocabularies produces files that fail both.

---

## Part 1 — Design (print file) prompts

### Model choice, verified against the live catalog

| Design type | Model | Why |
|---|---|---|
| **Type-led** (the hook IS the design: badges, rosters, forms, signs) | `recraft_v4_1`, `model_type: "vector"` | Built for typography/logos/SVG-like flats. Two killer parameters: **`colors` (up to 10 exact hex)** — the DTF flat-palette constraint enforced by parameter, not by hoping the prompt is obeyed — and **`background_color`** for a controlled solid keying background |
| **Illustration-led** (engraving, halftone, storybook, collage) | `nano_banana_pro` | Best illustration quality + reliable text; **native 4k** (~4096 px ⇒ ~410 DPI at a 10″ print — kills the DPI trap at generation time). `resolution: "4k"`, aspect `1:1` |
| Fallback for stubborn text errors | `openai_hazel` | "Best text rendering" per catalog; use when a hook keeps garbling after 2 regenerations |

### The seven layers of a design prompt

Every design prompt is assembled in this order. Omitting a layer is how past failures happened.

1. **Medium declaration** — `"flat vector screen-print t-shirt graphic"` / `"vintage engraving-style
   print"`. Never "photo", never "render". This single phrase moves the model out of photorealism.
2. **Exact text block** — the hook, in double quotes, with an explicit instruction:
   `The design contains EXACTLY this text, spelled letter-for-letter: "I COULD BE MEANER". No other words,
   no extra letters.` Type style described separately (see text rules below).
3. **Subject & composition** — what is drawn, arranged how, from the concept's visual idea. Always ends
   with `centered composition, bold overall silhouette that reads at small size` (the 300×300 thumbnail
   test, encoded).
4. **Palette constraint** — named colours + `flat solid colors only, no gradients, no soft shading, no
   glow, no drop shadows` (the DTF constraint — flatness, NOT palette size; DTF prints unlimited flat
   colours natively). On Recraft, ALSO pass the hex palette as the `colors` parameter.
5. **Edge & texture language** — `hard clean edges, screen-print separations`. Distress is allowed but
   must be *coarse*: `coarse halftone`, `chipped-paint texture` — never `faded`, `soft`, `airbrushed`.
6. **Background for removal** — see below.
7. **Negative space & exclusion list** — `no t-shirt, no mockup, no fabric, no frame, no watermark, no
   brand logos, no gradients`. The model must draw the ART, not a picture of a shirt wearing the art.

### The Recraft SVG pipeline — verified live 2026-07-31, and it's shorter

`recraft_v4_1 vector` returns a **true SVG** (134 paths in the A5 test; text converted to paths, no font
dependency). This changes the type-led pipeline entirely:

1. The background is the SVG's first full-canvas path — **delete it programmatically** → true
   transparency. `remove_background`, fringe-clean and the halo risk **do not exist on this path.**
2. Rasterise at any size (`rsvg-convert -w 4500`) — infinite-resolution source, the DPI trap is dead.
3. `colors` is genuinely deterministic (A5 test: exactly the 3 requested hex values, nothing else).
4. **`background_color` is NOT reliable** — the test ignored it and filled with a palette colour. Doesn't
   matter: the bg path gets stripped regardless. Keep the palette 3–6 colours so the bg is identifiable.
5. Text result: "DAD OF / EMMA / NOAH / MIA" letter-perfect **first try** — vs 1-in-2 garble on the nano
   illustration path. Type-led designs should expect ~1 generation each, not ~2.

So the two archetype chains are:
- **Recraft (type-led):** generate → strip bg path → rasterise 4500px → S2 gate → mockups
- **nano (illustration):** generate 4k → remove_background → fringe/alpha fix → S2 gate → mockups

### Background strategy — learned from the 493k-pixel halo (nano path only)

Never ask the model for a transparent background (models fake it, often literally drawing a checkerboard).
Generate on a **solid flat background in a colour absent from the artwork palette**, then
`remove_background`, then fringe-clean + alpha-binarize (the halo fix from `pipeline/LEARNINGS.md`).

- Dark artwork → background `#F4F4F0` (near-white)
- Light/cream artwork → background `#1A6B54` (deep green key)
- On Recraft: set it via `background_color` — deterministic. On nano banana: state it in the prompt:
  `isolated on a plain solid uniform [colour] background, no shadow under the artwork, no vignette`.

### Text rules — the supersession, stated openly

`ai-design/SKILL.md` says "no AI-rendered text, hand-set type." That rule is **superseded here**, for two
documented reasons: (1) the later standing user directive — *"higgsfield'de her şeyi yapman gerekiyor"*
(2026-07-30) — bans hand-compositing outright; (2) the rule predates text-capable models; the catalog now
carries models whose primary tag is `text-rendering`. The *risk* the rule guarded against is real, so it
converts into a **gate instead of a ban**:

- Exact text always in **double quotes**, prefixed `EXACTLY this text, letter-for-letter`. Diegetic
  micro-text (a word on an object *inside* the drawing, e.g. a snack bag reading "SNACK") is ALLOWED —
  the live test showed it improves the joke — but it passes the same letter-for-letter QA
- Keep per-design text short. Every extra word is another chance to garble; hooks over ~10 words get
  `openai_hazel` consideration by default
- **QA gate: character-by-character comparison of rendered text vs the hook. One wrong glyph = regenerate.
  Never ship "close".** A subtly wrong letter is invisible until it prints
- Describe type by *style vocabulary*, never by font name (fonts are licensed objects; styles are not):
  `collegiate varsity block`, `1950s horror movie poster lettering`, `typewriter monospace`,
  `hand-painted sign script`, `ransom-note cut-paper letters`

### Personalised designs are prompt TEMPLATES — this is the per-order engine

30 concepts (60 listings) carry `{NAME}/{NAMES}/{YEAR}...` placeholders. Their design prompts contain a
literal sample (`"DAD OF" then stacked names "EMMA", "NOAH", "MIA"`) plus a `[PERSONALIZATION]` marker in
the stored template. Per order: substitute the buyer's text, regenerate, QA the text gate, send to
producer. The prompt template IS the fulfilment machinery — which is why it must also solve **the roster
problem**: every roster-style prompt specifies layout behaviour for 1–6 names
(`names stacked vertically, centered, font size shrinking as the list grows, list never wider than the
arched title above it`). A template that only works for three names is a template that breaks on order #1.

### Palette ↔ garment logic

One print file serves 22 shirt colours; it cannot read on all of them equally. Each design declares a
`garment_base` (dark / light) and the palette is built for that base **with a keyline**: light-base designs
get artwork with dark outlines; dark-base designs get light/cream artwork (DTF prints white natively — no
underbase needed; light-on-dark is the single most reliable DTF combination). The S2 gate's
contrast-per-colorway check then decides which colorways the design actually ships on.

---

## Part 2 — Mockup prompts

### The non-negotiables (all from documented failures or directives)

1. **The mockup is generated WITH the design on the garment** — `nano_banana_pro`, print file uploaded via
   `media_upload`/`media_confirm`, passed as reference image. Hand-compositing is banned (tried, failed
   three ways: inconsistent panel-width detection, collar-offset broke on folded presentation, artwork
   crossed the shirt edge).
2. **The placement block appears verbatim in every mockup prompt** (from `cover-image.md`):
   - *PRINT THE SUPPLIED REFERENCE ARTWORK onto the shirt's front chest panel, reproduced EXACTLY as
     supplied with no changes to its colours, shapes or proportions*
   - *centred horizontally on the folded chest panel*
   - *a clear empty gap of fabric between the bottom of the collar ribbing and the top of the artwork*
   - *the artwork occupies roughly 65 percent of the visible folded panel width*
   - *fully contained inside the shirt with generous fabric margin on the left, right and bottom, and
     NEVER touches or crosses the shirt's edges, collar or the fold lines*
   - *looks like real soft DTF ink absorbed into the cotton weave, following the fabric's subtle folds and
     shadows, matte, not a glossy sticker*
3. **Cover = styled flat lay**, not bare mockup, not on-model (flat-lay-first for detailed designs — the
   print stays legible). Folded shirt, slight overhead angle, shirt at ~80–85% of frame, 1:1, 2k.
4. **Garment honesty**: `heavyweight garment-dyed 100% ring-spun cotton, Comfort Colors 1717, visibly
   soft washed texture, relaxed drape, ribbed collar` + the **neck label visible** (the blank brand is in
   every title — prove it). Never plasticky-smooth.
5. **Props frame, never cross the print.** 2–3 props from the slot's scene kit; explicit clause:
   `no prop, shadow or fold crosses or touches the printed artwork`.
6. **Corner colorway word**: `the word "Pepper" hand-written small in one corner of the scene` — the one
   allowed text overlay.
7. **Consistency = brand.** One scene kit per TREE (not per concept), reused verbatim; only the garment
   colour phrase and the artwork reference change between colorways of the same design. Same surface, same
   light direction (`soft window light from the left`), same warm grade shop-wide.

### Scene kits (one per tree — this is the shop's visual identity)

| Tree | Surface | Props (2–3, never over the print) | Grade |
|---|---|---|---|
| fandom · book | worn oak desk | stack of weathered paperbacks, brass reading lamp glowing warm, cotton tote | warm library amber |
| original humour · animal | washed linen cloth, pale oat | enamel mug, small potted succulent, wooden hanger corner | bright playful daylight |
| humour · esoteric (cryptid) | dark green felt | vintage brass compass, folded topo map, pine sprig | moody forest, soft |
| family / personalised | light maple tabletop | kraft gift box with cotton ribbon, dried wheat stems | warm golden hour |
| seasonal Halloween | charcoal linen | mini pumpkin, black taper candle (unlit), eucalyptus | dusky amber |
| seasonal Christmas | cream knit blanket | pine sprig with tiny brass bells, cinnamon sticks | cozy warm tungsten |
| seasonal teacher | light birch desk | two yellow pencils, small apple, paper clip chain | clean bright morning |
| nature / cottagecore | weathered white wood | pressed-flower frame corner, ceramic vase with dried grasses | soft pastel morning |
| aesthetic western | tan suede | felt cowboy hat top corner, braided leather cord | sun-bleached warm |

### Hero colorway per design — decided AFTER generation (test lesson, 2026-07-31)

The mockup shows ONE colorway (buyers pick the rest from the chart image, position 3). The pre-assigned
hero is only a *starting guess*: the live A3-c1 test produced cream-headline artwork that its assigned
Ivory hero would have swallowed. **Rule: after the design is generated, check the rendered artwork's
dominant lightness against the hero; reassign before mockups.** Cream/light art → Pepper. Dark-outline
art → Ivory/Butter/Chambray per slot.

### The 3-mockup set per product (user decision, 2026-07-31)

| # | shot | role |
|---|---|---|
| 1 | **Cover — styled flat lay** (scene kit, props, neck label, corner word) | wins the click |
| 2 | **Hanging** — natural wood hanger, warm plaster wall, full shirt visible | shows the whole garment + full artwork |
| 3 | **On-model** — front-facing, cropped below the chin, hair away from the chest | fit + drape, closes the sale |

Then the colour chart (position 4) and the rest of the carousel. The on-model crop (below the chin) is
deliberate: one consistent anonymous model shop-wide, no face-generation artifacts, nothing crossing the
print. Two verbatim clauses added after the live test: cover prompts get *"the ENTIRE artwork is visible
above the fold"* (the test's only placement violation), and hanging/model prompts get *"the ENTIRE artwork
fully visible, nothing overlapping it"*.

### Anatomy of a full mockup prompt

```
[SCENE] Editorial product photography, styled flat lay on <surface>, <props>, <grade>,
soft window light from the left, shot from a slight overhead angle, 85mm look.
[GARMENT] A <colorway> Comfort Colors 1717 heavyweight garment-dyed 100% ring-spun cotton
t-shirt, visibly soft washed texture, relaxed drape, ribbed collar, neatly folded with the
front chest panel flat and fully visible, Comfort Colors neck label visible inside the collar.
[PLACEMENT] <the six verbatim placement rules>
[OVERLAY] The word "<colorway>" hand-written small and unobtrusive in the lower right corner.
[EXCLUSIONS] No person, no hands, no brand logos other than the garment's own neck label,
no props or shadows touching the printed artwork, no text anywhere else in the scene.
```

---

## Part 3 — Pipeline order & QA hooks

Per design: `generate (design) → text QA (char-by-char) → visual IP QA → upscale if <300 eff. DPI →
remove_background → fringe/alpha fix → S2 gate → media_upload → mockup generate (cover + details) →
placement QA (artwork inside panel? props clear?) → carousel assembly` (cover, detail crop, colour chart
at position 3, size card, trust card).

Prompts are stored per listing in the DB (`design_prompt`, `mockup_prompt`, `design_model`,
`hero_colorway`) and rendered in `/plan` — the user approves the *prompt*, not just the idea. Every prompt
goes verbatim into `PROVENANCE.md` at generation time.
