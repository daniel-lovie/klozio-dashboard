# Phase 3 quality gate — local text vs Sonnet

The spec makes `default_on` conditional on an A/B the operator reviews. This is the measured half of
it, and it points one way clearly enough to state now.

## The bar

Every listing title this shop publishes must be 125-140 characters, carry the primary keyword inside
the first 40, include "Comfort Colors" once, and use comma-separated phrases. `write_listing_copy.py`
enforces it and feeds the rejection reason back once before giving up.

## Result

| engine | in band, first try | in band, one retry |
|---|---|---|
| Sonnet (production) | — | **16/16** on the eclipse batch, 0 rejected |
| Qwen3 30B-A3B local | **1/5** | **3/5** |

Sample first-attempt lengths from the local model: 118, 124, 106, 103, 128. It understands the brief —
the titles read well and carry the keyword and the brand — but it does not count characters, and the
band is narrow.

## What follows

**Image generation goes local. Listing text stays on Sonnet.**

The spec anticipated exactly this and allows it: "the option to keep Sonnet as default for final
listing copy if the A/B shows a quality gap (pennies/day at this volume)". At ten designs a day the
text is the cheap half of the bill; the images were the expensive half, and those now cost nothing.

`LOCAL_ENGINE` therefore should not advance past `internal` for text. The flag is per-stage in the
job row, so this is a setting rather than a rewrite: `engine_image=local-comfyui` with
`engine_text=sonnet` is a supported combination and the fallback logic already produces it.

## The route back

Two cheap things would likely close the gap, in order of effort:

1. **Constrain rather than ask.** Have the model write the phrases and assemble the title in code,
   where the character count is arithmetic instead of a request. The 125-140 band is the only rule it
   failed; it met every other one.
2. **More retries.** Three attempts instead of one would likely reach 4-5/5, at ~9 s each warm. That
   is the lazy fix and it hides the cause.

Neither is worth doing before the images have proven themselves in the shop.
