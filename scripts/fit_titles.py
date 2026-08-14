#!/usr/bin/env python3
"""Bring titles into the 125-140 character operating band without losing the keyword that earns the click.

Titles average 126 characters here, built as four or five comma-separated keyword phrases. The band is a
standard this shop states; meeting it means dropping phrases, so which ones go is the whole question.

Rules, in order:
  1. The FIRST segment is never touched. It carries the primary keyword and CLAUDE.md requires it unbroken
     inside the first 40 characters — that is what a shopper sees before Etsy truncates.
  2. "Comfort Colors" is kept when present. It is not decoration: it is a search term buyers type.
  3. Remaining segments are added longest-first while they fit, so the band fills with the most specific
     phrases rather than whatever happened to come next.
  4. A title that still falls under 125 gets back the best segment that fits, because an under-length title
     wastes search surface just as an over-length one wastes attention. NOTE: this tool can only DROP
     segments — it cannot invent keywords, so it cannot lift a short title into the band. Titles below 125
     need new keyword phrases written, which is a content job, not a trimming one.

Nothing is written without --apply, and a title that cannot be fitted is reported rather than mangled.

    python3 scripts/fit_titles.py                 # dry run, shows every change
    python3 scripts/fit_titles.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys

import psycopg2

LOW, HIGH = 125, 140
KEYWORD_HEAD = 40


# Words every apparel listing carries; repeating them buys no search surface.
FILLER = {"shirt", "tee", "t-shirt", "tshirt", "gift", "gifts", "funny", "custom", "personalized",
          "for", "and", "the", "a", "an", "womens", "mens", "unisex"}


def _words(text: str) -> set[str]:
    return {w.strip("®,.-").lower() for w in text.split() if w.strip("®,.-")}


# How often each word appears across every title in the catalogue. A word in three titles identifies a
# niche; a word in two hundred identifies nothing. Filled by main() before any title is fitted.
DF: dict[str, int] = {}


def _new_words(seg: str, head: str, chosen: list[str]) -> float:
    """What this segment ADDS, weighted by how distinctive the words are.

    Counting new words alone left ties that length then broke the wrong way: "Funny Fantasy Book Lover
    Gift" beat "Litrpg Dungeon Crawler Tee" by three characters, dropping the one term a litrpg buyer
    actually types. Rarity settles it — a word carried by three listings is worth more than one carried
    by two hundred.
    """
    have = _words(head).union(*(_words(c) for c in chosen)) if chosen else _words(head)
    return sum(1.0 / (1 + DF.get(w, 0)) for w in (_words(seg) - have - FILLER))


def split_segments(title: str) -> list[str]:
    return [s.strip() for s in title.split(",") if s.strip()]


def fit(title: str) -> tuple[str, str]:
    """Returns (new_title, note). note is empty when nothing had to change."""
    segs = split_segments(title)
    if not segs:
        return title, "segment yok"
    head = segs[0]
    if len(head) > HIGH:
        return title, f"ilk segment tek basina {len(head)} karakter, kesilemez"

    rest = segs[1:]
    chosen: list[str] = []
    # Comfort Colors first: it is a keyword, not a flourish.
    cc = next((s for s in rest if "comfort colors" in s.lower()), None)
    if cc and len(head) + 2 + len(cc) <= HIGH:
        chosen.append(cc)
        rest = [s for s in rest if s is not cc]

    def total(extra: str | None = None) -> int:
        parts = [head] + chosen + ([extra] if extra else [])
        return len(", ".join(parts))

    # Rank by what a segment ADDS, not by how long it is. Length picked "Funny Fantasy Book Lover Gift"
    # over "Litrpg Dungeon Crawler Tee" purely because it was three characters longer, and a niche term is
    # what a buyer types — filler like funny/gift/tee/shirt is not, so it does not count toward the score.
    for s in sorted(rest, key=lambda s: (_new_words(s, head, chosen), len(s)), reverse=True):
        if total(s) <= HIGH:
            chosen.append(s)
    out = ", ".join([head] + chosen)

    if len(out) < LOW:
        # Under the band: try the longest unused segment that still fits under HIGH.
        unused = [s for s in segs[1:] if s not in chosen]
        for s in sorted(unused, key=len, reverse=True):
            if len(out) + 2 + len(s) <= HIGH:
                out = f"{out}, {s}"
                break
    note = ""
    if not (LOW <= len(out) <= HIGH):
        note = f"banda oturmadi ({len(out)})"
    if len(head) > KEYWORD_HEAD:
        note = (note + " · " if note else "") + f"birincil kelime {len(head)} karakter (>40)"
    return out, note


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute(f"""SELECT id, slug, title, etsy_listing_id FROM products
                   WHERE title IS NOT NULL AND length(title) NOT BETWEEN {LOW} AND {HIGH}
                   ORDER BY id""")
    rows = k.fetchall()

    k.execute("SELECT title FROM products WHERE title IS NOT NULL")
    for (t,) in k.fetchall():
        for w in _words(t):
            DF[w] = DF.get(w, 0) + 1

    changed, skipped, live = 0, 0, 0
    # Only LIVE titles can collide in a way that matters: two listings with the same title compete in Etsy
    # search. A draft twin sharing a title costs nothing, and blocking on it kept the live half of seven
    # pairs stuck at 134 characters while its unpublished copy sat safely in the band.
    seen: dict[str, tuple[str, bool]] = {}
    k.execute("SELECT lower(title), slug, etsy_listing_id IS NOT NULL FROM products WHERE title IS NOT NULL")
    for t, s, is_live in k.fetchall():
        if is_live or t not in seen:
            seen[t] = (s, is_live)

    for pid, slug, title, etsy in rows:
        new, note = fit(title)
        if new == title:
            skipped += 1
            continue
        # Two identical titles compete with each other in Etsy search; trimming must not create a collision.
        other = seen.get(new.lower())
        if other and other[0] != slug and other[1]:
            print(f"  ATLANDI {slug}: kirpilmis baslik YAYINDAKI {other[0]} ile ayni olurdu", file=sys.stderr)
            skipped += 1
            continue
        seen[new.lower()] = (slug, bool(etsy))
        changed += 1
        live += 1 if etsy else 0
        flag = " · YAYINDA" if etsy else ""
        print(f"{slug} {len(title)}->{len(new)}{flag}{' · ' + note if note else ''}")
        print(f"    - {title}")
        print(f"    + {new}")
        if a.apply:
            k.execute("UPDATE products SET title=%s, updated_at=now() WHERE id=%s", (new, pid))
    if a.apply:
        c.commit()
    c.close()
    print(f"\n{changed} baslik {'guncellendi' if a.apply else 'guncellenecek'} "
          f"({live} tanesi yayinda), {skipped} atlandi")
    if not a.apply:
        print("uygulamak icin --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
