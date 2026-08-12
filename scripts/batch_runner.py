#!/usr/bin/env python3
"""One command: N design concepts in, publish-ready product folders + a blocking QA report out.

Why this exists
---------------
The pipeline already ran end to end (Higgsfield -> cutout -> thread colours -> typeset -> mockups ->
listing), but only ever in ones and twos, at roughly $8.50 of image generation per design — and a
single four-product batch still shipped four distinct defect classes. Volume is the bottleneck (see
research/heckman-pod-lessons-2026-08.md: ~1% of designs win, so a catalogue of four is not a test),
and volume is unreachable while every product costs $8.50 and needs a human to notice the defects.

Two things change here:

1. **Product photos come from Printful's mockup generator, not from Higgsfield.** Free, ~10s, and
   with `option_groups: ["Men's","Women's"]` it returns real ON-MODEL worn shots — which is exactly
   what the house cover rule demands. Higgsfield is reserved for the artwork itself. That is the
   whole $8.50 -> ~$0.40 move.
2. **Every defect we shipped is a blocking gate**, run automatically, reported in a table. Nothing is
   silently skipped: a concept that fails a gate is listed for human review with the reason.

Nothing is published. The runner prepares files, seeds the DB row with etsy_listing_id NULL, and
stops. Going live on Etsy or Shopify stays a separate, deliberate step.

Why Python rather than .mts
---------------------------
Six of the eight scripts being orchestrated are Python (thread_colors, ttrpg_typeset, make_cover,
make_info_cards, seed_ttrpg, shopify_port), every QA gate is a pixel measurement (PIL/numpy), and the
DB access is psycopg2. Only Higgsfield is TypeScript, because its MCP client lives in worker/hf.ts —
so that one boundary is crossed by subprocess through scripts/hf_gen.mts. Writing this in .mts would
have meant reimplementing the image analysis instead.

Run
---
    set -a && source .env && set +a
    python3 scripts/batch_runner.py scripts/batch_spec.example.json --dry-run
    python3 scripts/batch_runner.py my_batch.json --limit 3

Flags: --dry-run (no spend, no writes) · --limit N · --only <slug> · --force (redo existing stages)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import date
from io import BytesIO
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from thread_colors import PALETTE_HEX, MAX_THREADS, coverage as thread_coverage, pick as thread_pick

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
HF_GEN = HERE / "hf_gen.mts"
MAKE_COVER = HERE / "make_cover.py"
MAKE_CARDS = HERE / "make_info_cards.py"

# --- economics -------------------------------------------------------------------------------
# Measured off the credit balance, not estimated: gpt_image_2 low costs 0.75 credits against
# nano_banana_pro's 2.00 at 2k and 4.00 at 4k — the setting we shipped the first batch with. Side by
# side on our own prompts gpt_image_2 drew the cleaner crest, and once the cutout stopped eating white
# ribbons it produced a bigger, better banner than the model costing five times as much.
DEFAULT_MODEL = "gpt_image_2"
DEFAULT_QUALITY = "low"
HF_CREDITS_PER_CALL = 0.75
HF_COST_PER_CREDIT = 0.035       # ultra plan; top-up is $0.05/cr, subscription $0.033-0.039
HF_COST_PER_CALL = HF_CREDITS_PER_CALL * HF_COST_PER_CREDIT
PRINTFUL_COST_PER_MOCKUP = 0.0   # mockup generator is free — this is the entire cost fix

# --- Printful --------------------------------------------------------------------------------
PF_BASE = "https://api.printful.com"
PF_CC1717 = 586                  # Comfort Colors 1717
# api.printful.com answers 403 "error code: 1010" (Cloudflare) with no User-Agent. Not documented.
PF_HEADERS_BASE = {"User-Agent": "klozio/1.0", "Content-Type": "application/json"}
# A 10x10 inch chest print inside CC1717's 1800x2400 (12x16 inch @150dpi) front area. It used to be
# the full 1800 wide — 12x12 inches, the largest the garment takes — and the composited mockups were
# showing 17 inches, a print no press could produce. 10 inches is what the listing now promises, so
# it has to be what the file orders: 1500px square, centred, dropped 2.5 inches below the neckline.
PRINT_INCHES = 10
PF_DPI = 150
PF_POSITION = {"area_width": 1800, "area_height": 2400,
               "width": PRINT_INCHES * PF_DPI, "height": PRINT_INCHES * PF_DPI,
               "top": int(2.5 * PF_DPI), "left": (1800 - PRINT_INCHES * PF_DPI) // 2}

# Printful renders a completely different garment per technique, and the mockup has to be the
# technique we actually fulfil. Ordering embroidery_chest_left while showing a DTG "front" mockup
# advertises a big printed graphic and ships a 4" stitched badge — the buyer is right to complain.
# Placement -> printfile area, from /mockup-generator/printfiles/586 (chest left is 1200x1200 @300).
PF_TECHNIQUE = {"embroidery": "embroidery", "dtf": "dtg"}
PF_KIND_PLACEMENT = {"embroidery": "embroidery_chest_left", "dtf": "front"}

# A 4-inch badge cannot carry what a 10-inch print can. A needle has a minimum stitch length, so
# hairlines close up, small counters fill in, and every extra colour is another thread change the
# digitiser charges for. Embroidery concepts are therefore constrained at the prompt, not fixed in
# review: bold shapes, few colours, nothing that stops reading at 4 inches.
EMB_PROMPT_CLAUSE = (
    "simple bold badge that reads clearly at 4 inches wide, very few shapes, thick chunky forms, "
    "no thin lines, no small details, no gradients, no tiny elements, high contrast, "
    "at most four flat colours, generous spacing between shapes, ")
MAX_EMB_THREADS = 4
PF_AREA = {"embroidery_chest_left": (1200, 1200), "embroidery_chest_center": (1200, 1200),
           "embroidery_large_center": (3000, 1800)}
WORN_GROUPS = {"Men's", "Men's 2", "Men's 3", "Women's", "Women's 2"}

# Comfort Colors 1717, size L — Printful renders the colourway, the size only picks the photo.
# The mockup has to be the colour the listing sells: the first pending batch put dark type on a
# charcoal Pepper tee for 88 products whose hero colourway is Ivory, which is unreadable and is not
# the garment the buyer would receive.
COLORWAY_VARIANT = {"Ivory": 16525, "Butter": 15168, "Chambray": 17650, "Pepper": 17695,
                    "Black": 15116, "White": 15126, "True Navy": 15183, "Moss": 17703,
                    "Blue Jean": 16513, "Bay": 17709, "Khaki": 21536, "Denim": 21522}
# Ink follows the cloth. Anything darker than this reads as a dark garment and takes cream type.
DARK_GARMENTS = {"Pepper", "Black", "True Navy", "Moss", "Denim", "Graphite", "Midnight", "Navy"}
INK_ON_LIGHT, INK_ON_DARK = "#111111", "#F2EDE3"

# Comfort Colors swatches, for deciding whether a design can actually be seen on the cloth it is
# listed against. 12 of the first 94 pending products put dark artwork on charcoal Pepper — the art
# was fine, the garment was wrong, and swapping the garment costs nothing while regenerating does.
GARMENT_RGB = {"Ivory": (255, 244, 217), "Butter": (255, 224, 158), "Chambray": (217, 243, 255),
               "White": (255, 255, 255), "Bay": (184, 191, 171), "Khaki": (179, 171, 139),
               "Pepper": (81, 79, 76), "Black": (27, 27, 28), "True Navy": (30, 44, 74),
               "Moss": (107, 112, 83), "Denim": (86, 90, 103), "Blue Jean": (112, 126, 141)}
MIN_VISIBLE = 0.55       # fraction of artwork pixels that must stand clear of the garment


def _luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def visible_fraction(art: Path, colorway: str) -> float:
    im = open_rgba(art)
    im.thumbnail((256, 256))
    a = np.asarray(im)
    op = a[:, :, 3] > 128
    if not op.any():
        return 0.0
    g = GARMENT_RGB.get(colorway or "", (255, 244, 217))
    return float((np.abs(_luma(a[:, :, :3][op].astype(float)) - _luma(np.array(g, float))) > 60).mean())


def best_colorway(art: Path, preferred: str) -> tuple[str, float]:
    """Keep the listed colour when the design reads on it; otherwise pick the one it reads on best."""
    have = visible_fraction(art, preferred)
    if have >= MIN_VISIBLE:
        return preferred, have
    ranked = sorted(((visible_fraction(art, c), c) for c in GARMENT_RGB), reverse=True)
    return ranked[0][1], ranked[0][0]

# --- design prompt tail ----------------------------------------------------------------------
# ── style presets, measured against what actually sells ──────────────────────────────────────────
#
# One tail for every design was the mistake. It asked for a "flat vector emblem, bold outlines, no
# shading" — and 40 of the best-selling non-personalised Comfort Colors tees on Etsy (est. 150-1300
# sales/month, IP excluded) are mostly NOT that. What they are:
#
#   · a straight-faced illustration under a mundane caption — an antique botanical plate titled
#     "ALL PLANTS ARE EDIBLE, SOME ONLY ONCE" (1313/mo), a dying armoured knight titled "TUMMY HURTS".
#     The joke is the GAP between how seriously the picture is drawn and how dumb the line is.
#   · a collection: nine small drawings of unloved animals, nine protest icons, school supplies.
#     Plenty to look at reads as worth more money.
#   · a character given a persona under an arched title ("THE DESPERADO CLUB", a cat with a cocktail).
#   · type as the artwork: varsity letters filled with florals, groovy wavy lettering.
#   · a tiny chest motif where the garment shade does the selling.
#
# Two things are true of nearly all of them and were absent from our prompts: **there is text**, and the
# palette is small and muted — two to five colours, earthy or a single bright accent, very often cream
# ink on a garment-dyed dark. Texture (engraving lines, halftone, distress) is the norm, not clean vector.
#
# So the tail is now per style, and every style RESERVES SPACE for the type we hand-set afterwards. We
# still never ask the model for letters — it cannot draw them — but we stop asking for a full-bleed
# emblem that leaves the caption nowhere to go.

STYLE_TAILS = {
    # An antique engraving or scientific plate: the "serious picture, silly caption" formula.
    "engraving": (
        # "single ink colour" used to sit here, and it fought the palette layer in the same breath — 209 of
        # 290 products asked for one ink AND for two to five roled colours, and the model split the
        # difference into the washed-out look we kept rejecting. Colour is decided in one place, the palette
        # layer; the style layer describes the MEDIUM only. Cross-hatching is not a monochrome technique.
        "vintage 19th-century engraving style, fine cross-hatched line work, etched texture, "
        "aged printmaking feel, high contrast, "
        "detailed but readable at 10 inches, centred subject with clear empty space above and below "
        "for a caption"),
    # Dense botanical / naturalist plate with muted earth tones.
    "plate": (
        "antique botanical plate illustration, muted earth palette, hand-inked outlines with soft "
        "flat fills, arranged specimens, subtle aged paper texture, "
        "generous empty band at the top and bottom for a caption"),
    # A grid of small drawings — the highest perceived-value layout in the sample.
    "collection": (
        "a neat grid of eight to twelve small separate hand-drawn illustrations of the same theme, "
        "even spacing, consistent line weight, limited muted palette, each item complete and "
        "recognisable on its own, empty space in the middle or bottom "
        "reserved for a caption"),
    # Character with an identity: cat with a cocktail, raccoon with a flag.
    "character": (
        "a single hand-drawn character with personality and a prop, expressive face, retro cartoon "
        "line work, limited muted palette, soft grain shading, "
        "arched empty space above the character for a title and a clear band below for a subtitle"),
    # 70s poster: condensed shapes, sunset bands, halftone.
    "retro": (
        "1970s screen-print poster style, limited three-colour palette, halftone dot shading, "
        "sun-ray or horizontal band motif, slightly distressed ink texture, "
        "a wide empty rectangle across the centre where large type will sit"),
    # Tiny left-chest or centre-chest motif; the garment colour carries the product.
    "minimal": (
        "one small simple motif, clean minimal line art, two colours at most, generous margins, "
        "no background elements, reads clearly at three inches, "
        "small empty space beneath for a short caption"),
}
DEFAULT_STYLE = "engraving"

# Applies to every style. "NO text" is not optional: AI-rendered type is malformed and every word we
# ship is hand-set in PIL afterwards.
# ── the key colour ───────────────────────────────────────────────────────────────────────────────
#
# The background is not a detail of the concept; it is the thing the cutout keys on, so the pipeline names
# it and nobody else gets a vote. A live product proved why: the concept's own prompt said "isolated on a
# plain solid uniform background — the background colour must not appear anywhere in the artwork" and never
# NAMED a colour. The subject was nine WHITE ducks, the generator chose white, and no algorithm on earth
# separates a white duck from a white backdrop. The result shipped as white smears on a dark tee.
#
# Magenta because nothing we draw can be magenta: every style tail asks for muted earth tones and the
# palette clause bans neon outright, so a leftover pixel of this colour is unambiguously background.
KEY_COLOR = "#E6007E"
KEY_NAME = "bright magenta"

# Sentences that try to set the background themselves. Left in place they contradict the clause below, and a
# contradiction is resolved by the model at random — which is how this failed in the first place.
_BG_SENTENCE = re.compile(
    r"[^.]*\b(isolated on|background colou?r|plain (solid|uniform)[^.]*background|transparent background)\b[^.]*\.?",
    re.I)


def strip_background_talk(text: str) -> str:
    """Remove any background instruction from a concept, so the pipeline's own clause stands alone."""
    return re.sub(r"\s{2,}", " ", _BG_SENTENCE.sub("", text or "")).strip()


