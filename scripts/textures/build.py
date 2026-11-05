"""Cut the doodles out of the generated sheets, make them more childlike, and lay them on a seamless tile.

    python scripts/textures/build.py christmas|everyday [--seed N] [--preview]
    (needs numpy + scipy + pillow:  pip install numpy scipy pillow)

Reads .texture-work/sheets/<theme>_v*.png (scripts/textures/generate.py) and writes
public/textures/<theme>-doodles.webp — a MASK: black ink on transparent. The section colours never
live in the image: globals.css paints the lines through it (mask-image) with token colours and a
gentle gradient, so the same file stays right if a token moves.

Childlike, on purpose: every doodle is warped by a smooth random field (wobbly, lopsided lines) and
thickened in patches (uneven crayon pressure), turned a little, sized unevenly. The tile wraps (each
doodle is pasted at its toroidal copies), so it repeats with no seams.
"""
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent.parent
SHEETS = ROOT / ".texture-work" / "sheets"
OUT = ROOT / "public" / "textures"

TILE = 1400          # px to compose on; saved at SAVE px and shown at 1000 css px (globals.css)
SAVE = 1000          # a shade-away texture needs no 2x: soft lines read as crayon, and the file stays small
MAIN = (110, 156)    # main doodle size range (longest side, tile px)
FILL = (30, 54)      # little fillers (stars, dots, sparkles)
GAP = 26             # min clear space between doodles (tile px)


def cut(sheet: Path):
    """Doodles on a sheet → list of float ink crops (0..1)."""
    g = np.asarray(Image.open(sheet).convert("L"), dtype=np.float32)
    ink = np.clip((228 - g) / 150, 0, 1)
    b = 22
    ink[:b], ink[-b:], ink[:, :b], ink[:, -b:] = 0, 0, 0, 0
    grouped = ndi.binary_dilation(ink > 0.3, iterations=16)
    lab, n = ndi.label(grouped)
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        piece = ink[sl] * (lab[sl] == i)
        ys, xs = np.nonzero(piece > 0.3)
        if len(ys) < 50:
            continue
        piece = piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        h, w = piece.shape
        if max(h, w) < 26 or max(h, w) > 520 or min(h, w) < 6:
            continue
        if max(h, w) < 90 and (max(h, w) / min(h, w) > 1.8 or len(ys) < 140):
            continue  # stray marks and slivers, not fillers
        out.append(piece)
    return out


def noise(shape, sigma, rng):
    f = ndi.gaussian_filter(rng.standard_normal(shape).astype(np.float32), sigma)
    return f / (np.abs(f).max() + 1e-6)


def kidify(piece, target, rng):
    """Resize to `target` (longest side), then wobble + uneven pressure + a slight turn."""
    h, w = piece.shape
    k = target / max(h, w)
    im = Image.fromarray((piece * 255).astype(np.uint8)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    pad = 14
    a = np.pad(np.asarray(im, dtype=np.float32) / 255, pad)
    H, W = a.shape
    # wobble: a broad displacement field (lopsided shapes) + a fine one (shaky hand)
    amp, sig = target * 0.05, target * 0.15
    dy = noise(a.shape, sig, rng) * amp + noise(a.shape, target * 0.04, rng) * target * 0.012
    dx = noise(a.shape, sig, rng) * amp + noise(a.shape, target * 0.04, rng) * target * 0.012
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    a = ndi.map_coordinates(a, [yy + dy, xx + dx], order=1, mode="constant")
    # thicken to a chunky marker line, then press harder in patches (uneven weight)
    a = np.maximum(a, ndi.grey_dilation(a, size=(2, 2)) * 0.9)
    press = np.clip(noise(a.shape, target * 0.09, rng) * 1.6, 0, 1)
    a = np.maximum(a, ndi.grey_dilation(a, size=(4, 4)) * press)
    a = np.clip(a * 1.25, 0, 1)
    im = Image.fromarray((a * 255).astype(np.uint8)).rotate(rng.uniform(-18, 18), resample=Image.BICUBIC, expand=True)
    if rng.random() < 0.3:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return np.asarray(im, dtype=np.float32) / 255


def place(tile, items, placed, size_range, rng, tries=4000):
    for _ in range(tries):
        if not items:
            return
        piece = items[-1]
        h, w = piece.shape
        r = max(h, w) / 2 * 0.82
        x, y = rng.uniform(0, TILE), rng.uniform(0, TILE)
        ok = True
        for (px, py, pr) in placed:
            ddx = min(abs(x - px), TILE - abs(x - px))
            ddy = min(abs(y - py), TILE - abs(y - py))
            if (ddx * ddx + ddy * ddy) ** 0.5 < r + pr + GAP:
                ok = False
                break
        if not ok:
            continue
        items.pop()
        placed.append((x, y, r))
        x0, y0 = int(x - w / 2), int(y - h / 2)
        for ox in (-TILE, 0, TILE):          # toroidal copies → seamless repeat
            for oy in (-TILE, 0, TILE):
                X, Y = x0 + ox, y0 + oy
                xa, ya, xb, yb = max(X, 0), max(Y, 0), min(X + w, TILE), min(Y + h, TILE)
                if xa < xb and ya < yb:
                    tile[ya:yb, xa:xb] = np.maximum(tile[ya:yb, xa:xb], piece[ya - Y:yb - Y, xa - X:xb - X])


def main():
    args = sys.argv[1:]
    theme = args[0]
    seed = int(args[args.index("--seed") + 1]) if "--seed" in args else 7
    rng = np.random.default_rng(seed)
    random.seed(seed)
    pieces = [p for s in sorted(SHEETS.glob(f"{theme}_v*.png")) for p in cut(s)]
    big = [p for p in pieces if max(p.shape) >= 90]
    small = [p for p in pieces if max(p.shape) < 90]
    print(f"{theme}: {len(big)} doodles, {len(small)} fillers from {len(list(SHEETS.glob(f'{theme}_v*.png')))} sheets")
    rng.shuffle(big)
    rng.shuffle(small)
    tile = np.zeros((TILE, TILE), np.float32)
    placed = []
    mains = [kidify(p, rng.uniform(*MAIN), rng) for p in big[:46]]
    place(tile, mains, placed, MAIN, rng)
    fills = [kidify(p, rng.uniform(*FILL), rng) for p in (small * 3)[:40]]
    place(tile, fills, placed, FILL, rng)
    print(f"placed {len(placed)}")
    OUT.mkdir(parents=True, exist_ok=True)
    alpha = Image.fromarray((tile * 255).astype(np.uint8)).resize((SAVE, SAVE), Image.LANCZOS)
    rgba = Image.merge("RGBA", (Image.new("L", alpha.size, 0),) * 3 + (alpha,))
    dest = OUT / f"{theme}-doodles.webp"
    rgba.save(dest, "WEBP", quality=50, alpha_quality=40, method=6)
    print(f"{dest.relative_to(ROOT)}  {dest.stat().st_size / 1024:.0f} KB")
    if "--preview" in args:
        prev = ROOT / ".texture-work" / f"{theme}-preview.png"
        Image.merge("RGB", (Image.fromarray((255 - tile * 255).astype(np.uint8)),) * 3).save(prev)


if __name__ == "__main__":
    main()
