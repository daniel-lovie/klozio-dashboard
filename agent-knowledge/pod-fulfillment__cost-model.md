<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/pod-fulfillment/references/cost-model.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Cost model — fill with the producer's real numbers

Single source of truth for per-unit costs. `etsy-growth/references/pricing-and-fees.md` owns the formula;
this file owns the inputs. Until it's filled, every price is a guess.

**Manual producer model.** Costs come from the producer's quote plus our own label purchase — not from a
POD platform's landed cost. Two lines are easy to forget and both are ours:

1. **Etsy shipping label** — invisible under a POD platform, a real cost line here
2. **Our handoff labor** — not a cash cost, but it caps how many orders/day are sustainable

## Chosen setup

| Field | Value | Verified on |
|---|---|---|
| Producer | **A print shop** (Etsy production_partner_id **5739954**) | 2026-07-30 via API |
| Producer location / ships-from | **Dallas, TX, US** | 2026-07-30 via API |
| **Print method** | **DTF** ✅ CONFIRMED | 2026-07-30 |
| Blank brand + model | **Comfort Colors 1717** ✅ CONFIRMED — we sell Comfort Colors | 2026-07-30 |
| Print area (W × H, inches) | **9.5 wide max** (was 10×10; reduced 2026-07-31 — oversized DTF reads cheap). Files stay 300+ DPI at 9.5″ | 2026-07-31 |
| Producer turnaround | **1 day to carrier** ✅ confirmed | 2026-07-30 |
| Our handoff latency | must be same-day for the 1-day promise to hold | ⚠️ |
| Who sources blanks | **Producer** | |

## Per-unit cost — REAL PRODUCER QUOTE (Printinly price sheet, received 2026-07-31)

Source: `~/Downloads/Printinly Fulfillment Prices - Sheet1.csv`. Two columns exist — standard and a
"Special Offer" column. **Special Offer CONFIRMED as ours (user, 2026-07-31).** All planning numbers below use it.

**We sell Comfort Colors only (user decision 2026-07-31).** The producer also runs Gildan/Bella/Teeland
(incl. sweatshirts $11.50–13.50 and hoodies $14–15) — but those are NOT Comfort Colors, so the
sweatshirt/hoodie expansion question is settled: not available within our brand constraint.

| Size | Standard | **Special Offer** | Label (plan) | COGS (special) |
|---|---|---|---|---|
| S–XL | $10.50 | **$9.50** | $5.50 | **$15.00** |
| 2XL | $12.50 | **$11.00** | $5.50 | **$16.50** |
| 3XL | $13.80 | **$13.00** | $5.50 | **$18.50** |
| 4XL | $15.00 | **$13.80** | $5.50 | **$19.30** |

The old **$6.00 flat** figure was wrong by **+58% to +130%** and is dead. Every margin number derived from
it is dead with it.

**Label**: producer quotes "USPS First Class starts at $4.92, varies by weight/distance, real-time via
their system." Planning number **$5.50** (competitor observed real: $5.73). No longer a blind estimate.

**Production time**: orders before 4 PM US ship next day; standard 1–3 business days. Our 1-day
readiness_state holds only if handoff is same-day and before their cutoff.

## Size upcharges — DECIDED: upcharge (2026-07-31)

Flat pricing S–4XL would mean a 3XL sale nets **$3.50 less** than an S. Charged to keep net flat, rounded
to retail-clean steps:

| Size | Cost delta | Upcharge |
|---|---|---|
| 2XL | +$1.50 | **+$2.00** |
| 3XL | +$3.50 | **+$4.00** |
| 4XL | +$4.30 | **+$5.00** |

Implemented in `dashboard/src/lib/etsy.ts` (`price_on_property` by size) — not a manual step.

## Net per single-item order (buyer pays $5 shipping under $30)

`net = 0.905 × (P + 5) − 0.45 − production − label`

| List price | net S–XL | net 2XL (+$2) | net 3XL (+$4) |
|---|---|---|---|
| $19.99 | **$7.17** | $7.48 | $7.29 |
| $21.99 | $8.98 | $9.29 | $9.10 |
| $23.99 | $10.79 | $11.10 | $10.91 |
| $25.99 | $12.60 | $12.91 | $12.72 |
| $27.99 | $14.41 | $14.72 | $14.53 |

**Strategic consequence, stated honestly:** at the old $6 assumption we believed we had 2–3× the benchmark
unit economics. At real prices, $19.99 nets $7.17 — *inside* the normal $5–9 benchmark band, not above it.
The structural cost edge is gone; what remains is the zero-marginal-cost design pipeline. Ads math tightens
too: breakeven CPC at $19.99/4% CR is **$0.29** (apparel CPC runs $0.20–0.50), so the "ads incubator" play
only has real headroom at the $23.99+ slots or on high-CR listings.

Extras:

| Item | Cost |
|---|---|
| Second print location (back / sleeve) | |
| Rush surcharge | |
| Package insert | |
| Reprint (if we pay) | |

## Colorway availability & cost

