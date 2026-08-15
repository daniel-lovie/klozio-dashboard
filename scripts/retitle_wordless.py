#!/usr/bin/env python3
"""Rewrite the titles of designs that no longer carry the words their titles promise.

81 products were regenerated wordless. Their titles were written for the old artwork and still sell the
slogan that used to be printed on it — "I Have Killed Before Shirt", "Achievement: Did not Die (barely)".
A buyer reading that and receiving a shirt with no text on it has been mis-sold, and that is a refund and
a review, not a cosmetic mismatch.

Two problems get fixed in one pass, because they have the same answer:

  THE PROMISE   the title must describe what the shirt IS — a printed illustration — rather than quote
                words that are no longer on it.
  THE BAND      these titles run 83-95 characters against an operating band of 125-140, so a third of
                the searchable surface is unused. fit_titles.py cannot help: it only drops phrases, and
                lengthening needs keywords written, which is a copywriting job.

The model writes; the machine decides whether to keep it. Every candidate is checked for length, comma
structure, the primary keyword landing inside the first 40 characters, and — the point of the exercise —
that it does not reintroduce a quoted slogan. A candidate that fails is reported, not silently written.

    python3 scripts/retitle_wordless.py --limit 5        # dry run, shows before/after
    python3 scripts/retitle_wordless.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import psycopg2

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import batch_runner as br                                          # noqa: E402

LOW, HIGH = 125, 140
KEYWORD_HEAD = 40
MODEL = "claude-opus-5"

# A title that quotes something is promising printed words. These are the shapes that do it.
QUOTED = re.compile(r"[\"“”']|[!?]|\b(that says|reading|quote|slogan|text)\b", re.I)

RULES = """You write Etsy t-shirt listing titles for a US print-on-demand shop.

THE DESIGN HAS NO WORDS ON IT. It is a printed illustration only. The current title was written when the
shirt carried a slogan and it must stop promising one.

Rules, all mandatory:
- 125 to 140 characters. Not 120, not 141. Count them.
- Four or five phrases separated by commas.
- The primary keyword phrase comes FIRST and must fit inside the first 40 characters.
- Include "Comfort Colors" once — buyers search it.
- US English. No emoji. No ALL CAPS words.
- Every comma phrase starts with a capital letter, like a headline. One title came back reading
  "Duck Garden Tee, folk art ducks in a trampled flowerbed illustration" and it looks careless next to
  the rest of the shop.
- Do NOT quote a slogan, do not use quotation marks, exclamation marks or question marks, and do not
  say the shirt "says" anything. Describe the illustration, the niche, the recipient and the occasion.
- Do not invent a brand, a character name, a team or a franchise.

Reply with the title only, nothing else."""


def conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def call(messages: list[dict]) -> str:
    # 3000, not 400. Opus 5 thinks by default and the first version gave it 400 tokens for everything:
    # thinking took 376 of them, the answer was truncated, and every candidate came back empty with
    # stop_reason=max_tokens. An empty string is not a model that cannot write titles, it is a budget.
    body = json.dumps({
        "model": MODEL, "max_tokens": 3000, "system": RULES, "messages": messages,
    }).encode()
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


def ask(concept: str, old_title: str, tags: list[str]) -> tuple[str, str]:
    """The title and why it was refused, if it was. One retry, and the retry is TOLD what was wrong.

    Counting characters is the part a model is worst at, and the check already knows exactly what missed.
    Handing that back is far cheaper than throwing the candidate away and asking the same question again.
    """
    msgs = [{"role": "user", "content":
             f"Illustration on the shirt: {concept[:700]}\n\n"
             f"Old title (promised words that are no longer printed): {old_title}\n\n"
             f"Existing tags for context: {', '.join(tags[:13])}\n\n"
             f"Write the new title."}]
    for attempt in (1, 2):
        cand = call(msgs).strip().strip('"')
        why = check(cand)
        if not why:
            return cand, ""
        if attempt == 2:
            return cand, why
        msgs += [{"role": "assistant", "content": cand},
                 {"role": "user", "content":
                  f"That title is not usable: {why}. It is {len(cand)} characters. "
                  f"Rewrite it so it lands between {LOW} and {HIGH} characters and satisfies every rule. "
                  f"Reply with the title only."}]
    return "", "bilinmeyen"


def check(title: str) -> str:
    """Empty string when the title is acceptable, otherwise the reason it is not."""
    t = title.strip().strip('"')
    if not (LOW <= len(t) <= HIGH):
        return f"{len(t)} karakter, band {LOW}-{HIGH}"
    if "," not in t:
        return "virgul ayraci yok"
    head = t.split(",")[0].strip()
    if len(head) > KEYWORD_HEAD:
        return f"birincil kelime {len(head)} karakter (>{KEYWORD_HEAD})"
    if QUOTED.search(t):
        return "hala yazi vaat ediyor (tirnak/unlem/'says')"
    lower = [seg.strip() for seg in t.split(",")[1:] if seg.strip() and seg.strip()[0].islower()]
    if lower:
        return f"kucuk harfle baslayan segment: {lower[0][:30]!r}"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--live-only", action="store_true")
    # Without this, retrying ONE rejected title meant re-running all eighty-one and paying to rewrite
    # titles that were already right — which is what happened.
    ap.add_argument("--only", help="virgulle ayrilmis slug listesi")
    a = ap.parse_args()

    c = conn()
    k = c.cursor()
    where = "AND etsy_listing_id IS NOT NULL" if a.live_only else ""
    k.execute(f"""SELECT id, slug, title, design_prompt, tags, etsy_listing_id IS NOT NULL
                    FROM products
                   WHERE design_params::jsonb->>'chest_refit' = 'done'
                     AND NOT personalised {where}
                   ORDER BY (etsy_listing_id IS NOT NULL) DESC, id""")
    rows = k.fetchall()
    c.close()
    if a.only:
        want = {x.strip() for x in a.only.split(",") if x.strip()}
        rows = [r for r in rows if r[1] in want]
    if a.limit:
        rows = rows[:a.limit]

    print(f"{len(rows)} yazisiz urunun basligi yeniden yazilacak "
          f"({sum(1 for r in rows if r[5])} tanesi YAYINDA)\n")

    ok = bad = 0
    for pid, slug, title, prompt, tags, live in rows:
        subject = br.strip_background_talk(br.subject_of(prompt or "")[0] or (prompt or ""))
        tg = tags if isinstance(tags, list) else [x.strip() for x in str(tags or "").split(",") if x.strip()]
        try:
            new, why = ask(subject, title, tg)
        except Exception as e:                                     # noqa: BLE001
            bad += 1
            print(f"  HATA {slug}: {str(e)[:120]}", file=sys.stderr)
            continue
        flag = " · YAYINDA" if live else ""
        if why:
            bad += 1
            print(f"{slug}{flag} · REDDEDILDI ({why})\n    ? {new}", file=sys.stderr)
            continue
        ok += 1
        print(f"{slug} {len(title)}->{len(new)}{flag}\n    - {title}\n    + {new}")
        if a.apply:
            c = conn()
            k = c.cursor()
            k.execute("UPDATE products SET title=%s, updated_at=now() WHERE id=%s", (new, pid))
            c.commit()
            c.close()

    print(f"\n{ok} baslik {'yazildi' if a.apply else 'yazilacak'}, {bad} reddedildi")
    if not a.apply:
        print("uygulamak icin --apply")
    return 0


if __name__ == "__main__":
    sys.exit(main())
