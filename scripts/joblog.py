#!/usr/bin/env python3
"""Report progress of local work to the dashboard.

Design generation and listing-image builds run on the operator's machine, so from the website's point
of view approving a product and a stalled pipeline looked exactly the same — silence. These helpers let
a local script say "I am working, here is how far, here is what broke", which is all the dashboard needs
to show a live bar instead of nothing.

Every call is best-effort: a failure to log must never take down the work being logged. That is the
opposite of the rule for writes that matter, and it is deliberate — this table is a status light.

    from joblog import Job
    with Job("design", "SPA · 7 tasarim", total=7, shop_id=1) as job:
        for slug in slugs:
            ...
            job.tick(slug)                 # or job.tick(slug, failed=True)
"""
from __future__ import annotations

import os
import traceback


def _conn():
    import psycopg2
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=15,
                            keepalives=1, keepalives_idle=20)


class Job:
    def __init__(self, kind: str, label: str, total: int = 0, shop_id: int | None = None,
                 product_id: int | None = None):
        # product_id is carried so a finished job can link straight to the thing it produced: checking the
        # output is what catches a bad design, and it should not require hunting for the row by name.
        self.kind, self.label, self.total, self.shop_id = kind, label, total, shop_id
        self.product_id = product_id
        self.id: int | None = None
        self.done = self.failed = 0

    # --- lifecycle -------------------------------------------------------------------------------
    def start(self) -> "Job":
        try:
            c = _conn(); k = c.cursor()
            # A product is produced one run at a time, so any row still open for it belongs to a process that
            # is gone — killed before it could close its own row. Two runs of one product left two phantom
            # bars warning that work had stalled while the work had actually finished under the newer row.
            # Closing the old one here is the only place that knows a new run is starting.
            if self.product_id is not None:
                k.execute("""UPDATE jobs SET status='superseded', detail='yeni uretim basladi',
                                            updated_at=now(), dismissed_at=now()
                              WHERE product_id=%s AND status='running'""", (self.product_id,))
            k.execute("""INSERT INTO jobs (shop_id, kind, label, total, status, product_id)
                         VALUES (%s,%s,%s,%s,'running',%s) RETURNING id""",
                      (self.shop_id, self.kind, self.label, self.total, self.product_id))
            self.id = k.fetchone()[0]
            c.commit(); c.close()
        except Exception:
            self.id = None                      # keep going; the work matters, the status light does not
        return self

    def tick(self, detail: str = "", failed: bool = False) -> None:
        if failed:
            self.failed += 1
        else:
            self.done += 1
        self._write(status="running", detail=detail[:300])

    def finish(self, status: str = "done", detail: str = "") -> None:
        self._write(status=status, detail=detail[:300])

    def _write(self, status: str, detail: str) -> None:
        if self.id is None:
            return
        try:
            c = _conn(); k = c.cursor()
            k.execute("""UPDATE jobs SET done=%s, failed=%s, status=%s, detail=%s, updated_at=now()
                          WHERE id=%s""",
                      (self.done, self.failed, status, detail or None, self.id))
            c.commit(); c.close()
        except Exception:
            pass

    # --- context manager -------------------------------------------------------------------------
    def __enter__(self) -> "Job":
        return self.start()

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is not None:
            # The operator needs the reason on screen, not just in a terminal they are not watching.
            self.finish("error", f"{exc_type.__name__}: {exc}"[:300])
            return False
        self.finish("error" if self.failed and not self.done else "done",
                    f"{self.done} tamam, {self.failed} hata" if self.failed else "")
        return False


def note(kind: str, label: str, detail: str, status: str = "done") -> None:
    """One-shot entry for work with no natural progress count."""
    try:
        c = _conn(); k = c.cursor()
        k.execute("""INSERT INTO jobs (kind, label, total, done, status, detail)
                     VALUES (%s,%s,0,0,%s,%s)""", (kind, label, status, detail[:300]))
        c.commit(); c.close()
    except Exception:
        traceback.print_exc()
