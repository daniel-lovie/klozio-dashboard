# Order print processor — v2 keyer (flood fill + colour-blind erosion + speck sweep + inpaint
# + hard verify), trimmed for the personalizer agent container.
# Usage: python3 process_order_print.py <in.png> <out.png>   (exit 0 = PASS, 1 = FAIL)
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

FLOOD_CAP, MIN_ISLAND, ERODE = 60, 400, 2
INT_TIERS = [(55, 5000), (95, 2000)]

def run(inp, outp):
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
    # interior speck inpaint, iterate to convergence
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
    a[...,3] = np.where(alpha >= 128, 255, 0)
    im = Image.fromarray(a.astype('uint8'))
    bbox = im.getbbox()
    if bbox: im = im.crop(bbox)
    side = max(im.size)
    canvas = Image.new('RGBA', (side, side), (0,0,0,0))
    canvas.paste(im, ((side-im.size[0])//2, (side-im.size[1])//2))
    canvas.save(outp)
    # verify
    c = np.array(canvas).astype(int); al = c[...,3]
    semi = int(((al>0)&(al<255)).sum())
    opv = al > 0
    labv, nv = ndimage.label(opv)
    tiny = int((ndimage.sum(opv, labv, range(1, nv+1)) < MIN_ISLAND).sum()) if nv else 0
    print(f"{canvas.size[0]}x{canvas.size[1]} semi={semi} tiny={tiny}")
    return semi == 0 and tiny == 0

if __name__ == '__main__':
    ok = run(sys.argv[1], sys.argv[2])
    sys.exit(0 if ok else 1)
