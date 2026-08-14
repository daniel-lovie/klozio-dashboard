<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/veteran-playbooks/references/copy-playbook.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Veteran copy playbook — titles, tags, descriptions

Measured on 139 winner listings (≥30 sales/mo, sales-weighted) across the 13 veteran shops, plus the
full text of the 24 top champions' descriptions (2026-08-02). Percentages are shares of winner sales.

## Titles — the measured technique

| Rule | Evidence |
|---|---|
| Length ~130–140 chars (use the whole field) | winners w-avg 128, median 137 |
| 4–5 comma-separated phrases | w-avg 4.4 phrases |
| Phrase 1 = full primary buyer-intent keyword, starts with `Custom` / `Personalized` | 67% of winner sales |
| Keyword-stack: repeat ≥2 core words of phrase 1 in later phrases (synonyms/reorders) | 71% of winner sales |
| `Comfort Colors®` in title when premium band | 45% overall; 87% in the premium archetype (A1) |
| Year in title for trip/event products (A4) | 20–35% of those catalogs; the annual-renewal engine |

Template: `[Custom|Personalized] [asset] [product], [reorder/synonym phrase], [Comfort Colors® phrase
(premium)], [occasion/recipient tail], [year (A4 only)]`

Real champions:
- A1: `Comfort Colors® Custom Girlfriend Shirt, Personalized Bootleg Girlfriend T Shirt, Retro Bootleg Boyfriend Tee, Custom Gift`
- A3: `Custom Pet Photo And Name Shirt, Personalized Comfort Colors Pet Shirt, ...`
- A5: `Custom Logo Shirts, Personalized Logo Shirt, Custom Design Shirt, Cust...`

## Tags — the measured technique

- **Fill all 13.** 93% of winner sales come from listings with 13/13 tags.
- **Every tag multi-word** (100% measured), average 16 chars — spend the 20-char budget on long-tail
  phrases (`gifts for dog owners`), never single words.
- **95% title overlap**: tags are the title's phrases re-cut, not a second keyword universe. Build the
  title first, derive tags from it, then add recipient/occasion long-tails.
- Archetype tag pools (top sellers' actual tags, sales-weighted):
  - A1: bootleg shirt · comfort colors · custom bootleg · girlfriend shirt · boyfriend shirt · custom rap tee · personalized bootleg
  - A2: gifts for dog owners · gift for dog mom · cat lovers gift · pet memorial gifts · dog loss gifts · custom pet gift
  - A3: custom photo shirt · gift from daughter · fathers day shirt · gift for dad · gift for husband · custom photo tshirt
  - A4: disneyworld shirts¹ · disney vacation¹ · family trip 2026 · matching shirts · [theme] trip [year]
  - A5: custom shirt · custom graphic tee · business logo shirt · team logo shirt · custom text tee · custom logo · personalized design
  - A6: comfort colors · retro [subject] shirt · [holiday] tee · [subject] lovers gift

¹ pool shown as observed; Klozio adapts patterns to its own themes.

## Descriptions — the champion skeleton

Structure beats prose. 19/24 champions use bullet blocks, 12/24 use emoji section headers,
22/24 include care, 21/24 blank/fabric details, 18/24 production+shipping, 16/24 point to a size chart.
Median length ~2,900 chars. Block order (assemble all that apply):

1. **Keyword opener** (1–2 sentences re-stating the title's primary keywords in natural prose —
   the single best champion does this; most shops skip it, do not skip it).
2. **HOW TO ORDER / PERSONALIZE** — numbered steps: pick size+color from dropdown → check size
   chart → type personalization in the box exactly as it should print. (Photo customs: "send the
   photo via Etsy message after ordering"; preview-approval within 24h if offered.)
3. **MATERIAL** — exact blank spec. Klozio: Comfort Colors 1717, garment-dyed, 100% ring-spun
   cotton, 6.1 oz + fit guidance lines champions use verbatim: "size down for fitted / true size
   for relaxed / size up 1–2 for oversized".
4. **SIZE CHART** pointer → "see photos" (our color chart is rank 4; size table in description).
5. **CARE** — wash cold inside-out, no bleach, hang dry, don't iron the print.
6. **PRODUCTION & SHIPPING** — production 1 business day (our real producer SLA), US shipping
   window, "tracking provided automatically", "delivery dates estimated, not guaranteed",
   "need a deadline? message first".
7. **POLICY block** — custom items: no returns/exchanges; damaged/defective → free replacement;
   wrong address → contact immediately; not responsible for carrier delays.
8. **LADDER CROSS-LINKS** — link matching sizes/sibling products (toddler/youth/other items with
   the same personalization). This is how A2 ladders monetize inside one listing.
9. **Follow-the-shop line** + AI disclosure (Klozio compliance: visible generative-AI disclosure
   stays high in the description, non-negotiable).

## Klozio S3/S4 checklist (apply verbatim)

- [ ] Title ≥125 chars, 4–5 phrases, phrase 1 starts Custom/Personalized (unless A6), stacked keywords
- [ ] Premium band ⇒ `Comfort Colors®` in title; A4 ⇒ year in title
- [ ] 13/13 multi-word tags, ≥90% derived from title phrases + recipient/occasion long-tails
- [ ] Description follows the 9-block skeleton; blocks 2, 3, 5, 6, 7 are mandatory
- [ ] Personalized listing ⇒ block 2 explains the personalization box exactly
- [ ] AI disclosure present and high
