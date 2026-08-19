# Phase 2 bake-off — which checkpoint becomes the default

Open question 3 in the spec. Three candidates, the same five briefs and three seeds each, 45
generations. The briefs are the shop's own kind — flat, limited palette, clear subject, no text — not
generic prompt-adherence bait: a model that cannot do this cannot do the job whatever its benchmarks.

| model | n | time | PPI after 4x | partly-transparent | inks | licence |
|---|---|---|---|---|---|---|
| SDXL base 1.0 | 15 | 27.4 s | 371 | 1.11% | 1086 | CreativeML OpenRAIL++-M |
| Juggernaut XL v9 | 15 | 27.2 s | 331 | 1.20% | 554 | CreativeML OpenRAIL-M |
| **FLUX.2 klein 4B** | 15 | 75.6 s | 343 | **0.90%** | **365** | **Apache 2.0** |

## What the numbers say, and what they do not

**All three clear the print gate.** Every candidate lands above 300 PPI at ten inches after the
standard 4x upscale, and all sit under the 2% partly-transparent ceiling. None of them is disqualified
on printability.

**Klein is the flattest and the most disciplined.** 0.90% partly-transparent against 1.11-1.20%, and
365 inks against 554 and 1086. For DTF that ordering matters more than it looks: partly-transparent
pixels are what a transfer cannot lay down, and ink count is how closely a model followed "flat,
limited palette" rather than reaching for gradients.

**Klein is 2.8x slower.** 75.6 s against 27 s. At ten designs a day that is thirteen minutes versus
five — irrelevant. It would matter at a hundred.

**Klein's licence is the only clean one.** Apache 2.0, no use restrictions. Both OpenRAIL variants
permit commercial use but carry behavioural restrictions that have to be honoured and, more
practically, explained if anyone ever asks what made a design we sell.

## Correction — the criterion this table missed

Everything above measures printability. **It does not measure the rule this shop treats as absolute:
no letterform may come out of a model** (CLAUDE.md #5). That was caught by eye afterwards, not by the
harness — a fishing badge came back reading "EESTOR DUTDER", a camping one "WIRILS · BOGAE".

All three candidates do it, and the cause is largely the brief: "retro badge" and "vintage label"
invite a banner with words in it. Two OCR engines disagree badly on the rate (tesseract 60/40/20%,
easyocr 7/7/33%) and both miss text visible to the eye, so no single number is quoted. What is certain
is that all three produce it far too often to publish unattended.

`ops/text_gate.py` is the backstop: either detector seeing a letterform rejects the image. The prompt
guidance — stop asking for badges and labels — belongs upstream and is the real fix.

This does not change the choice of klein, which is still the flattest, most palette-disciplined and
only unrestricted-licence candidate. It changes what "passes" means.

## What is still the operator's call

**Prompt adherence, which is the primary criterion and is not in this table.** No script should
pretend to judge whether the fox actually looks like a fox reading a book. The 45 images are on the
Spark at `~/dgx-out/bakeoff2/`, named `<model>-p<prompt>-s<seed>.png`, so the same brief and seed sit
side by side across models.

## The gap this table does not close

The drawn files in this repository — the eclipse collection, the book-lover tee — run **6 to 7 inks**
and **0.02-0.48% partly-transparent**. The best generated candidate is 365 inks and 0.90%. Generation
is not close to composition on flatness, and it never will be, because one is drawing shapes and the
other is predicting pixels.

That is the honest frame for this whole phase: local generation replaces Higgsfield for the
*illustrative* work, at zero marginal cost and with no session to expire. It does not replace drawing
for anything geometric or typographic, and it was never going to.