# The print envelope, in one place. The producer prints at 300 PPI and the largest area on a Comfort Colors
# 1717 front is 10 inches across, so 3000 px is simultaneously the ceiling (a bigger file is wasted bytes the
# DTF software resamples away) and the floor (a smaller one prints soft). Both directions matter: the old
# 2048 cap was 205 PPI, and CLAUDE.md has always said 300.
PRINT_PPI = 300
PRINT_MAX_IN = 10.0
PRINT_MAX_PX = int(PRINT_PPI * PRINT_MAX_IN)
# What the generator can actually deliver, measured rather than assumed: "4k" on our model returns 2880 px
# for a square, which is a true 300 PPI print 9.6 inches wide. So the useful question is not "is it 300 PPI
# at 10 inches" — nothing we generate passes that — but "how wide can this file print before it drops below
# 300". Anything at 9.5 inches or better fills the envelope; the old 2048 files managed 6.8.
PRINT_MIN_IN = 9.5


def key_clause(key: str = KEY_COLOR, name: str = KEY_NAME) -> str:
    """The only background instruction any prompt should carry."""
    return (f"the artwork sits alone on a plain solid uniform {name} {key} background that fills the entire "
            f"canvas edge to edge, absolutely flat with no gradient, no shadow under the artwork, no vignette; "
            f"{key} appears NOWHERE inside the artwork itself")


# Layer 1 of the compiler, and the one we had only in negative form. "no mockup, no t-shirt, no person"
# tells the model what to avoid; the positive sentence tells it what the file IS, which is what actually
# stops it returning the product instead of the print. The silhouette half is the other repair: unsaid, the
# model centres everything in a square, and a wide or tall idea gets squeezed into it — spending a fraction
# of a 10 inch envelope on a design that was meant to fill it.
ARTIFACT_MARK = "isolated front-print artwork"        # how to recognise the contract in a stored prompt
ARTIFACT_CONTRACT = (
    "one isolated front-print artwork on a plain generation canvas, the graphic only, "
    "not rendered on clothing, a person, paper, a wall or inside a scene; "
    "the outer silhouette may be organic, irregular, wide, tall or asymmetrical — "
    "do not force it into a square, a circle, a badge or a border unless the concept asks for one; "
    "the whole design stays inside the canvas with an even margin and nothing cropped at the edges"
)

# Grain and halftone belong INSIDE the artwork. Asked for over the whole image, the model textures the key
# matte as well, and every speck of texture sitting on the matte survives keying as dirt on the garment.
# This is where the residue that took a catalogue-wide cleaning pass came from.
TEXTURE_CLAUSE = ("any halftone, grain or distress texture stays strictly inside the artwork shapes, "
                  "never over the background")

# Focused exclusions only — four to eight, scenario-specific. A long generic ban list dilutes the
# instruction that matters, and half of the old list is now stated positively in ARTIFACT_CONTRACT.
# What is left is fatal HERE: our words are typeset afterwards in a licensed font, so any generated
# lettering is waste, and soft shadow or glow keys out as a white fringe on dark cotton.
# NOT "transparent background": the generator cannot draw transparency, so it paints something — a
# checkerboard, or worse, whatever colour suits the subject. Naming the key colour is the whole point.
PROMPT_TAIL_COMMON = (
    "flat print-ready artwork for a garment, no drop shadow, no glow, no photorealism, "
    "NO text, NO letters, NO words, NO numbers, no watermark, no signature"
)

# Banning letters makes the model draw the CONTAINER for letters instead: empty ribbons, blank scrolls,
# vacant plaques. On a finished tee that reads as unfinished artwork — the same defect as the "leave every
# label COMPLETELY EMPTY" prompts that shipped blank bands to buyers. Our words are typeset afterwards in
# their own zone, so the illustration needs no label at all.
#
# Conditional, because some concepts ARE a banner or a crest ("a guild banner carrying the guild name").
# Forbidding the subject the concept asks for is the contradiction this whole pass exists to remove, so
# the clause is dropped whenever the subject names one of these shapes.
NO_LABEL_CLAUSE = "no ribbons, no banners, no scrolls, no plaques, no empty label shapes waiting to be filled"
_LABEL_WORDS = re.compile(r"\b(banner|ribbon|scroll|plaque|placard|pennant|crest|shield|badge|patch|"
                          r"plate|sign|label|tag|nameplate)\b", re.I)


def wants_label_shape(subject: str | None) -> bool:
    return bool(subject and _LABEL_WORDS.search(subject))

# Comfort Colors is garment-dyed, so the ink that reads best is the one the winners use: a warm
# off-white on dark shades, deep earth tones on light ones. Naming it stops the model reaching for pure
# white and neon, which look like a sticker on washed cotton.
#
# Each colour also gets a job. A palette listed as four hexes invites the model to spread all four evenly
# and the result reads as a swatch; naming which colour carries the shapes, which draws the contour and
# which is the sparing accent is what produces the restrained look the winners have.
PALETTE_HINT = (
    "colour palette: two to five colours only, muted and slightly desaturated, each with a role — "
    "warm cream #F2E8D5 or deep charcoal #2B2B2B carries the main shapes, the other of the two draws "
    "contour and shadow, and one earth tone (rust #B5563A, olive #6B7250, ochre #C9A227, faded indigo "
    "#3F4A6E) is the accent, used sparingly; no neon, no pure white"
)


# The stored design_prompt is the FULL assembled prompt from the batch that created the product, tail and
# all — `stage_seed` saves `c["_prompt"]`, not the subject line. So appending a new style tail produced a
# prompt that asked for "flat solid colors only, no shading" AND "engraving with fine cross-hatching" in
# the same breath, and the model split the difference. 128 of 264 stored prompts carry an old tail.
#
# These markers open the old style block. Everything from the earliest one is dropped; the concept's own
# `Palette:` clause is kept, because a palette chosen for that design beats a generic one.
OLD_TAIL_MARKERS = (
    "Centered composition with", "flat vector emblem", "Flat solid colors only",
    "flat solid colors only", "artwork in rich colours", "bold graphic patch design",
)
PREAMBLE = re.compile(r"^\s*(vintage illustrated t-shirt print|flat vector embroidery preview graphic)"
                      r"[^.]*\.\s*", re.I)
PALETTE_CLAUSE = re.compile(r"(Palette:\s*[^.]+\.)", re.I)


def subject_of(prompt: str) -> tuple[str, bool]:
    """The concept itself, without the style directives baked in by an earlier batch.

    Returns the subject text and whether it already names a palette — when it does, the generic palette
    hint is left out rather than argued with.
    """
    text = (prompt or "").strip()
    palette = ""
    m = PALETTE_CLAUSE.search(text)
    if m:
        palette = m.group(1).strip()
    cuts = [text.find(mk) for mk in OLD_TAIL_MARKERS if text.find(mk) > 0]
    if cuts:
        text = text[:min(cuts)]
    text = PALETTE_CLAUSE.sub("", text)
    text = PREAMBLE.sub("", text).strip().rstrip(",.;— ")
    # Legacy prompts come in several shapes and not all of them survive a mechanical cut: one embroidery
    # prompt reduced to "5mm. Isolated on a plain solid deep pine green background", subject gone. Returning
    # that would generate confident nonsense. When the remainder does not look like a subject — too short,
    # or opening on a leftover fragment — the caller is told so and uses the original prompt instead, and the
    # product is flagged for a rewritten concept. Better a design in the old style than a design of nothing.
    looks_broken = (len(text) < 60
                    or re.match(r"^\s*(\d|isolated\b|exclusions\b|no\b)", text, re.I) is not None)
    if looks_broken:
        return "", bool(palette)
    if palette:
        text = f"{text}. {palette}"
    return text, bool(palette)


def style_tail(style: str | None, with_palette: bool = True, subject: str | None = None,
               key_hex: str = KEY_COLOR) -> str:
    """The full instruction tail for a concept's style.

    `subject` is the concept's own shape description; pass it so a concept that genuinely asks for a
    crest or a banner is not told to leave one out.
    """
    key = (style or DEFAULT_STYLE).strip().lower()
    parts = [STYLE_TAILS.get(key, STYLE_TAILS[DEFAULT_STYLE])]
    if with_palette:
        parts.append(PALETTE_HINT)
    if not wants_label_shape(subject):
        parts.append(NO_LABEL_CLAUSE)
    parts.append(TEXTURE_CLAUSE)
    parts.append(PROMPT_TAIL_COMMON)
    parts.append(key_clause(key_hex))
    return ", ".join(parts)


# Kept for callers that still reference the old single tail.
PROMPT_TAIL = f"{STYLE_TAILS[DEFAULT_STYLE]}, {PALETTE_HINT}, {PROMPT_TAIL_COMMON}"

