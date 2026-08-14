#!/usr/bin/env python3
"""Measure the catalogue against the standards this shop says it holds.

Every rule here is written down somewhere — CLAUDE.md's hard numbers, the listing standards, the AI
disclosure policy — and none of them was ever checked in one place. A standard nobody measures is a
preference, so this prints the gap, product by product, and exits non-zero when something that reaches a
buyer is wrong.

    python3 scripts/audit_pipeline.py            # everything
    python3 scripts/audit_pipeline.py --live     # only what is on Etsy right now
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter

import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import produce_images as pi   # noqa: E402 — the one authority on what a product's print size is

TITLE_MAX = 140
TITLE_BAND = (125, 140)
TAGS_REQUIRED = 13
TAG_MAX = 20
SEO_FLOOR = 85
GROSS_FLOOR = 55.0
NET_FLOOR = 40.0
PRINT_PPI = 300


# NOT a fixed band. CLAUDE.md still says $18-26, which was true when the producer charged $6 all-in; at the
# real $9.50 + $5.50 label a $26 tee makes 42% gross, so the written band and the written 55% gross floor
# cannot both be satisfied — 269 of 271 products sit outside the band and are RIGHT to. The floor is the
# rule; the price that clears it is arithmetic, so it is computed rather than remembered.
DISCOUNT = 0.70   # magaza geneli %30 indirim: alicinin odedigi = price_cents * 0.7


def min_price_cents(pod_cents: int, label_cents: int, floor_pct: float = GROSS_FLOOR) -> int:
    """The ANCHOR needed to clear the floor once the shop discount is applied.

    price_cents is an anchor, not what the buyer pays. Measuring margin against it overstates every product
    by about twenty points — the catalogue reads 53% gross on the anchor and 35.8% on what actually arrives.
    """
    cogs = (pod_cents or 0) + (label_cents or 0)
    return int(round(cogs / (1 - floor_pct / 100) / DISCOUNT))
# "Designed by" attribution plus a disclosure the buyer meets before the fold. Etsy has removed listings
# for burying it, so the check is position-aware rather than a substring search.
DISCLOSURE_WORDS = re.compile(r"\b(ai|artificial intelligence|yapay zek)\w*\b", re.I)
DISCLOSURE_HEAD = 600


def rows(cur, sql, *args):
    cur.execute(sql, args)
    return cur.fetchall()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="only listings currently on Etsy")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    cur = c.cursor(cursor_factory=psycopg2.extras.DictCursor)
    where = "WHERE etsy_listing_id IS NOT NULL" if a.live else ""
    prods = rows(cur, f"""
        SELECT id, slug, title, description, tags, price_cents, seo_score, gross_margin_pct,
               net_margin_pct, pod_cost_cents, label_cost_cents,
               technique, content_status, design_state, hook, colorways, sizes,
               etsy_listing_id, etsy_state, print_file_w, print_file_h, design_params,
               (print_file IS NOT NULL) AS has_print,
               (SELECT count(*) FROM product_images g WHERE g.product_id = p.id) AS images
          FROM products p {where} ORDER BY id""")

    findings: dict[str, list[str]] = {}

    def flag(rule: str, slug: str, detail: str) -> None:
        findings.setdefault(rule, []).append(f"{slug}: {detail}")

    for p in prods:
        slug = p["slug"]
        live = p["etsy_listing_id"] is not None
        t = (p["title"] or "").strip()
        if not t:
            flag("baslik yok", slug, "-")
        else:
            if len(t) > TITLE_MAX:
                flag("baslik 140 karakteri asiyor", slug, f"{len(t)}")
            elif not (TITLE_BAND[0] <= len(t) <= TITLE_BAND[1]):
                flag(f"baslik {TITLE_BAND[0]}-{TITLE_BAND[1]} bandi disinda", slug, f"{len(t)}")
            if "," not in t:
                flag("baslikta virgul ayraci yok", slug, t[:50])

        tags = p["tags"] or []
        if isinstance(tags, str):
            tags = [x.strip() for x in tags.split(",") if x.strip()]
        if len(tags) != TAGS_REQUIRED:
            flag(f"tag sayisi {TAGS_REQUIRED} degil", slug, f"{len(tags)}")
        for tg in tags:
            if len(tg) > TAG_MAX:
                flag("tag 20 karakteri asiyor", slug, f"{tg!r} ({len(tg)})")
        single = [tg for tg in tags if " " not in tg]
        if single:
            flag("tek kelimelik tag", slug, ", ".join(single[:4]))

        d = (p["description"] or "")
        if not d.strip():
            flag("aciklama yok", slug, "-")
        elif not DISCLOSURE_WORDS.search(d[:DISCLOSURE_HEAD]):
            where_found = "hic yok" if not DISCLOSURE_WORDS.search(d) else "var ama asagida gomulu"
            flag("AI aciklamasi ilk 600 karakterde yok", slug, where_found)

        if p["seo_score"] is not None and p["seo_score"] < SEO_FLOOR and live:
            flag(f"yayinda SEO {SEO_FLOOR} altinda", slug, f"{p['seo_score']}")

        pc = p["price_cents"]
        if pc is not None and p["pod_cost_cents"]:
            need = min_price_cents(p["pod_cost_cents"], p["label_cost_cents"] or 0)
            if pc < need:
                flag(f"fiyat brut %{GROSS_FLOOR:.0f} tabanini tutturmuyor", slug,
                     f"{pc/100:.2f} — bu maliyetle en az {need/100:.2f} gerekir")

        # Only the net floor is reported separately: a gross breach is the same fact as the price flag above
        # and listing it twice makes the total look worse than the catalogue is.
        v = p["net_margin_pct"]
        if v is not None and float(v) < NET_FLOOR:
            flag(f"net marj {NET_FLOOR:.0f}% altinda", slug, f"{float(v):.1f}%")

        if p["has_print"]:
            w, h = p["print_file_w"] or 0, p["print_file_h"] or 0
            # The same resolver produce_product and measure_product use, rather than a second reading of
            # design_params. Reading `print_inches` raw and defaulting to 10 disagreed with the pipeline on
            # every minimal/left-chest row — demanding 2850 px where the design prints 1140 — and an audit
            # that cries wolf is an audit whose real flags get skipped.
            declared = pi.print_placement(p["design_params"] if isinstance(p["design_params"], dict) else None)["inches"]
            # NOTE: this reads the stored COLUMNS, which measure the canvas and can also disagree with the
            # bytes (one row claims 3382x3382 for a 2048x2048 file and is therefore invisible to both this
            # audit and the upscaler). The artwork's own size is what prints; measure_product.py reads the
            # bytes and is the authority. This check is the cheap catalogue-wide sweep, so it is
            # deliberately generous — it flags what is short even by the flattering measure.
            if max(w, h) < declared * PRINT_PPI * 0.95:
                flag("baski dosyasi beyan edilen boyut icin dusuk cozunurluk", slug,
                     f"{w}x{h} px, {declared:g} inc icin {int(declared*PRINT_PPI)} gerekir")

        if live and not p["images"]:
            flag("yayinda ama gorseli yok", slug, "-")
        if p["content_status"] == "approved" and p["design_state"] == "ready" and not p["has_print"]:
            flag("hazir gorunuyor ama baski dosyasi yok", slug, "-")

    print(f"denetlenen urun: {len(prods)}\n")
    total = 0
    for rule in sorted(findings, key=lambda r: -len(findings[r])):
        hits = findings[rule]
        total += len(hits)
        print(f"[{len(hits):>3}] {rule}")
        for h in hits[:6]:
            print(f"        {h}")
        if len(hits) > 6:
            print(f"        … +{len(hits)-6} tane daha")
    print(f"\ntoplam bulgu: {total}")

    dupes = rows(cur, """SELECT lower(title) t, count(*) n FROM products
                          WHERE title IS NOT NULL AND etsy_listing_id IS NOT NULL
                          GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC LIMIT 5""")
    if dupes:
        print("\nyayinda ayni baslik (Etsy'de birbirini yer):")
        for d in dupes:
            print(f"   {d['n']}x  {d['t'][:70]}")
    c.close()
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
