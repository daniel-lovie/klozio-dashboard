<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/etsy-listing-helper/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: etsy-listing-helper
description: >-
  Generate complete, copy-paste-ready Etsy listing content (title, tags, description,
  materials, category, attributes, alt text, variation ideas) from POD product spec text
  and/or white-background product photos. Use when the user provides product information
  and/or product images and wants Etsy listing info, listing copy, SEO tags, or anything
  related to publishing a t-shirt or POD product on Etsy. Also trigger when the user only
  sends product images in a session where product base info was given earlier.
---

# Etsy Listing Helper

Turn POD (print-on-demand) product specs + designed product photos into ready-to-paste Etsy listing content, in a fixed format with translations and reasoning.

## When to use

- User provides product specs/images and wants Etsy listing content
- User asks for title, tags, description for an Etsy product
- User sends product images and wants listing copy generated
- User wants to create or optimize a t-shirt listing for Etsy

## Language rules

1. **Copy-paste blocks** (Title, Tags, Description, Materials, Alt Text): English by default (Etsy primary marketplace). If user asks for another language (e.g., German for Etsy DE), use that language. Never mix languages in copy-paste blocks.
2. **Annotations** (translation lines, rationale): use the language the user is conversing in.

## Inputs

1. **Product base info** (spec text: Material, Size, Design Area, Printing Technique, Performance, Scenarios, Washing Instructions, Package)
2. **One or more product images** showing the design

Rules:
- N images = N complete listings (numbered Listing 1, 2...)
- Images only, no spec = reuse most recent product base info from conversation
- Spec only, no image = generate one listing with placeholder design keywords
- Look at each image carefully: identify design subject, art style, colors, mood

## Reference files

Before writing listings, read:
- `references/listing-fields.md` — consolidated per-field rules (always read)
- `references/etsy-categories.md` — grep for product keyword to find deepest category (do NOT read whole file)
- `references/sources/` — only if listing-fields.md leaves a question open

Validate: title <= 140 chars, each tag <= 20 chars.

## SEO principles (T-Shirt focused)

- **Think like a buyer**: keywords = subject + product type + recipient/occasion + style
- **Title**: short and scannable, ~15 words max. Put strongest identifying phrase first. No repeated words, no fluff ("perfect", "beautiful"), no price/shipping info.
- **Tags**: all 13, multi-word phrases, natural language. Mix high-traffic and long-tail. Cover 7 brainstorming dimensions (descriptive, materials, recipient, occasion, solution, style, size).
- **Description**: keywords in first few sentences (Google snippet). Don't copy title verbatim. Essential info at top.
- **Categories/Attributes**: pick deepest category, fill every applicable attribute. Don't waste tag slots duplicating them.
- **First photo**: clean background, no text overlays, 2000px+ recommended.

## Fixed output format

Use this template for every listing:

```
## Listing {N} — {design short name}

### 1. Title (~15 words, ≤140 chars)
{listing-language title}

> Translation: {title in conversation language — omit if same}

### 2. Tags (13 tags, ≤20 chars each)
{tag1}, {tag2}, … {tag13}

> Translation: {tag-by-tag translation — omit if same}

### 3. Description
{structured description with emoji sections:
• Opening hook with main keywords (first ~160 chars)
• ✨ DESIGN — describe the printed design
• 📏 DETAILS — size, material, printing technique
• 🌟 FEATURES — fabric quality, comfort
• 🎁 PERFECT FOR — scenarios & gift occasions
• 🧴 CARE — washing instructions
• 📦 PACKAGE — what's included
• ⚠️ PLEASE NOTE — production variance reminder}

> Translation: {full description in conversation language — omit if same}

### 4. Materials (≤13)
{e.g. 100% Cotton, Polyester blend}

### 5. Category & Attributes
- Category: {deepest official Etsy category path}
- Color: {primary} / Size: {range} / Occasion: {if applicable}

### 6. Photo Alt Text (≤250 chars)
{description of image for accessibility/SEO}

### 7. Variations (if applicable)
{size options, color options, personalization}

### 8. Rationale
{2-5 bullets explaining keyword/title/tag/category choices}
```

## Quality bar

- Tags: count characters; anything over 20 chars must be shortened
- Title: never start with shop name or generic words; start with strongest identifying phrase
- Don't invent product facts not in spec or visible in image
- Personalization: POD products usually support custom designs — suggest in Variations
- Remind user once per session: Etsy requires POD shops to disclose production partners
