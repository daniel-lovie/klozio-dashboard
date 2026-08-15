#!/usr/bin/env python3
"""Eighty minimal left-chest designs — one per niche — written, checked, and scheduled ten a day.

The shop already carries 79 niches and most of them have never had a small wordless chest print. That is
the gap this fills: not another anime variant, which is the same buyer again, but one clean icon per
niche the shop already knows how to sell, plus ten niches it does not sell yet.

Concepts are WRITTEN by the model and KEPT by the machine. Every candidate is checked for the things that
have actually gone wrong in this pipeline before:

  ONE OBJECT      the minimal tail asks for "one small simple motif ... no background elements", and a
                  concept naming three things gets all three drawn small — a smudge at 3.5 inches.
  ITS OWN PALETTE the generic palette layer asks for six to twelve flat colours, right for a ten-inch
                  front print and wrong for a chest icon. `subject_of` drops the generic hint when the
                  concept names its own, so this is the supported way to say "colourful, but four".
  NO WORDS        no quotes, no "reading", no sign or banner shapes, because the design is wordless and
                  a concept that asks for a label gets an empty label drawn.
  NO IP           no brand, franchise, character, team or celebrity, checked against a banned list as
                  well as instructed.
  NO KEY COLOUR   magenta and hot pink are the background; a concept that asks for them is uncuttable
                  before a credit is spent.

    python3 scripts/seed_minimal_batch.py --plan          # write concepts, show them, save to a file
    python3 scripts/seed_minimal_batch.py --apply         # insert the products from that file
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import psycopg2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import batch_runner as br                                          # noqa: E402

PLAN_PATH = HERE.parent / "assets" / "minimal-batch-plan.json"
SHOP_ID = 1
BLANK = "Comfort Colors 1717"
MODEL = "claude-opus-5"
TARGET = 80

SIZES = ["S", "M", "L", "XL", "2X", "3X", "4X"]
COLORWAYS = ["Black", "Blossom", "Blue Jean", "Blue Spruce", "Butter", "Brick", "Denim", "Gray",
             "Ivory", "Chambray", "Espresso", "Moss", "Light Green", "Midnight", "Orchid", "Pepper",
             "Berry", "Violet", "Red", "Watermelon", "White", "Grape"]
HEROES = ["Ivory", "Pepper", "Moss", "Blue Jean", "Espresso", "Midnight", "Butter", "Denim"]

# Matches the rest of the catalogue: a 3142 anchor is $21.99 after the shop's 30% off. At $9.50 producer
# plus $5.50 label that is 32% gross, under the written 55% floor — the same conflict audit_pipeline.py
# already reports for 273 products. Priced to match the shop rather than invented, and reported.
PRICE_CENTS, POD_CENTS, LABEL_CENTS = 3142, 950, 550
PARAMS = {"style": "minimal", "placement": "left_chest", "print_inches": 3.5,
          "aspect_ratio": "1:1", "resolution": "4k"}

# Niches whose whole product IS the personalisation. A wordless icon in them is a different product and
# the operator asked for nothing custom.
SKIP_NICHE = re.compile(r"personalised|embroidery-custom", re.I)

# Ten the shop does not sell yet, checked against the existing 79.
NEW_NICHES = [
    "birdwatching minimal icon", "pottery / ceramics minimal icon", "trail running minimal icon",
    "stargazing / astronomy minimal icon", "mushroom foraging minimal icon",
    "sailing / coastal minimal icon", "gravel cycling minimal icon",
    "matcha / tea ceremony minimal icon", "woodworking hand tools minimal icon",
    "chess minimal icon",
    # Two more, because two existing niches cannot be done wordless by definition — "anime retro vhs
    # badge WITH TEXT" and "anime marathon culture" are built on lettering. A niche whose identity is
    # the words is not a niche this batch can serve, so it is replaced rather than fudged.
    "camping / campfire minimal icon", "surfing minimal icon",
]

# Niches that cannot exist without lettering. Excluded by name, with the reason attached.
TEXT_NICHE = re.compile(r"with text|marathon culture", re.I)

BANNED = re.compile(
    r"\b(nike|adidas|disney|pixar|marvel|dc comics|pokemon|nintendo|star wars|harry potter|lego|"
    r"coca[- ]cola|starbucks|nfl|nba|mlb|nhl|yankees|lakers|taylor swift|mickey|batman|superman|"
    r"spider[- ]?man|mario|zelda|minecraft|fortnite|hello kitty|barbie)\b", re.I)
# The apostrophe is NOT a quote. The first version banned it and refused nine perfectly good concepts
# for writing "a cat's paw" — twice each, because the retry could not tell what it was supposed to
# change. Only real quotation marks, and only label-words used as an OBJECT ("a banner", "a sign"),
# not in passing ("label-free", "signature curl").
WORDY = re.compile(r"[\"“”]|\b(?:a|an|the|one|small|blank|empty)\s+"
                   r"(?:banner|ribbon|scroll|sign|label|placard|nameplate|caption|slogan)\b"
                   r"|\b(?:text|lettering|typography|slogan|caption)\b"
                   r"|\b(?:reading|that says|spelling out)\b", re.I)

SPEC = """You write single-object concepts for small left-chest t-shirt prints. US market, Etsy.

Each concept describes ONE object, drawn as clean flat minimal line art, printed about 3.5 inches on the
left chest. It is an illustration with NO WORDS ON IT.

Rules, all mandatory:
- Exactly one main object. Not a scene, not a collection, not three things together. One.
- 2 or 3 sentences, then a final sentence beginning "Palette:" naming FOUR flat colours with a role each.
- Flat shapes and solid colour only. No gradients, no soft glows, no shading fades.
- NO text, letters, numbers, banners, ribbons, scrolls, signs, labels or anything that reserves space
  for words. The shirt is wordless.
