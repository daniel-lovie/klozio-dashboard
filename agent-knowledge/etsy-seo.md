<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/etsy-seo/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: etsy-seo
description: "Etsy SEO analyzer and optimizer for t-shirt and POD listings. Scores listings 0-100 across title, tags, description, attributes, and images. Provides keyword suggestions, long-tail variations, and prioritized action plans. Use when the user wants to analyze, score, or optimize an Etsy listing's SEO performance, generate keyword ideas, or audit existing listings for search visibility improvements."
---

# Etsy SEO Analyzer

Analyze and optimize Etsy listings for better search visibility, with a focus on t-shirt and print-on-demand (POD) products.

## When to use

- User asks to analyze or score an existing Etsy listing's SEO
- User wants keyword research for a product category
- User wants to compare listing SEO before/after optimization
- User wants a prioritized action plan to improve search ranking

## SEO Scoring System

| Dimension | Weight | What it measures |
|-----------|--------|------------------|
| Title | 30% | Keyword placement, length (ideal 80-140 chars), readability |
| Tags | 25% | Count (max 13), long-tail ratio, length (max 20 chars each), uniqueness |
| Description | 20% | Length, keyword density, first 160 chars quality, CTA presence |
| Attributes | 15% | Completeness (5+ attributes = full score) |
| Images | 10% | Count (10 = full score), alt text presence |

Grades: A (90-100), B (70-89), C (50-69), D (30-49), F (0-29).

## Usage

Run the analyzer script with listing data:

```bash
python3 /Users/omer/Documents/code/etsy/.claude/skills/etsy-seo/scripts/analyzer.py '{\n  "title": "Funny Cat T-Shirt, Cat Lover Gift, Unisex Cotton Tee",\n  "tags": ["funny cat shirt", "cat lover gift", "unisex tee"],\n  "description": "This funny cat t-shirt features...",\n  "category": "clothing",\n  "attributes": {"material": "cotton", "color": "black", "size": "S-3XL"},\n  "images": 7\n}'
```

For demo mode: `python3 /Users/omer/Documents/code/etsy/.claude/skills/etsy-seo/scripts/analyzer.py --demo`

## T-Shirt SEO Best Practices

### Title Formula
```
[Design Subject] [Product Type] [Key Attribute], [Recipient/Occasion], [Size Range]
```
Example: `Personalized 100% Cotton Dad T-Shirt: Custom Kids' Names S-XL`

### Tag Strategy for T-Shirts
Cover these dimensions across 13 tags:
1. Design subject + product type (e.g., "funny cat tshirt")
2. Recipient (e.g., "gift for cat mom")
3. Occasion (e.g., "birthday gift")
4. Style/aesthetic (e.g., "retro vintage tee")
5. Material/technique (e.g., "screen print shirt")
6. Solution (e.g., "matching family tee")
7. Size/fit (e.g., "oversized graphic tee")

### Etsy Tag Rules
- Maximum 13 tags, each max 20 characters
- Use multi-word phrases (long-tail > generic)
- No duplicates, no misspellings, no plural variants
- Don't repeat category/attribute words as standalone tags

## Keyword Library (Clothing/T-Shirt)

High-traffic: custom t-shirt, graphic tee, funny shirt, vintage tee, personalized shirt
Long-tail: cat lover gift shirt, retro dad tshirt, matching couple tees, dog mom graphic tee

## Optimization Workflow

1. Analyze current listing with the script
2. Review score breakdown per dimension
3. Apply HIGH priority actions first (title rewrite, tag additions)
4. Re-analyze to confirm improvement
5. Track performance in Etsy Shop Stats after 2-4 weeks
