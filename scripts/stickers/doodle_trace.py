"""Turn the picked doodle candidates into the Studio's sticker SVGs.

  python scripts/stickers/doodle_trace.py [id[:candidate.png] ...]   (no ids = every pick in sticker-art/picks.json)

For each sticker: lift the doodle off its white paper (the paper touching the edge goes transparent;
white INSIDE the outline — a snowman, a beard — stays as paper colour), snap every colour to the brand
palette (globals.css tokens + the family's browns), crop to the art with even padding on a square, and
trace it to vector paths. Vector means the sticker prints crisp at any size (the print render
rasterises it at the final pixel size) and the Studio preview draws the very same SVG string.

Writes public/stickers/christmas/<id>.svg (what the Studio tray and canvas load); then
`node scripts/stickers/build-art.mjs` writes the server's copy (src/lib/stickers/christmas-art.ts) and
the contact sheet. Needs Pillow, NumPy, OpenCV and vtracer
(pip install pillow numpy opencv-python-headless vtracer).

Per-sticker settings live in sticker-art/picks.json next to the candidates; the picks used for the
2026 doodle set are recorded in scripts/stickers/doodle-picks.json.
"""
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import vtracer
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / "sticker-art"
OUT = ROOT / "public" / "stickers" / "christmas"

# brand tokens (src/app/globals.css) + the family's derived browns/skin: every fill snaps to one of these
PALETTE = {
    "ink": "#2b2118", "tomato": "#c8402a", "honey": "#f6c445", "band": "#fbe9b7", "leaf": "#7fa65e",
    "save": "#3f6e29", "sky": "#8fb5d6", "cobalt": "#2f5da8", "berry": "#e8786e", "paper": "#fffbf2",
    "ginger": "#d78a36", "deer": "#9c5327", "skin": "#fbe7cc",
}
WORK = 600        # traced on a 600px square (plenty for smooth curves), written into the 200-unit view box
PAD = 0.05        # empty margin round the art, each side, as a fraction of the square
INK_GAP = 7       # px (at 1024) of outline gap the paper flood won't leak through
FILL_BLUR = 11    # px (at 1024) of smoothing for the colouring-in
SPECKLE = 4       # vtracer: patches smaller than this (px at WORK) are dropped
SOFTEN = 2.2      # px (at WORK) of edge rounding before tracing
SLIVER_AREA = 1500  # px (at 1024): paper patches up to this size touching the outside are outside
SPECK_AREA = 220   # px (at 1024): smaller flecks of paper / sky melt into their surroundings
KEY = "#00ff00"   # stands in for "no paper here" while tracing; never a sticker colour


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


PAL = np.array([hex_rgb(h) for h in PALETTE.values()], dtype=np.float32)
PAL_HEX = list(PALETTE.values())
INK_I = list(PALETTE).index("ink")
PAPER_I = list(PALETTE).index("paper")
# colours the drawings use that aren't in the palette, and which palette colour they become
ALIASES = [
    ("#d6d3cf", "paper"), ("#bdb8b2", "paper"),  # pencil-grey shading on white: still white
    ("#c4561a", "deer"), ("#b24c18", "deer"), ("#a8582c", "deer"),  # burnt-orange brown crayon: brown, not red
]
MATCH = np.concatenate([PAL, np.array([hex_rgb(h) for h, _ in ALIASES], np.float32)])
MATCH_TO = np.array(list(range(len(PAL))) + [list(PALETTE).index(n) for _, n in ALIASES], np.uint8)


def to_lab(rgb):
    """sRGB (0-255, ...x3) to CIE Lab, so 'nearest colour' means nearest to the eye."""
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


PAL_LAB = to_lab(PAL)
MATCH_LAB = to_lab(MATCH)


def grow(mask, px):
    return np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(px * 2 + 1))) > 0