# Plain-English names for the 15 Printful threads. The generator ignores a bare hex but obeys
# "golden yellow #FFCC00", so both go in.
THREAD_NAMES = {
    "#FFFFFF": "white", "#000000": "black", "#9E9897": "warm grey", "#855332": "golden oak brown",
    "#FFC918": "bright golden yellow", "#FA5F0B": "vivid orange", "#C8888A": "dusty pink",
    "#CD2E29": "brick red", "#81673D": "olive tan", "#3F4A6E": "ink navy blue",
    "#1C53AD": "royal blue", "#BCD2E1": "pale denim blue", "#803886": "purple",
    "#1D4933": "deep forest green", "#4D5E53": "muted spruce green",
}


def palette_line(threads: list[str] | None) -> str:
    """Name the exact thread colours in the prompt.

    Without this the prompt describes shape only and the model picks its own palette: the first
    embroidery batch came back in muted gold #D0A04E, which snaps to tan brown — while the spec had
    declared bright golden yellow. Both the gate and the digitiser were right to object. Stating the
    hexes moves the model close enough that the snap is a cleanup, not a reinterpretation.
    """
    named = [f"{THREAD_NAMES[h]} {h}" for h in (threads or []) if h in THREAD_NAMES]
    if not named:
        return ""
    return ("use ONLY these exact colours and no others: " + ", ".join(named)
            + ", every shape filled with one of these exact colours, ")

# Gate 8. Not a trademark search — a cheap tripwire for the names that must never reach a prompt.
# Extend freely; a false positive costs one edit, a false negative costs the shop.
BANNED_PROMPT_TERMS = [
    "dungeons", "dragons", "d&d", "dnd", "pathfinder", "warhammer", "magic the gathering",
    "critical role", "baldur", "elder scrolls", "world of warcraft", "pokemon", "pokémon",
    "nintendo", "mario", "zelda", "marvel", "dc comics", "star wars", "harry potter", "hogwarts",
    "disney", "pixar", "lego", "minecraft", "fortnite", "roblox", "nike", "adidas", "supreme",
    "coca-cola", "dr pepper", "buc-ee", "whataburger", "heb", "taylor swift", "in the style of",
    "nfl", "nba", "mlb", "premier league",
]

# "-" means the gate has not run yet (missing input); "n/a" means it does not apply to this kind of
# product. The difference matters: a concept is only "ready" when nothing is still pending.
PASS, FAIL, WARN, SKIP, NA = "ok", "FAIL", "warn", "-", "n/a"
BLOCKING = {FAIL}
PENDING = {SKIP}


@dataclass
class Gate:
    key: str
    status: str
    note: str = ""


@dataclass
class Result:
    slug: str
    kind: str
    gates: list[Gate] = field(default_factory=list)
    hf_calls: int = 0
    hf_planned: int = 0          # what a live run WOULD spend, so --dry-run can quote a price
    pf_mockups: int = 0
    files: dict = field(default_factory=dict)
    error: str = ""
    note: str = ""      # non-fatal, still said out loud in the report

    def add(self, key, status, note=""):
        self.gates.append(Gate(key, status, note))
        return status

    @property
    def blocked(self) -> bool:
        return bool(self.error) or any(g.status in BLOCKING for g in self.gates)

    @property
    def pending(self) -> bool:
        """A stage never ran (dry run, or an upstream stage produced nothing)."""
        return any(g.status in PENDING for g in self.gates) or len(self.gates) < len(GATE_KEYS)

    def gate(self, key) -> str:
        for g in self.gates:
            if g.key == key:
                return g.status
        return SKIP


# =================================================================================================
# small helpers
# =================================================================================================

def sh(cmd: list[str], env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run([str(c) for c in cmd], capture_output=True, text=True,
                          env={**os.environ, **(env or {})} if env else None)


def hexes(seq) -> list[str]:
    return [h.strip().upper() for h in (seq or [])]


def rgb_of(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def open_rgba(path) -> Image.Image:
    return Image.open(path).convert("RGBA")


# =================================================================================================
# stage: generate (Higgsfield — the ONLY paid step)
# =================================================================================================

def hf(args: dict, shop_id: int | None = None) -> dict:
    """Call scripts/hf_gen.mts. Keeps all MCP/OAuth logic in worker/hf.ts where it already works.

    HF_SHOP_ID decides WHOSE Higgsfield account pays. Without it every tenant's generation was billed to
    the operator's account, because worker/hf.ts read a single hardcoded token row.
    """
    env = {"HF_SHOP_ID": str(shop_id)} if shop_id else None
    p = sh(["node", "--experimental-strip-types", HF_GEN, json.dumps(args)], env=env)
    line = (p.stdout or "").strip().splitlines()
    try:
        return json.loads(line[-1]) if line else {"ok": False, "error": (p.stderr or "no output")[:300]}
    except json.JSONDecodeError:
        return {"ok": False, "error": ((p.stderr or p.stdout) or "unparseable")[-300:]}


def stage_generate(c: dict, d: Path, r: Result, dry: bool, force: bool,
                   shop_id: int | None = None) -> Path | None:
    raw = d / "raw" / f"{c['slug']}-raw.png"
    emb = c["kind"] == "embroidery"
    pal = palette_line(c.get("threads")) if emb else ""
    lead = EMB_PROMPT_CLAUSE if emb else ""
    # `style` picks the tail (engraving / plate / collection / character / retro / minimal). Absent, the
    # engraving style is used: it is the formula behind the strongest sellers in the sample.
    prompt = (f"{c['prompt_head'].strip().rstrip(',')}, {lead}{pal}"
              f"{style_tail(c.get('style'), subject=c['prompt_head'])}")
    c["_prompt"] = prompt
    if raw.exists() and not force:
        return raw
    r.hf_planned += 1
    if dry:
        return None
    raw.parent.mkdir(parents=True, exist_ok=True)
    out = hf({"op": "generate", "prompt": prompt, "out": str(raw),
              "model": c.get("model", DEFAULT_MODEL),
              "quality": c.get("quality", DEFAULT_QUALITY),
              # 2k, not 4k: the cutout downsamples to 2048 either way, and 2048 is already well over
              # what both placements need (embroidery chest-left is a 1200px printfile, the DTF front
              # 1800px). Compared side by side the 4k output has no visible advantage after the
              # resize. recraft_v4_1 is half the credits but could not draw the concepts — it
              # returned an unrecognisable dice tower — so the saving is resolution, not model.
              "resolution": c.get("resolution", "2k")}, shop_id=shop_id)
    if not out.get("ok"):
        r.error = f"generate: {out.get('error')}"
        return None
    r.hf_calls += out.get("calls", 1)
    c["_model"] = out.get("model")
    c["_job_id"] = out.get("job_id")
    return raw


def drop_background_specks(im: Image.Image, light: int = 200, neutral: int = 14,
                           open_frac: float = 0.0002, closed_frac: float = 0.0008
                           ) -> tuple[Image.Image, int]:
    """Clear the pale flecks of backdrop the cutout could not reach.

    The generator paints on white and a cutout only removes what it can reach from outside, so the
    counter of an "a", the triangle inside an "A" and the valleys of an "M" come through as pale
    islands. On Ivory nobody sees them; on rust or Pepper they are visible dirt — this is what "you
    cannot clean properly" means. `drop_smooth_pockets` cannot catch them: it works in percent-of-area
    and these are three orders of magnitude smaller. Texture cannot either — a fleck that small sits
    inside the boundary gradient of the thread around it, so its local variance reads HIGH (measured
    2629 against 1223 for real thread).

    Two measures do separate them:

    * **Neutrality.** Backdrop residue is grey (measured 209,209,211). Thread sheen on navy stays
      coloured (211,217,233). Requiring R≈G≈B keeps every highlight and drops only the paper.
    * **Size.** Real satin fills are thousands of pixels; residue here ran to 77. An enclosed pocket is
      allowed to be larger than an open one, because a wholly surrounded pale area cannot be a
      deliberate edge highlight.

    A genuine white-thread element (a white heart, a satin outline) is far above both limits and stays.
    """
    from scipy import ndimage

    a = np.asarray(im).astype(np.uint8).copy()
    opaque = a[:, :, 3] > 128
    if not opaque.any():
        return im, 0
    rgb = a[:, :, :3].astype(int)
    pale = opaque & (rgb.min(axis=2) >= light) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= neutral)
    if not pale.any():
        return im, 0

    lab, n = ndimage.label(pale)
    sizes = ndimage.sum(pale, lab, range(1, n + 1))
    area = float(opaque.sum())
    limit_open = max(64.0, area * open_frac)
    limit_closed = max(256.0, area * closed_frac)
    # A component touching the transparent field is part of the silhouette, not an enclosed pocket.
    outside_near = ndimage.binary_dilation(~opaque, iterations=1)
    touches = ndimage.maximum(outside_near.astype(np.uint8), lab, range(1, n + 1)).astype(bool)

    drop_ids = [i for i, (sz, t) in enumerate(zip(sizes, touches), start=1)
                if sz <= (limit_open if t else limit_closed)]
    if not drop_ids:
        return im, 0
    a[:, :, 3][np.isin(lab, drop_ids)] = 0
    return Image.fromarray(a, "RGBA"), len(drop_ids)


def drop_flat_white_pockets(im: Image.Image, light: int = 247, neutral: int = 14,
                            rough: float = 6.0, max_frac: float = 0.15) -> tuple[Image.Image, int]:
    """Open enclosed pockets of untouched backdrop, however large.

    The cutout keeps every light area it cannot reach from the border. That rule exists for a reason —
    it once erased the white interior of a personalisation ribbon — but it also keeps the gap between a
    mascot's legs and the space behind a stack of books. Measured on one product those two pockets were
    76 164 and 10 016 pixels, 7.3% of the artwork, flat white (251,251,251) at a standard deviation of
    3.5. Composited, the garment's weave modulates that white and it reads as a dirty checkered patch.

    Size cannot decide this and neither can enclosure alone. Three things together can:

    * **very light** — 247+, the generator's paper. Our own light ink is cream #F2E8D5, and the palette
      clause forbids pure white, so nothing we draw lands here.
    * **neutral** — R≈G≈B. Cream is not (max-min = 29), nor is any tinted highlight.
    * **smooth** — a real white shape drawn as ink or stitched as thread carries grain; backdrop does
      not. This is what protects a white satin heart or a white halftone field from being erased.

    Those three are still not enough, and a badge design proved it: a white disc inside a heavy dark
    ring is flat, neutral and 251, and it is entirely deliberate — deleting it leaves bottles floating
    in a hoop. What separates it from a gap between a mascot's legs is SHARE of the artwork. Measured
    over 194 print files the residue pockets sit at a median of 3.1% of the opaque area and only seven
    products exceed 15%; the badge field is 44%. So a pocket larger than `max_frac` is left alone and
    reported instead — the same instinct as the ribbon rule this function refines, kept as a number.
    """
    from scipy import ndimage

    a = np.asarray(im).astype(np.uint8).copy()
    opaque = a[:, :, 3] > 128
    if not opaque.any():
        return im, 0
    rgb = a[:, :, :3].astype(float)
    pale = opaque & (rgb.min(axis=2) >= light) & ((rgb.max(axis=2) - rgb.min(axis=2)) <= neutral)
    if not pale.any():
        return im, 0

    grey = rgb.mean(axis=2)
    m = ndimage.uniform_filter(grey, 7)
    sd = np.sqrt(np.maximum(ndimage.uniform_filter(grey * grey, 7) - m * m, 0))

    lab, n = ndimage.label(pale)
    outside_near = ndimage.binary_dilation(~opaque, iterations=1)
    touches = ndimage.maximum(outside_near.astype(np.uint8), lab, range(1, n + 1)).astype(bool)
    smoothness = ndimage.median(sd, lab, range(1, n + 1))
    sizes = ndimage.sum(pale, lab, range(1, n + 1))
    limit = opaque.sum() * max_frac

    kept_big = 0
    drop_ids = []
    for i, (t, s, sz) in enumerate(zip(touches, smoothness, sizes), start=1):
        if t or s >= rough:
            continue
        if sz > limit:
            kept_big += int(sz)          # probably a deliberate white field, not paper
            continue
        drop_ids.append(i)
    if kept_big:
        print(f"  UYARI: {kept_big} px duz beyaz alan KORUNDU (opak alanin >%{max_frac*100:.0f}'i, "
              f"kasitli tasarim olabilir — elle bakilmali)", file=sys.stderr)
    if not drop_ids:
        return im, 0
    mask = np.isin(lab, drop_ids)
    a[:, :, 3][mask] = 0
    # The freshly opened edge is backdrop-coloured; pull colour in from what is left so later
    # interpolation has only ink to blend with.
    keep = a[:, :, 3] > 128
    if keep.any():
        idx = ndimage.distance_transform_edt(~keep, return_distances=False, return_indices=True)
        a[:, :, :3] = a[:, :, :3][idx[0], idx[1]]
    return Image.fromarray(a, "RGBA"), int(mask.sum())


def key_cutout(raw: Path, out: Path, key: str = KEY_COLOR, tol: int = 60) -> tuple[Path, dict]:
    """Cut the artwork out of a KNOWN background colour, and prove it worked.

    `local_cutout` has to guess what the background is: it samples the border, floods inward, and then
    argues about enclosed light areas because it cannot tell a white backdrop from a white subject. That
    argument is unwinnable — nine white ducks on white shipped as white smears on a dark tee.
    
    When the prompt NAMES the background colour the problem disappears: the colour appears nowhere in the
    artwork, so every pixel near it is background wherever it sits — enclosed, bordering, in the crook of a
    duck's wing. No flood, no pockets, no heuristics.

    Returns the path and a report, because "cut out" is a claim until measured: leftover key pixels mean the
    generator drifted off the colour and the caller must not ship the file.
    """
    from scipy import ndimage                        # noqa: PLC0415

    kr, kg, kb = int(key[1:3], 16), int(key[3:5], 16), int(key[5:7], 16)
    im = Image.open(raw).convert("RGB")
    # The cap is the print envelope, not an arbitrary number: PRINT_MAX_PX across is exactly 300 PPI at the
    # 10 inch print width, which is the standard the producer needs. It was 2048 — 205 PPI — so every file in
    # the catalogue was a fifth short of the resolution we tell ourselves we ship. `thumbnail` only ever
    # shrinks, so a small source is left alone and reported as under-resolution rather than fake-upscaled.
    im.thumbnail((PRINT_MAX_PX, PRINT_MAX_PX), Image.LANCZOS)
    a = np.asarray(im).astype(int)
    dist = np.sqrt(((a - np.array([kr, kg, kb])) ** 2).sum(axis=2))
    bg = dist <= tol

    # The blend ring: where ink meets the key colour the generator mixes the two, so those pixels are part
    # key and would tint the edge. Take the ring off rather than trying to un-mix it.
    keep = ndimage.binary_erosion(~bg, np.ones((5, 5)))
    # Speckles inside the artwork (a stray key-coloured pixel in a dark line) are noise, not holes.
    keep = ndimage.binary_closing(keep, np.ones((3, 3)))
    alpha = np.where(keep, 255, 0).astype(np.uint8)

    rgb = np.asarray(im).copy()
    if keep.any():
        idx = ndimage.distance_transform_edt(~keep, return_distances=False, return_indices=True)
        rgb = rgb[idx[0], idx[1]]                    # design colour outward, so nothing else can bleed

    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.dstack([rgb, alpha]), "RGBA").save(out)

    opaque = keep.sum()
    leftover = int((bg & keep).sum())
    # A subject that runs off the canvas is a fatal defect that looks fine in the raw frame — the crop is
    # only obvious once the design is on a garment and a wing or a boot ends in a straight line. It is also
    # free to detect: the matte fills the canvas edge to edge, so artwork touching the border means either
    # the composition was cut off or the matte failed there. Measured across 30 shipped files: 0 touch.
    edge_contact = max(float(b.mean()) for b in
                       (keep[:2, :], keep[-2:, :], keep[:, :2], keep[:, -2:]))
    report = {
        "opaque_frac": round(float(opaque) / keep.size, 4),
        "bg_frac": round(float(bg.sum()) / bg.size, 4),
        "leftover_key_px": leftover,
        "edge_contact": round(edge_contact, 4),
        "size_in_at_300": round(max(im.size) / PRINT_PPI, 1),
    }
    return out, report


