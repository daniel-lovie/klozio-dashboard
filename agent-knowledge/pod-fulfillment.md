<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/pod-fulfillment/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: pod-fulfillment
description: Producer relationship and sourcing setup for the Klozio Etsy shop under a manual fulfillment model — onboarding the print producer, agreeing blanks and colorways, print method and file requirements, turnaround and defect policy, per-unit cost model, Etsy production partner registration, and the producer-address ships-from shipping profile. Use during shop setup, when onboarding or switching producers, when a price needs a real cost input, or when reviews complain about color, fit, print quality, or delivery time.
---

# Producer & sourcing setup

**Fulfillment model: manual producer, not a POD platform.** There is no Printify/Printful integration.

```
Sale on Etsy → we send the producer: print-ready PNG + product details + Etsy shipping label
             → producer sources the blank, prints, packs, ships
```

Division of labor:

| Who | Owns |
|---|---|
| **Us** | Design, listing, pricing, buying the Etsy shipping label, the per-order handoff, customer service |
| **Producer** | **Sourcing the blank**, printing, packing, shipping |

Because the producer sources blanks, **we carry no inventory and no overselling risk** — per-order cost
is fixed and Etsy quantities don't need stock management. That's the main advantage of this model, and
it's why the cost model below is per-order rather than per-batch.

This skill covers the **relationship and setup**. The per-order operational loop belongs to
**`order-fulfillment`**.

## Setup gate — S0

The Launch pipeline cannot pass S1 until all of these are true. Verify, don't assume.

- [ ] Producer onboarding questionnaire completed (`references/producer-brief.md`)
- [ ] **Print method confirmed** (DTF / DTG / screen / vinyl) — file spec depends on it
- [ ] Blank brand + model agreed, with print area recorded
- [ ] Colorways agreed, with the producer's exact color names
- [ ] Turnaround SLA agreed in business days
- [ ] Defect / reprint policy agreed in writing
- [ ] **Producer registered as an Etsy production partner** (Shop Manager UI only)
- [ ] **Ships-from address set to the producer's address** in Etsy shipping settings
- [ ] Shipping profile created using producer turnaround + buffer
- [ ] **Processing profile (readiness state) created** — `readiness_state_id` is now required for physical
      listings; build on processing profiles from the start rather than migrating later
- [ ] `references/cost-model.md` filled with the producer's real per-unit price
- [ ] One physical sample received and checked

### ✅ Klozio S0 status (2026-07-30) — complete

| Item | Value |
|---|---|
| Producer | A print shop, Dallas TX — Etsy partner **5739954** |
| Print method | **DTF** (prints full colour + white natively) |
| Blank | **Comfort Colors 1717** |
| Producer cost | **$6.00 all-in** (flat across sizes — 2XL/3XL still to confirm) |
| Turnaround | **1 day** to carrier |
| Shipping profile | **312066804390** — $5.00 first item / $0.00 additional |
| Processing profile | **1504534157129** — made_to_order, 1 day |
| Ships-from | Dallas TX, ZIP **75201** ⚠️ placeholder — need the real street address |

Still open: real shipping-label quote (the $5.00 figure is an estimate; a category competitor shows
**$5.73**), 2XL/3XL cost, defect policy in writing, physical sample.

## Blanks & colorways

The producer sources, but **we specify** — do not leave the blank to their discretion. The blank is both
a quality decision and an SEO asset.

**Preferred: Comfort Colors 1717** (garment-dyed, 100% ring-spun cotton):
- Dominates Etsy t-shirt bestsellers, and **"comfort colors" is itself a high-volume search keyword** —
  put it in titles and tags
- The muted washed palette photographs better than flat blanks and reads premium
- Matches Klozio's brand (ivory/espresso/amber, comfort-first)

Starter colorways: Ivory, Moss, Blue Jean, Berry, Butter, Pepper, Chalky Mint. **No hard cap** — the
reference bestseller offers 17+. Expand as far as the producer can source, since every colorway
needs its own mockup.

If the producer can't source 1717: LA Apparel 1801GD, Lane Seven LS16005, American Apparel 1301GD,
AS Colour 5082/4082 give the same garment-dyed look. Budget blanks (Bella+Canvas 3001, Gildan 64000) are
acceptable for testing but photograph flat — **if used, do not claim garment-dyed in the description.**

Two things must be recorded from the producer, in writing:
1. **Print area dimensions** — the design stage needs them; wrong-area artwork gets cropped
2. **Exact colorway names as the producer uses them** — listing colorway names must match, and "Moss" is
   not "olive"

## Color verification

Mockup color mismatch is the **single largest cause of negative POD reviews.** With no platform swatch
library, verification runs off the blank brand and physical stock:

