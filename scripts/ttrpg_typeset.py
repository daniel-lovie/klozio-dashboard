"""Hand-set the "20" on the d20 badges, and erase every AI-rendered numeral.

The generator drew digits on the die faces: 14 appeared twice, 10 and 12 came out inverted and
malformed. A tabletop player spots that immediately, and the design rules forbid AI-rendered type
outright. So we strip the model's numerals and set the one numeral that matters ourselves, in a real
font — which is also what makes the typography demonstrably ours.

Colour surgery, not masking: the peripheral digits are rust red sitting on gold faces, so they are
recoloured to the exact face gold; the centre "20" is charcoal on cream and is recoloured to cream.
Both are keyed by radius from the emblem centre so the black facet outlines and the star survive.
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np
import sys

DIR = "/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild"
GOLD = (214, 169, 88)
CREAM = (245, 230, 207)
CHARCOAL = (26, 24, 22)


def load_font(size: int) -> ImageFont.FreeTypeFont:
    """Futura's geometric numerals are the dice-face look; Arial Bold is the fallback."""
    for path, idx in (("/System/Library/Fonts/Supplemental/Futura.ttc", 1),
                      ("/System/Library/Fonts/Supplemental/Futura.ttc", 0),
                      ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 0)):
        try:
            f = ImageFont.truetype(path, size, index=idx)
            if "bold" in (f.getname()[1] or "").lower() or "Arial" in path:
                return f
        except Exception:
            continue
    return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", size)