def local_cutout(raw: Path, out: Path, tol: int = 26) -> Path:
    """Cut the emblem out of the painted background locally, for free.

    The generator answers "transparent background" with a drawn two-tone checkerboard, and that is
    the easiest background there is to key: flat, hard-edged, and sampled straight off the border.
    Matched against a paid remove_bg on real batch output it agrees to 97-99.7% IoU.

    Two rules do the work. Flood from the BORDER rather than keying the colour globally, or the white
    interior of a personalisation ribbon disappears with the background. Then reclaim the enclosed
    pockets — between a shield and its banner, say — using the one thing that separates them from a
    genuine white shape: painted checkerboard alternates two tones, a real white area is one tone.
    """
    from scipy import ndimage                        # noqa: PLC0415 — only this stage needs it

    im = Image.open(raw).convert("RGB")
    im.thumbnail((2048, 2048), Image.LANCZOS)
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    edge = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
                           a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    uniq, cnt = np.unique(edge.reshape(-1, 3), axis=0, return_counts=True)
    tones = uniq[np.argsort(-cnt)][:3]

    masks = [np.abs(a - t).max(axis=2) <= tol for t in tones]
    bgish = np.logical_or.reduce(masks)
    lab, n = ndimage.label(bgish)
    keep = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}

    # The enclosed-pocket rule only means anything when the background really is TWO tones. On a
    # plain white background all three sampled tones are the same white, every test passes, and the
    # white interior of a personalisation ribbon gets reclaimed as background — which is exactly how
    # a perfectly good banner came back measuring 1px. Distinct tones, or no reclaim.
    distinct = [t for i, t in enumerate(tones)
                if all(np.abs(t.astype(int) - u.astype(int)).max() > tol * 2 for u in tones[:i])]
    if len(distinct) >= 2:
        dmasks = [np.abs(a - t).max(axis=2) <= tol for t in distinct]
        for idx in range(1, n + 1):
            if idx in keep:
                continue
            blob = lab == idx
            hits = sum(1 for m in dmasks if (m & blob).sum() > blob.sum() * 0.15)
            if hits >= 2:                            # two distinct tones inside -> painted checker
                keep.add(idx)
    alpha = np.where(np.isin(lab, list(keep)), 0, 255).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.MedianFilter(3)))

    # Cut the anti-aliased ring off. Where the artwork meets the background the generator blends the
    # two, so those pixels are mostly background colour — on white that is a pale halo which survives
    # any keying that works on colour alone, and it is visible as a white outline around the badge on
    # a dark shirt. Eroding by the width of that blend removes it; on flat art with thick outlines
    # two pixels of a 2048px canvas cost nothing.
    # Measured, not guessed: sampling inward from the boundary, 34-37% of pixels at the edge are
    # near-white, 24-29% at 2px, 1-3% at 4px and none at 6px. The blend zone is four pixels, so that
    # is what comes off — 0.25% of a 2048px canvas, invisible on artwork with thick outlines.
    grow = max(5, int(min(alpha.shape) * 0.0025))
    keepmask = ndimage.binary_erosion(alpha > 128, np.ones((grow * 2 + 1, grow * 2 + 1)))
    alpha = np.where(keepmask, 255, 0).astype(np.uint8)

    # Extend the colour outward past the alpha edge. Zeroing alpha does not change RGB, so every
    # transparent pixel still carried the white the artwork was drawn on — and every later stage
    # that interpolates (the perspective warp, the displacement resample, the ink-bleed feather)
    # mixed that white back in. On a black shirt it shows as a pale line hugging the design, which
    # no amount of eroding removes because the erosion is not where it comes from. Filling the
    # transparent region with its nearest opaque colour means those blends have nothing but design
    # colour to blend with.
    rgb = np.asarray(im).copy()
    if keepmask.any():
        idx = ndimage.distance_transform_edt(~keepmask, return_distances=False, return_indices=True)
        rgb = rgb[idx[0], idx[1]]
    # The enclosed-pocket rule above keeps every light area it cannot reach from the border, which is
    # right for a ribbon interior and wrong for the counter of an "a": those come through as pale
    # flecks that are invisible on Ivory and read as dirt on rust. Drop the small neutral ones only.
    art, specks = drop_background_specks(Image.fromarray(np.dstack([rgb, alpha]), "RGBA"))
    if specks:
        print(f"  {out.stem}: {specks} zemin lekesi temizlendi", file=sys.stderr)
    # Same rule, the other end of the size range: whole pockets of untouched paper between a mascot's
    # legs or behind a stack of books, kept by the enclosed-area rule and read as dirt once the weave
    # modulates them.
    art, pocket_px = drop_flat_white_pockets(art)
    if pocket_px:
        print(f"  {out.stem}: {pocket_px} px duz beyaz cep acildi", file=sys.stderr)
    out.parent.mkdir(parents=True, exist_ok=True)
    art.save(out)
    return out


def stage_cutout(raw: Path | None, c: dict, d: Path, r: Result, dry: bool, force: bool,
                 shop_id: int | None = None) -> Path | None:
    cut = d / "work" / f"{c['slug']}-cutout.png"
    if cut.exists() and not force:
        return cut
    if dry or raw is None or not raw.exists():
        r.hf_planned += 1                            # quoted only as the fallback price
        return None
    cut.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Free, deterministic, and it does not leave the painted checkerboard behind the way a
        # generic subject-cutout sometimes does — that failure cost three regenerations in one batch.
        return local_cutout(raw, cut)
    except Exception as e:
        r.note = f"yerel kesim basarisiz ({str(e)[:80]}), remove_bg'a dusuldu"
    r.hf_planned += 1
    out = hf({"op": "remove_bg", "src": str(raw), "out": str(cut)}, shop_id=shop_id)
    if not out.get("ok"):
        r.error = f"remove_bg: {out.get('error')}"
        return None
    r.hf_calls += out.get("calls", 1)
    return cut


# =================================================================================================
# GATE 1 — alpha
# =================================================================================================