1. Get official swatch images from the **blank manufacturer** (e.g. Comfort Colors' own color chart)
2. Confirm the producer can actually source each colorway you plan to list
3. Compare every mockup side by side against the swatch
4. **Check the physical sample against both** — manufacturer swatches and dye lots drift
5. Never apply a filter or grade that shifts garment color

Store swatches locally (`assets/swatches/`).

## Turnaround & the shipping profile

```
Etsy processing time = our handoff latency + producer turnaround + 1–2 day buffer
Etsy delivery time   = carrier transit from the PRODUCER's location
```

Our handoff latency is real and easy to forget: the clock starts when the order lands, not when the
producer receives the file. If handoffs are batched daily, that's up to 1 day before the producer starts.

**Ships-from = the producer's address.** Etsy requires an accurate ships-from address, and delivery
estimates are computed from it. Set it in Etsy shipping settings; the producer's location, not ours.

Note: since June 2026 Etsy prints the **shop name on every label** generated through Etsy Shipping — so
labels read Klozio even though the producer ships. Good for branding; the ships-from address is the part
that must be correct.

Keep US shipping under **$6** — Etsy prioritizes those listings. Bake it into item price. Set the
shop-level free-shipping guarantee for US orders $35+.

On-time shipping with tracking (95%+) is a Star Seller requirement **and** a ranking factor. Pad
processing by 1–2 days: under-promising is free, over-promising costs the badge.

## Quality control & defects

A platform would absorb some of this. A manual producer doesn't — we do.

Agree in writing, before the first order:
- Who pays for a reprint when the print is defective (misplaced, cracked, wrong color)?
- Who pays when the wrong size or colorway ships?
- Turnaround on a reprint
- What happens if the blank is out of stock mid-order — substitute, or hold and notify?
- Whether they photograph finished items before shipping (invaluable for disputes)

Spot-check policy: request photos of the first order in every new colorway and every new design, and
periodically thereafter. Etsy holds **us** responsible for what the buyer receives regardless of who
shipped it.

## Feeding the price

`etsy-growth/references/pricing-and-fees.md` owns the formula. This skill owns the **inputs** — and under
this model the inputs differ from a POD platform's single landed cost:

```
Retail = (producer all-in per unit + Etsy shipping label + per-unit ad allowance)
         ÷ (1 − fee rate − target margin)
```

`producer all-in per unit` should include blank + print + packing, since they source. Get it in writing
per size — 2XL/3XL blanks usually cost more; decide whether to upcharge or absorb.

**The Etsy shipping label is now our cost line, not the platform's.** It was invisible under a POD
platform and is easy to omit here. Include it.

Record everything in `references/cost-model.md`.

## Etsy production partner registration

**Mandatory. Non-disclosure sits in the same violation tier as selling prohibited items** — first
offense typically a warning with a ~48-hour fix window; repeats mean permanent closure.

Under this model the producer is unambiguously a production partner:

1. Shop Manager → Settings → Production partners → add the producer (real name, real location)
2. Check **"I work with a production partner"** on every listing
3. The partner must **not** be listed as the item's creator — we are the designer
4. Designs must be ours. With AI-generated artwork this bar is higher — see `ai-design` for the
   "Designed by" attribution and provenance requirements

Approved wording is in `klozio-etsy-api/references/profile-content.md`. Registration is **Shop Manager UI
only**; the API cannot do it.

## Diagnostics — when reviews complain

| Complaint | Cause | Fix |
|---|---|---|
| "Color isn't what I ordered" | Swatch/mockup/dye-lot mismatch | Re-run color verification against physical stock; rebuild mockups |
| "Print is off-center / too small" | Artwork vs print area mismatch | Re-check recorded print area; see `tshirt-visuals/references/print-file-spec.md` |
| "Took too long" | Handoff latency or turnaround underestimated | Re-pad processing time; check whether the delay was ours or the producer's |
| Print cracks / fades after wash | Producer print quality or method mismatch | Escalate with the producer; may need a method change (DTF vs DTG) |
| Wrong size / colorway shipped | Handoff packet ambiguity | Fix the handoff template in `order-fulfillment`, not the listing |
| "Fabric feels cheap" | Blank mismatch with premium positioning | Move to garment-dyed; stop claiming premium |

Diagnose whether the fault is **ours (handoff/artwork)** or **theirs (print/pack/ship)** before
escalating. The handoff packet is the usual culprit for wrong-item errors.

## References

| File | Read when |
|---|---|
| `references/producer-brief.md` | Onboarding or switching a producer; the questions to ask |
| `references/cost-model.md` | Any pricing decision, or adding a garment/size/colorway |
| `references/provider-setup.md` | Etsy-side setup: partner registration, ships-from, shipping profile |
