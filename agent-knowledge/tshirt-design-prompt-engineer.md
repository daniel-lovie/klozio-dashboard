<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-design-prompt-engineer/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: tshirt-design-prompt-engineer
description: Convert an idea, slogan, or reference into a model-aware, print-aware prompt system for isolated t-shirt artwork within a maximum 10 × 10 inch print area and any outer silhouette. Use for generation, clean-background extraction, and POD print-file validation.
---

# tshirt-design-prompt-engineer

## Overview
Convert an idea, niche, slogan, reference image, or existing draft into a **model-aware and print-aware prompt system** for standalone t-shirt artwork, then guide or execute generation, focused iteration, clean-background extraction, and production validation. Optimized for US-market POD (Print-on-Demand) use, ensuring clean alpha channels, correct typography, and scalable graphic silhouettes.

## Trigger Scope

**Use this skill when:**
- The user asks to create, improve, reverse-engineer, or evaluate prompts for t-shirt graphics.
- The user wants to convert a visual idea or slogan into printable apparel artwork.
- The user needs to create clean/transparent-background apparel art.
- The user needs model-specific prompts (e.g., for Higgsfield, Midjourney, Recraft) to generate t-shirt designs.
- The user asks to fix a failed generated design (e.g., misspelled text, dirty background, cropped edges).
- The user wants to build design variants for light and dark garments.

**Scope boundary:** This skill produces only the isolated printable design and its production prompt. Do not extend the deliverable beyond the print file.

## Workflow Decision Tree

1. **Classify:** Determine if the request is prompt-only, generate-art, edit-art, background-cleanup, or print-file audit.
2. **Safety Gate:** Check for unauthorized brands, copyrighted characters, celebrity likenesses, and living-artist imitation. If found, remove or transform them into generic stylistic attributes.
3. **Creativity Engine:** If the user asks for "creative," "unique," or "likeable" designs, or if the brief is generic, apply `references/creativity-engine.md`. Filter out POD clichés; generate three distinct angles (Elevated, Juxtaposition, Inside Joke); score novelty, identity resonance, readability, wearability, printability, and IP safety; then use the winning concept. Show options only when the user asks to choose—otherwise proceed autonomously.
4. **Normalize Brief:** Extract or infer the intended buyer/niche, core message, exact text, placement, shirt colors, print method, style direction, subject/viewpoint, palette, outer silhouette, and background target. Enforce the fixed maximum print area of 10 × 10 inches. Ask the user only for missing correctness-critical fields.
5. **Route:** Choose the primary model family and typography/background route based on the brief.
   - *Vector/Logo/Icon/Simple Typography:* Recraft V4.1 (`vector` or `utility_vector`) or equivalent.
   - *Complex Illustration + Exact Short Text:* GPT Image 2 (High Quality) or Nano Banana Pro.
   - *Exact Long Text/Personalization:* Deterministic vector/type workflow (generate illustration only, add text later).
6. **Compile Prompt:** Build a modular master prompt using the 10-layer compiler (see `references/prompt-framework.md`). Ensure the "Likeability Formula" (restrained palette, wearable organic silhouette, clear visual anchor) is applied.
7. **Execute/Deliver:**
   - *Prompt-only:* Deliver the normalized brief, master prompt, model adapter parameters, background plan, and acceptance check.
   - *Generate-art:* Check current model capabilities via MCP/API, generate controlled candidates, and present them.
8. **Validate:** Score the candidate against the 100-point rubric (`references/quality-rubric.md`). Check for fatal failures (wrong text, IP violation, design rendered on clothing instead of isolated art, cropped subject, fused background).
9. **Refine:** If validation fails, diagnose the failure. Modify *one module only* and restate necessary invariants using the edit grammar. Do not rewrite the entire prompt.
10. **Prepare Asset:** Verify/remove background, inspect alpha, test on light/dark grounds, preserve the requested free-form silhouette, and scale proportionally so the final artwork bounding box does not exceed 10 × 10 inches. At 300 PPI, neither pixel dimension may exceed 3000 px. Run `scripts/inspect_print_asset.py` before delivery.
11. **Deliver Final:** Provide the final transparent print asset, clearly distinguishing it from working matte images.

## Core Directives

- **Artifact Contract:** Always specify "One isolated front-print artwork on a plain generation canvas; show the graphic only. Do not render it on clothing, a person, paper, a wall, or inside a scene. The design may use any organic, geometric, irregular, wide, tall, or asymmetrical outer silhouette; do not force it into a square, circle, badge, or border unless the concept requests one."
- **Print-Area Limit:** The final transparent artwork must fit inside a maximum 10 × 10 inch bounding box. At 300 PPI, the maximum canvas/bounding-box limit is 3000 × 3000 px; non-square designs must scale proportionally so both dimensions remain at or below 3000 px.
- **Background Strategy:** Never trust the word "transparent" in a prompt. Use Route A (Verified native alpha) or Route B (Uniform removable matte). See `references/background-and-production.md`.
- **Typography:** Quote exact text once. If the text is long or requires strict brand alignment, do not generate it via image models; generate the art and set the type deterministically.
- **Print Behavior:** Use medium-specific vocabulary (e.g., clean ink linework, flat cel shading, bold outlines, halftone dots) instead of generic quality adjectives (e.g., masterpiece, 8k, ultra detailed).
- **Iteration:** Fix one dimension at a time. Use: "Change only [target]. Preserve exactly: [composition, silhouette, palette, typography, texture, background/alpha, and all non-target elements]."

## References

MUST read these references when performing related tasks:
- `references/creativity-engine.md`: Cliché filter, three creative angles, and the likeability formula.
- `references/prompt-framework.md`: The 10-layer prompt compiler and successful/anti-patterns.
- `references/background-and-production.md`: Background removal, alpha validation, and print-method rules.
- `references/quality-rubric.md`: The 100-point scoring system and fatal failure checks.
- `references/worked-examples.md`: Before/after prompt transformations.
- `references/model-adapters.md`: Model selection, parameters, aspect-ratio routing, and fallback logic.
- `templates/design-brief.md`: Standard print-design output format.
- `scripts/inspect_print_asset.py`: Deterministically validate transparency and the maximum 10 × 10 inch envelope at 300 PPI.
