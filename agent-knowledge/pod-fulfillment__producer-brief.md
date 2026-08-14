<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/pod-fulfillment/references/producer-brief.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Producer brief — questions to ask, answers to record

Fill this before any design work. **Print method and print area are blocking** — the file spec depends on
the first, and artwork sizing depends on the second.

Get answers in writing (email/message), not verbally. This document is the contract-in-practice.

## Identity

| Field | Answer |
|---|---|
| Producer name (legal / business name) | A print shop (Etsy partner id 5739954) |
| Location (city, state, country) | Dallas, TX, US |
| Contact person + channel | |
| **Ships-from address** (goes in Etsy shipping settings) | Dallas, TX (exact street address still needed) |
| Preferred handoff channel (email / Drive / WhatsApp / portal) | |
| Working days & hours; weekend coverage? | |

## Print method — BLOCKING

| Question | Answer |
|---|---|
| **Print method?** | **DTF** ✅ confirmed 2026-07-30 |
| If DTG: white underbase on dark garments? | |
| Max print size (W × H, inches) | |
| **Print area / placement they print to by default** | |
| Do they handle gradients and soft transitions? | |
| Minimum line weight / text size that survives their process | |
| Color limit (screen print) or unlimited (DTG/DTF)? | |
| File format they want (PNG? PDF? layered?) | |
| Required DPI and pixel dimensions | |
| Do they want the file at print size, or will they scale? | |
| Do they need a bleed or safe margin? | |
| **Can they print WHITE ink on dark garments?** | |
| If DTG: do they lay a **white underbase** on dark garments? | |

**Why it matters:** DTF wants hard clean edges and punishes soft gradients; DTG tolerates photographic
detail but needs an underbase on dark garments and still breaks up fine lines on garment-dyed cotton.
Screen print caps colors and changes the design approach entirely. Record the answer into
`tshirt-visuals/references/print-file-spec.md` once known.

## Blanks — they source

| Question | Answer |
|---|---|
| Can they source **Comfort Colors 1717**? | **YES — confirmed, this is the blank we sell** |
| If not, which garment-dyed blanks can they get? | |
| Size range available (need S–3XL) | |
| **Exact colorway names as they use them** | |
| Which of Ivory / Moss / Blue Jean / Berry / Butter / Pepper / Chalky Mint are available? | |
| Colorway or size availability that's unreliable? | |
| What happens if a blank is out of stock mid-order — substitute or hold+notify? | |

Listing colorway names must match theirs exactly.

## Turnaround & capacity

| Question | Answer |
|---|---|
| Turnaround from receiving our packet to handing to carrier | **1 day** ✅ confirmed |
| Same-day cutoff time for orders received before X? | |
| Capacity per day / per week | |
| Peak-season capacity (Oct–Dec) | |
| Any planned closures / holidays | |
| Do they batch, or print per order? | |

Feed this into the shipping profile: `processing = our handoff latency + their turnaround + 1–2 day buffer`.

## Pricing

| Item | Price |
|---|---|
| All-in per unit, S–XL (blank + print + packing) | |
| All-in per unit, 2XL | |
| All-in per unit, 3XL | |
| Second print location (back / sleeve) surcharge | |
| Rush surcharge, if any | |
| Minimum order quantity, if any | |
| Volume discount tiers | |
| Payment terms (per order / weekly / monthly) | |

**We buy the Etsy shipping label separately** — confirm they do not also charge shipping.

## Quality & defects — agree in writing

| Question | Answer |
|---|---|
| Who pays for a reprint on a **print defect** (misplacement, cracking, wrong color)? | |
| Who pays for a **wrong size / wrong colorway** ship? | |
| Reprint turnaround | |
| Do they photograph finished items before shipping? | |
| Will they send photos on request (new design / new colorway)? | |
| Do they inspect blanks for defects before printing? | |
| How are damaged-in-transit claims handled? | |

Etsy holds **us** responsible for what the buyer receives, regardless of who shipped. An unwritten defect
policy becomes our cost by default.

## Packaging

| Question | Answer |
|---|---|
| Do they supply packaging (poly mailer / box)? | |
| Can they include a **package insert** (coupon + review ask)? | |
| Can they include branded tissue / sticker / thank-you card? | |
| Any packaging cost not in the per-unit price? | |

Package inserts are the highest-yield physical review lever — see
`etsy-growth/references/cold-start.md`. Confirm feasibility before promising it anywhere.

## Handoff mechanics

| Question | Answer |
|---|---|
| What exactly do they need per order? | |
| Do they accept the Etsy label PDF as-is? | |
| Do they want one packet per order, or a daily batch? | |
| How do they confirm shipment + return tracking to us? | |
| How fast do they confirm receipt of a packet? | |
| Do they need a packing slip, or is the label enough? | |

This determines the handoff template in `order-fulfillment`.

## Open risks

Record anything unresolved. An unanswered blocking question is a reason not to launch, not a detail.

| Risk | Impact | Status |
|---|---|---|
| ~~Print method unknown~~ | ~~Blocks S2 file spec~~ | ✅ **RESOLVED — DTF** |
| Exact ships-from street address | Needed for Etsy shipping settings | ☐ open |
| White-ink / underbase capability | DTF handles white natively — confirm anyway | ☐ open |
| | | |
