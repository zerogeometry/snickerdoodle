"""The doodle textures and the floating doodles, cut from the brand's own doodle sheets.

    python scripts/textures/build.py [path/to/brand-assets] [--seed N] [--preview]
    (needs numpy + scipy + pillow:  pip install numpy scipy pillow)

Reads the shared brand-assets folder (default ../brand-assets) — the same drawings Snickerdoodle Draw
teaches, drawn in crayon:
    backgrounds/everyday/doodle-sheet-reference.png             12 x 16 doodles, 200px cells
    backgrounds/christmas/doodle-sheet-christmas-reference.png    8 x 5 doodles, 250px cells

and writes, into public/textures/:
    <season>-doodles.webp    a seamless 1000 css-px tile for the doodle-paper bands (globals.css .doodle-paper)
    floaters-<season>.webp   a sprite of the floating doodles (src/ui/components/FloatingDoodles.tsx)

Both are MASKS (black on transparent): the section colours never live in the image — globals.css paints
the lines through them with token colours — so the same file stays right if a token moves. The drawings
are used as drawn: crayon grain, wobble and all. They're only turned a little, flipped now and then and
sized unevenly, and the tile wraps (each doodle is pasted at its toroidal copies), so it repeats with no
seams.
"""
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent.parent
OUT = ROOT / "public" / "textures"

SHEETS = {
    "everyday": ("backgrounds/everyday/doodle-sheet-reference.png", 12, 16),
    "christmas": ("backgrounds/christmas/doodle-sheet-christmas-reference.png", 8, 5),
}

TILE = 1400          # px to compose on; saved at SAVE px and shown at 1000 css px (globals.css)
SAVE = 1000          # 1x: the lines are a shade off the band colour, so soft is fine and the file stays ~85 KB
MAIN = (120, 168)    # doodle size range (longest side, tile px)
FILL = (52, 74)      # little ones between them
GAP = 30             # min clear space between doodles (tile px)

# The floating doodles, by (row, column) on each sheet, in the order FloatingDoodles.tsx names them.
FLOATERS = {
    "everyday": [
        ("sun", 0, 0), ("balloons", 0, 1), ("star", 0, 5), ("heart", 0, 10), ("flower", 0, 11), ("rainbow", 1, 0),
        ("kite", 2, 8), ("hotair", 2, 10), ("rocket", 4, 8), ("house", 5, 0), ("snail", 4, 4), ("butterfly", 10, 11),
    ],
    "christmas": [
        ("snowman", 0, 0), ("snowflake", 0, 1), ("tree", 0, 2), ("present", 0, 3), ("bauble", 0, 6), ("hat", 1, 0),
        ("robin", 1, 1), ("penguin", 1, 2), ("star", 1, 7), ("moon", 2, 0), ("mug", 3, 0), ("socks", 4, 7),
    ],
}
SPRITE_CELL = 160    # px per floater in the sprite (shown at up to ~64 css px: 2.5x)
SPRITE_COLS = 4

# Simple shapes that also make good little fillers between the big ones.
FILLERS = {"everyday": [(0, 5), (0, 10), (0, 0), (0, 11), (2, 9)], "christmas": [(0, 1), (1, 7), (0, 6), (0, 3)]}


def ink_of(sheet: Path):
    g = np.asarray(Image.open(sheet).convert("L"), dtype=np.float32)
    # crayon on white: keep the grain (soft edges, speckle) — only the paper itself goes
    return np.clip((236 - g) / 170, 0, 1)


def cells(ink, cols, rows):
    """Each grid cell's doodle, trimmed to its ink → {(row, col): crop}. Empty cells are skipped."""
    H, W = ink.shape
    ch, cw = H / rows, W / cols
    out = {}
    for r in range(rows):
        for c in range(cols):
            a = ink[round(r * ch):round((r + 1) * ch), round(c * cw):round((c + 1) * cw)].copy()
            a[a < 0.06] = 0
            # drop specks away from the drawing (stray grain), keep everything joined to it
            lab, n = ndi.label(ndi.binary_dilation(a > 0.25, iterations=6))
            if n == 0:
                continue
            sizes = ndi.sum(a > 0.25, lab, range(1, n + 1))
            keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(40, sizes.max() * 0.02)])
            a = a * keep
            ys, xs = np.nonzero(a > 0.25)
            if len(ys) < 120:
                continue
            out[(r, c)] = a[max(ys.min() - 3, 0):ys.max() + 4, max(xs.min() - 3, 0):xs.max() + 4]
    return out