def _drawn_checkerboard(im: Image.Image) -> bool:
    """The generator answers "transparent background" with a PAINTED grey checkerboard in RGB mode.

    It looks transparent in a preview and prints as a grey grid on the garment. Signature: a corner
    patch that is almost entirely neutral grey, splits into two light tones, and alternates on a
    regular period along each row.
    """
    rgb = np.asarray(im.convert("RGB")).astype(int)
    h, w, _ = rgb.shape
    k = max(24, min(h, w) // 8)
    patch = rgb[:k, :k]
    neutral = (np.abs(patch[:, :, 0] - patch[:, :, 1]) < 14) & (np.abs(patch[:, :, 1] - patch[:, :, 2]) < 14)
    if neutral.mean() < 0.95:
        return False
    lum = patch.mean(axis=2)
    lo, hi = np.percentile(lum, [10, 90])
    if not (lo > 140 and hi < 252 and 6 < hi - lo < 90):
        return False
    sign = (lum > lum.mean()).astype(int)
    return float(np.abs(np.diff(sign, axis=1)).sum(axis=1).mean()) >= 2.0


def gate_alpha(path: Path | None, r: Result) -> None:
    if path is None or not Path(path).exists():
        r.add("G1 alpha", SKIP, "no cutout yet")
        return
    im = Image.open(path)
    if im.mode != "RGBA":
        r.add("G1 alpha", FAIL, f"mode={im.mode}, expected RGBA — background was never removed")
        return
    a = np.asarray(im)[:, :, 3]
    k = max(8, min(a.shape) // 64)
    worst = max(int(c.max()) for c in (a[:k, :k], a[:k, -k:], a[-k:, :k], a[-k:, -k:]))
    if worst > 8:
        r.add("G1 alpha", FAIL, f"corner alpha {worst} != 0 — opaque or haloed background")
        return
    if _drawn_checkerboard(im):
        r.add("G1 alpha", FAIL, "drawn checkerboard detected — 'transparency' is painted, not alpha")
        return
    r.add("G1 alpha", PASS, f"RGBA, corner alpha {worst}")


# =================================================================================================
# palette snap + GATE 2 — thread colours
# =================================================================================================

def stage_palette_snap(src: Path, declared: list[str], out: Path) -> Path:
    """Redraw the embroidery file in the EXACT declared thread hexes.

    Not nearest-match against the full 15: nearest-in-RGB is not nearest-to-the-eye, which is how a
    dusty blue was stitched in purple (#6B5294) and a muted gold in brown (#A67843). The human picks
    the mapping in the spec; this only enforces it, so what the digitiser receives and what the
    mockup shows are the same file.
    """
    im = open_rgba(src)
    a = np.asarray(im).astype(int).copy()
    pal = np.array([rgb_of(h) for h in declared])
    opaque = a[:, :, 3] > 128
    px = a[:, :, :3][opaque].astype(float)
    nearest = np.argmin(((px[:, None, :] - pal[None, :, :]) ** 2).sum(axis=2), axis=1)
    a[:, :, :3][opaque] = pal[nearest]
    a[:, :, 3][~opaque] = 0                     # kill soft edges: embroidery has no partial alpha
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(a.astype(np.uint8), "RGBA").save(out)
    return out


# A colour holding this much of the artwork is a visible element (a red star, a small ribbon). It is
# BELOW thread_colors.py's 3% auto-pick threshold, which is exactly the trap: the colour is dropped
# from the declared list and the digitiser then maps it to whatever it likes.
MIN_DECLARE = 0.005


def fringe_only(art: Path, colours: list[str]) -> set[str]:
    """Of `colours`, the ones that exist ONLY as anti-aliased edge pixels.

    Where a black outline meets a gold fill, the blended border snaps to whatever thread sits
    between the two — tan brown, dark maroon — and on a 4k emblem that border is ~1% of the artwork,
    over MIN_DECLARE. It is not an element and the digitiser never sees it: the palette snap rewrites
    every pixel to a declared thread. Erosion tells the two apart. A real element, however small,
    keeps a solid core; a 1-2px border vanishes completely.
    """
    im = open_rgba(art)
    im.thumbnail((512, 512), Image.NEAREST)
    a = np.asarray(im).astype(np.int32)
    pal = np.array([rgb_of(h) for h in PALETTE_HEX])
    opaque = a[:, :, 3] >= 128
    idx = np.argmin(((a[:, :, :3][opaque][:, None, :] - pal[None, :, :]) ** 2).sum(axis=2), axis=1)
    lab = np.full(a.shape[:2], -1)
    lab[opaque] = idx
    out = set()
    for h in colours:
        mask = Image.fromarray(((lab == PALETTE_HEX.index(h)) * 255).astype(np.uint8))
        if not np.asarray(mask.filter(ImageFilter.MinFilter(3))).any():
            out.add(h)
    return out


def gate_threads(art: Path | None, c: dict, r: Result) -> list[str]:
    if c["kind"] != "embroidery":
        r.add("G2 threads", NA, "dtf — no thread palette")
        return []
    declared = hexes(c.get("threads"))
    if not declared:
        auto = thread_pick(art) if art and Path(art).exists() else []
        r.add("G2 threads", FAIL,
              "no threads declared; nearest-match is advisory only. Proposed: " + ",".join(auto))
        return []
    bad = [h for h in declared if h not in PALETTE_HEX]
    if bad:
        r.add("G2 threads", FAIL, f"not exact Printful thread hexes: {','.join(bad)}")
        return declared
    if len(declared) > MAX_THREADS:
        r.add("G2 threads", FAIL, f"{len(declared)} threads > {MAX_THREADS} the machine carries")
        return declared
    if art is None or not Path(art).exists():
        r.add("G2 threads", SKIP, "artwork not generated yet")
        return declared

    # Cross-check against the ORIGINAL artwork, before the snap — after the snap every colour is
    # declared by construction and the check would prove nothing.
    cov = thread_coverage(art)
    over = [h for h, f in cov.items() if f >= MIN_DECLARE and h not in declared]
    fringe = fringe_only(art, over) if over else set()
    missing = [f"{h}({cov[h] * 100:.1f}%)" for h in over if h not in fringe]
    if missing:
        r.add("G2 threads", FAIL,
              "colour present in art but not declared -> digitiser will guess: " + ", ".join(missing))
        return declared
    unused = [h for h in declared if cov.get(h, 0) < 0.001]
    note = f"{len(declared)} exact threads"
    if fringe:                       # said out loud: a silent tolerance is how a real element slips
        note += f"; edge blend absorbed by snap: {','.join(sorted(fringe))}"
    if unused:
        note += f"; unused: {','.join(unused)}"
    r.add("G2 threads", WARN if unused else PASS, note)
    return declared


# =================================================================================================
# stage: hand-set type / personalisation token + GATE 7
# =================================================================================================

SLOGAN_FONT = "/System/Library/Fonts/Supplemental/Impact.ttf"


def stage_slogan(src: Path, slogan: str, out: Path, ink: str = "#111111") -> tuple[Path, int]:
    """Hand-set the slogan under the emblem.

    These products ARE the phrase — the stored prompts asked the generator for the words letter by
    letter, which is the one thing it reliably gets wrong (malformed glyphs, dropped letters, invented
    punctuation). So the emblem is generated wordless and the line is set here in real type, the same
    way the d20 numeral and the personalisation token are.

    Layout is emblem-over-line, sized so the words read at thumbnail size: the phrase is the product,
    and a buyer scrolling Etsy has to be able to read it in a 170px grid tile.
    """
    art = open_rgba(src)
    art = art.crop(art.getbbox() or (0, 0, art.width, art.height))
    W = H = 2048
    # 6% margin cost real chest coverage: the print measured 43% of the shirt against the ~55% a
    # 12-inch front print should occupy. Printful fits the whole square into the print area, so every
    # transparent pixel of margin is print area given away.
    pad = int(W * 0.02)
    lines = _wrap(slogan.upper(), W - 2 * pad)
    text_h = int(H * (0.16 if len(lines) == 1 else 0.13 * len(lines)))
    art_box = H - text_h - int(H * 0.10) - pad
    scale = min((W - 2 * pad) / art.width, art_box / art.height)
    art = art.resize((max(1, int(art.width * scale)), max(1, int(art.height * scale))), Image.LANCZOS)

    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.paste(art, ((W - art.width) // 2, pad), art)
    d = ImageDraw.Draw(canvas)
    y = pad + art.height + int(H * 0.045)
    drawn = 0
    for line in lines:
        size = _fit(line, W - 2 * pad, text_h // max(1, len(lines)))
        f = ImageFont.truetype(SLOGAN_FONT, size)
        l, t, r, b = d.textbbox((0, 0), line, font=f)
        d.text(((W - (r - l)) // 2 - l, y - t), line, font=f, fill=rgb_of(ink) + (255,))
        y += (b - t) + int(H * 0.015)
        drawn += 1
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    return out, drawn


def _wrap(text: str, width_px: int, max_lines: int = 3) -> list[str]:
    """Break on words so no line needs a font smaller than the others to fit."""
    words = text.split()
    for n in range(1, max_lines + 1):
        per = max(1, len(words) // n + (1 if len(words) % n else 0))
        lines = [" ".join(words[i:i + per]) for i in range(0, len(words), per)]
        if len(lines) <= n and max(len(x) for x in lines) <= 18:
            return lines
    return [" ".join(words)]


def _fit(line: str, width_px: int, height_px: int) -> int:
    """Largest Impact size that keeps the line inside the box on both axes."""
    probe = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    size = height_px
    while size > 24:
        f = ImageFont.truetype(SLOGAN_FONT, size)
        l, t, r, b = probe.textbbox((0, 0), line, font=f)
        if (r - l) <= width_px and (b - t) <= height_px:
            return size
        size -= 4
    return 24


def stage_token(src: Path, token: str, out: Path) -> tuple[Path, int]:
    """Draw the placeholder token into the design's banner. Reuses ttrpg_placeholder.ribbon_box().

    The personalizer swaps EXISTING lettering; a design with an empty banner gives it nothing to find
    and the order dies with "cannot identify design's text token". So the token has to be in the base
    print file, and it is hand-set here — AI never renders type.
    """
    from ttrpg_placeholder import ribbon_box, font, CHARCOAL   # noqa: PLC0415 — optional dependency
    from PIL import ImageDraw

    im = open_rgba(src)
    x0, y0, x1, y1 = ribbon_box(im)             # raises SystemExit when there is no banner
    bw, bh = x1 - x0, y1 - y0
    d = ImageDraw.Draw(im)
    size = int(bh * 0.58)
    f = font(size)
    while d.textlength(token, font=f) > bw * 0.66 and size > 40:
        size -= 6
        f = font(size)
    before = np.asarray(im).astype(int)
    l, t, rr, bb = d.textbbox((0, 0), token, font=f)
    d.text((x0 + (bw - (rr - l)) / 2 - l, y0 + (bh - (bb - t)) / 2 - t), token, font=f,
           fill=CHARCOAL + (255,))
    drawn = int((np.abs(np.asarray(im).astype(int) - before).sum(axis=2) > 20).sum())
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return out, drawn


def gate_personalisation(c: dict, r: Result, drawn: int | None) -> None:
    if not c.get("personalised"):
        r.add("G7 personalise", NA, "fixed design")
        return
    token = (c.get("placeholder_token") or "").strip()
    instr = (c.get("personalization_instructions") or "").strip()
    if not token or not token.isalnum():
        r.add("G7 personalise", FAIL, "placeholder_token missing or not alphanumeric")
        return
    if len(token) > 14:
        r.add("G7 personalise", FAIL, f"token '{token}' is {len(token)} chars; banner stays readable to 14")
        return
    if not instr:
        r.add("G7 personalise", FAIL,
              "personalization_instructions empty — buyer copy lives in its OWN column, never in "
              "personalization_placeholder")
        return
    if len(instr) > 120:
        r.add("G7 personalise", FAIL, f"instructions {len(instr)} chars; Etsy truncates at 120")
        return
    if drawn is None:
        r.add("G7 personalise", SKIP, f"token '{token}' declared; artwork not typeset yet")
        return
    if drawn <= 0:
        r.add("G7 personalise", FAIL, "token drew 0 pixels — empty banner, personalizer will fail")
        return
    r.add("G7 personalise", PASS, f"token '{token}' set in banner ({drawn} px)")


# =================================================================================================
# stage: Shopify Files -> Printful mockups
# =================================================================================================

def shopify_public_url(path: Path) -> str:
    """Park the print file in Shopify Files and return its cdn.shopify.com URL.

    Printful's mockup generator FETCHES the artwork, so it must be publicly reachable. stagedUpload's
    resourceUrl is not public — fileCreate is what mints the CDN url, and it is asynchronous.
    """
    import shopify_port as sp                    # imports lazily: minting a token is a network call

    blob = path.read_bytes()
    resource_url = sp.staged_upload(path.name, "image/png", blob, resource="FILE", normalize=False)
    d = sp.gql("""mutation fc($files:[FileCreateInput!]!){
      fileCreate(files:$files){ files{ id } userErrors{ message } } }""",
               {"files": [{"originalSource": resource_url, "contentType": "IMAGE", "alt": path.stem}]})
    errs = d["fileCreate"]["userErrors"]
    if errs:
        raise RuntimeError(f"fileCreate: {errs[:2]}")
    fid = d["fileCreate"]["files"][0]["id"]
    for _ in range(30):                          # fileStatus goes UPLOADED -> READY before url exists
        time.sleep(2)
        n = sp.gql("query($id:ID!){ node(id:$id){ ... on MediaImage { image { url } } } }",
                   {"id": fid})["node"]
        if n and (n.get("image") or {}).get("url"):
            return n["image"]["url"]
    raise RuntimeError("Shopify file never became READY")


def printful_mockups(image_url: str, spec_pf: dict, out_dir: Path,
                     kind: str = "dtf", placement: str | None = None) -> list[tuple[str, str, Path]]:
    """(option_group, title, path) for every mockup Printful renders. Free, ~10s, 4-12 images."""
    h = dict(PF_HEADERS_BASE, Authorization=f"Bearer {os.environ['PRINTFUL_API_KEY']}")
    if spec_pf.get("store_id"):
        h["X-PF-Store-Id"] = str(spec_pf["store_id"])
    place = placement or PF_KIND_PLACEMENT.get(kind) or spec_pf.get("placement", "front")
    if place in PF_AREA:                        # embroidery: square badge area, image fills it
        w, hh = PF_AREA[place]
        position = {"area_width": w, "area_height": hh, "width": w, "height": hh,
                    "top": 0, "left": 0}
    else:
        position = spec_pf.get("position", PF_POSITION)
    body = {
        "variant_ids": spec_pf["variant_ids"],
        "format": "jpg",
        "technique": PF_TECHNIQUE.get(kind, "dtg"),
        "option_groups": spec_pf.get("option_groups", ["Men's", "Flat"]),
        "files": [{"placement": place, "image_url": image_url, "position": position}],
    }
    res = requests.post(f"{PF_BASE}/mockup-generator/create-task/{spec_pf.get('product_id', PF_CC1717)}",
                        headers=h, json=body, timeout=60)
    res.raise_for_status()
    key = res.json()["result"]["task_key"]
    for _ in range(40):
        time.sleep(3)
        st = requests.get(f"{PF_BASE}/mockup-generator/task", headers=h,
                          params={"task_key": key}, timeout=60).json()["result"]
        if st["status"] == "completed":
            break
        if st["status"] == "failed":
            raise RuntimeError(f"printful mockup failed: {json.dumps(st)[:200]}")
    else:
        raise RuntimeError("printful mockup timed out")

    out_dir.mkdir(parents=True, exist_ok=True)
    shots: list[tuple[str, str, Path]] = []
    for m in st["mockups"]:
        entries = [("Default", m["placement"], m["mockup_url"])]
        entries += [(e.get("option_group") or "Default", e.get("title") or "extra", e["url"])
                    for e in m.get("extra", [])]
        for group, title, url in entries:
            name = re.sub(r"[^a-z0-9]+", "-", f"{group} {title}".lower()).strip("-")
            p = out_dir / f"{name}.jpg"
            p.write_bytes(requests.get(url, timeout=120).content)
            shots.append((group, title, p))
    return shots


def pick_worn(shots: list[tuple[str, str, Path]], prefer: str = "women") -> Path | None:
    """House rule: the cover is ALWAYS the product on a person. Never folded, never a macro.

    Which person is a merchandising decision, not a technical one. Printful returns the men's group
    first, so taking the first front shot silently made every cover male — on a marketplace where
    apparel is bought overwhelmingly by women, and for niches (cottagecore, cat, frog, gardening)
    whose buyer is the wearer. `prefer` is set per concept; dad and grandpa gifts still lead with a
    man, because there the buyer is shopping for someone else.

    Matched on filename rather than the option-group label: when a rerun reuses mockups from disk the
    group is rebuilt from the file stem as "Women", which never equalled the "Women's" this checked.
    """
    order = ["women-s-2", "women-s", "men-s"] if prefer == "women" else ["men-s", "women-s-2", "women-s"]
    paths = [p for _, _, p in shots]
    # Framing before identity. Printful's first women's model is photographed full-length mid-stride,
    # which leaves the design a thumbnail inside the frame; the "front 2" and "left front" shots of
    # the second model are waist-up and show the print at a size a buyer can read in a grid tile.
    for who in order:
        for suffix in ("-front-2", "-left-front", "-front"):
            hit = sorted(p for p in paths if p.stem.lower() == f"{who}{suffix}")
            if hit:
                return hit[0]
    for who in order:
        any_worn = sorted(p for p in paths if p.stem.lower().startswith(f"{who}-"))
        if any_worn:
            return any_worn[0]
    return None


# =================================================================================================
# stage: cover + info cards, GATE 3
# =================================================================================================

def stage_cover(worn: Path, c: dict, out: Path, crop_top: float) -> Path:
    """Crop above the shoulders, then hand the frame to make_cover.py.

    Printful's on-model shots include the model's face; the house cover is shoulders-down. make_cover
    only trims 12% off the top, which is not enough, so the head comes off here first.
    """
    im = Image.open(worn).convert("RGB")
    w, h = im.size
    src = out.parent / f"{out.stem}-src.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.crop((0, int(h * crop_top), w, h)).save(src, quality=95)
    cov = c.get("cover", {})
    p = sh([sys.executable, MAKE_COVER, src, out, "--banner", cov.get("banner", ""),
            "--strip", cov.get("strip", "")])
    if p.returncode != 0:
        raise RuntimeError(f"make_cover: {p.stderr[-200:]}")
    return out


def _band_text_span(im: Image.Image, top: bool) -> tuple[int, int, int] | None:
    """(x_min, x_max, text_height) of the words inside the cover's colour band.

    Measured from the pixels rather than recomputed from make_cover's font maths, so the gate still
    holds if make_cover's SAFE constant regresses or a cover arrives from some other path. The band is
    the run of rows from the edge in which the band colour still dominates — the threshold has to be
    loose (0.2, not 0.5) because a dense line of type legitimately covers half a row.
    """
    a = np.asarray(im.convert("RGB")).astype(int)
    h, w, _ = a.shape
    edge = a[0] if top else a[-1]
    vals, counts = np.unique(edge.reshape(-1, 3), axis=0, return_counts=True)
    band_rgb = vals[counts.argmax()]
    band = []
    for y in (range(h) if top else range(h - 1, -1, -1)):
        if (np.abs(a[y] - band_rgb).max(axis=1) < 40).mean() < 0.2:
            break
        band.append(y)
    if len(band) < 6:
        return None
    inner = a[min(band) + 2: max(band) - 1]
    if inner.size == 0:
        return None
    text = np.abs(inner - band_rgb).max(axis=2) > 60
    xs = np.where(text.any(axis=0))[0]
    ys = np.where(text.any(axis=1))[0]
    if not xs.size:
        return None
    return int(xs.min()), int(xs.max()), int(ys.max() - ys.min() + 1)


def gate_cover(cover: Path | None, worn_ok: bool, any_mockup: bool, r: Result) -> None:
    if not worn_ok:
        # Only a failure once mockups exist and none of them is on a person. With no mockups at all
        # there is nothing to judge yet.
        r.add("G3 cover", FAIL if any_mockup else SKIP,
              "mockups returned no on-model frame — house rule: the cover is always on a person"
              if any_mockup else "no mockups yet")
        return
    if cover is None or not Path(cover).exists():
        r.add("G3 cover", SKIP, "cover not built yet")
        return
    im = Image.open(cover)
    w = im.size[0]
    lo, hi = int(w * 0.10), int(w * 0.90)        # Etsy crops the main image ~10% off EACH side
    problems, thin = [], []
    for label, top in (("banner", True), ("strip", False)):
        span = _band_text_span(im, top)
        if span is None:
            problems.append(f"{label}: no band/text found")
            continue
        x0, x1, cap = span
        if x0 < lo or x1 > hi:
            problems.append(f"{label} x{x0}-{x1} outside safe [{lo},{hi}] — will read clipped on Etsy")
        # make_cover shrinks type to fit the safe zone, so an over-long line survives the crop but
        # arrives unreadable at the ~120px thumbnail Etsy search actually shows. Same defect, later.
        elif cap < w * 0.022:
            thin.append(f"{label} cap height {cap}px ({cap / w * 100:.1f}% of width) — shorten the line")
    if problems:
        r.add("G3 cover", FAIL, "; ".join(problems))
    elif thin:
        r.add("G3 cover", WARN, "worn frame, inside safe zone, but: " + "; ".join(thin))
    else:
        r.add("G3 cover", PASS, f"worn frame, text inside centre 80% of {w}px")


def stage_cards(c: dict, out_dir: Path) -> list[Path]:
    cards = c.get("info_cards") or []
    if not cards:
        return []
    out_dir.mkdir(parents=True, exist_ok=True)
    spec = out_dir / "_cards.json"
    spec.write_text(json.dumps(cards))
    p = sh([sys.executable, MAKE_CARDS, out_dir, spec])
    if p.returncode != 0:
        raise RuntimeError(f"make_info_cards: {p.stderr[-200:]}")
    return [out_dir / cd["file"] for cd in cards if (out_dir / cd["file"]).exists()]


# =================================================================================================
# GATE 4 — listing fields · GATE 6 — Shopify image limits · GATE 8 — prompt hygiene
# =================================================================================================

def gate_listing(c: dict, r: Result) -> None:
    title, tags = c.get("title", ""), c.get("tags") or []
    bad = []
    if len(title) > 140:
        bad.append(f"title {len(title)}>140")
    if len(tags) != 13:
        bad.append(f"{len(tags)} tags, Etsy gives exactly 13 and every empty one is lost reach")
    over = [t for t in tags if len(t) > 20]
    if over:
        bad.append(f"tags >20 chars: {', '.join(over)}")
    if not (c.get("description") or "").strip():
        bad.append("description empty")
    r.add("G4 listing", FAIL if bad else PASS,
          "; ".join(bad) if bad else f"title {len(title)}, 13 tags")


def gate_shopify_images(paths: list[Path], r: Result) -> None:
    from shopify_port import normalize_image      # pure PIL; import is now side-effect free

    present = [p for p in paths if p and Path(p).exists()]
    if not present:
        r.add("G6 shopify img", SKIP, "no images yet")
        return
    worst_px, worst_mb, offenders = 0, 0.0, []
    for p in present:
        blob = p.read_bytes()
        mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        _, _, out = normalize_image(p.name, mime, blob)
        im = Image.open(BytesIO(out))
        mb = len(out) / 1_048_576
        worst_px, worst_mb = max(worst_px, *im.size), max(worst_mb, mb)
        if max(im.size) > 2048 or mb > 20:
            offenders.append(f"{p.name} {max(im.size)}px/{mb:.1f}MB")
    if offenders:
        r.add("G6 shopify img", FAIL, "over Shopify limits after normalize: " + ", ".join(offenders))
    else:
        r.add("G6 shopify img", PASS,
              f"{len(present)} imgs, max {worst_px}px/{worst_mb:.1f}MB (stagedUpload sends fileSize)")


def gate_prompt(c: dict, prov: Path | None, r: Result) -> None:
    text = " ".join(str(c.get(k) or "") for k in
                    ("prompt_head", "_prompt", "title", "description", "hook")).lower()
    text += " " + " ".join(c.get("tags") or []).lower()
    hits = sorted({t for t in BANNED_PROMPT_TERMS if t in text})
    if hits:
        r.add("G8 trademark", FAIL, "brand/franchise term in prompt or copy: " + ", ".join(hits))
        return
    if prov is None:
        r.add("G8 trademark", WARN, "no banned term; PROVENANCE.md is written on a live run")
        return
    if not prov.exists():
        r.add("G8 trademark", FAIL, "PROVENANCE.md not written")
        return
    if "Trademark re-check" not in prov.read_text():
        r.add("G8 trademark", FAIL, "PROVENANCE.md has no trademark re-check note")
        return
    r.add("G8 trademark", WARN, "no banned term; PROVENANCE written — HUMAN must still eyeball the art")


# =================================================================================================
# GATE 5 — shop_id · DB seed
# =================================================================================================

def db():
    import psycopg2
    return psycopg2.connect(os.environ["DATABASE_URL"])


def gate_shop_preflight(cur, template: str, shop_id: int, r: Result) -> None:
    """Catch the wrong-shop clone BEFORE any money is spent, not after a 403 on publish.

    Cloning a product row copies the template's shop_id. Two TTRPG products landed on the wrong shop
    exactly this way; in this DB `a1-c1-v1` is shop 1 and `h-a1-c1-v1` is shop 2, one character apart.
    """
    cur.execute("SELECT shop_id FROM products WHERE slug=%s", (template,))
    row = cur.fetchone()
    if not row:
        r.add("G5 shop_id", FAIL, f"template '{template}' does not exist")
    elif row[0] != shop_id:
        r.add("G5 shop_id", FAIL,
              f"template '{template}' is shop {row[0]}, batch targets shop {shop_id} — clone would "
              f"inherit the wrong shop and fail publish with 403")
    else:
        r.add("G5 shop_id", PASS, f"template shop {row[0]} == target {shop_id} (verified again after seed)")


def stage_seed(cur, c: dict, spec: dict, threads: list[str], print_file: Path, r: Result) -> None:
    """Clone a proven row, then override. Same technique as seed_ttrpg.py, generalised: every column
    we do not name keeps a value the rest of the pipeline already knows how to handle."""
    template = spec["templates"][c["kind"]]
    shop_id = spec["shop_id"]
    cur.execute("SELECT column_name FROM information_schema.columns "
                "WHERE table_name='products' AND column_name <> 'id' ORDER BY ordinal_position")
    cols = [x[0] for x in cur.fetchall()]

    cur.execute("SELECT id FROM products WHERE slug=%s", (c["slug"],))
    row = cur.fetchone()
    if row:
        new_id = row[0]
    else:
        select_list = ", ".join("%s" if x == "slug" else f'"{x}"' for x in cols)
        cur.execute(f'INSERT INTO products ({", ".join(chr(34) + x + chr(34) for x in cols)}) '
                    f"SELECT {select_list} FROM products WHERE slug=%s RETURNING id",
                    (c["slug"], template))
        new_id = cur.fetchone()[0]

    blob = print_file.read_bytes()
    w, h = Image.open(print_file).size
    cur.execute("""
        UPDATE products SET
          slug=%s, shop_id=%s, title=%s, description=%s, tags=%s, price_cents=%s,
          niche=%s, concept_no=%s, hook=%s,
          print_file=%s, print_file_name=%s, print_file_w=%s, print_file_h=%s,
          thread_colors=%s, personalised=%s,
          personalization_placeholder=%s, personalization_instructions=%s,
          hero_colorway=COALESCE(%s, hero_colorway),
          etsy_listing_id=NULL, etsy_state=NULL,
          design_model=%s, design_prompt=%s, design_state='ready', content_status='approved',
          notes=%s, updated_at=now()
        WHERE id=%s""",
        (c["slug"], shop_id, c["title"], c["description"], c["tags"], c["price_anchor_cents"],
         c.get("niche"), c.get("concept_no"), c.get("hook"),
         memoryview(blob), f"{c['slug']}-print.png", w, h,
         threads or None, bool(c.get("personalised")),
         c.get("placeholder_token"), c.get("personalization_instructions"),
         c.get("hero_colorway"),
         c.get("_model", "nano_banana_pro"), c.get("_prompt"),
         f"batch_runner {date.today()} · campaign {spec['campaign']} · not published",
         new_id))

    cur.execute("SELECT shop_id FROM products WHERE id=%s", (new_id,))
    got = cur.fetchone()[0]
    if got != shop_id:
        r.add("G5 shop_id", FAIL, f"seeded row is shop {got}, expected {shop_id}")
    r.files["product_id"] = new_id


def write_usage(cur, spec: dict, r: Result, c: dict) -> None:
    if r.hf_calls:
        cur.execute("""INSERT INTO usage_events (shop_id, provider, kind, model, units, cost_usd, meta)
                       VALUES (%s,'higgsfield','batch_runner',%s,%s,%s,%s)""",
                    (spec["shop_id"], c.get("_model", "nano_banana_pro"), r.hf_calls,
                     round(r.hf_calls * HF_COST_PER_CALL, 5),
                     json.dumps({"estimate": True, "slug": r.slug, "campaign": spec["campaign"]})))
    if r.pf_mockups:
        cur.execute("""INSERT INTO usage_events (shop_id, provider, kind, units, cost_usd, meta)
                       VALUES (%s,'printful','mockup',%s,0,%s)""",
                    (spec["shop_id"], r.pf_mockups,
                     json.dumps({"slug": r.slug, "campaign": spec["campaign"], "free": True})))


# =================================================================================================
# provenance
# =================================================================================================

def write_provenance(c: dict, d: Path, spec: dict, r: Result, threads: list[str]) -> Path:
    """The authorship evidence, written at creation time — it cannot honestly be reconstructed later.
    Etsy's POD rules require proving we are the original designer; an assertion is not evidence."""
    p = d / "PROVENANCE.md"
    kept = c.get("_job_id") or "(dry-run: not generated)"
    lines = [
        f"# Provenance — {c['slug']}",
        "",
        f"| Field | Value |", "|---|---|",
        f"| Campaign | {spec['campaign']} |",
        f"| Niche / buyer identity | {c.get('niche', '')} |",
        f"| Date | {date.today()} |",
        f"| Tool + model | higgsfield · {c.get('_model', 'nano_banana_pro')} |",
        f"| Job id | {kept} |",
        f"| Product kind | {c['kind']}{' · personalised' if c.get('personalised') else ''} |",
        "",
        "## Prompt (verbatim, as sent)", "",
        "```", c.get("_prompt", "(not generated)"), "```", "",
        "## Selection rationale", "",
        c.get("selection_rationale",
              "Single generation kept. The concept, palette, composition and every word of type were "
              "decided by us before any tool ran; the model drew ornament only."),
        "",
        "## Edit trail", "",
        "| Step | Tool | Output |", "|---|---|---|",
        "| Background removal | higgsfield remove_background | `work/*-cutout.png` |",
    ]
    if threads:
        lines.append(f"| Palette snap to exact thread hexes | batch_runner | {', '.join(threads)} |")
    if c.get("personalised"):
        lines.append(f"| Placeholder token hand-set (PIL, Arial Bold) | batch_runner | `{c.get('placeholder_token')}` |")
    lines += [
        "| Product photography | Printful mockup generator (not AI) | `mockups/` |",
        "| Cover | make_cover.py, type hand-set in PIL | `covers/` |",
        "",
        "## Typography", "",
        "All type is hand-set with PIL in a licensed system face (Arial Bold / Futura). "
        "The generator was instructed `NO text, NO letters, NO numbers` — AI never renders type here.",
        "",
        "## Trademark re-check on the output", "",
        "| Check | Result |", "|---|---|",
        "| Banned-term scan of prompt, title, tags, description | "
        f"{'clean' if r.gate('G8 trademark') != FAIL else 'FAILED — see report'} |",
        "| Recognizable logo, mark, character or team in the IMAGE | "
        "☐ **human visual check required — automation cannot clear this** |",
        "| Prompted in a named living artist's style | no |",
        "",
        "## Etsy AI compliance", "",
        "- [ ] AI disclosure line placed high in the description, plainly worded",
        "- [ ] `who_made=i_did` + production partner assigned (this is what renders \"Designed by\")",
        "- [x] `raw/` retained, unedited",
        "",
        "## QA gates at build time", "",
        "| Gate | Status | Note |", "|---|---|---|",
    ]
    lines += [f"| {g.key} | {g.status} | {g.note} |" for g in r.gates]
    p.write_text("\n".join(lines) + "\n")
    return p


# =================================================================================================
# per-concept pipeline
# =================================================================================================

def run_concept(c: dict, spec: dict, cur, dry: bool, force: bool) -> Result:
    r = Result(slug=c["slug"], kind=c["kind"])
    root = Path(spec.get("pipeline_dir", "/Users/omer/Documents/code/etsy/pipeline"))
    d = root / spec["campaign"] / "designs" / c["slug"]
    if not dry:
        d.mkdir(parents=True, exist_ok=True)

    # --- cheap gates first: never spend on a concept whose copy or shop is already wrong
    gate_listing(c, r)
    if cur is not None:
        gate_shop_preflight(cur, spec["templates"][c["kind"]], spec["shop_id"], r)
    else:
        r.add("G5 shop_id", SKIP, "no DB connection")
    if r.blocked and not dry:
        r.error = r.error or "blocked before generation — nothing spent"
        write_provenance(c, d, spec, r, [])
        return r

    # --- generate -> cutout -> alpha
    raw = stage_generate(c, d, r, dry, force, shop_id=spec.get("shop_id"))
    cut = stage_cutout(raw, c, d, r, dry, force, shop_id=spec.get("shop_id"))
    gate_alpha(cut, r)

    # --- palette snap + threads (embroidery only)
    art = cut
    threads = gate_threads(art, c, r)
    if (c["kind"] == "embroidery" and threads and art and Path(art).exists()
            and r.gate("G2 threads") != FAIL and not dry):
        art = stage_palette_snap(art, threads, d / "work" / f"{c['slug']}-emb.png")

    # --- hand-set type / personalisation token
    drawn = None
    final = d / "final.png"
    if art and Path(art).exists() and not dry:
        if c.get("slogan"):
            # the phrase is the product; the emblem alone would not match its own listing
            try:
                ink = c.get("ink") or (INK_ON_DARK if (c.get("hero_colorway") in DARK_GARMENTS)
                                       else INK_ON_LIGHT)
                _, drawn = stage_slogan(art, c["slogan"], final, ink)
            except Exception as e:
                r.error = f"slogan: {str(e)[:160]}"
                drawn = 0
        elif c.get("personalised") and c.get("placeholder_token"):
            try:
                _, drawn = stage_token(art, c["placeholder_token"], final)
            except SystemExit as e:                       # ribbon_box could not find a banner
                r.error = f"token: {e} (design has no banner to swap)"
                drawn = 0
            except Exception as e:
                r.error = f"token: {str(e)[:160]}"
            # The token is stitched like everything else, so it has to be snapped too. Drawing it
            # after the snap put the lettering — and the customer's name after the personalizer
            # swaps it — in a charcoal that no thread carries.
            if threads and final.exists():
                stage_palette_snap(final, threads, final)
        else:
            shutil.copyfile(art, final)
    gate_personalisation(c, r, drawn)

    # --- Printful mockups (free) — worn on-model shots, then cover + cards
    shots, worn, cover = [], None, None
    mock_dir, cover_dir, card_dir = d / "mockups", d / "covers", d / "cards"
    have_mocks = mock_dir.exists() and any(mock_dir.glob("*.jpg"))
    # `"mockups": false` in the spec turns the whole Printful path off. It has to be switchable: the
    # shop no longer publishes Printful renders — listing images are composited onto our own licensed
    # blanks by scripts/produce_images.py — but the cover gate below still judged the Printful cover,
    # so a perfectly good batch was refused for missing text bands on an artefact nobody ships.
    if (spec.get("mockups", True) and final.exists() and not dry
            and r.gate("G7 personalise") != FAIL and (force or not have_mocks)):
        try:
            # Rerunning would park a duplicate copy of the print file in Shopify Files, so existing
            # mockups are reused unless --force. They are free, but they are not free of clutter.
            url = shopify_public_url(final)
            pf = dict(spec["printful"])
            # The garment is chosen here rather than at catalogue time, because only now do we know
            # what the artwork actually looks like.
            chosen, vis = best_colorway(final, c.get("hero_colorway") or "Ivory")
            if chosen != c.get("hero_colorway"):
                r.note = (f"kumas {c.get('hero_colorway')} -> {chosen}: tasarim eskisinde "
                          f"gorunmuyordu (gorunur %{vis * 100:.0f})")
                c["hero_colorway"] = chosen
            variant = COLORWAY_VARIANT.get(chosen)
            if variant:
                pf["variant_ids"] = [variant]
            shots = printful_mockups(url, pf, mock_dir, c["kind"],
                                     c.get("printful_placement"))
            r.pf_mockups = len(shots)
            worn = pick_worn(shots, c.get("cover_model", "women"))
        except Exception as e:
            r.error = r.error or f"mockups: {str(e)[:200]}"
    elif have_mocks:                                      # dry run, or a rerun: grade what is there
        shots = [(p.stem.split("-")[0].title(), p.stem, p) for p in sorted(mock_dir.glob("*.jpg"))]
        worn = pick_worn(shots, c.get("cover_model", "women"))

    if worn and not dry:
        try:
            cover = stage_cover(worn, c, cover_dir / f"{c['slug']}-cover.jpg",
                                float(c.get("cover_crop_top", spec.get("cover_crop_top", 0.20))))
        except Exception as e:
            r.error = r.error or f"cover: {str(e)[:160]}"
    elif worn and (cover_dir / f"{c['slug']}-cover.jpg").exists():
        cover = cover_dir / f"{c['slug']}-cover.jpg"
    gate_cover(cover, worn is not None, bool(shots), r)

    cards = []
    if not dry:
        try:
            cards = stage_cards(c, card_dir)
        except Exception as e:
            r.error = r.error or f"cards: {str(e)[:160]}"
    elif card_dir.exists():
        cards = sorted(card_dir.glob("*.jpg"))

    listing_images = [p for p in ([cover, worn] + cards) if p]
    gate_shopify_images(listing_images, r)

    prov = write_provenance(c, d, spec, r, threads) if not dry else None
    gate_prompt(c, prov, r)

    # --- DB row. Blocked concepts are NOT seeded: a half-good row is worse than none.
    if cur is not None and not dry and final.exists() and not r.blocked:
        stage_seed(cur, c, spec, threads, final, r)
        write_usage(cur, spec, r, c)

    if not dry:
        write_provenance(c, d, spec, r, threads)          # rewrite with the final gate table
    r.files = {**r.files, "dir": str(d), "final": str(final) if final.exists() else None,
               "cover": str(cover) if cover else None, "mockups": len(shots), "cards": len(cards)}
    return r


# =================================================================================================
# report
# =================================================================================================

GATE_KEYS = ["G1 alpha", "G2 threads", "G3 cover", "G4 listing",
             "G5 shop_id", "G6 shopify img", "G7 personalise", "G8 trademark"]


def report(results: list[Result], spec: dict, dry: bool) -> int:
    print("\n" + "=" * 118)
    print(f"BATCH {spec['campaign']}  ·  shop {spec['shop_id']}  ·  {len(results)} concepts"
          + ("  ·  DRY RUN (no spend, no writes)" if dry else ""))
    print("=" * 118)
    head = f"{'slug':<18}{'kind':<11}" + "".join(f"{k.split()[0]:<6}" for k in GATE_KEYS) + f"{'HF$':>7}  status"
    print(head)
    print("-" * 118)
    total_hf = 0
    for r in results:
        cells = "".join(f"{r.gate(k):<6}" for k in GATE_KEYS)
        cost = (r.hf_planned if dry else r.hf_calls) * HF_COST_PER_CALL
        total_hf += r.hf_calls
        status = "REVIEW" if r.blocked else ("incomplete" if r.pending else "ready")
        print(f"{r.slug:<18}{r.kind:<11}{cells}{cost:>7.2f}  {status}")
    print("-" * 118)

    review = [r for r in results if r.blocked]
    if review:
        print(f"\nNEEDS HUMAN REVIEW ({len(review)}/{len(results)}) — not seeded, nothing skipped silently:")
        for r in review:
            if r.error:
                print(f"  {r.slug}: {r.error}")
            for g in r.gates:
                if g.status in BLOCKING:
                    print(f"  {r.slug}  {g.key}: {g.note}")

    warns = [(r, g) for r in results for g in r.gates if g.status == WARN]
    if warns:
        print("\nWARNINGS:")
        for r, g in warns:
            print(f"  {r.slug}  {g.key}: {g.note}")
    for r in results:
        if r.note:                       # a fallback is not a failure, but it is never silent
            print(f"  {r.slug}  NOT: {r.note}")

    n = len(results) or 1
    scenes = spec.get("campaign_scene_calls", 0)          # shared lifestyle library, amortised
    planned = sum(r.hf_planned for r in results)
    calls = total_hf if not dry else planned
    per = (calls * HF_COST_PER_CALL + scenes * HF_COST_PER_CALL) / n
    pf = sum(r.pf_mockups for r in results)
    word = "projected" if dry else "spent"
    print(f"\nCOST  higgsfield {word} {calls} calls x ${HF_COST_PER_CALL:.2f} = ${calls * HF_COST_PER_CALL:.2f}"
          f"  +  {scenes} shared scene calls amortised  |  printful {pf} mockups = "
          f"${pf * PRINTFUL_COST_PER_MOCKUP:.2f} (free)")
    print(f"      ${per:.2f} per design   (was ~$8.50 when product photos were generated too)")
    ok = len([r for r in results if not r.blocked and not r.pending])
    print(f"\n{ok}/{len(results)} ready to publish. Publishing is a SEPARATE explicit step "
          f"(scripts/publish_ttrpg.py, scripts/shopify_port.py).")
    return 1 if review else 0


# =================================================================================================

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", help="JSON batch spec")
    ap.add_argument("--dry-run", action="store_true", help="no generation, no API calls, no DB writes")
    ap.add_argument("--limit", type=int, help="process at most N concepts")
    ap.add_argument("--only", help="single slug")
    ap.add_argument("--force", action="store_true", help="redo stages whose output already exists")
    a = ap.parse_args()

    spec = json.loads(Path(a.spec).read_text())
    concepts = spec["concepts"]
    if a.only:
        concepts = [c for c in concepts if c["slug"] == a.only]
    if a.limit:
        concepts = concepts[:a.limit]
    if not concepts:
        print("no concepts selected")
        return 1

    conn = cur = None
    if os.environ.get("DATABASE_URL"):
        try:
            conn = db()
            cur = conn.cursor()
        except Exception as e:
            print(f"warn: no DB ({str(e)[:120]}) — gate 5 and seeding will be skipped")
    else:
        print("warn: DATABASE_URL not set — gate 5 and seeding will be skipped")

    if not a.dry_run:
        missing = [k for k in ("PRINTFUL_API_KEY", "SHOPIFY_STORE_DOMAIN", "DATABASE_URL")
                   if not os.environ.get(k)]
        if missing:
            print(f"missing env for a live run: {', '.join(missing)}")
            return 2

    results = []
    # Report progress to the dashboard. This work runs on the operator's machine, so without a row in
    # `jobs` the website shows nothing at all while it runs: approving a product and a dead pipeline
    # look identical from there. A dry run is not reported — nothing is happening that anyone waits on.
    job = None
    if not a.dry_run:
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            from joblog import Job
            job = Job("design", f"{spec.get('campaign', 'batch')} · {len(concepts)} tasarim",
                      total=len(concepts), shop_id=spec.get("shop_id")).start()
        except Exception:
            job = None                       # the batch matters, the status light does not

    for i, c in enumerate(concepts, 1):
        print(f"[{i}/{len(concepts)}] {c['slug']} ({c['kind']}{', personalised' if c.get('personalised') else ''})")
        try:
            res = run_concept(c, spec, cur, a.dry_run, a.force)
            results.append(res)
            if job:
                job.tick(f"{c['slug']}: {res.error}" if res.error else c["slug"], failed=bool(res.error))
        except Exception as e:
            r = Result(slug=c.get("slug", "?"), kind=c.get("kind", "?"))
            r.error = f"{type(e).__name__}: {str(e)[:200]}"
            results.append(r)
            if job:
                job.tick(f"{r.slug}: {r.error}", failed=True)
        if conn and not a.dry_run:
            conn.commit()
    if job:
        job.finish("error" if any(x.error for x in results) else "done",
                   f"{sum(1 for x in results if not x.error)}/{len(results)} tamam")

    if conn:
        if a.dry_run:
            conn.rollback()
        conn.close()
    return report(results, spec, a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