def lift(img, gap=INK_GAP):
    """True where the paper shows (connected to the edge): that goes transparent."""
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    mx, mn = a.max(-1), a.min(-1)
    whitish = (mn > 200) & (mx - mn < 40)
    ink = a.mean(-1) < 110
    # seal small gaps in the outline before flooding, so the paper can't run inside
    passable = Image.fromarray(((whitish & ~grow(ink, gap)) * 255).astype(np.uint8)).copy()  # a buffer PIL owns
    h, w = whitish.shape
    edge = [(x, 0) for x in range(0, w, 8)] + [(x, h - 1) for x in range(0, w, 8)] + \
           [(0, y) for y in range(0, h, 8)] + [(w - 1, y) for y in range(0, h, 8)]
    for xy in edge:
        if passable.getpixel(xy) == 255:
            ImageDraw.floodfill(passable, xy, 128)
    flood = np.asarray(passable) == 128
    # the seal held the flood back from the real outline: let it creep up to the ink through paper only
    bg = flood
    for _ in range(gap + 2):
        bg = (grow(bg, 1) & whitish) | flood
    return bg


def snap(img, bg, blur=FILL_BLUR, line=5, remap=None, dark=95, no_paper=False):
    """Each kept pixel to a palette index. The ink line is read from the drawing as it is (so it keeps
    its wobble); the colouring-in from a smoothed copy, so crayon grain becomes flat felt-tip colour
    instead of hundreds of tiny specks. `line` is the clean-up window for the ink (smaller keeps thin
    strings and whiskers); `dark` is how dark a pixel must be to count as the line (raise it for a
    light pen); `remap` swaps palette colours for this sticker ({"honey": "ginger"}); `no_paper` lifts
    every white patch big enough to be paper showing through (a sticker with nothing white in it)."""
    raw = np.asarray(img.convert("RGB").filter(ImageFilter.MedianFilter(3))).astype(np.int16)
    ink = (raw.mean(-1) < dark) & (raw.max(-1) - raw.min(-1) < 70)
    ink = np.asarray(Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.ModeFilter(line))) > 127
    smooth = img.convert("RGB").filter(ImageFilter.MedianFilter(blur))
    lab = to_lab(np.asarray(smooth).astype(np.float32))
    d = ((lab[..., None, :] - MATCH_LAB[None, None]) ** 2).sum(-1)
    d[..., INK_I] += 2500  # dark-ish colouring stays a colour; only the real line is ink
    idx = MATCH_TO[d.argmin(-1)]
    idx = np.asarray(Image.fromarray(idx).filter(ImageFilter.ModeFilter(blur)))
    for a, b in (remap or {}).items():
        idx = np.where(idx == list(PALETTE).index(a), list(PALETTE).index(b), idx).astype(np.uint8)
    idx = np.where(ink, INK_I, idx)
    idx = np.where(bg, 255, idx).astype(np.uint8)
    # slivers of paper left just outside the outline (where the seal held the flood back) are paper too
    idx = clear_slivers(idx)
    if no_paper:
        n, comp, stats, _ = cv2.connectedComponentsWithStats((idx == PAPER_I).astype(np.uint8), connectivity=8)
        for c in range(1, n):
            if stats[c, cv2.CC_STAT_AREA] >= SPECK_AREA:
                idx = np.where(comp == c, 255, idx).astype(np.uint8)
    # flecks of paper caught in the outline, and stray specks of sky blue, melt into what's round them
    for label in (PAPER_I, list(PALETTE).index("sky")):
        idx = melt_specks(idx, label, SPECK_AREA)
    return idx


def clear_slivers(idx):
    """A small patch of paper colour that touches the lifted-off paper is more of the same: lift it."""
    bg = (idx == 255).astype(np.uint8)
    near_bg = cv2.dilate(bg, np.ones((5, 5), np.uint8)).astype(bool)
    n, comp, stats, _ = cv2.connectedComponentsWithStats((idx == PAPER_I).astype(np.uint8), connectivity=8)
    out = idx.copy()
    for c in range(1, n):
        if stats[c, cv2.CC_STAT_AREA] < SLIVER_AREA:
            patch = comp == c
            if (patch & near_bg).any():
                out[patch] = 255
    return out


