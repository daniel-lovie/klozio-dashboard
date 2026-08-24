#!/usr/bin/env python3
"""Yesterday's search trends, sorted into what we can legally put on a shirt and what we cannot.

    python3 scripts/trend_scan.py                     # US, table
    python3 scripts/trend_scan.py --geo US,GB,CA --json

WHY THE FILTER IS THE POINT, not the feed.

Google's trending feed is free and public — https://trends.google.com/trending/rss?geo=US, no key, no
quota, updated within the hour. Getting the data is the easy half and it took ten minutes.

The hard half is that the feed is mostly things we are not allowed to print. Measured on 30 trends
across US/GB/CA on 2026-08-24: 14 were a named person, 11 were a club or league, and exactly ONE —
"lunar eclipses" — could become a design without using somebody's name, face or mark. An automated
trend-to-tshirt pipeline with no filter does not produce a design a day; it produces an infringement a
day, and the penalty tier for that is shop closure rather than a warning.

So this tool's output is not "today's trend". It is "today's trends, each with a verdict and a reason",
and the only rows worth designing from are the ones it marks USABLE.

WHAT IS ACTUALLY EXTRACTABLE from a blocked trend is the CATEGORY it points at, never the subject. A
film trending does not license the film; it tells you people are thinking about, say, gothic horror
this week, and gothic horror is ours to draw. That translation is a judgement call, which is why this
tool hands the operator a list rather than queueing a product.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

NS = {"ht": "https://trends.google.com/trending/rss"}
FEED = "https://trends.google.com/trending/rss?geo={geo}"
UA = "Mozilla/5.0 (compatible; klozio-trend-scan/1.0)"

# A club fixture, a league, a franchise. All marks.
TEAM = re.compile(
    r"\bvs\.?\b|\bv\b\s|\b(fc|cf|sc|afc|united|city|rovers|county|athletic)\b"
    r"|\b(nfl|nba|nhl|mlb|mls|ufc|wwe|ncaa|premier league|la liga|serie a|bundesliga|ligue 1"
    r"|champions league|world cup|super bowl|olympics|formula 1|f1)\b",
    re.I)

# A company or a product. "honda cr-v" was landing in the club bucket, which is the right verdict for
# the wrong reason — and a reason the operator reads is the whole output of this tool.
BRAND = re.compile(
    r"\b(honda|toyota|ford|tesla|bmw|apple|google|amazon|meta|microsoft|samsung|nike|adidas"
    r"|outage|recall|stock|earnings|ipo|layoffs|visa|airlines)\b", re.I)

# Entertainment property: a title is copyright, its characters are too.
PROPERTY = re.compile(
    r"\b(season \d|episode|trailer|premiere|box office|netflix|disney|hbo|marvel|dc |star wars"
    r"|pokemon|nintendo|playstation|xbox|taylor swift|album|tour dates|movie|film|series)\b", re.I)

# A person: names carry publicity rights even when the person is not famous enough to notice.
PERSON_HINT = re.compile(
    r"\b(actor|actress|singer|rapper|player|coach|quarterback|striker|ceo|senator|governor"
    r"|died|dies|death|obituary|arrested|lawsuit|divorce|engaged|pregnant|wife|husband)\b", re.I)

# Somebody is having the worst day of their life. Checked BEFORE the generic list on purpose: the
# generic list contains "wildfire", "hurricane" and "blizzard" because those make good seasonal weather
# designs — and on 2026-08-24 "velma" came through as a drawable weather trend when what had actually
# happened was a town in Oklahoma evacuating ahead of a fire. Selling a rainy-day joke off an evacuation
# is not a legal problem, it is a shop-ending one, and no amount of category abstraction fixes it.
HARM = re.compile(
    r"\b(evacuat\w*|evacuation|casualt\w*|fatalit\w*|killed|dead|deaths?|death toll|injur\w*"
    r"|victims?|missing|manhunt|shooting|shot|stabbed|stabbing|gunman|hostage|kidnap\w*"
    r"|crash|collision|derail\w*|collapse|quake|earthquake|tsunami|flooding|floods?|mudslide"
    r"|landfall|storm surge|state of emergency|disaster|wreckage|rescue|survivors?"
    r"|outbreak|epidemic|overdose|suicide|funeral|memorial|mourning|vigil"
    r"|war|airstrike|bombing|shelling|invasion|refugee|protest|riot|unrest)\b", re.I)

# Ours to draw: weather, sky, seasons, food, hobbies, plain nouns.
GENERIC = re.compile(
    r"\b(eclipse|meteor|aurora|solstice|equinox|full moon|comet|hurricane|blizzard|heat wave"
    r"|wildfire|recipe|sourdough|coffee|matcha|garden|planting|frost|harvest|migration|whale"
    r"|northern lights|daylight saving|leap year|tax day|back to school|thanksgiving|halloween"
    r"|christmas|new year|spring|summer|autumn|winter)\b", re.I)


def fetch(geo: str) -> list[dict]:
    req = urllib.request.Request(FEED.format(geo=geo), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        root = ET.fromstring(r.read())
    out = []
    for it in root.findall(".//item"):
        news = [{
            "title": n.findtext("ht:news_item_title", default="", namespaces=NS) or "",
            "source": n.findtext("ht:news_item_source", default="", namespaces=NS) or "",
            "url": n.findtext("ht:news_item_url", default="", namespaces=NS) or "",
        } for n in it.findall("ht:news_item", NS)]
        out.append({
            "geo": geo,
            "term": (it.findtext("title") or "").strip(),
            "traffic": it.findtext("ht:approx_traffic", default="", namespaces=NS) or "",
            "published": (it.findtext("pubDate") or "")[:25],
            "picture": it.findtext("ht:picture", default="", namespaces=NS) or "",
            "news": news,
        })
    return out


def looks_like_name(term: str, blob: str) -> bool:
    """Two or three lowercase words in the feed that the news writes as capitalised — a person."""
    words = [w for w in re.split(r"[^a-z']+", term.lower()) if w]
    if not (1 < len(words) <= 3):
        return False
    caps = sum(1 for w in words if re.search(rf"\b{re.escape(w)}\b", blob, re.I)
               and re.search(rf"\b{w.capitalize()}\b", blob))
    return caps >= len(words) - 1


def verdict(t: dict) -> tuple[str, str]:
    blob = f"{t['term']} " + " ".join(n["title"] for n in t["news"])
    if BRAND.search(blob):
        return "BLOCKED", "sirket / urun markasi"
    if TEAM.search(blob):
        return "BLOCKED", "kulup / lig markasi"
    if PROPERTY.search(blob):
        return "BLOCKED", "telifli yapim ya da marka"
    if HARM.search(blob):
        return "BLOCKED", "afet / insan zarari — tisort konusu degil"
    if GENERIC.search(t["term"]) or GENERIC.search(blob):
        return "USABLE", "jenerik kavram — cizilebilir"
    if PERSON_HINT.search(blob) or looks_like_name(t["term"], blob):
        return "BLOCKED", "kisi adi / benzerlik hakki"
    return "REVIEW", "siniflandirilamadi — insan baksin"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--geo", default="US")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--hours", type=int, default=24, help="bu kadar saatten eskisini at")
    a = ap.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(hours=a.hours)
    rows: list[dict] = []
    for geo in [g.strip().upper() for g in a.geo.split(",") if g.strip()]:
        try:
            for t in fetch(geo):
                try:
                    when = datetime.strptime(t["published"], "%a, %d %b %Y %H:%M:%S").replace(tzinfo=timezone.utc)
                    if when < cutoff:
                        continue
                except ValueError:
                    pass                       # unparsable date is not a reason to drop a live trend
                t["verdict"], t["reason"] = verdict(t)
                rows.append(t)
        except Exception as e:
            print(f"{geo}: alinamadi — {type(e).__name__}: {e}", file=sys.stderr)

    if a.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    order = {"USABLE": 0, "REVIEW": 1, "BLOCKED": 2}
    rows.sort(key=lambda r: (order[r["verdict"]], r["geo"]))
    n_use = sum(1 for r in rows if r["verdict"] == "USABLE")
    n_rev = sum(1 for r in rows if r["verdict"] == "REVIEW")
    print(f"{len(rows)} trend · {n_use} cizilebilir · {n_rev} incelenecek · "
          f"{len(rows) - n_use - n_rev} engelli\n")
    for r in rows:
        mark = {"USABLE": "+", "REVIEW": "?", "BLOCKED": "x"}[r["verdict"]]
        print(f" {mark} [{r['geo']}] {r['term'][:38]:38} {r['traffic']:>7}  {r['reason']}")
        if r["verdict"] != "BLOCKED" and r["news"]:
            print(f"      {r['news'][0]['title'][:76]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
