#!/usr/bin/env python3
"""Re-cut the under-resolution designs as wordless left-chest prints.

135 print files carry fewer pixels than a 10 inch front print needs — measured on the ARTWORK, not the
canvas, so the transparent margin is not counted as resolution. 38 of them are live. The pixels are not in
the files and no amount of upscaling invents them.

Two facts decided the shape of this script:

  1. At a 4 inch left-chest print, all 135 clear 300 PPI on the artwork they already have. The resolution
     problem is a PLACEMENT problem — a 1911px design is soft at ten inches and sharp at four.
  2. The words are baked into print_file. typeset.py composes type onto the artwork and the pre-type
     artwork is never stored, so "remove the text" cannot be done by re-composing. It needs a new file.

So the regeneration is for the WORDS, not for the resolution, and it is worth doing on its own terms: a
wordless concept compiles with FILL_CLAUSE instead of a reserved caption band, so the artwork fills the
composition rather than sitting above an empty strip — which is what a chest patch should be.

`left_chest` puts the print at x=0.78, the RIGHT side of the mockup and the wearer's left chest. That is
the industry-standard chest placement and what the operator asked for (confirmed 2026-08-14).

Each product is done atomically: parameters first, then generation, and the row is only marked ready when
the new file measures. A failure leaves the old file in place rather than a half-migrated product.

    python3 scripts/refit_chest_designs.py --limit 1          # dry run, shows the plan
    python3 scripts/refit_chest_designs.py --limit 1 --apply  # ONE product, PAID
    python3 scripts/refit_chest_designs.py --apply            # all of them, PAID
"""
from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import psycopg2
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import batch_runner as br                                          # noqa: E402
import produce_images as pi                                        # noqa: E402

CHEST_IN = 4.0
PLACEMENT = "left_chest"


def conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def under_resolution() -> list[dict]:
    """Products whose ARTWORK is short of 300 PPI at the size they currently declare."""
    c = conn()
    k = c.cursor()
    # `print_file IS NOT NULL` is deliberately NOT in this query. produce_product --redo clears the file
    # before it draws, so a product whose regeneration failed has no file at all — and filtering on the
    # column would drop exactly those products out of the retry queue and strand them empty for ever.
    k.execute("""SELECT id, slug, print_file, design_params, hook, etsy_listing_id, technique
                   FROM products
                  WHERE technique <> 'embroidery' AND design_prompt IS NOT NULL
                  ORDER BY (etsy_listing_id IS NOT NULL), id""")
    out = []
    for pid, slug, blob, dp, hook, etsy, tech in k.fetchall():
        d = pi.as_params(dp)
        if blob is None:
            # No file: only interesting if we are the reason it is missing.
            if d.get("chest_refit") == "pending":
                out.append({"id": pid, "slug": slug, "art": 0, "want": 0.0,
                            "dp": d, "hook": hook, "live": etsy is not None})
            continue
        try:
            im = Image.open(io.BytesIO(bytes(blob)))
            bb = im.getbbox()
        except Exception:                                          # noqa: BLE001
            continue
        if not bb:
            continue
        art = max(bb[2] - bb[0], bb[3] - bb[1])
        want = pi.print_placement(d)["inches"]
        # Two ways to qualify. The obvious one is "short of 300 PPI at the size it declares". The second is
        # "already repointed but not yet regenerated": repoint() changes the declared size to 4 inches,
        # which makes the SAME file pass the resolution test instantly — so a product that failed halfway
        # through a previous run would silently drop out of the list while still carrying baked-in words.
        # The marker is what makes this script safe to re-run.
        if d.get("chest_refit") == "pending" or art / max(want, 0.1) < br.PRINT_PPI * 0.95:
            out.append({"id": pid, "slug": slug, "art": art, "want": want,
                        "dp": d, "hook": hook, "live": etsy is not None})
    c.close()
    return out


def repoint(p: dict, keep_hook: bool = False) -> None:
    """Placement, size, and no words. Written before generation so the compiler reads them."""
    dp = dict(p["dp"])
    dp["placement"] = PLACEMENT
    dp["print_inches"] = CHEST_IN
    dp["chest_refit"] = "pending"
    # The style's own scale must not override the explicit placement; STYLE_SPOT only applies when
    # neither placement nor print_inches is set, but being explicit here costs nothing.
    c = conn()
    k = c.cursor()
    # hook drives typeset. Emptying it is what makes the design wordless, and it also makes the prompt
    # compiler emit FILL_CLAUSE instead of reserving a caption band.
    if keep_hook:
        k.execute("UPDATE products SET design_params = %s, updated_at = now() WHERE id = %s",
                  (json.dumps(dp), p["id"]))
    else:
        k.execute("""UPDATE products SET design_params = %s, hook = NULL, updated_at = now()
                      WHERE id = %s""", (json.dumps(dp), p["id"]))
    c.commit()
    c.close()


def mark_done(pid: int) -> None:
    """Only after the new file has been measured. Until then the row stays `pending` and is retried."""
    c = conn()
    k = c.cursor()
    # design_params is a TEXT column holding JSON, not jsonb — jsonb_set returns jsonb and Postgres will
    # not assign that to text without the cast back.
    k.execute("""UPDATE products
                    SET design_params = jsonb_set(design_params::jsonb, '{chest_refit}', '"done"')::text,
                        updated_at = now()
                  WHERE id = %s""", (pid,))
    c.commit()
    c.close()


def snapshot(pid: int) -> tuple[bytes | None, str | None]:
    """The current file and state, so a failed regeneration can be undone.

    produce_product --redo sets print_file=NULL and design_state=NULL BEFORE it draws (produce_product.py
    :447), which is correct for its own resumability and catastrophic for a bulk migration: four products
    were left with no print file at all when a run died mid-way. The old bytes are the only copy there is.
    """
    c = conn()
    k = c.cursor()
    k.execute("SELECT print_file, design_state FROM products WHERE id=%s", (pid,))
    row = k.fetchone()
    c.close()
    return (bytes(row[0]) if row and row[0] else None, row[1] if row else None)