def radius_grid(h: int, w: int):
    yy, xx = np.mgrid[0:h, 0:w]
    return np.sqrt((yy - h // 2) ** 2 + (xx - w // 2) ** 2)


def clean_laurel(src: str, dst: str) -> None:
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(int).copy()
    h, w, _ = a.shape
    d = radius_grid(h, w)
    rgb, al = a[:, :, :3], a[:, :, 3]
    op = al > 120
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    # 1. central "20": dark pixels inside the cream face -> cream
    dark = op & (rgb.max(axis=2) < 90) & (d < 165)
    a[:, :, :3][dark] = CREAM

    # 2. peripheral numerals: rust red on the gold faces -> gold.
    #    Radius-bounded so the red star above the wreath is untouched.
    red = op & (r > 110) & (r < 215) & (g > 35) & (g < 120) & (b > 20) & (b < 105) & (d >= 150) & (d < 640)
    a[:, :, :3][red] = GOLD

    # 2b. Snapping every pixel inside the die to the nearest palette colour. Recolouring only the
    #     solid red left visible ghosts: the anti-aliased ring between a digit and its gold face is
    #     neither red nor gold, so it survived as a faint outline of the number. Snapping also
    #     flattens the art, which is what embroidery and DTF both want anyway.
    band = op & (d < 660)
    palette = np.array([GOLD, CREAM, (0, 0, 0), (74, 96, 124)])  # gold, cream, outline, ring blue
    px = a[:, :, :3][band].astype(float)
    nearest = np.argmin(((px[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2), axis=1)
    a[:, :, :3][band] = palette[nearest]

    im2 = Image.fromarray(a.astype(np.uint8), "RGBA")

    # 3. set the numeral on the centre face. Its visual centre is the centroid of the cream
    #    region near the middle, not the image centre — the facet is a triangle, not a disc.
    a2 = np.asarray(im2).astype(int)
    cream_mask = (np.abs(a2[:, :, :3] - np.array(CREAM)).max(axis=2) < 30) & (a2[:, :, 3] > 120) & (d < 330)
    ys, xs = np.where(cream_mask)
    cy, cx = int(ys.mean()), int(xs.mean())

    draw = ImageDraw.Draw(im2)
    size = 260
    font = load_font(size)
    while True:
        l, t, rr, bb = draw.textbbox((0, 0), "20", font=font)
        if rr - l <= 320 or size <= 90:
            break
        size -= 6
        font = load_font(size)
    l, t, rr, bb = draw.textbbox((0, 0), "20", font=font)
    draw.text((cx - (rr - l) / 2 - l, cy - (bb - t) / 2 - t), "20", font=font, fill=CHARCOAL + (255,))
    im2.save(dst)
    print(f"  {dst.split('/')[-1]}: '20' ({cx},{cy}) punto={size} · silinen sayi pikseli: {dark.sum()+red.sum()}")


def _main():
    clean_laurel(f"{DIR}/v1_die_laurel_cutout.png", f"{DIR}/A_laurel_20.png")
    shield_numeral(f"{DIR}/v3_shield_crest_cutout.png", f"{DIR}/B_shield_20.png")
    big_shield_numeral(f"{DIR}/B_shield_bigdie_cutout.png", f"{DIR}/B2_shield_bigdie_20.png")
    clean_b2(f"{DIR}/B2_shield_bigdie_20.png", f"{DIR}/B2_shield_final.png")


def shield_numeral(src: str, dst: str) -> None:
    """Set the "20" on the gold centre facet of the die inside the shield.

    The shield's die came back with blank faces, so there is nothing to erase here — only the
    numeral to place. The facet is a triangle whose gold also appears in the flanking torches, so
    the mask is restricted to the central column before taking a centroid.
    """
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    rgb, op = a[:, :, :3], a[:, :, 3] > 150
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    gold = op & (r > 170) & (r < 235) & (g > 130) & (g < 200) & (b > 60) & (b < 140)
    xx = np.arange(w)[None, :].repeat(h, 0)
    gold &= (xx > int(w * 0.34)) & (xx < int(w * 0.66))     # drop the torch flames
    ys, xs = np.where(gold)
    cy, cx = int(ys.mean()), int(xs.mean())

    # widest run of gold on the centroid row bounds the numeral
    row = np.where(gold[cy])[0]
    span = (row.max() - row.min()) if row.size else int(w * 0.2)

    im2 = im.copy()
    draw = ImageDraw.Draw(im2)
    size = 200
    font = load_font(size)
    while True:
        l, t, rr, bb = draw.textbbox((0, 0), "20", font=font)
        if rr - l <= span * 0.62 or size <= 70:
            break
        size -= 5
        font = load_font(size)
    l, t, rr, bb = draw.textbbox((0, 0), "20", font=font)
    draw.text((cx - (rr - l) / 2 - l, cy - (bb - t) / 2 - t), "20", font=font, fill=CHARCOAL + (255,))
    im2.save(dst)
    print(f"  {dst.split('/')[-1]}: '20' ({cx},{cy}) punto={size} · yuz genisligi {span}px")




def big_shield_numeral(src: str, dst: str, scale: float = 0.24) -> None:
    """Numeral for the enlarged-die shield.

    Here every facet is gold, so the gold mask covers the whole die and its centroid is the centre
    facet — but the widest gold run is the die's full width, which would oversize the type. So the
    numeral is sized as a fraction of the die width instead of the facet run.
    """
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    rgb, op = a[:, :, :3], a[:, :, 3] > 150
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    gold = op & (r > 175) & (r < 240) & (g > 135) & (g < 205) & (b > 55) & (b < 145)
    ys, xs = np.where(gold)
    cy, cx = int(ys.mean()), int(xs.mean())
    die_w = xs.max() - xs.min()

    im2 = im.copy()
    draw = ImageDraw.Draw(im2)
    size = int(die_w * scale * 1.35)
    font = load_font(size)
    while True:
        l, t, rr, bb = draw.textbbox((0, 0), "20", font=font)
        if rr - l <= die_w * scale * 1.6 or size <= 60:
            break
        size -= 5
        font = load_font(size)
    l, t, rr, bb = draw.textbbox((0, 0), "20", font=font)
    draw.text((cx - (rr - l) / 2 - l, cy - (bb - t) / 2 - t), "20", font=font, fill=CHARCOAL + (255,))
    im2.save(dst)
    print(f"  {dst.split('/')[-1]}: '20' ({cx},{cy}) punto={size} · zar genisligi {die_w}px")




def clean_b2(src: str, dst: str) -> None:
    """Drop the two green slivers behind the ribbon and report the ribbon's text box.

    The slivers are leftovers of the laurel the earlier prompt asked for; on a stitch-out they would
    read as stray specks. The ribbon box is what the personalizer needs in order to place a
    customer's character line, so it is measured here rather than eyeballed later.
    """
    im = Image.open(src).convert("RGBA")
    a = np.asarray(im).astype(int).copy()
    h, w, _ = a.shape
    rgb, al = a[:, :, :3], a[:, :, 3]
    op = al > 120
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]

    green = op & (g > r + 18) & (g > b + 18) & (g > 60)
    a[:, :, 3][green] = 0                      # clear, don't recolour: they sit outside the shield
    im2 = Image.fromarray(a.astype(np.uint8), "RGBA")

    # ribbon = the large cream band in the lower third
    a2 = np.asarray(im2).astype(int)
    cream = (np.abs(a2[:, :, :3] - np.array(CREAM)).max(axis=2) < 34) & (a2[:, :, 3] > 120)
    lower = cream.copy()
    lower[: int(h * 0.62), :] = False
    ys, xs = np.where(lower)
    im2.save(dst)
    if ys.size:
        print(f"  {dst.split('/')[-1]}: {green.sum()} yesil artik silindi · "
              f"kurdele yazi alani x {xs.min()}-{xs.max()} y {ys.min()}-{ys.max()} "
              f"({100*(xs.max()-xs.min())/w:.0f}% genislik)")


if __name__ == "__main__":
    _main()