def melt_specks(idx, label, max_area):
    """Every patch of `label` smaller than max_area px takes the commonest colour bordering it."""
    n, comp, stats, _ = cv2.connectedComponentsWithStats((idx == label).astype(np.uint8), connectivity=8)
    out = idx.copy()
    for c in range(1, n):
        if stats[c, cv2.CC_STAT_AREA] >= max_area:
            continue
        x, y, w, h = (int(stats[c, k]) for k in (cv2.CC_STAT_LEFT, cv2.CC_STAT_TOP, cv2.CC_STAT_WIDTH, cv2.CC_STAT_HEIGHT))
        x0, y0, x1, y1 = max(0, x - 3), max(0, y - 3), x + w + 3, y + h + 3
        patch = comp[y0:y1, x0:x1] == c
        ring = cv2.dilate(patch.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & ~patch
        vals, counts = np.unique(idx[y0:y1, x0:x1][ring], return_counts=True)
        if len(vals):
            out[y0:y1, x0:x1][patch] = vals[counts.argmax()]
    return out


def square_crop(idx):
    """The art, centred on a square with PAD all round, at WORK px (255 = transparent)."""
    ys, xs = np.where(idx != 255)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(y1 - y0, x1 - x0)
    full = int(round(side / (1 - 2 * PAD)))
    out = np.full((full, full), 255, np.uint8)
    oy, ox = (full - (y1 - y0)) // 2, (full - (x1 - x0)) // 2
    out[oy:oy + y1 - y0, ox:ox + x1 - x0] = idx[y0:y1, x0:x1]
    return soften(np.asarray(Image.fromarray(out).resize((WORK, WORK), Image.NEAREST)))


def soften(idx, radius=SOFTEN):
    """Round off pixel stair-steps: blur each colour's region and let the strongest win at every pixel,
    so the traced edges are smooth curves even blown up onto a blanket (the wobble is the child's)."""
    labels = [l for l in np.unique(idx)]
    stack = np.stack([np.asarray(Image.fromarray(((idx == l) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)))
                      for l in labels]).astype(np.int16)
    return np.array(labels, np.uint8)[stack.argmax(0)]


def trace(idx):
    rgba = np.zeros((WORK, WORK, 4), np.uint8)
    rgba[..., :3] = hex_rgb(KEY)
    rgba[..., 3] = 255
    kept = idx != 255
    rgba[kept, :3] = PAL[idx[kept]].astype(np.uint8)
    pixels = [tuple(int(v) for v in p) for p in rgba.reshape(-1, 4)]
    return vtracer.convert_pixels_to_svg(
        pixels, size=(WORK, WORK), colormode="color", hierarchical="stacked", mode="spline",
        filter_speckle=SPECKLE, color_precision=8, layer_difference=4, corner_threshold=120,
        length_threshold=12.0, max_iterations=10, splice_threshold=90, path_precision=1,
    )


def num(v):
    """Shortest text for a number at 0.1 precision: 0.5 is .5, -0.5 is -.5, 3.0 is 3."""
    t = f"{v:.1f}".rstrip("0").rstrip(".")
    if t in ("-0", ""):
        return "0"
    if t.startswith("0."):
        return t[1:]
    if t.startswith("-0."):
        return "-" + t[2:]
    return t


def join(vals):
    out = ""
    for v in vals:
        t = num(v)
        out += t if not out or t.startswith("-") else " " + t
    return out


def is_key(fill):
    r, g, b = hex_rgb(fill)
    return g > 200 and r < 80 and b < 80


PATH = re.compile(r'<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})" transform="translate\(([-\d.]+),([-\d.]+)\)"/>')
TOKEN = re.compile(r"[MLCZ]|-?\d+(?:\.\d+)?")


def subpaths(toks):
    """Split a path's tokens at each M."""
    out = []
    for t in toks:
        if t == "M":
            out.append([])
        out[-1].append(t)
    return out


def spans_canvas(toks):
    nums = [float(v) for v in toks if not v.isalpha()]
    return max(nums[0::2]) - min(nums[0::2]) > 0.97 * WORK and max(nums[1::2]) - min(nums[1::2]) > 0.97 * WORK


def compact(toks, tx, ty):
    """Absolute WORK-px tokens to a 200-box path string: one decimal, relative after each M."""
    k = 200 / WORK
    out, i = "", 0
    cx = cy = sx = sy = 0.0  # current point and subpath start, as written (rounded)
    while i < len(toks):
        c = toks[i]
        i += 1
        if c == "Z":
            out += "z"
            cx, cy = sx, sy
            continue
        n = {"M": 2, "L": 2, "C": 6}[c]
        pts = [round((float(toks[i + j]) + (tx if j % 2 == 0 else ty)) * k, 1) for j in range(n)]
        i += n
        if c == "M":
            out += "M" + join(pts)
            cx, cy = sx, sy = pts
        else:
            out += c.lower() + join([round(v - (cx if j % 2 == 0 else cy), 1) for j, v in enumerate(pts)])
            cx, cy = pts[-2], pts[-1]
    return out


def snap_hex(fill):
    lab = to_lab(np.array(hex_rgb(fill), np.float32))
    return PAL_HEX[int(((PAL_LAB - lab) ** 2).sum(-1).argmin())]


def to_box(svg):
    """vtracer's stacked paths (WORK px, each with a translate) into one 200-unit view box with
    palette-exact fills, written compactly so twelve stickers stay light.

    Stacked mode lays a whole-canvas shape at the bottom and the stand-in paper (KEY) over it with a
    hole the shape of the art. Where nothing else covers that hole, the bottom colour is what shows (often
    the ink line), so the hole's outline becomes the sticker's base, in the bottom colour; the canvas and
    the stand-in paper themselves are dropped (the art never spans the canvas: it sits inside PAD)."""
    paths, base = [], None
    for m in PATH.finditer(svg):
        d, fill, tx, ty = m.group(1), m.group(2), float(m.group(3)), float(m.group(4))
        toks = TOKEN.findall(d)
        if is_key(fill):
            if base:
                inner = [sp for sp in subpaths(toks) if not spans_canvas(sp)]
                if inner:
                    paths.append((base, "".join(compact(sp, tx, ty) for sp in inner)))
            continue
        if spans_canvas(toks):
            base = snap_hex(fill)
            continue
        paths.append((snap_hex(fill), compact(toks, tx, ty)))
    if not paths:
        raise RuntimeError("vtracer output had no paths I could read")
    # a hairline of its own colour round each shape closes the anti-aliasing seam between neighbours
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">'
            '<g stroke-width=".5" stroke-linejoin="round">'
            + "".join(f'<path d="{d}" fill="{f}" stroke="{f}"/>' for f, d in paths) + "</g></svg>")


