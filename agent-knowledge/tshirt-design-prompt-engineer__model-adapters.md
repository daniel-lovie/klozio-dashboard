<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-design-prompt-engineer/references/model-adapters.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Model Adapters and Routing

This document details how to map the normalized design brief to the correct generative model. The Skill currently focuses on Higgsfield models (via MCP) but the logic applies broadly.

## Higgsfield Model Selection

| Need | Preferred Model | Key Parameters |
|---|---|---|
| Vector-like illustration, logo, icon, limited palette | **Recraft V4.1** | `model_type="vector"` or `"utility_vector"`; choose the supported aspect ratio closest to the intended free-form silhouette; set `background_color="[HEX]"` |
| Exact short typography, complex illustration | **GPT Image 2** | `quality="high"`; choose the supported aspect ratio closest to the intended free-form silhouette |
| High-quality text/diagrams, versatile image-to-image | **Nano Banana Pro** | Choose the supported aspect ratio closest to the intended free-form silhouette |


## Fixed Export Constraint

Model aspect ratio controls the working composition, not the final physical print size. Preserve the natural outer silhouette, remove the matte, trim unnecessary transparent margins, and scale proportionally so the final raster fits within **10 × 10 inches**. At 300 PPI, width and height must each be **3000 px or less**. Do not stretch or pad a wide, tall, organic, irregular, or asymmetrical graphic into a square.

## Parameter Formatting

When providing the model adapter block to the user, or when constructing the API payload, use this structure:

### For Recraft V4.1 (Vector/Logo Route)
```json
{
  "model_id": "recraft_v4_1",
  "model_type": "vector",
  "aspect_ratio": "[closest supported ratio to the intended silhouette]",
  "background_color": "#FF00FF",
  "prompt": "[Master Prompt]"
}
```
*Note:* Recraft V4.1 explicitly supports a `background_color` parameter, which is the safest way to guarantee a uniform removable matte.

### For GPT Image 2 / Nano Banana Pro (Illustration/Typography Route)
```json
{
  "model_id": "gpt_image_2",
  "aspect_ratio": "[closest supported ratio to the intended silhouette]",
  "quality": "high",
  "prompt": "[Master Prompt including Background Contract]"
}
```
*Note:* These models do not have a dedicated background color parameter, so the `[BACKGROUND CONTRACT]` in the text prompt is critical.

## Fallback Routing

If the primary model fails (e.g., text is misspelled or background is fused):
1. **Text Failure:** If GPT Image 2 fails to spell the text correctly after one targeted retry, drop the text from the image prompt. Generate the illustration only, and instruct the user to add the text deterministically using a vector graphics editor.
2. **Background Failure:** If the model refuses to generate a solid matte (e.g., it keeps adding a floor or sky), switch to a tighter crop or a different model (e.g., from GPT Image 2 to Recraft V4.1 utility mode).