| Colorway | Producer's exact name | Sourceable | Cost delta | Swatch verified | Sample checked |
|---|---|---|---|---|---|
| Ivory | | | | ☐ | ☐ |
| Moss | | | | ☐ | ☐ |
| Blue Jean | | | | ☐ | ☐ |
| Berry | | | | ☐ | ☐ |
| Butter | | | | ☐ | ☐ |
| Pepper | | | | ☐ | ☐ |
| Chalky Mint | | | | ☐ | ☐ |

**No hard cap on colorways** — expand as far as the producer can source and we can mock up (the reference
bestseller runs 17+). Each offered colorway still needs its own mockup. **Listing colorway names must match the producer's
names exactly.**

## Price derivation

### ⚠️ Two margins — do not conflate them

This was a real error in this project's early docs. Both are always reported.

```
COGS         = producer all-in + shipping label
GROSS margin = (price − COGS) / price                    <- the "55–65% POD margin" figure
NET   margin = (price − COGS − Etsy fees) / price         <- what actually lands
```

Vendor POD-margin figures (55–65%) are **GROSS**. Etsy's ~10–25% fee load sits on top. Requiring 55%
**net** in this model would force a ~$34 price — far outside the researched $18–26 band — so the floors are:

| Floor | Value | Applies to |
|---|---|---|
| **Gross** | **55%** | the researched POD floor |
| **Net** | **40%** | realistic for the manual-producer model |

Also check the **offsite-ads-attributed** case separately: at 12–15% it can push net into the low 30s. It
should stay clearly positive, but it will not meet the net floor and that is expected.

Calculator: `../scripts/margin.py` (`--price`, `--pod`, `--label`, `--solve-net`).

| Input | Value | Note |
|---|---|---|
| Producer all-in | **$6.00** | confirmed |
| Etsy shipping label | **~$5.00** | ⚠️ estimate — biggest unverified input |
| Packaging | $0 | included in producer all-in |
| Per-unit ad allowance | $0 | no ads during cold start |
| **COGS** | **$11.00** | |
| **Actual list price** | **$26.00** | inside $18–26, above the $25 free-shipping threshold |

### Shipping policy — buyer pays under $30

**Confirmed policy:** the buyer pays shipping when the subtotal is under **$30**; free above it.
Shipping profile **312066804390**: `primary_cost $5.00`, `secondary_cost $0.00` (second item ships free).

Etsy charges the 6.5% transaction fee on **item price + shipping charged**, so charging shipping adds a
small fee, but recovers the whole label.

### Result at $26 item price

| Order | Buyer pays | COGS | Fees | **Net** | Net/revenue |
|---|---|---|---|---|---|
| 1 item (ships charged) | $31.00 | $11.00 | $3.40 | **$16.61** | **53.6%** |
| 2 items (free, ≥$30) | $52.00 | $22.00 | $5.59 | **$24.41** | **46.9%** |
| 1 item, offsite-attributed | $31.00 | $11.00 | $7.30 | $12.71 | 41.0% |

Gross margin on a single item: **$15.00 / 57.7%** ✅ · Net **53.6%** ✅ — both floors clear comfortably.

### Why $26 + charged shipping beats the alternatives

| Option | Buyer pays | Net | Note |
|---|---|---|---|
| **$26 + $5 ship** ✅ chosen | $31 | **$16.61** | item price stays in the researched $18–26 band |
| $30 flat, free ship | $30 | $15.70 | $1 cheaper for the buyer but $0.91 less net, and above the band |
| $26 free ship | $26 | $12.08 | best optics, worst margin — the label is unrecovered |

**The $30 threshold is doing real work at a $26 price point:** a single item never reaches it, two items do.
That is the textbook free-shipping-threshold incentive, and research puts the AOV lift at ~30%. With
`secondary_cost $0.00` the second item also ships free, so the jump from 1→2 items is unusually attractive.

**Trade-off to watch:** single-item orders lose the free-shipping badge. $5 still clears Etsy's
under-$6 preference so the ranking signal survives, but if conversion on singles disappoints, the fix is
either a cheaper label or dropping the threshold below the item price.

### Label sensitivity — still the biggest lever

Every $0.50 off the label is ~$0.50 straight to net (we pay it either way):

| Label | Net on a single item | Net/revenue |
|---|---|---|
| $5.00 | $16.61 | 53.6% |
| $4.50 | $17.11 | 55.2% |
| $4.00 | $17.61 | 56.8% |
| $3.50 | $18.11 | 58.4% |

⚠️ **Still an estimate.** Buy one real label and update this.

Sanity-check against Etsy's built-in profit calculator (Listings dashboard).

## Fee reminder

| Fee | Amount |
|---|---|
| Listing | $0.20 (renews every 4 months or on sale) |
| Transaction | 6.5% on item price + shipping charged |
| Payment processing | 3% + $0.25 (US) |
| Offsite Ads (if attributed) | 12–15%, capped $100 |
| **Effective** | ~10% baseline, ~22–25% on offsite-attributed orders |

Price so the business stays profitable at the **full ~25% load**, not the baseline.

## Margin check

Compute before publishing, not after.

| Size | Retail | Total cost | Fees @25% | Net | Margin % | Clears 55%? |
|---|---|---|---|---|---|---|
| M | | | | | | ☐ |

## Change log

Producer pricing and blank costs move. Record every re-verification.

| Date | What changed | Effect on price |
|---|---|---|
| | | |