def sized(piece, target, rng=None):
    """Resize to `target` (longest side); with `rng`, also a slight turn and the odd flip."""
    h, w = piece.shape
    k = target / max(h, w)
    im = Image.fromarray((piece * 255).astype(np.uint8)).resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    if rng is not None:
        im = im.rotate(rng.uniform(-16, 16), resample=Image.BICUBIC, expand=True)
        if rng.random() < 0.25:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
    return np.asarray(im, dtype=np.float32) / 255


def place(tile, items, placed, rng, tries=6000):
    for _ in range(tries):
        if not items:
            return
        piece = items[-1]
        h, w = piece.shape
        r = max(h, w) / 2 * 0.8
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


def save_mask(alpha_u8: Image.Image, dest: Path, quality=40):
    rgba = Image.merge("RGBA", (Image.new("L", alpha_u8.size, 0),) * 3 + (alpha_u8,))
    rgba.save(dest, "WEBP", quality=quality, alpha_quality=quality, method=6)
    print(f"{dest.relative_to(ROOT)}  {alpha_u8.size[0]}x{alpha_u8.size[1]}  {dest.stat().st_size / 1024:.0f} KB")


def build(season, src: Path, seed, preview):
    rel, cols, rows = SHEETS[season]
    doodles = cells(ink_of(src / rel), cols, rows)
    print(f"{season}: {len(doodles)} doodles")
    rng = np.random.default_rng(seed)
    random.seed(seed)

    # ── the tile ───────────────────────────────────────────────────────────────────────────────────
    keys = list(doodles)
    rng.shuffle(keys)
    while len(keys) < 44:                      # the christmas sheet is small: use some twice (turned/flipped)
        keys += keys[: 44 - len(keys)]
    tile = np.zeros((TILE, TILE), np.float32)
    placed = []
    place(tile, [sized(doodles[k], rng.uniform(*MAIN), rng) for k in keys[:44]], placed, rng)
    fillers = [k for k in FILLERS[season] if k in doodles]
    place(tile, [sized(doodles[fillers[i % len(fillers)]], rng.uniform(*FILL), rng) for i in range(26)], placed, rng)
    print(f"  tile: placed {len(placed)}")
    OUT.mkdir(parents=True, exist_ok=True)
    alpha = Image.fromarray((np.clip(tile, 0, 1) * 255).astype(np.uint8))
    if SAVE != TILE:
        alpha = alpha.resize((SAVE, SAVE), Image.LANCZOS)
    save_mask(alpha, OUT / f"{season}-doodles.webp", quality=40)

    # ── the floaters sprite ────────────────────────────────────────────────────────────────────────
    names = FLOATERS[season]
    srows = -(-len(names) // SPRITE_COLS)
    sprite = np.zeros((srows * SPRITE_CELL, SPRITE_COLS * SPRITE_CELL), np.float32)
    for i, (name, r, c) in enumerate(names):
        piece = sized(doodles[(r, c)], SPRITE_CELL - 12)
        h, w = piece.shape
        y0 = (i // SPRITE_COLS) * SPRITE_CELL + (SPRITE_CELL - h) // 2
        x0 = (i % SPRITE_COLS) * SPRITE_CELL + (SPRITE_CELL - w) // 2
        sprite[y0:y0 + h, x0:x0 + w] = np.maximum(sprite[y0:y0 + h, x0:x0 + w], piece)
    # a touch bolder than the sheet: they're small and pale on the page
    sprite = np.clip(np.maximum(sprite, ndi.grey_dilation(sprite, size=(2, 2)) * 0.85) * 1.15, 0, 1)
    save_mask(Image.fromarray((sprite * 255).astype(np.uint8)), OUT / f"floaters-{season}.webp", quality=60)

    if preview:
        work = ROOT / ".texture-work"
        work.mkdir(exist_ok=True)
        Image.fromarray((255 - np.clip(tile, 0, 1) * 255).astype(np.uint8)).save(work / f"{season}-preview.png")
        Image.fromarray((255 - sprite * 255).astype(np.uint8)).save(work / f"floaters-{season}-preview.png")


def main():
    args = sys.argv[1:]
    seed = int(args[args.index("--seed") + 1]) if "--seed" in args else 7
    paths = [a for a in args if not a.startswith("--") and not a.isdigit()]
    src = Path(paths[0]) if paths else ROOT.parent / "brand-assets"
    for season in SHEETS:
        build(season, src, seed, "--preview" in args)


if __name__ == "__main__":
    main()
