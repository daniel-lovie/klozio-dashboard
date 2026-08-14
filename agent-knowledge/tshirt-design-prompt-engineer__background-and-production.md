<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-design-prompt-engineer/references/background-and-production.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Background and Production System

This document defines how to ensure generated artwork is technically ready for Print-on-Demand (POD) production.

## The Two Artifacts

Never confuse these two distinct image types:
1. **Printable artwork:** True transparent alpha (after validation), clean edges, correct pixel dimensions, optimized for garment contrast. This is the final deliverable.
2. **Generation working image:** The raw output from the model. May have verified alpha or a uniform removable matte. Optimized for model control and extraction.

## Fixed Print Envelope: Maximum 10 × 10 Inches

The final isolated artwork must fit inside a **maximum 10-inch width × 10-inch height bounding box**. The outer silhouette may be any shape: organic, irregular, asymmetrical, circular, square, wide, or tall. Do not add a border, badge, square, or circle merely to fill the available area.

At 300 PPI, 10 inches equals 3000 pixels. Therefore, neither final pixel dimension may exceed 3000 px. Preserve the design aspect ratio and scale the longest constrained axis to 3000 px or less. Examples: a 10 × 4 inch design is 3000 × 1200 px; a 6 × 10 inch design is 1800 × 3000 px; an 8 × 8 inch design is 2400 × 2400 px. Crop unnecessary transparent margins before export while retaining a small intentional safety margin around the complete silhouette.

If a provider's printable area is smaller than 10 × 10 inches, use the smaller provider limit. Never enlarge past the user's 10 × 10 inch cap.

## Background Decision Tree

### Route A — Verified Native Alpha
Use this route only when the selected model/workflow is documented to output transparency AND the delivered file actually contains an alpha channel.
1. Request one complete, uncropped standalone subject with even padding.
2. Request true transparent background and prohibit checkerboard, paper, scene, floor, cast shadow, glow field, frame, and rectangle.
3. **Inspect the file:** Reject RGB-only output, rendered checkerboards, white boxes, and colored matte pixels.
4. Test edges over white, black, and one saturated contrasting color.

### Route B — Uniform Removable Matte (Default)
Use this as the default when native alpha cannot be verified.
1. **Select a matte color that does NOT appear anywhere in the artwork**, especially at the edges.
   - *If art has white/cream edges:* Use saturated cyan, green, or magenta.
   - *If art has black/dark edges:* Use bright cyan, warm yellow, or magenta.
   - *If art is full rainbow:* Use neutral mid-gray, or generate a temporary high-contrast outline around the subject.
2. Ask for an edge-to-edge, perfectly uniform, untextured matte. No horizon, floor, gradient, vignette, light falloff, paper grain, shadow, reflection, fog, or glow.
3. Keep all distress, halftone, and grain **inside** the artwork silhouette. Never apply them "over the whole image."
4. **Remove the background** (e.g., using Higgsfield's `remove_background` tool) after semantic errors are corrected. Recheck interior holes and enclosed counters in letters.

**Recommended Prompt Block for Route B:**
> **BACKGROUND CONTRACT:** Use a perfectly uniform solid [HEX] removal matte that does not appear inside the artwork. Fill the entire canvas outside the graphic with exactly this flat color. No texture, gradient, vignette, paper grain, lighting variation, floor, horizon, cast shadow, reflection, fog, glow, border, frame, or rectangle. Keep the artwork fully separated from the matte with a crisp complete silhouette and even outer padding.

## Light-Shirt and Dark-Shirt Logic

One graphic file is rarely optimal for every garment color.
- **Dark outline disappears on black/navy shirt:** Create a light keyline or a knockout-aware dark-shirt variant.
- **White highlight disappears on white/ivory shirt:** Add a dark contour or substitute a light-shirt palette.
- **Black ink area on black garment:** Consider knocking it out to transparency so the garment supplies black; verify provider underbase behavior.
- **Fine negative spaces close on dark underbase:** Increase gaps and simplify distress.

*Rule:* The prompt compiler should describe the intended garment: "designed for a black shirt; cream outer keyline; black regions may knock out to garment."

## Print-Method Behavior

- **DTG (Direct-to-Garment):** Needs opaque color regions, clean alpha, sufficient contrast. Opaque gradients can print; the real hazard is unintended low-opacity haze and edge contamination, especially over white underbase on dark garments.
- **DTF (Direct-to-Film):** Needs clean exterior cut, connected shapes, robust small details.
- **Screen Print:** Spot-color plan, limited palette, deliberate halftone angle/scale, separable shapes.
- **Embroidery:** Simplified fills, very thick strokes, low detail, no distressed dust. Route to an embroidery-specific file workflow.

## Resolution and Export Pipeline

1. Generate at the highest *reliable* native resolution and choose the aspect ratio that best matches the intended free-form silhouette; do not force a square composition.
2. Correct concept, spelling, anatomy, composition, and palette *before* background removal.
3. Remove or verify the background.
4. Inspect the isolated art on multiple flat backgrounds, then trim unnecessary transparent margins without touching the artwork.
5. **Upscaling:**
   - If the upscaler preserves alpha: isolate first, upscale second, recheck alpha.
   - If the upscaler flattens alpha: upscale the uniform matte image first, then remove the matte.
6. Scale proportionally so both final dimensions are at or below 3000 px at 300 PPI. Do not stretch or pad the artwork into a square. Embed sRGB unless otherwise specified.
7. Run `scripts/inspect_print_asset.py` and reject any file whose non-transparent bounding box exceeds 10 × 10 inches.

## Alpha-Quality Gate

A print asset passes only when:
- Real alpha channel exists (no rendered checkerboard).
- Complete subject, no crop, no scene remnants, no accidental cast shadows.
- No white, black, or colored halo fringe over test grounds.
- No accidental low-opacity fog or dust outside the intended design.
- Smooth contours retained (no jagged binary thresholds).
- Intended interior holes (letter counters, distressed holes) remain transparent.
- No accidental one-pixel or tiny-matte debris.
- The complete non-transparent silhouette fits within 10 × 10 inches; at 300 PPI, its width and height are each no greater than 3000 px.
- The requested organic, geometric, irregular, wide, tall, or asymmetrical outer shape remains intact and has not been forced into a square or badge.
