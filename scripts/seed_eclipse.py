#!/usr/bin/env python3
"""Seed the August 27, 2026 lunar eclipse collection for Klozio, for operator approval.

Sixteen listings: the ten designs in the brief, four more state versions of the template, the child
variant of the crew tee, and the light-garment variant of the evergreen phases design.

Everything follows the standing Etsy tactic — $24.99 anchor, Digital PNG variation, free-shipping stamp
— see the project memory. Products are seeded content_status='approved' so the pipeline may draw and
photograph them; the SCHEDULE row is written 'pending', because nothing in this shop goes live without
the operator saying so.

Two commercial facts the operator should have in hand, recorded here rather than in a message that
scrolls away:

  LEAD TIME    the eclipse is ten days out. The shop's own rule is to publish a seasonal listing six to
               eight weeks before its peak. These will not have time to rank organically before the
               event, and a shirt ordered on the 25th does not arrive before the 27th. What they can
               catch is the post-event commemorative wave and the searches that spike on the night.
  EVERGREEN    `eclipse-moon-phases` carries no date on purpose. It is the one design in the collection
               that still sells in November.

    python3 scripts/seed_eclipse.py            # dry run
    python3 scripts/seed_eclipse.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from build_eclipse_prints import DESIGNS                            # noqa: E402

SHOP_ID = 1
BLANK = "Comfort Colors 1717"
PRICE_CENTS, POD_CENTS, LABEL_CENTS = 3570, 950, 550   # 3570 anchor -> $24.99 after the standing 30% sale
SIZES = ["S", "M", "L", "XL", "2X", "3X", "4X", "Digital PNG"]

# Dark shirts, because every design is built for black. The light variant carries its own list: printing
# a cream-and-copper design on Ivory is how a listing photo comes back unreadable.
DARK_COLORWAYS = ["Black", "Pepper", "Espresso", "Midnight", "Graphite", "Blue Jean", "Denim",
                  "Blue Spruce", "Moss", "Brick"]
LIGHT_COLORWAYS = ["White", "Ivory", "Sandstone", "Butter", "Blossom"]

# The niche drives the keyword set the copy writer works from, so it is the search intent, not the theme.
NICHE = {
    "eclipse-commemorative-classic": "lunar eclipse 2026 commemorative",
    "eclipse-texas": "texas lunar eclipse 2026",
    "eclipse-ohio": "ohio lunar eclipse 2026",
    "eclipse-california": "california lunar eclipse 2026",
    "eclipse-florida": "florida lunar eclipse 2026",
    "eclipse-new-york": "new york lunar eclipse 2026",
    "eclipse-crew": "eclipse viewing group matching",
    "eclipse-my-first": "kids first eclipse 2026",
    "eclipse-almost-totality": "lunar eclipse humor",
    "eclipse-stayed-up": "astronomy humor late night",
    "eclipse-sturgeon-moon": "sturgeon moon fishing",
    "eclipse-dog-howl": "dog owner blood moon humor",
    "eclipse-team-umbra": "astronomy nerd science diagram",
    "eclipse-sorry-blood-moon": "witchy celestial humor",
    "eclipse-moon-phases": "celestial moon phases minimal",
    "eclipse-moon-phases-light": "celestial moon phases minimal",
}

# The printed line, which the copy writer quotes verbatim. Every one of these is hand-set type in a
# vendored OFL face — no letter on any of these shirts came out of a model.
HOOK = {
    "eclipse-commemorative-classic": "BLOOD MOON — TOTAL-ISH LUNAR ECLIPSE, AUGUST 27, 2026",
    "eclipse-texas": "TEXAS • BLOOD MOON • 8.27.26",
    "eclipse-ohio": "OHIO • BLOOD MOON • 8.27.26",
    "eclipse-california": "CALIFORNIA • BLOOD MOON • 8.27.26",
    "eclipse-florida": "FLORIDA • BLOOD MOON • 8.27.26",
    "eclipse-new-york": "NEW YORK • BLOOD MOON • 8.27.26",
    "eclipse-crew": "ECLIPSE CREW 2026",
    "eclipse-my-first": "MY FIRST ECLIPSE",
    "eclipse-almost-totality": "96% TOTAL. 100% WORTH IT.",
    "eclipse-stayed-up": "I STAYED UP PAST MIDNIGHT TO WATCH A SHADOW",
    "eclipse-sturgeon-moon": "STURGEON MOON RISING",
    "eclipse-dog-howl": "MY DOG HOWLED AT THE BLOOD MOON",
    "eclipse-team-umbra": "TEAM UMBRA",
    "eclipse-sorry-blood-moon": "SORRY FOR WHAT I SAID DURING THE BLOOD MOON",
    "eclipse-moon-phases": "la luna",
    "eclipse-moon-phases-light": "la luna",
}

# What was actually drawn, for the listing copy. Written from the composition, not from the brief.
CONCEPT = {
    "eclipse-commemorative-classic":
        "A large coppery-orange moon 96% covered by Earth's shadow with a thin bright silver sliver on "
        "the upper limb, stepped copper shadow bands, halftone crater texture, framed by two concentric "
        "rings, over bold condensed type and a seven-step lunar phase strip.",
    "eclipse-crew":
        "A bold arc of condensed type over the 96%-eclipsed coppery moon on a field of solid star dots.",
    "eclipse-my-first":
        "A friendly, plain coppery eclipsed moon under an arc of bold type, on a field of star dots.",
    "eclipse-almost-totality":
        "The 96%-eclipsed coppery moon with an arrow pointing at the thin silver sliver, labelled "
        "'the 4%', under heavy condensed type.",
    "eclipse-stayed-up":
        "A small eclipsed moon with a scatter of stars above four lines of heavy condensed type and a "
        "fine serif subline.",
    "eclipse-sturgeon-moon":
        "A leaping sturgeon in silhouette across a large coppery eclipsed moon, over stepped solid water "
        "bars, in a heavy retro slab face.",
    "eclipse-dog-howl":
        "The silhouette of a mixed-breed dog howling in front of the coppery eclipsed moon, under bold "
        "condensed type, with solid star dots.",
    "eclipse-team-umbra":
        "A clean single-weight diagram of the Sun, Earth and Moon with the umbra and penumbra shadow "
        "cones labelled in small caps, the Moon drawn as the coppery eclipsed disc.",
    "eclipse-sorry-blood-moon":
        "An arc of outlined moon phases with the blood moon at its centre, elegant high-contrast serif "
        "type, a copper rule and a mirrored botanical flourish of solid leaves.",
    "eclipse-moon-phases":
        "A vertical column of eight outlined moon phases with the coppery eclipsed moon at its centre, "
        "delicate solid stars, and 'la luna' set small in a high-contrast serif.",
}
for _s in ("eclipse-texas", "eclipse-ohio", "eclipse-california", "eclipse-florida", "eclipse-new-york"):
    CONCEPT[_s] = (CONCEPT["eclipse-commemorative-classic"].replace(
        "framed by two concentric rings",
        f"set over the silhouette of {_s.replace('eclipse-', '').replace('-', ' ').title()} in deep rust"))
CONCEPT["eclipse-moon-phases-light"] = CONCEPT["eclipse-moon-phases"].replace(
    "delicate solid stars", "drawn in deep night blue for light garments, with solid stars")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("SELECT slug FROM products WHERE slug LIKE 'eclipse-%'")
    taken = {r[0] for r in k.fetchall()}

    todo = [s for s in DESIGNS if s not in taken]
    if taken:
        print(f"zaten var, atlanacak: {sorted(taken)}\n")
    print(f"{len(todo)} urun · Klozio · $24.99 + Digital PNG · takvimde onay bekleyecek\n")

    for slug in todo:
        _fn, inches, hero = DESIGNS[slug]
        light = slug.endswith("-light")
        cols = LIGHT_COLORWAYS if light else DARK_COLORWAYS
        print(f"  {slug:32} {inches:>4}in  {hero:6} yazi: {HOOK[slug][:44]}")
        if a.apply:
            params = {"style": "poster", "placement": "center_chest", "print_inches": inches,
                      "aspect_ratio": "1:1", "resolution": "4k"}
            k.execute("""
                INSERT INTO products (shop_id, slug, niche, blank, technique, design_prompt, design_params,
                                      price_cents, pod_cost_cents, label_cost_cents, sizes, colorways,
                                      hero_colorway, personalised, hook, content_status, title,
                                      description, tags, created_at, updated_at)
                VALUES (%s,%s,%s,%s,'dtf',%s,%s,%s,%s,%s,%s,%s,%s,false,%s,'approved','','',%s,now(),now())""",
                      (SHOP_ID, slug, NICHE[slug], BLANK, CONCEPT[slug], json.dumps(params), PRICE_CENTS,
                       POD_CENTS, LABEL_CENTS, SIZES, cols, hero, HOOK[slug], []))
    if a.apply:
        c.commit()
        print(f"\n{len(todo)} urun eklendi. Sirada: build_eclipse_prints --apply -> gorseller -> "
              f"ilan metni -> takvime 'pending'.")
    else:
        print("\nDRY RUN. Eklemek icin --apply")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
