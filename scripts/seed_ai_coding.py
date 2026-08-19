#!/usr/bin/env python3
"""Five AI / vibe-coding tees for Klozio, seeded as drafts for operator approval.

The operator supplied five reference listings. Three of them print Anthropic's Claude starburst, which
is a registered mark — reproducing it on merchandise is trademark infringement, it is what CLAUDE.md
non-negotiables #2 and #6 forbid, and it is the most common reason a POD shop gets a takedown. The joke
in every one of those designs lives in the WORDS, not the mark, so the concepts survive intact with an
original ornament in its place.

The same applies to keywords. "Claude" as a listing keyword rides someone else's brand and brings people
looking for the company, not for a shirt. The tags below are the real search terms for this audience:
vibe coding, prompt engineer, developer gift, software engineer, machine learning.

Everything else follows the standing Etsy tactic — $24.99 anchor, Digital PNG, free-shipping stamp —
see the project memory. Products are seeded content_status='approved' so the producer can draw them, but
the SCHEDULE row is written 'pending': the operator asked to approve each one before it goes live.

    python3 scripts/seed_ai_coding.py            # dry run
    python3 scripts/seed_ai_coding.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import psycopg2

SHOP_ID = 1
BLANK = "Comfort Colors 1717"
PRICE_CENTS, POD_CENTS, LABEL_CENTS = 3570, 950, 550     # 3570 anchor -> $24.99 after the 30% sale
SIZES = ["S", "M", "L", "XL", "2X", "3X", "4X", "Digital PNG"]
COLORWAYS = ["Black", "Pepper", "Espresso", "Midnight", "Blue Jean", "Moss", "Ivory", "Gray",
             "Denim", "Blue Spruce", "Brick", "White"]

# The ornament that replaces the Claude starburst. Described from scratch so the generator draws OUR
# mark: a even-rayed geometric burst, not Anthropic's asymmetric eight-ray asterisk.
ORNAMENT = ("a single small geometric burst mark with twelve even tapered rays radiating from a clear "
            "centre point, perfectly symmetrical, flat solid colour, like a printer's asterisk ornament")

CONCEPTS = [
    # slug, niche, hero, hook (typeset by us in the licensed font), placement, inches, concept
    ("vibe-tokens-v1", "vibe coding humor", "Pepper", "WE REQUIRE MORE TOKENS", "center_chest", 9.0,
     "A chunky 8-bit pixel-art creature seen head on: a wide rectangular body, two small square eyes, "
     "four stubby legs and two side nubs, drawn as hard-edged pixels with no anti-aliasing. "
     "Palette: four flat colours — warm terracotta body, deep charcoal eyes, muted clay shadow pixels, "
     "one cream highlight."),
    ("vibe-hallucinating-v1", "AI developer humor", "Black", "Hallucinating...", "left_chest", 4.0,
     f"{ORNAMENT} Nothing else in the frame. "
     "Palette: three flat colours — burnt terracotta rays, deep rust core, one soft clay accent."),
    ("vibe-pixelpet-v1", "vibe coding minimal icon", "Black", "", "left_chest", 3.5,
     "A chunky 8-bit pixel-art creature seen head on: a wide rectangular body, two small square eyes "
     "and four stubby legs, hard-edged pixels, no anti-aliasing, no text. "
     "Palette: three flat colours — warm terracotta body, deep charcoal eyes, one clay shadow tone."),
    ("vibe-absolutely-right-v1", "AI developer humor", "Black", "You're absolutely right —",
     "center_chest", 8.0,
     f"{ORNAMENT} Nothing else in the frame. "
     "Palette: three flat colours — burnt terracotta rays, deep rust core, one soft clay accent."),
    ("vibe-no-mistakes-v1", "AI developer humor", "Black", "Make no mistakes", "center_chest", 8.0,
     f"{ORNAMENT} Nothing else in the frame. "
     "Palette: three flat colours — burnt terracotta rays, deep rust core, one soft clay accent."),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("SELECT slug FROM products")
    taken = {r[0] for r in k.fetchall()}
    clash = [s for s, *_ in CONCEPTS if s in taken]
    if clash:
        print(f"CAKISMA: {clash}", file=sys.stderr)
        return 1

    print(f"{len(CONCEPTS)} urun · Klozio · $24.99 + Digital PNG · onay bekleyecek\n")
    for slug, niche, hero, hook, placement, inches, concept in CONCEPTS:
        print(f"  {slug:26} {placement:13} {inches:>4}in  yazi: {hook or '(yazisiz)'}")
        if a.apply:
            params = {"style": "minimal", "placement": placement, "print_inches": inches,
                      "aspect_ratio": "1:1", "resolution": "4k"}
            k.execute("""
                INSERT INTO products (shop_id, slug, niche, blank, technique, design_prompt, design_params,
                                      price_cents, pod_cost_cents, label_cost_cents, sizes, colorways,
                                      hero_colorway, personalised, hook, content_status, title,
                                      description, tags, created_at, updated_at)
                VALUES (%s,%s,%s,%s,'dtf',%s,%s,%s,%s,%s,%s,%s,%s,false,%s,'approved','','',%s,now(),now())""",
                      (SHOP_ID, slug, niche, BLANK, concept, json.dumps(params), PRICE_CENTS,
                       POD_CENTS, LABEL_CENTS, SIZES, COLORWAYS, hero, hook or None, []))
    if a.apply:
        c.commit()
        print(f"\n{len(CONCEPTS)} urun eklendi. Sirada: uretim -> ilan metni -> takvime 'pending' olarak.")
    else:
        print("\nDRY RUN. Eklemek icin --apply")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
