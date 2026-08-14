<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-design-prompt-engineer/references/prompt-framework.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# T-Shirt Prompt Framework

This framework is based on analysis of official image-model guidance, print-on-demand production requirements, and high-performing community examples.

## The 10-Layer Prompt Compiler

Do not paste every possible descriptor into every request. Compile only the relevant layers below, in this stable order.

| Layer | Question answered | High-value language | Failure prevented |
|---|---|---|---|
| **1. Artifact contract** | What exact deliverable is being generated? | "One isolated front-print artwork on a plain generation canvas; show the graphic only. Any outer silhouette is allowed; do not force a square, circle, badge, or border unless requested." | Model returns the product, a scene, or an artificial container instead of the intended isolated print graphic. |
| **2. Concept kernel** | What is the one dominant idea? | One subject, one action/attitude, one message, and at most one supporting motif family. | Concept soup and competing focal points. |
| **3. Composition blueprint** | How are elements arranged? | Choose the natural outer silhouette and hierarchy: organic, irregular, asymmetrical, wide, tall, stacked, arched, or geometric. Preserve the complete silhouette and even safety margin; use a badge or frame only when conceptually justified. | Cropping, arbitrary placement, forced-square composition, weak hierarchy, unusable silhouette. |
| **4. Style grammar** | What coherent visual system should render it? | Medium + line character + shape language + texture behavior + era/mood. | Contradictory style stacking and generic "make it cool." |
| **5. Palette and garment interface** | How will art contrast with the shirt? | Target garment color, opaque FLAT ink palette (6-12 colors typical, no upper limit), specific evocative color names, role of each color, knockout/negative space. | Gradients, soft glows, airbrush fades; weak figure-ground contrast; white-on-white loss. Colour *count* is not the defect — soft transitions are. |
| **6. Typography contract** | What literal text appears, and how? | Exact quoted text once, line breaks, hierarchy, lettering character, alignment, no other characters. | Misspelling, duplication, tiny filler copy, unrelated pseudo-text. |
| **7. Print-behavior contract** | What physical traits must survive production? | Opaque shapes, sturdy line weights, intentional halftone/distress, no fragile dust, process-specific detail limits, and a final bounding box no larger than 10 × 10 inches (3000 × 3000 px maximum at 300 PPI). | Semi-transparent haze, mud, isolated specks, detail loss, or an oversized print file. |
| **8. Background contract** | What is alpha/matte behavior? | Verified true alpha **or** a uniform removable matte absent from the art; no scene, floor, shadow, glow field, border, or rectangle. | Checkerboard-as-pixels, dirty halos, fused scenery, removal failure. |
| **9. Focused exclusions** | Which fatal errors are likely here? | Four to eight scenario-specific exclusions, placed in native negative controls when available. | Long generic negative lists that dilute the main instruction. |
| **10. Model adapter** | Which tool-specific fields control the output? | Model, aspect ratio matched to the intended free-form silhouette, quality, reference roles, image weight, moodboard, palette/HEX, negative parameter, and seed/variation behavior. | Version-dependent syntax or a default square canvas distorting the design intent. |

## High-Value Patterns

1. **Medium-specific vocabulary beats generic quality adjectives:** Use concrete graphic-production language (e.g., *clean ink linework, flat cel shading, bold outlines, halftone dots, screenprint texture, limited high-contrast palette*). Avoid "masterpiece," "best quality," "8K," or repeated "ultra detailed."
2. **A recognizable silhouette is the primary visual asset:** The best examples establish a dominant subject that survives reduction. Support it with typography and texture, do not compete with it.
3. **Geometry and hierarchy outperform style-name imitation:** Define frontal vs. profile view, tight crop vs. complete silhouette, centered vs. offset subject, arched vs. stacked type. These are safer than naming a living artist, photographer, or franchise.
4. **Exact palettes are strongest when assigned functional roles:** Assign roles to colors (e.g., "cream for the main lettering, black for contour and shadow, magenta only for mouth accents, teal as removable matte").
5. **Print texture must be intentional and bounded:** Halftone, distress, and grain must stay **inside** the artwork silhouette. Never apply them "over the whole image," as that contaminates the removable background matte.

## Anti-Pattern Catalogue

| Anti-pattern | Why it fails for apparel | Replacement rule |
|---|---|---|
| **Adjective soup** | Competes with subject and print constraints while inviting microdetail. | Use one coherent medium, line language, texture behavior, palette, and mood. |
| **Camera-spec transplant** | Lens, aperture, bokeh, and film-stock language pushes a scene/photo rectangle instead of a self-contained print. | Translate camera intent into graphic geometry: crop, viewpoint, focal scale, edge hardness, and value contrast. |
| **Full environment** | Streets, skies, rooms, water, snow, and floors fuse into the subject and create a rectangular print. | Convert environment into one or two bounded motifs or an internal badge shape; keep the exterior clean. |
| **Tiny editorial/UI copy** | Becomes unreadable and frequently misspelled; wastes ink and attention. | Keep only a primary phrase and optionally one short secondary line. |
| **Many unrelated focal points** | Produces visual noise and thumbnail failure. | One hero subject, one message, one supporting motif family. |
| **Forced-square composition** | Distorts wide, tall, organic, or asymmetrical ideas and wastes the 10 × 10 inch envelope. | Match the generation ratio and final transparent canvas to the natural silhouette; keep both final dimensions at or below 3000 px at 300 PPI. |
| **Contradictory visual language** | "Minimalist, maximalist, photoreal, flat vector, soft watercolor" leaves the model to average incompatible targets. | Select one primary medium and at most one compatible texture/era modifier. |
| **`transparent background` as a magic phrase** | Some models render a checkerboard or flat field rather than a true alpha channel. | Use native alpha only when capability is verified; otherwise request a uniform removable matte and remove it afterward. |
| **Universal pure-white matte** | White artwork merges with white and returns contaminated edges. | Choose a matte color absent from the art and maximally separated from edge colors. |
| **Soft shadows, glow fog, and low-opacity aura** | Background removal creates halos; dark-garment underbase can print faint contamination as visible white. | Use a deliberate hard silhouette or contained opaque glow shapes. |
| **Universal "no gradients"** | Overly restrictive for DTG/DTF and some design styles. | Ban accidental semi-transparency and diffuse haze; allow opaque gradients when the print method supports them. |
| **Named brands, franchises, celebrities, or living creators** | Introduces commercial IP, publicity-rights, and platform-policy risk. | Translate the reference into generic era, composition, palette, line, texture, and mood attributes. |
| **Endless whole-prompt rewrites** | Destroys accepted elements and makes debugging impossible. | Preserve accepted modules; revise one failed dimension per loop. |