def run(sid, pick):
    """`pick` is a candidate file name, or {"file", and any of "gap", "blur", "line", "dark", "remap", "no_paper"}."""
    opt = pick if isinstance(pick, dict) else {"file": pick}
    cand = opt["file"]
    img = Image.open(ART / "candidates" / cand).convert("RGB")
    bg = lift(img, opt.get("gap", INK_GAP))
    idx = square_crop(snap(img, bg, opt.get("blur", FILL_BLUR), opt.get("line", 5), opt.get("remap"),
                           opt.get("dark", 95), opt.get("no_paper", False)))
    svg = to_box(trace(idx))
    (OUT / f"{sid}.svg").write_text(svg + "\n", encoding="utf-8")
    print(f"{sid:12s} {cand:22s} {len(svg) / 1024:6.1f} KB  {svg.count('<path')} paths", flush=True)


def main():
    local = ART / "picks.json"
    picks = json.loads((local if local.exists() else Path(__file__).with_name("doodle-picks.json")).read_text())
    # "reindeer" uses the pick; "reindeer:reindeer_v3.png" tries another candidate
    for arg in sys.argv[1:] or list(picks):
        sid, _, cand = arg.partition(":")
        run(sid, {**(picks[sid] if isinstance(picks.get(sid), dict) else {}), "file": cand} if cand else picks[sid])


if __name__ == "__main__":
    main()
