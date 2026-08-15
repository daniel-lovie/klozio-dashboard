#!/usr/bin/env python3
"""Write the title, tags and description for products whose design already exists.

Order matters and it is the reason this is a separate script: the copy describes what was DRAWN, not
what was asked for. A concept says "a pair of field binoculars with a songbird on the hinge" and the
generator returns something close but not identical, and a listing written from the brief rather than
from the result is how a shop ends up selling a shirt it does not have.

Every field is checked before it is written, against the standards the shop states:

  TITLE        125-140 characters, comma-separated phrases, primary keyword inside the first 40, no
               quotes or promised words — the design is wordless.
  TAGS         exactly 13, each 20 characters or fewer, each multi-word. Etsy rejects a 21-character
               tag outright and single words compete with the entire site.
  DESCRIPTION  the AI disclosure inside the first 600 characters, because Etsy has removed listings for
               burying it, and the shop's own physical spec so the buyer knows what arrives.

A field that fails is reported and NOT written. Half a listing is worse than none: it looks finished.

    python3 scripts/write_listing_copy.py --limit 3      # dry run
    python3 scripts/write_listing_copy.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import psycopg2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from seed_minimal_batch import call                                # noqa: E402

LOW, HIGH = 125, 140
KEYWORD_HEAD = 40
TAGS_N, TAG_MAX = 13, 20
DISCLOSURE_HEAD = 600

QUOTED = re.compile(r"[\"“”]|[!?]|\b(that says|reading|slogan|lettering)\b", re.I)

# The physical half of the description never changes and must never be improvised: it is the product
# spec, and a model rewriting "6.1 oz" as "heavyweight" is a claim the producer did not make.
BODY = """THE TEE
• Comfort Colors® 1717 · 100% ring-spun cotton · 6.1 oz, garment-dyed so the colour softens instead of fading
• Relaxed unisex cut — size down if you want it fitted
• Sizes S–4XL · 22 Comfort Colors shades — pick yours from the colour chart in the photos
• DTF print, small left-chest placement — soft to the touch, no cracking, no stiff plastic square

SHIPPING
• Made and shipped from Dallas, Texas, within 1 business day
• Tracking on every order

CARE
Cold wash inside out, tumble dry low, no bleach, and keep the iron off the print.

Questions? Message me — I reply the same day."""

DISCLOSURE = ("ABOUT THE DESIGN — This design was created by me using AI image-generation tools as part "
              "of my design process, then refined and prepared for print by hand. Original illustration.")

SPEC = f"""You write Etsy listing copy for a US print-on-demand t-shirt shop.

The shirt carries a SMALL WORDLESS ILLUSTRATION on the left chest, about 3.5 inches. There is no text on
the garment. Never promise words, quotes or slogans.

Return STRICT JSON with exactly these keys and nothing else:
  "title"   — {LOW} to {HIGH} characters. Four or five phrases separated by commas. The primary keyword
              phrase comes first and fits inside the first {KEYWORD_HEAD} characters. Include
              "Comfort Colors" once. Every phrase starts with a capital letter. No quotes, no exclamation
              or question marks. US English, no emoji, no ALL CAPS words.
  "tags"    — exactly {TAGS_N} strings. Each at most {TAG_MAX} characters INCLUDING spaces, and each must
              be TWO OR MORE words. No duplicates. No punctuation. Lowercase.
  "hook"    — one sentence, at most 140 characters, describing the illustration for the top of the
              listing. It must not quote or promise any printed words.

Do not invent a brand, franchise, character, team or celebrity."""


def conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def check(d: dict) -> str:
    t = str(d.get("title", "")).strip()
    if not (LOW <= len(t) <= HIGH):
        return f"baslik {len(t)} karakter (band {LOW}-{HIGH})"
    if "," not in t:
        return "baslikta virgul yok"
    if len(t.split(",")[0].strip()) > KEYWORD_HEAD:
        return f"ilk segment {len(t.split(',')[0].strip())} karakter (>{KEYWORD_HEAD})"
    if QUOTED.search(t):
        return "baslik hala yazi vaat ediyor"
    if any(seg.strip() and seg.strip()[0].islower() for seg in t.split(",")[1:]):
        return "baslikta kucuk harfle baslayan segment"
    if "comfort colors" not in t.lower():
        return "baslikta Comfort Colors yok"

    tags = d.get("tags") or []
    if not isinstance(tags, list) or len(tags) != TAGS_N:
        return f"tag sayisi {len(tags) if isinstance(tags, list) else '?'} (tam {TAGS_N} olmali)"
    seen = set()
    for tg in tags:
        s = str(tg).strip()
        if len(s) > TAG_MAX:
            return f"tag {len(s)} karakter: {s!r}"
        if " " not in s:
            return f"tek kelimelik tag: {s!r}"
        if s.lower() in seen:
            return f"tekrar eden tag: {s!r}"
        seen.add(s.lower())

    hook = str(d.get("hook", "")).strip()
    if not (20 <= len(hook) <= 140):
        return f"hook {len(hook)} karakter"
    if QUOTED.search(hook):
        return "hook yazi vaat ediyor"
    return ""


def build_description(hook: str) -> str:
    text = f"{hook}\n\n{DISCLOSURE}\n\n{BODY}"
    # The gate the shop is actually judged on: the disclosure has to be readable before the fold.
    assert re.search(r"\bAI\b", text[:DISCLOSURE_HEAD]), "AI beyani ilk 600 karakterde degil"
    return text


def one(row) -> tuple:
    pid, slug, niche, concept = row
    msgs = [{"role": "user", "content":
             f"Niche: {niche}\nIllustration printed on the shirt: {concept}\n\nWrite the JSON."}]
    for attempt in (1, 2):
        raw = call(msgs, SPEC)
        try:
            d = json.loads(re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip())
        except ValueError:
            why = "JSON ayristirilamadi"
            d = {}
        else:
            why = check(d)
        if not why:
            return pid, slug, d, ""
        if attempt == 2:
            return pid, slug, d, why
        msgs += [{"role": "assistant", "content": raw},
                 {"role": "user", "content": f"Rejected: {why}. Fix exactly that and return the JSON "
                                             f"again, nothing else."}]
    return pid, slug, {}, "bilinmeyen"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()

    c = conn()
    k = c.cursor()
    # Only products whose design EXISTS. Copy written before the artwork describes a brief, not a shirt.
    k.execute("""SELECT id, slug, niche, design_prompt FROM products
                  WHERE (title = '' OR title IS NULL) AND print_file IS NOT NULL
                  ORDER BY id""")
    rows = k.fetchall()
    c.close()
    if a.limit:
        rows = rows[:a.limit]
    print(f"{len(rows)} urunun ilan metni yazilacak\n")

    ok = bad = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        for f in as_completed([pool.submit(one, r) for r in rows]):
            pid, slug, d, why = f.result()
            if why:
                bad += 1
                print(f"  RED {slug}: {why}", file=sys.stderr)
                continue
            ok += 1
            print(f"{slug}\n    T({len(d['title'])}) {d['title']}\n    tags: {', '.join(d['tags'])}")
            if a.apply:
                c = conn()
                k = c.cursor()
                k.execute("""UPDATE products SET title=%s, tags=%s, description=%s, updated_at=now()
                              WHERE id=%s""",
                          (d["title"], d["tags"], build_description(d["hook"]), pid))
                c.commit()
                c.close()
    print(f"\n{ok} ilan {'yazildi' if a.apply else 'yazilacak'}, {bad} reddedildi")
    if not a.apply:
        print("uygulamak icin --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
