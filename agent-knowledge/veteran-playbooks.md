<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/veteran-playbooks/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: veteran-playbooks
description: Battle-tested playbooks distilled from 13 Etsy t-shirt shops that stayed successful for 3-14 years (3,269 listings analyzed via EverBee, 2026-08). Six archetypes with title formulas, price bands, tempo modes and product-ladder rules. Use at concept generation (S1), when writing listing copy/pricing (S3/S4), when planning weekly batches, or when deciding what to do after a product wins or flops. Every new Klozio concept must map to one of these archetypes or be flagged as a conscious deviation.
---

# Veteran playbooks

What 3-to-14-year survivors actually do, measured — not guessed. Source analysis:
`research/veteran-playbooks-2026-08.md`; raw per-shop numbers in `references/shop-metrics.json`,
their top listings in `references/shop-top-listings.json`. **Copy technique (titles, tags,
descriptions — with the measured numbers and the champion description skeleton) lives in
`references/copy-playbook.md` and is a mandatory read at S4.**

**The one law:** personalization carries 83–100% of revenue in 12 of 13 long-lived shops — even where
only 10–24% of listings are personalizable, those few carry the shop. Default every concept to
personalizable; a non-personalized concept is only justified inside archetype A6.

## The six archetypes

Every new concept MUST be tagged with one archetype (put `archetype: A1..A6` in the concept/staging
file). If it fits none, it may still ship, but flag `archetype: DEVIATION` so we can measure whether
our deviations ever beat the proven shapes.

### A1 · Photo-Bootleg Premium — *UpTopNorth ($65k/mo, 6y), UniqueTrendsDesign*
Buyer sends a photo (partner/pet/friend); design is a rap-bootleg-style collage around it.
- Price: **$28–42 effective** (premium band; photo IS the premium justification)
- Title formula: `Comfort Colors® Custom [Subject] Shirt, Personalized Bootleg [Subject] T Shirt, [occasion tail]`
- "Comfort Colors®" in title (87% of UpTopNorth's catalog does this — it sells the blank's quality)
- Tempo: evergreen-hero — winners carry 13+ months; don't churn, iterate the hero's variants
- Klozio fit: needs photo-by-message workflow (text personalization + buyer message photo) — heavier ops, highest price premium of any mechanic

### A2 · Pet-Photo Product Ladder — *ModPawsUS ($73k/mo, 6y), TIMOTHYJACOBShop*
ONE personalization asset (pet photo + name), MANY products: shirt → golf towel → cap → blanket → magnet.
- Price ladder: $10 (towel/magnet) → $15–24 (shirt) → $29 (blanket)
- Rule: when a personalized concept wins, its SECOND product is a different item with the same
  personalization, not a second shirt design
- 99–100% of catalog personalized; niche = pet parents as identity

### A3 · Gift-Occasion Photo Machine — *CuteLoveGiftsShop ($86k/mo)*
Dad/Mom/birthday/memorial photo gifts at impulse prices, run as a FRESHNESS ENGINE.
- Price: **$13–15 effective** (velocity band)
- 62% of monthly sales come from listings ≤6 months old; median winner is 5 months old →
  publish continuously, kill losers fast, re-cut winners into new occasions
- Title formula: `Custom [Occasion] Shirt With Photo, Personalized [Recipient] Gift, Comfort Colors [Product]`
- This is the archetype closest to Klozio's current daily-drop cadence

### A4 · Trip/Family Matching + Year — *SchmidtsTees (14 YEARS), NextDayCustomTees*
`[Theme] Family/Matching + YEAR + name personalization`. 20–35% of titles carry a year.
- Price: **$13–16 effective** — deliberately low because families buy 4–8 units per order
- Annual renewal machine: every November, publish next-year versions of all year-titled winners;
  the year in the title is why a 14-year-old shop still ranks for fresh intent
- Klozio fit: family/group slots; also the mechanic behind matching-couple concepts

### A5 · Text/Logo Utility — *TeaShirtsUS ($58k/mo), SweeTeeShirt, LilyApperal, HopifyCustomTees*
"Your text/logo here" generic customs. The MOST evergreen shape measured: median winner age 30–38
months, top-5 listings = 90–96% of revenue. One hero listing can carry a shop for years
(LilyApperal: 23 listings → $20k/mo).
- Two viable price poles: bare-bones single item **$11–15** (velocity, undercut) OR
  group/event premium **$28–34** (bachelorette, team, company merch)
- Title formula: `Custom [Text|Logo] Shirt, Personalized [Front and Back|Pocket] Print, [Comfort Colors|Bella] [Product], [group-occasion tail]`
- Rule: these listings are INFRASTRUCTURE — build a handful, optimize relentlessly, never delete;
  they compound rank for years. Klozio should own 3–5 of these as permanent catalog floor.

### A6 · Aesthetic Brand (the only non-personalized survivor) — *OldSchoolCulture ($114k/mo)*
Coherent retro/vintage graphic identity, $21.50 avg, demand SPREAD across catalog (top-5 only 36%),
44% of sales from fresh listings, 100% hit rate in top-300.
- Works only with: consistent recognizable aesthetic + high publish tempo + mid price
- This justifies Klozio's original-humour slots (A3 tree) — but hold them to the aesthetic-coherence
  bar: shared palette/style family across drops, not one-off styles

## Cross-cutting rules (apply at the listed pipeline stage)

1. **S1 concept:** tag archetype; personalizable by default (exception: A6). State which tempo mode
   the slot runs in: `evergreen-hero` (A1/A5: fewer, iterated) or `freshness-engine` (A3/A4/A6:
   continuous drops, prune fast).
2. **S3 pricing:** pick a band, don't drift mid-band: velocity $11–15 / niche $19–24 / premium $28–42
   (photo or special technique ONLY). These are effective (post-30%-sale) prices — anchor = ÷0.7.
3. **S3 titles:** premium-band titles say "Comfort Colors®"; A4 titles carry the year;
   utility titles lead with `Custom` + the asset type (`Text`, `Logo`, `Photo`).
4. **Yearly renewal op:** every November, clone all year-titled winners to next year's version.
5. **Ladder op:** any product that hits ~30 sales/mo → propose its ladder sibling (same
   personalization asset, different product) before proposing a new design.
6. **Portfolio shape:** catalog floor = 3–5 A5 utility heroes (never expire) + weekly freshness
   drops (A3/A4/A6) + a premium A1/A2 wing once photo-ops workflow exists. Small catalogs win on
   sales-per-listing (802/450/430 measured) — publish deliberately, not maximally.

## When results arrive

- Winner (≥30 sales/mo): iterate INSIDE its archetype (variants, ladder, year-clone) before starting
  a new concept. Veterans concentrate: top-5 share is 56–97% everywhere.
- Flop in freshness mode: kill without sentiment — CuteLove's 68% hit rate means 1 in 3 dies; speed
  of replacement is the strategy.
- Flop in evergreen mode: don't kill early; A5 winners took 30+ months to compound. Re-SEO instead.
