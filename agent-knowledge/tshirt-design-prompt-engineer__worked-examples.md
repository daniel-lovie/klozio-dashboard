<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-design-prompt-engineer/references/worked-examples.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Worked Examples: Prompt Transformations

This document demonstrates how to convert weak, generic, or camera-focused prompts into strong, print-ready t-shirt artwork prompts using the 10-layer compiler.

---

## Example 1: The "Adjective Soup" Photographic Prompt

**User's Original Prompt:**
> "A super cool cyberpunk samurai with a glowing katana, highly detailed, 8k resolution, masterpiece, trending on artstation, cinematic lighting, neon city background, photorealistic, depth of field, sharp focus, unreal engine 5 render."

**Diagnosis:**
- *Artifact failure:* Will generate a rectangular poster or scene, not standalone shirt art.
- *Background failure:* "Neon city background" and "depth of field" fuse the subject to the environment.
- *Print failure:* "Photorealistic" and "cinematic lighting" create gradients and soft edges that print poorly on apparel.
- *Adjective soup:* "8k, masterpiece, trending on artstation" add noise without controlling the pixels.

**Transformed Master Prompt (Vector Route):**
```text
One isolated front-print artwork on a plain generation canvas; show the graphic only. Do not render it on clothing, a person, paper, a wall, or inside a scene. Preserve the concept's natural outer silhouette; do not force a square, circle, badge, or border unless requested. The final transparent artwork must fit proportionally inside a maximum 10 × 10 inch bounding box; at 300 PPI, both dimensions must be 3000 px or less.

A cyberpunk samurai in futuristic armor, holding a glowing katana in a dynamic combat stance.

Centered composition, full-body silhouette with even outer padding.

Flat vector cel-shaded illustration style, clean ink linework, bold graphic comic-book aesthetic.

Palette: Deep charcoal armor, electric cyan accents, and neon magenta for the glowing katana. Designed for a black t-shirt.

Opaque shapes, sturdy line weights, no soft gradients or photographic rendering.

Use a perfectly uniform solid #00FF00 (bright green) removal matte that does not appear inside the artwork. Fill the entire canvas outside the graphic with exactly this flat color. No texture, gradient, vignette, paper grain, lighting variation, floor, horizon, cast shadow, reflection, fog, glow, border, frame, or rectangle. Keep the artwork fully separated from the matte with a crisp complete silhouette.

Avoid: complex city background, photorealism, 3D render, cropped edges, text.
```

---

## Example 2: The "Tiny Text and Halos" Vintage Graphic

**User's Original Prompt:**
> "Vintage 70s sunset with palm trees and a surfer, distressed texture everywhere, transparent background, text says 'California Dreaming' with some small cool surf quotes at the bottom."

**Diagnosis:**
- *Background failure:* "Transparent background" often yields a fake checkerboard. "Distressed texture everywhere" contaminates the matte, making background removal impossible without halos.
- *Typography failure:* "Small cool surf quotes" invites the model to invent unreadable, misspelled filler text.
- *Vagueness:* Lacks a defined color palette or structural hierarchy.

**Transformed Master Prompt (Screen Print Route):**
```text
One isolated front-print artwork on a plain generation canvas; show the graphic only. Do not render it on clothing, a person, paper, a wall, or inside a scene. Preserve the concept's natural outer silhouette; do not force a square, circle, badge, or border unless requested. The final transparent artwork must fit proportionally inside a maximum 10 × 10 inch bounding box; at 300 PPI, both dimensions must be 3000 px or less.

A retro 1970s striped sunset graphic with silhouette palm trees and a surfer riding a wave.

Arched layout: the sunset forms a perfect half-circle at the top, typography arches above it.

Vintage screen-print aesthetic, limited color palette, bold flat shapes.

Palette: Warm mustard yellow, burnt orange, and terracotta red. Silhouettes in deep navy blue. Designed for a cream or white t-shirt.

Exact text: "CALIFORNIA DREAMING" in a bold, chunky 70s retro serif font, arched over the sunset. No other text.

Intentional distressed texture and halftone grain must be bounded strictly INSIDE the artwork shapes.

Use a perfectly uniform solid #FF00FF (bright magenta) removal matte that does not appear inside the artwork. Fill the entire canvas outside the graphic with exactly this flat color. No texture, gradient, vignette, paper grain, lighting variation, floor, horizon, cast shadow, reflection, fog, glow, border, frame, or rectangle. Keep the artwork fully separated from the matte with a crisp complete silhouette.

Avoid: fake checkerboard background, tiny filler text, misspelled words, distress outside the main graphic.
```

---

## Example 3: The Surgical Edit (Fixing a Generation)

**Context:** The user generated a great skull graphic using the prompt compiler, but the model added an unwanted crown of thorns to the skull. The user wants to remove the crown without changing the skull or the colors.

**User's Original Fix Attempt:**
> "Generate the skull again but without the crown."
*(Result: The model generates a completely different skull, losing the approved style).*

**Transformed Edit Grammar (For an Image-to-Image / Edit Model):**
```text
Edit the provided design. Change only the top of the skull.
Preserve exactly: the skull's face, jaw, shading, composition, silhouette, palette, texture, and the uniform magenta background matte.
New result: A smooth, bare bone skull top with no headwear or accessories.
Avoid: regenerating the whole image, changing the lighting, adding new objects.
```
