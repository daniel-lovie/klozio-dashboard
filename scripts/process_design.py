# Design processor for the producer agent — both raw paths, hard verify.
#   python3 process_design.py svg <in.svg> <out.png>   (strip bg path -> rsvg 4200 -> binarize)
#   python3 process_design.py png <in.png> <out.png>   (v2 chroma keyer, same as order prints)
# exit 0 = PASS (semi=0, tiny=0), 1 = FAIL. Prints "WxH semi=N tiny=N".
import re, subprocess, sys
import numpy as np
from PIL import Image
from scipy import ndimage

FLOOD_CAP, MIN_ISLAND, ERODE = 60, 400, 2
INT_TIERS = [(55, 5000), (95, 2000)]

def finalize_and_verify(a, alpha, outp, allow_tiny=False):
    a = a.copy(); a[...,3] = np.where(alpha >= 128, 255, 0)
    im = Image.fromarray(a.astype('uint8'))
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    side = max(im.size)
    canvas = Image.new('RGBA', (side, side), (0,0,0,0))
    canvas.paste(im, ((side-im.size[0])//2, (side-im.size[1])//2))
    canvas.save(outp)
    c = np.array(canvas).astype(int); al = c[...,3]
    semi = int(((al>0)&(al<255)).sum())
    op = al > 0
    lab, n = ndimage.label(op)
    tiny = int((ndimage.sum(op, lab, range(1, n+1)) < MIN_ISLAND).sum()) if n else 0
    print(f"{canvas.size[0]}x{canvas.size[1]} semi={semi} tiny={tiny}{' (tiny allowed: vector path)' if allow_tiny else ''}")
    return semi == 0 and (allow_tiny or tiny == 0)

def svg_mode(inp, outp):
    s = open(inp).read()
    m = re.search(r'<path[^>]*d="M ?0 0 L ?\d+ 0 L ?\d+ \d+ L ?0 \d+ L ?0 0 ?z"/>\n?', s)
    if m: s = s.replace(m.group(0), '', 1)
    tmp_svg, tmp_png = inp + '.nobg.svg', inp + '.raster.png'
    open(tmp_svg, 'w').write(s)
    subprocess.run(['rsvg-convert', '-w', '4200', '-h', '4200', tmp_svg, '-o', tmp_png], check=True)
    a = np.array(Image.open(tmp_png).convert('RGBA')).astype(int)
    # vector output has no chroma noise — tiny islands are legit design texture (distress dots)
    return finalize_and_verify(a, a[...,3], outp, allow_tiny=True)

def png_mode(inp, outp):
    a = np.array(Image.open(inp).convert('RGBA')).astype(int)
    corners = np.median(np.array([a[5,5,:3], a[5,-5,:3], a[-5,5,:3], a[-5,-5,:3]]), axis=0)
    dist = np.sqrt(((a[...,:3]-corners)**2).sum(-1))
    ring = np.concatenate([dist[:20].ravel(), dist[-20:].ravel(), dist[:,:20].ravel(), dist[:,-20:].ravel()])
    t = float(min(FLOOD_CAP, max(35, np.percentile(ring, 99.9) * 2 + 10)))
    reachable = dist < t
    seed = np.zeros_like(reachable); seed[0,:]=seed[-1,:]=seed[:,0]=seed[:,-1]=True; seed &= reachable
    lab, _ = ndimage.label(reachable)
    bl = np.unique(lab[seed]); bl = bl[bl != 0]
    alpha = np.where(np.isin(lab, bl), 0, a[...,3])
    op = ndimage.binary_erosion(alpha > 0, iterations=ERODE, border_value=0)
    lab, n = ndimage.label(op)
    if n:
        sizes = ndimage.sum(op, lab, range(1, n+1))
        op &= ~np.isin(lab, np.where(sizes < MIN_ISLAND)[0] + 1)
    alpha = np.where(op, alpha, 0)
    for _ in range(6):
        opm = alpha > 0
        speck = np.zeros(opm.shape, bool)
        d2 = np.sqrt(((a[...,:3]-corners)**2).sum(-1))
        for td, ta in INT_TIERS:
            cand = opm & (d2 < td)
            lab2, n2 = ndimage.label(cand)
            if not n2: continue
            s2 = ndimage.sum(cand, lab2, range(1, n2+1))
            speck |= np.isin(lab2, np.where(s2 < ta)[0] + 1)
        if not speck.any(): break
        src = opm & ~speck
        _, (iy, ix) = ndimage.distance_transform_edt(~src, return_indices=True)
        ys, xs = np.where(speck)
        a[ys, xs, :3] = a[iy[ys, xs], ix[ys, xs], :3]
    return finalize_and_verify(a, alpha, outp)

if __name__ == '__main__':
    mode, inp, outp = sys.argv[1], sys.argv[2], sys.argv[3]
    ok = svg_mode(inp, outp) if mode == 'svg' else png_mode(inp, outp)
    sys.exit(0 if ok else 1)