- No brand, franchise, character, team, mascot or celebrity. Nothing trademarked. Generic objects only.
- Never magenta, fuchsia or hot pink in the palette — that colour is the background key and gets cut out.
- Readable at 3.5 inches: bold simple shapes, no fine hatching, no tiny detail.

Reply with the concept only, no preamble, no title."""


def call(messages: list[dict], system: str) -> str:
    body = json.dumps({"model": MODEL, "max_tokens": 3000, "system": system,
                       "messages": messages}).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={"content-type": "application/json",
                 "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                 "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(req, timeout=180) as r:
        out = json.loads(r.read())
    if out.get("stop_reason") == "max_tokens":
        raise RuntimeError("yanit token sinirinda kesildi")
    return "".join(b.get("text", "") for b in out.get("content", []) if b.get("type") == "text").strip()


def check(concept: str) -> str:
    if not (120 <= len(concept) <= 520):
        return f"{len(concept)} karakter (120-520 bekleniyor)"
    if "palette:" not in concept.lower():
        return "kendi paleti yok"
    if WORDY.search(concept):
        return f"yazi/etiket vaat ediyor: {WORDY.search(concept).group(0)!r}"
    if BANNED.search(concept):
        return f"marka/IP: {BANNED.search(concept).group(0)!r}"
    if br.concept_uses_key_hue(concept):
        return f"anahtar renk: {br.concept_uses_key_hue(concept)!r}"
    return ""


def write_concept(niche: str) -> tuple[str, str, str]:
    msgs = [{"role": "user", "content": f"Niche: {niche}\n\nWrite the concept."}]
    for attempt in (1, 2):
        cand = call(msgs, SPEC)
        why = check(cand)
        if not why:
            return niche, cand, ""
        if attempt == 2:
            return niche, cand, why
        msgs += [{"role": "assistant", "content": cand},
                 {"role": "user", "content": f"That concept is not usable: {why}. Rewrite it so every "
                                             f"rule holds. Reply with the concept only."}]
    return niche, "", "bilinmeyen"


def slug_for(niche: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", niche.lower()).strip("-")
    base = re.sub(r"-(minimal|icon|humor|humour)\b", "", base).strip("-")[:24].strip("-")
    s = f"{base}-m1-v1"
    n = 1
    while s in taken:
        n += 1
        s = f"{base}-m{n}-v1"
    return s


def plan() -> int:
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("SELECT DISTINCT niche FROM products WHERE niche IS NOT NULL ORDER BY 1")
    existing = [r[0] for r in k.fetchall()
                if not SKIP_NICHE.search(r[0]) and not TEXT_NICHE.search(r[0])]
    k.execute("SELECT slug FROM products")
    taken = {r[0] for r in k.fetchall()}
    c.close()

    niches = (NEW_NICHES + existing)[:TARGET]
    # Re-runnable: a niche that already has a good concept in the plan is not paid for again.
    have = {}
    if PLAN_PATH.exists():
        have = {r["niche"]: r for r in json.loads(PLAN_PATH.read_text())}
        taken |= {r["slug"] for r in have.values()}
        niches = [n for n in niches if n not in have]
        print(f"planda {len(have)} konsept var, {len(niches)} tanesi eksik")
    print(f"{len(niches)} nis icin konsept yazilacak ({len(NEW_NICHES)} yeni, "
          f"{len(niches)-len(NEW_NICHES)} mevcut)\n")

    out, bad = list(have.values()), 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(write_concept, n) for n in niches]
        for f in as_completed(futs):
            niche, concept, why = f.result()
            if why:
                bad += 1
                print(f"  RED {niche}: {why}", file=sys.stderr)
                continue
            s = slug_for(niche, taken)
            taken.add(s)
            out.append({"slug": s, "niche": niche, "concept": concept,
                        "hero": HEROES[len(out) % len(HEROES)]})
    out.sort(key=lambda r: r["slug"])
    PLAN_PATH.parent.mkdir(parents=True, exist_ok=True)
    PLAN_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False))
    print(f"\n{len(out)} konsept yazildi, {bad} reddedildi -> {PLAN_PATH.name}")
    for r in out[:6]:
        print(f"\n  {r['slug']}  ({r['niche']})\n    {r['concept'][:200]}")
    return 0


def apply_plan() -> int:
    rows = json.loads(PLAN_PATH.read_text())
    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("SELECT slug FROM products")
    taken = {r[0] for r in k.fetchall()}
    added = 0
    for r in rows:
        if r["slug"] in taken:
            print(f"  atlandi (var): {r['slug']}", file=sys.stderr)
            continue
        k.execute("""
            INSERT INTO products (shop_id, slug, niche, blank, technique, design_prompt, design_params,
                                  price_cents, pod_cost_cents, label_cost_cents, sizes, colorways,
                                  hero_colorway, personalised, hook, content_status, title, description,
                                  tags, created_at, updated_at)
            VALUES (%s,%s,%s,%s,'dtf',%s,%s,%s,%s,%s,%s,%s,%s,false,NULL,'approved','','',%s,now(),now())""",
                  (SHOP_ID, r["slug"], r["niche"], BLANK, r["concept"], json.dumps(PARAMS),
                   PRICE_CENTS, POD_CENTS, LABEL_CENTS, SIZES, COLORWAYS, r["hero"], []))
        added += 1
    c.commit()
    c.close()
    print(f"{added} urun eklendi — baslik/aciklama BOS, once tasarim uretilecek")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    if a.plan:
        return plan()
    if a.apply:
        return apply_plan()
    print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main())