def restore(pid: int, blob: bytes | None, state: str | None) -> None:
    """Put the old design back. A failed migration must cost nothing, not a product."""
    if blob is None:
        return
    c = conn()
    k = c.cursor()
    k.execute("UPDATE products SET print_file=%s, design_state=%s, updated_at=now() WHERE id=%s",
              (psycopg2.Binary(blob), state, pid))
    c.commit()
    c.close()


def regenerate(p: dict) -> tuple[bool, str]:
    """Run the one entrypoint. Old file stays until the new one measures."""
    r = subprocess.run([sys.executable, str(HERE / "produce_product.py"), str(p["id"]), "--redo"],
                       capture_output=True, text=True, timeout=900, env=os.environ)
    tail = ((r.stdout or "") + (r.stderr or "")).strip().splitlines()
    return r.returncode == 0, " | ".join(tail[-3:])[:400]


def verify(pid: int) -> tuple[bool, str]:
    c = conn()
    k = c.cursor()
    k.execute("SELECT print_file, design_params FROM products WHERE id=%s", (pid,))
    row = k.fetchone()
    c.close()
    if not row or not row[0]:
        return False, "print_file yok"
    im = Image.open(io.BytesIO(bytes(row[0])))
    bb = im.getbbox()
    if not bb:
        return False, "opak piksel yok"
    art = max(bb[2] - bb[0], bb[3] - bb[1])
    want = pi.print_placement(row[1])["inches"]
    ppi = art / max(want, 0.1)
    return ppi >= br.PRINT_PPI * 0.95, f"cizim {art}px = {ppi:.0f} PPI @ {want:g}in"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="UCRETLI: gercekten uretir")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--live-only", action="store_true")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--only", help="virgulle ayrilmis slug listesi")
    # Personalised products are the exception the wordless rule cannot cover: the buyer is paying for
    # their own name, so a print with no words is not a cleaner design, it is a different product with
    # nothing to sell. Clearing `hook` on those five was the mistake; this is how they come back.
    ap.add_argument("--keep-hook", action="store_true", help="hook'u SILME — kisisellestirilmis urunler")
    a = ap.parse_args()

    todo = under_resolution()
    if a.live_only:
        todo = [p for p in todo if p["live"]]
    if a.only:
        want = {x.strip() for x in a.only.split(",") if x.strip()}
        todo = [p for p in todo if p["slug"] in want]
    if a.limit:
        todo = todo[:a.limit]

    # The banner has to say what THIS run does. It read "yazisiz" unconditionally, which was a lie the
    # moment --keep-hook existed — and it printed that lie over the personalised products, the one set
    # where losing the words is the whole defect being repaired.
    words = "yazi KORUNUYOR (kisisellestirilmis)" if a.keep_hook else "yazisiz"
    print(f"{len(todo)} urun {CHEST_IN:g} inc {PLACEMENT} baskisina alinacak, {words} "
          f"({sum(1 for p in todo if p['live'])} tanesi YAYINDA)\n")
    for p in todo[:10]:
        print(f"  {p['slug']:28} cizim {p['art']:>5}px  {p['want']:g}in -> {CHEST_IN:g}in "
              f"({p['art']/CHEST_IN:.0f} PPI){'  · YAYINDA' if p['live'] else ''}"
              f"{('  · yazi: ' + (p['hook'] or '')[:28]) if a.keep_hook and (p['hook'] or '').strip() else ('  · yazi silinecek' if (p['hook'] or '').strip() else '')}")
    if len(todo) > 10:
        print(f"  … +{len(todo)-10} tane daha")

    if not a.apply:
        print("\nDRY RUN — hicbir sey degismedi. Uretmek icin --apply (UCRETLI).")
        return 0

    # One product takes about four minutes end to end — generate, cut, then seven listing frames — so a
    # hundred of them is seven hours in a row. A small pool, because the generator is a paid remote API and
    # hammering it is how a batch turns into a rate-limit cascade. Each product is still independent and
    # still rolls back on its own.
    done = {"ok": 0, "failed": 0, "n": 0}

    def one(p: dict) -> None:
        old_blob, old_state = snapshot(p["id"])
        repoint(p, keep_hook=a.keep_hook)
        good, msg = regenerate(p)
        if good:
            measured, detail = verify(p["id"])
        else:
            measured, detail = False, msg
        done["n"] += 1
        tag = f"[{done['n']}/{len(todo)}] {p['slug']}"
        if measured:
            mark_done(p["id"])
            done["ok"] += 1
            print(f"{tag}  tamam · {detail}", flush=True)
        else:
            restore(p["id"], old_blob, old_state)
            done["failed"] += 1
            print(f"{tag}  BASARISIZ (eski tasarim geri konuldu) · {detail}", file=sys.stderr, flush=True)

    with ThreadPoolExecutor(max_workers=a.workers) as pool:
        # Per-item exceptions must not take the batch down: a pool.map that raises kills the remaining
        # work while reporting nothing, which is the failure this repo has already shipped once.
        for fut in as_completed([pool.submit(one, p) for p in todo]):
            try:
                fut.result()
            except Exception as e:                                 # noqa: BLE001
                done["failed"] += 1
                print(f"  BEKLENMEYEN HATA: {e}", file=sys.stderr, flush=True)

    print(f"\n{done['ok']} basarili, {done['failed']} basarisiz")
    return 0 if not done["failed"] else 1


if __name__ == "__main__":
    sys.exit(main())
