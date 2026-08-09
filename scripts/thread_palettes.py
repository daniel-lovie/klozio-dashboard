#!/usr/bin/env python3
"""Thread palettes, per supplier. The design must be snapped to the palette that will actually stitch it.

Both suppliers run Madeira Polyneon, so the CODE is the authoritative identifier — "1838 Brick Red"
is a physical cone on a rack, and it is what the digitiser and the machine operator work from. The
hex is ours: it exists so the artwork can be snapped and the mockup rendered, and nothing is ordered
by it.

Printful's hexes come from their API, which publishes hex -> Madeira code directly.

Customzon publishes a PDF of photographs rather than values, so those hexes are measured from the
spool images and are approximate. Two calibrations were tried and discarded: a white-balance gain
from the white cone turned black into grey, and a two-point stretch across the shared black and white
cones drove the saturated colours to primaries. The cones are photographed in a working room at
different times, so no single correction transfers between them. What survives is the raw median with
a mild lift, plus black and white forced to their true values — they are Madeira 1800 and 1801, the
two codes both suppliers share, so we know exactly what they are.

Treat the Customzon hexes as good enough to snap and preview, and correct any of them against a
physical card without touching anything else: the codes do not move.
"""

# hex -> (Madeira code, name)
PRINTFUL = {
    "#FFFFFF": ("1801", "White"),      "#000000": ("1800", "Black"),
    "#96A1A8": ("1718", "Grey"),       "#A67843": ("1672", "Old Gold"),
    "#FFCC00": ("1951", "Gold"),       "#E25C27": ("1987", "Orange"),
    "#CC3366": ("1910", "Flamingo"),   "#CC3333": ("1839", "Red"),
    "#660000": ("1784", "Maroon"),     "#333366": ("1966", "Navy"),
    "#005397": ("1842", "Royal"),      "#3399FF": ("1695", "Aqua/Teal"),
    "#6B5294": ("1832", "Purple"),     "#01784E": ("1751", "Kelly Green"),
    "#7BA35A": ("1848", "Kiwi Green"),
}

CUSTOMZON = {
    "#FFFFFF": ("1801", "Super White"),      "#000000": ("1800", "Emerald Black"),
    "#9E9897": ("1613", "Gull Grey"),        "#855332": ("1657", "Golden Oak Brown"),
    "#FFC918": ("1980", "Sunflower"),        "#FA5F0B": ("1965", "Orange Peel"),
    "#C8888A": ("1549", "Pink Sorbet"),      "#CD2E29": ("1838", "Brick Red"),
    "#81673D": ("1538", "Tiramisu"),         "#3F4A6E": ("1742", "Blue Ink"),
    "#1C53AD": ("1934", "Royal Blue"),       "#BCD2E1": ("1674", "Light Denim Blue"),
    "#803886": ("1633", "Purple Passion"),   "#1D4933": ("1851", "Cadmium Green"),
    "#4D5E53": ("1903", "Spruce Green"),
}

PALETTES = {"printful": PRINTFUL, "customzon": CUSTOMZON}


def palette(supplier: str) -> dict:
    key = (supplier or "printful").strip().lower()
    if key not in PALETTES:
        raise KeyError(f"bilinmeyen tedarikci: {supplier}. secenekler: {list(PALETTES)}")
    return PALETTES[key]


def hexes(supplier: str) -> list:
    return list(palette(supplier))


def describe(supplier: str, hx: str) -> str:
    """'1838 Brick Red' — what a digitiser and a machine operator actually need."""
    code, name = palette(supplier).get(hx.upper(), ("?", "?"))
    return f"{code} {name}"
