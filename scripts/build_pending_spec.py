#!/usr/bin/env python3
"""Turn the pending catalogue rows into a runner spec — and refuse the ones we cannot make honestly.

The 153 rows waiting in the catalogue are slogan tees. Their stored prompts say it outright:
`The design contains EXACTLY this text, spelled letter-for-letter: "HUZZAH"`. That instruction is the
reason the pipeline exists in its current shape — an image model asked for words returns malformed
glyphs, dropped letters and invented punctuation, which is why the d20 numeral and the personalisation
token are hand-set. So the phrase is stripped out of the prompt and set in real type afterwards, and
what the shirt says matches what the listing says.

Two groups are excluded rather than fixed:

- Rows whose niche is somebody's published work (a novel, a series, a fictional institution). The
  name may not appear in the copy, but the design still points at the thing, and a shop that sells
  it is trading on it. Not a legal call, a policy one.
- Rows whose slogan is longer than a chest print carries. Past ~40 characters the type has to shrink
  below the point where it reads in an Etsy grid tile, and an unreadable joke is a dead listing.
"""
import argparse
import json
import os
import re

import psycopg2

OUT = os.path.join(os.path.dirname(__file__), "batch_pending_01.json")

# niches that are an existing published work; the design points at it even when the name does not
FRANCHISE_NICHES = ["project hail mary", "murderbot", "dungeon crawler carl", "briar university"]
FRANCHISE_TERMS = ["project hail mary", "hail mary", "murderbot", "dungeon crawler carl",
                   "briar university"]
MAX_SLOGAN = 40          # characters; beyond this Impact drops under a readable size on the chest
MIN_SLOGAN = 2

CARD_PRINT = {"file": "printed-to-last.jpg", "title": "PRINTED TO LAST",
              "footer": "SOFT-HAND FINISH", "numbered": False,
              "steps": [["Sits in the fabric", "Not a stiff plastic layer on top"],
                        ["Full colour", "Every shade in the artwork prints"],
                        ["Wash cold, inside out", "Keeps the colour where it belongs"]]}
CARD_FIT = {"file": "fit-and-care.jpg", "title": "FIT & CARE",
            "footer": "COMFORT COLORS 1717 · S-4XL", "numbered": False,
            "steps": [["Unisex relaxed fit", "Roomy through the body; size down for closer"],
                      ["Garment-dyed cotton", "Heavyweight and soft from the first wear"],
                      ["Wash cold, tumble low", "No bleach, no ironing over the design"]]}


def slogan_of(description: str) -> str:
    """The headline the listing already promises. It is the first line, before the blank line."""
    return (description or "").strip().split("\n")[0].strip().strip('"')


def prompt_of(visual_idea: str) -> str:
    """Shape only. The runner's tail adds the print constraints and the NO-text rule."""
    idea = (visual_idea or "").strip().rstrip(".")
    return idea


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("""SELECT slug, niche, technique, personalised, price_cents, hero_colorway,
                          concept_no, title, tags, description, visual_idea, hook
                     FROM products
                    WHERE shop_id=2 AND print_file IS NULL
                      AND design_state IS DISTINCT FROM 'ready'
                    ORDER BY slug""")
    rows = cur.fetchall()

    concepts, dropped = [], {"franchise": [], "slogan_uzun": [], "slogan_yok": [], "fikir_yok": []}
    for (slug, niche, technique, personalised, price, colorway, concept_no,
         title, tags, description, visual_idea, hook) in rows:
        blob = f"{niche} {title} {visual_idea} {hook}".lower()
        if (niche or "").lower() in FRANCHISE_NICHES or any(t in blob for t in FRANCHISE_TERMS):
            dropped["franchise"].append(slug)
            continue
        slogan = slogan_of(description)
        idea = prompt_of(visual_idea)
        if not idea:
            dropped["fikir_yok"].append(slug)
            continue
        if not (MIN_SLOGAN <= len(slogan) <= MAX_SLOGAN):
            dropped["slogan_yok" if len(slogan) < MIN_SLOGAN else "slogan_uzun"].append(slug)
            continue

        concepts.append({
            "slug": slug, "niche": niche, "kind": "dtf", "personalised": False,
            "concept_no": concept_no or 1, "price_anchor_cents": price or 3428,
            "hero_colorway": colorway or "Ivory",
            "hook": hook or slogan,
            "prompt_head": idea,
            "slogan": slogan,
            "title": title,
            "tags": (tags or [])[:13],
            "description": description,
            "cover": {"banner": slogan[:34].upper(), "strip": "COMFORT COLORS 1717 · S-4XL"},
            "info_cards": [CARD_PRINT, CARD_FIT],
        })

    if a.limit:
        concepts = concepts[:a.limit]

    spec = {"campaign": "pending-01", "shop_id": 2,
            "pipeline_dir": "/Users/omer/Documents/code/etsy/pipeline",
            "campaign_scene_calls": 0, "cover_crop_top": 0.10,
            "templates": {"dtf": "h-a1-c1-v1", "embroidery": "h-emb-c6-v1"},
            "printful": {"product_id": 586, "store_id": 18561101, "variant_ids": [17695],
                         "option_groups": ["Men's", "Women's", "Flat"], "placement": "front"},
            "concepts": concepts}
    with open(OUT, "w") as fh:
        json.dump(spec, fh, indent=1, ensure_ascii=False)

    print(f"bekleyen satir      : {len(rows)}")
    for k, v in dropped.items():
        print(f"  cikarilan {k:12}: {len(v):3}" + (f"  ornek: {', '.join(v[:4])}" if v else ""))
    print(f"spec'e giren        : {len(concepts)}")
    print(f"tahmini uretim      : ${len(concepts) * 0.0263:.2f}")
    print(f"yazildi             : {OUT}")


if __name__ == "__main__":
    main()
