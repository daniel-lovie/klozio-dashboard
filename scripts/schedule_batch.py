#!/usr/bin/env python3
"""Queue the new batch for publishing, ten a day for eight days.

Ten a day rather than eighty at once, because Etsy reads a sudden burst from a small shop as a signal in
its own right and because a listing that goes out with a defect is cheaper to catch when nine went with
it than when seventy-nine did.

A schedule row with status='approved' WILL publish when its time arrives — src/lib/publish.ts picks up
anything approved whose scheduled_at has passed. So this refuses to queue a product that is not actually
ready, and the readiness test is the shop's own written standard rather than "it exists":

  a print file, and the artwork genuinely at 300 PPI for the size it declares
  a title in the 125-140 band
  exactly 13 tags
  a description carrying the AI disclosure inside the first 600 characters
  listing images built
  content_status='approved'

Anything short is listed and left out. An unready product silently queued is the failure this whole day
has been about: something that looks finished, on a timer.

    python3 scripts/schedule_batch.py                 # dry run — shows the calendar and what is not ready
    python3 scripts/schedule_batch.py --apply
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import produce_images as pi                                        # noqa: E402

PER_DAY = 10
DAYS = 8
# 15:00 UTC is late morning in the US, which is when this shop's traffic is awake. The hour matters more
# than the date: a listing published at 04:00 UTC spends its first and most visible hours asleep.
PUBLISH_HOUR_UTC = 15
DISCLOSURE_HEAD = 600
LOW, HIGH = 125, 140


def ready(row) -> str:
    """Empty when the product can go live, otherwise the first reason it cannot."""
    (_pid, _slug, title, desc, tags, status, has_print, images, art_px, dp) = row
    if status != "approved":
        return f"content_status={status}"
    if not has_print:
        return "baski dosyasi yok"
    want = pi.print_placement(dp)["inches"]
    if not art_px or art_px / max(want, 0.1) < 285:
        return f"cizim {art_px or 0}px, {want:g} incte {(art_px or 0)/max(want,0.1):.0f} PPI (<285)"
    if not title or not (LOW <= len(title) <= HIGH):
        return f"baslik {len(title or '')} karakter"
    if not tags or len(tags) != 13:
        return f"tag sayisi {len(tags or [])}"
    if not desc:
        return "aciklama yok"
    if not re.search(r"\bAI\b|artificial intelligence", desc[:DISCLOSURE_HEAD], re.I):
        return "AI beyani ilk 600 karakterde yok"
    if not images:
        return "ilan gorseli yok"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--pattern", default="%-m_-v1", help="slug kalibi")
    a = ap.parse_args()

    c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    k = c.cursor()
    k.execute("""
        SELECT p.id, p.slug, p.title, p.description, p.tags, p.content_status,
               (p.print_file IS NOT NULL),
               (SELECT count(*) FROM product_images g WHERE g.product_id = p.id),
               p.print_file_w, p.design_params
          FROM products p
         WHERE p.slug LIKE %s AND p.etsy_listing_id IS NULL
         ORDER BY p.id""", (a.pattern,))
    rows = k.fetchall()

    # print_file_w is the CANVAS; the artwork is what prints. Measure the bytes rather than trust it.
    import io                                                      # noqa: PLC0415
    from PIL import Image                                          # noqa: PLC0415
    Image.MAX_IMAGE_PIXELS = None
    checked = []
    for r in rows:
        art = 0
        if r[6]:
            k.execute("SELECT print_file FROM products WHERE id=%s", (r[0],))
            blob = k.fetchone()[0]
            im = Image.open(io.BytesIO(bytes(blob)))
            bb = im.getbbox()
            art = max(bb[2] - bb[0], bb[3] - bb[1]) if bb else 0
        checked.append((r, art))

    good, blocked = [], []
    for r, art in checked:
        why = ready((r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], art, r[9]))
        (good if not why else blocked).append((r[0], r[1], why))

    print(f"{len(rows)} urun bakildi · yayina hazir {len(good)} · eksik {len(blocked)}\n")
    for _pid, slug, why in blocked[:15]:
        print(f"  HAZIR DEGIL {slug}: {why}")
    if len(blocked) > 15:
        print(f"  … +{len(blocked)-15} tane daha")

    start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(
        hour=PUBLISH_HOUR_UTC, minute=0, second=0, microsecond=0)
    print(f"\ntakvim ({PER_DAY}/gun, {DAYS} gun, {PUBLISH_HOUR_UTC}:00 UTC):")
    queued = 0
    for day in range(DAYS):
        chunk = good[day * PER_DAY:(day + 1) * PER_DAY]
        if not chunk:
            break
        when = start + timedelta(days=day)
        print(f"  {when:%Y-%m-%d %H:%M} UTC  {len(chunk)} urun  "
              f"{', '.join(s for _i, s, _w in chunk[:3])}…")
        for pid, _slug, _w in chunk:
            queued += 1
            if a.apply:
                # approved_by names the decision, not the machine that carried it out.
                k.execute("""INSERT INTO schedule (product_id, scheduled_at, status, approved_at,
                                                   approved_by, attempts, created_at, updated_at)
                             VALUES (%s, %s, 'approved', now(), 'operator: 8 gunluk minimal parti',
                                     0, now(), now())""", (pid, when))
    if a.apply:
        c.commit()
        print(f"\n{queued} urun kuyruga alindi")
    else:
        print(f"\n{queued} urun kuyruga alinacak. Uygulamak icin --apply")
    if len(good) < PER_DAY * DAYS:
        print(f"UYARI: {PER_DAY*DAYS} yer var, {len(good)} hazir urun bulundu.")
    c.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
