#!/usr/bin/env python3
"""Refuse any generated image containing letterforms.

CLAUDE.md non-negotiable #5: no AI-rendered text. Every word on every garment is hand-set in a
licensed font by typeset.py, because models return malformed glyphs, dropped characters and invented
punctuation — and a misspelt word on a shirt reads as a printing defect, not a style.

This exists because the Phase 2 bake-off measured flatness, palette and resolution and never checked
the one rule the shop treats as absolute. It was caught by eye, not by the harness: a fishing badge
came back reading "EESTOR DUTDER" and a camping one "WIRILS · BOGAE". Measured across 45 generations
afterwards, SDXL produced letterforms in 60% of images, Juggernaut 40%, klein 20% — all of them far
too high to publish unattended.

The cause is the brief, not only the model: "retro badge", "vintage label" and similar invite a banner
with words in it. The prompt guidance belongs upstream; this is the backstop.

    python3 text_gate.py image.png        # exit 0 clean, 1 letterforms found
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

# Three or more letters in a row. Deliberately blunt: the rule is that NO letterform may come out of a
# model, so a strict reading with the odd false positive costs one regeneration, while a lenient one
# costs a printed shirt with nonsense on it.
WORD = re.compile(r"[A-Za-z]{3,}")


def letterforms(path: Path) -> list[str]:
    """Whichever OCR this machine has. The MacBook has tesseract; the Spark cannot install it without
    the passwordless sudo it does not have, so easyocr is used there. A machine with neither must
    RAISE — "no OCR" is not the same as "no text", and defaulting to clean would quietly disable the
    one gate protecting an absolute rule."""
    try:
        out = subprocess.run(["tesseract", str(path), "-", "--psm", "11"],
                             capture_output=True, text=True, timeout=90).stdout
        return WORD.findall(out)
    except FileNotFoundError:
        pass
    except subprocess.TimeoutExpired:
        raise RuntimeError("tesseract zaman asimi")
    try:
        import easyocr
    except ImportError:
        raise RuntimeError("ne tesseract ne easyocr var — yazi kapisi dogrulanamiyor")
    global _READER
    if "_READER" not in globals() or _READER is None:
        # GPU where there is one: measured on the Spark, reading the same image took 0.37s on the GPU
        # against 1.37s on the CPU, and this gate runs on every candidate the producer draws. The
        # reader is built once per process — the model load is a second of the cost, and rebuilding it
        # per call is most of what made the gate look expensive from outside.
        try:
            _READER = easyocr.Reader(["en"], gpu=True, verbose=False)
        except Exception:
            _READER = easyocr.Reader(["en"], gpu=False, verbose=False)
    return [w for _b, w, conf in _READER.readtext(str(path))
            if conf > 0.35 for w in WORD.findall(w)]


_READER = None


def main() -> int:
    p = Path(sys.argv[1])
    found = letterforms(p)
    if found:
        print(f"{p.name}: REDDEDILDI — harf bulundu: {' '.join(found[:6])}")
        return 1
    print(f"{p.name}: temiz")
    return 0


if __name__ == "__main__":
    sys.exit(main())
