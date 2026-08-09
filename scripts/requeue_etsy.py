#!/usr/bin/env python3
"""Re-pace the Etsy queue: the channels are split, so Etsy carries everything that is not gaming.

Shopify is the gaming storefront now and Etsy runs on its own — a steady organic drip rather than a
launch. Three things are wrong with the queue as it stands and this fixes all three:

- 59 scheduled rows point at products with no print file. Those are the ones the batch runner refused
  (a niche named after somebody's book, a slogan too long to read in a grid tile, two personalisation
  blanks in one phrase). Publishing would fail at the Etsy call, burn an attempt and leave an error on
  the board. They are cancelled with the reason recorded, not deleted.
- Gaming products must never enter this queue. They are checked for and excluded even though none are
  present today, because the next batch will produce more of them.
- The pacing drifts between 4 and 9 a day. Etsy rewards consistency more than volume, so the queue is
  laid out at a fixed rate across whole days at hours that are actually daytime for US buyers.

Only rows that reach status='approved' are ever published (see src/lib/publish.ts), so approving is
the deliberate act that starts the drip.
"""
import argparse
import os
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import psycopg2

TZ = ZoneInfo(os.environ.get("SHOP_TIMEZONE", "America/Chicago"))
GAMING = ("tabletop rpg", "rpg", "mmorpg", "fps")
# Spread across the US buying day rather than clustered: Etsy's feed favours steady activity.
SLOTS = [time(9, 20), time(12, 40), time(15, 10), time(18, 30), time(20, 50)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-day", type=int, default=5)
    ap.add_argument("--start", help="YYYY-MM-DD; default tomorrow")
    ap.add_argument("--apply", action="store_true", help="write; otherwise show the plan only")
    a = ap.parse_args()
    per_day = max(1, min(a.per_day, len(SLOTS)))

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # --- 1. drop what cannot be published
    cur.execute("""SELECT s.id, p.slug FROM schedule s JOIN products p ON p.id = s.product_id
                    WHERE s.status IN ('pending','approved')
                      AND (p.print_file IS NULL OR p.niche = ANY(%s))""", (list(GAMING),))
    dead = cur.fetchall()

    # --- 2. everything left, oldest concept first so a niche is not dumped in one day
    cur.execute("""SELECT s.id, p.slug, p.niche FROM schedule s JOIN products p ON p.id = s.product_id
                    WHERE s.status IN ('pending','approved')
                      AND p.print_file IS NOT NULL
                      AND p.etsy_listing_id IS NULL
                      AND p.niche <> ALL(%s)
                    ORDER BY p.niche, p.slug""", (list(GAMING),))
    live = cur.fetchall()

    # interleave niches so consecutive listings are not eight chickens in a row
    by_niche: dict = {}
    for sid, slug, niche in live:
        by_niche.setdefault(niche, []).append((sid, slug))
    ordered = []
    while any(by_niche.values()):
        for niche in list(by_niche):
            if by_niche[niche]:
                ordered.append(by_niche[niche].pop(0))
            if not by_niche[niche]:
                del by_niche[niche]

    start = (datetime.strptime(a.start, "%Y-%m-%d").date() if a.start
             else date.today() + timedelta(days=1))
    plan = []
    for i, (sid, slug) in enumerate(ordered):
        day = start + timedelta(days=i // per_day)
        when = datetime.combine(day, SLOTS[i % per_day], tzinfo=TZ)
        plan.append((sid, slug, when))

    print(f"iptal edilecek (dosyasiz veya gaming) : {len(dead)}")
    print(f"kuyruga alinacak                      : {len(plan)}")
    if plan:
        print(f"tempo                                 : gunde {per_day}")
        print(f"ilk                                   : {plan[0][2]:%Y-%m-%d %H:%M} {plan[0][1]}")
        print(f"son                                   : {plan[-1][2]:%Y-%m-%d %H:%M} {plan[-1][1]}")
        print(f"suresi                                : {(plan[-1][2] - plan[0][2]).days + 1} gun")
    if not a.apply:
        print("\n(--apply verilmedi: hicbir sey yazilmadi)")
        return

    for sid, slug in dead:
        cur.execute("""UPDATE schedule SET status='cancelled',
                         last_error='kanal ayrimi: uretilmemis ya da gaming (shopify)',
                         updated_at=now() WHERE id=%s""", (sid,))
    for sid, slug, when in plan:
        cur.execute("""UPDATE schedule SET scheduled_at=%s, status='approved',
                         approved_at=now(), approved_by='requeue_etsy', last_error=NULL,
                         updated_at=now() WHERE id=%s""", (when, sid))
    conn.commit()
    print(f"\nyazildi: {len(dead)} iptal, {len(plan)} onaylandi ve tarihlendi")


if __name__ == "__main__":
    main()
