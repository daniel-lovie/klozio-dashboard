#!/usr/bin/env python3
"""Put the Claude keyword — and the printed line — into the AI/coding listings' title and tags.

Two changes, with different standing:

  THE PRINTED LINE is a plain defect fix. `vibe-absolutely-right-v1` did not carry "absolutely right"
  in a single tag, and `vibe-hallucinating-v1` did not carry "hallucinating". The quoted line is the one
  distinctive thing a buyer who has SEEN the shirt would type, and it was missing from every field they
  could search. Nothing about that is a trade-off.

  THE BRAND NAME is an operator decision, taken 2026-08-17 against my recommendation and recorded here
  so it is not mistaken for an oversight later. "Claude" is Anthropic's registered mark. Using a mark in
  an Etsy title or tag to draw that brand's traffic is the most common trigger for an IP takedown, and
  it is found automatically: rights holders sweep Etsy search for their own names. The cost if it lands
  is listing removal plus a strike against a shop that CLAUDE.md already flags as being in an
  aggressively enforced category. The operator judged the discoverability worth that risk. If a takedown
  arrives, `etsy-tshirt-research/references/ip-incident-response.md` is the procedure, and reverting is
  a matter of re-running this script with KEYWORD = "".

The design files are untouched. No shirt in this line depicts the Claude mark, and none ever will —
that is a separate rule and it still stands.

    python3 scripts/vibe_claude_keywords.py            # dry run
    python3 scripts/vibe_claude_keywords.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from write_listing_copy import check                                # noqa: E402

# slug -> (title, tags). Hand-set rather than generated: these are thirteen deliberate keyword bets and
# a 140-character budget, and a model rewrites them differently on every run.
PLAN = {
    "vibe-absolutely-right-v1": (
        "Claude AI Shirt, Youre Absolutely Right Tee, Comfort Colors Programmer Gift, "
        "Pixel Mascot Graphic, Funny Software Developer Present",
        ["claude ai shirt", "claude code tee", "absolutely right", "vibe coding shirt",
         "ai coding humor", "developer humor tee", "programmer gift", "machine learning tee",
         "comfort colors tee", "pixel art shirt", "software dev gift", "coder gift idea",
         "funny coding shirt"],
    ),
    "vibe-hallucinating-v1": (
        "Claude AI Shirt, Hallucinating AI Tee, Comfort Colors Developer Gift, "
        "Pixel Art Mascot Graphic, Funny Machine Learning Present",
        ["claude ai shirt", "claude code tee", "hallucinating tee", "ai hallucination",
         "vibe coding shirt", "developer humor tee", "programmer gift", "machine learning tee",
         "comfort colors tee", "pixel art shirt", "software dev gift", "data science gift",
         "funny coding shirt"],
    ),
    "vibe-no-mistakes-v1": (
        "Claude Code Shirt, Make No Mistakes Tee, Comfort Colors Programmer Gift, "
        "Pixel Mascot Graphic, Funny AI Software Developer Present",
        ["claude code tee", "claude ai shirt", "make no mistakes", "vibe coding shirt",
         "ai coding humor", "developer humor tee", "programmer gift", "machine learning tee",
         "comfort colors tee", "pixel art shirt", "software dev gift", "coder gift idea",
         "funny coding shirt"],
    ),
    # The weakest fit in the set and worth saying plainly: this design is our own pixel creature and has
    # no connection to the brand at all, so the keyword carries the most risk for the least relevance.
    # Kept because the operator asked for the line, not the individual listing.
    "vibe-pixelpet-v1": (
        "Claude Pixel Art Shirt, Minimalist Left Chest Icon Tee, Comfort Colors Coding Gift, "
        "Vibe Coding Programmer, Cute 8 Bit Creature Tee",
        ["claude ai shirt", "vibe coding tee", "pixel art shirt", "8 bit creature",
         "minimalist icon tee", "programmer gift", "retro gaming shirt", "coder gift idea",
         "pixel monster tee", "comfort colors tee", "software dev shirt", "cute pixel art",
         "tech gift idea"],
    ),
    "vibe-tokens-v1": (
        "Claude AI Shirt, We Require More Tokens Tee, Comfort Colors Programmer Gift, "
        "Pixel Art Mascot Graphic, Funny Vibe Coding Present",
        ["claude ai shirt", "claude code tee", "more tokens tee", "vibe coding shirt",
         "ai coding humor", "developer humor tee", "programmer gift", "machine learning tee",
         "comfort colors tee", "pixel art shirt", "software dev gift", "coder gift idea",
         "funny coding shirt"],
    ),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    bad = 0
    for slug, (title, tags) in PLAN.items():
        # Same gate the copy writer uses, so a hand-set title cannot skip the checks a generated one
        # has to pass: 125-140 characters, keyword inside the first 40, thirteen multi-word tags.
        why = check({"title": title, "tags": tags, "hook": "x" * 40, "_has_text": True})
        flag = "OK" if not why else f"RED: {why}"
        print(f"{slug}\n    T({len(title)}) {title}\n    {flag}")
        if why:
            bad += 1
    if bad:
        print(f"\n{bad} ilan gecemedi, hicbiri yazilmadi.", file=sys.stderr)
        return 1

    if not a.apply:
        print("\nDRY RUN. Yazmak icin --apply")
        return 0

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    for slug, (title, tags) in PLAN.items():
        k.execute("UPDATE products SET title=%s, tags=%s, updated_at=now() WHERE slug=%s",
                  (title, tags, slug))
    c.commit()

    k.execute("""SELECT slug, etsy_listing_id FROM products
                  WHERE slug = ANY(%s) AND etsy_listing_id IS NOT NULL""", (list(PLAN),))
    live = k.fetchall()
    c.close()
    print(f"\n{len(PLAN)} ilan guncellendi (veritabani).")
    if live:
        print("Etsy'de YAYINDA olanlar — degisiklik ancak push edilince gorunur:")
        for slug, lid in live:
            print(f"  {slug}  listing {lid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
