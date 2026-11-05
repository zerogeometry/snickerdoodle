/**
 * The APPLE WATCH STRAP (5 Nov 2026 — Prodigi's "global" change; project-office/briefs/PRODUCT-RANGE-global-uk-nov.md).
 * Faux (vegan) leather, UV-printed, black fittings, made at Prodigi's UK lab uk6 and posted Royal Mail
 * Standard TRACKED (£22 + £4, sandbox quote 5 Nov) — so, unlike a phone case, it needs no Express.
 *
 * ONE print file covers BOTH halves of the strap, end to end, with the watch in between. Prodigi's own
 * print templates (prodigi.com → apple watch strap → "print file templates": prodigi-38mm-strap.png
 * 307×2740, prodigi-42mm-strap.png 364×2933 — the API's file plus a 1 px border) shade what DOESN'T
 * print: a band down each side, the ends, and a fifth of the length in the middle that sits behind the
 * watch. Their outline is traced below (fractions of the file), so the preview, the placement screen and
 * the mockup all show the drawing only where it really prints. The buckle half is on top, the half with
 * the holes below; the holes are punched through the print.
 *
 * Sizes, in parent language: Prodigi sells "38mm" and "42mm" and says only "compatible with all Apple Watch
 * series". Apple's own rule is that bands fit across the SMALL cases (38/40/41 mm, and the 42 mm of Series
 * 10 and later) or across the LARGE ones (44/45/46/49 mm, and the 42 mm of Series 1–3). The size is on the
 * back of the watch.
 */

export interface StrapSize {
  /** our size name (the variant's `size`) */
  size: string;
  /** Prodigi's SKU */
  sku: string;
  /** Prodigi's exact print file, px (sandbox GET /v4.0/products, 5 Nov 2026 — 300 dpi) */
  px: { w: number; h: number };
  /** which watches it fits, for the product page */
  fits: string;
  /** the traced outline: each half as rows [y, xLeft, xRight] top → bottom (fractions of the file) */
  pieces: Array<Array<[number, number, number]>>;
  /** the punched holes on the lower half: centre y, height, width (fractions of the file; centred) */
  holes: Array<{ y: number; h: number; w: number }>;
}

const holes = (first: number, pitch: number, h: number, w: number) => Array.from({ length: 11 }, (_, i) => ({ y: Math.round((first + i * pitch) * 10000) / 10000, h, w }));

export const WATCH_STRAP_SIZES: StrapSize[] = [
  {
    size: 'small', sku: 'GLOBAL-TECH-AP-WS-FL-38MM', px: { w: 305, h: 2738 },
    fits: '38, 40 and 41 mm watches, and the 42 mm Series 10 and newer',
    pieces: [
      [[0.0128, 0.1238, 0.8762], [0.1894, 0.1238, 0.8795], [0.2186, 0.1205, 0.8827], [0.2332, 0.114, 0.886], [0.2478, 0.1107, 0.8925], [0.2624, 0.0977, 0.9023], [0.277, 0.0814, 0.9186], [0.2916, 0.0684, 0.9349], [0.3062, 0.0651, 0.9381], [0.323, 0.0651, 0.9381]],
      [[0.5131, 0.0619, 0.9349], [0.5438, 0.0651, 0.9316], [0.5584, 0.0782, 0.9186], [0.573, 0.0977, 0.9023], [0.5876, 0.1075, 0.8893], [0.6022, 0.114, 0.8827], [0.6168, 0.1173, 0.8795], [0.6314, 0.1205, 0.8795], [0.938, 0.1205, 0.8795], [0.9526, 0.127, 0.8697], [0.9672, 0.1792, 0.8208], [0.9715, 0.2085, 0.7915], [0.9759, 0.2443, 0.7524], [0.9803, 0.2964, 0.7003], [0.9847, 0.3811, 0.6156], [0.9869, 0.4593, 0.5407]],
    ],
    holes: holes(0.6664, 0.0238, 0.0111, 0.15),
  },
  {
    size: 'large', sku: 'GLOBAL-TECH-AP-WS-FL-42MM', px: { w: 363, h: 2932 },
    fits: '44, 45, 46 and 49 mm watches, and the 42 mm Series 1–3',
    pieces: [
      [[0.0136, 0.1071, 0.8736], [0.1923, 0.1071, 0.8736], [0.2196, 0.1044, 0.8736], [0.2332, 0.1016, 0.8764], [0.2468, 0.0989, 0.8791], [0.2605, 0.0934, 0.8846], [0.2741, 0.0824, 0.8956], [0.2878, 0.0659, 0.9121], [0.3014, 0.0522, 0.9258], [0.315, 0.0467, 0.9313], [0.3311, 0.0467, 0.9313]],
      [[0.4995, 0.0632, 0.9341], [0.524, 0.0659, 0.9341], [0.5281, 0.0687, 0.9313], [0.5418, 0.0797, 0.9203], [0.5554, 0.0934, 0.9038], [0.569, 0.1071, 0.8929], [0.5827, 0.1154, 0.8846], [0.5963, 0.1209, 0.8791], [0.6236, 0.1236, 0.8764], [0.9373, 0.1236, 0.8764], [0.9509, 0.1291, 0.8681], [0.9645, 0.1731, 0.8242], [0.9686, 0.1978, 0.8022], [0.9727, 0.228, 0.772], [0.9768, 0.2665, 0.7335], [0.9809, 0.3214, 0.6786], [0.985, 0.4203, 0.5769], [0.986, 0.4615, 0.5385]],
    ],
    holes: holes(0.657, 0.02445, 0.0116, 0.1538),
  },
];

export const WATCH_STRAP_KEY = 'watchStrap';
export const isWatchStrap = (key: string | null | undefined): boolean => key === WATCH_STRAP_KEY;

/** The strap size for a variant's `size` (the small one when unknown). */
export const strapSizeOf = (size: string | null | undefined): StrapSize => WATCH_STRAP_SIZES.find((s) => s.size === size) ?? WATCH_STRAP_SIZES[0]!;

/** Which strap a print canvas is — by its shape (the two files differ: 305×2738 vs 363×2932). */
export const strapSizeForCanvas = (w: number, h: number): StrapSize =>
  WATCH_STRAP_SIZES.reduce((best, s) => (Math.abs(s.px.w / s.px.h - w / h) < Math.abs(best.px.w / best.px.h - w / h) ? s : best));

/** Each half of the strap as an SVG path, in a box `w`×`h` at (x, y) — the file's own coordinates scaled. */
export function strapPiecePaths(s: StrapSize, box: { x: number; y: number; w: number; h: number }): string[] {
  const X = (f: number) => Math.round((box.x + f * box.w) * 10) / 10;
  const Y = (f: number) => Math.round((box.y + f * box.h) * 10) / 10;
  return s.pieces.map((rows) => {
    const down = rows.map(([y, l]) => `${X(l)} ${Y(y)}`);
    const up = [...rows].reverse().map(([y, , r]) => `${X(r)} ${Y(y)}`);
    return `M${down.join(' L')} L${up.join(' L')} Z`;
  });
}

/** The holes as SVG ellipses (`cx cy rx ry`) in the same box. */
export function strapHoles(s: StrapSize, box: { x: number; y: number; w: number; h: number }): Array<{ cx: number; cy: number; rx: number; ry: number }> {
  return s.holes.map((h) => ({ cx: box.x + box.w / 2, cy: box.y + h.y * box.h, rx: (h.w * box.w) / 2, ry: (h.h * box.h) / 2 }));
}

/**
 * Where the print file sits on a PHOTO of the strap (the founder's layers): the photo's two leather halves are
 * matched to Prodigi's traced halves — the file's top, the gap behind the watch and its bottom — by a least-squares
 * fit along the strap's length, so the drawing lands on each half where it really prints. Across the strap it's
 * aspect-locked to the file and centred (the photo's strap is a touch narrower than Prodigi's, so the preview
 * shows a little LESS of the sides than prints — never more). `halves` are the photo's two halves, top first:
 * [y0, y1) in px; `cx` the strap's centre line. Returns the quad box (px) and how far each half's ends land from
 * the photo's (px) — the registration error.
 */
export function strapPhotoBox(s: StrapSize, halves: [[number, number], [number, number]], cx: number): { x: number; y: number; w: number; h: number; residualPx: number } {
  const f = [s.pieces[0]![0]![0], s.pieces[0]!.at(-1)![0], s.pieces[1]![0]![0], s.pieces[1]!.at(-1)![0]];
  const y = [halves[0][0], halves[0][1], halves[1][0], halves[1][1]];
  const mf = f.reduce((a, b) => a + b, 0) / 4, my = y.reduce((a, b) => a + b, 0) / 4;
  const h = f.reduce((n, fi, i) => n + (fi - mf) * (y[i]! - my), 0) / f.reduce((n, fi) => n + (fi - mf) ** 2, 0);
  const top = my - h * mf;
  const w = (h * s.px.w) / s.px.h;
  const residualPx = Math.max(...f.map((fi, i) => Math.abs(top + fi * h - y[i]!)));
  return { x: cx - w / 2, y: top, w, h, residualPx };
}

/**
 * Lay the PRINT FILE onto a PHOTO of the strap HALF BY HALF, exactly as Prodigi prints it: the file's top half
 * (Prodigi's template: its upper leather piece) lands on the photo's top half and its bottom half on the bottom one,
 * each at its own place, so the drawing shows on each half exactly where it prints — even though the photo's gap
 * behind the watch isn't the file's. `halves` are the photo's two leather halves, top first, as fractions of the
 * print area's height (the print quad); the result is two bands: rows `from` of the file (fractions of its height)
 * drawn into rows `to` of the print area. The file is split at the middle of its unprinted gap, so nothing that
 * prints is lost. Each half keeps the file's own scale when the photo's halves are in Prodigi's proportions (the
 * founder's are, within 1%) — never stretched to fit.
 */
export function strapBands(s: StrapSize, halves: [[number, number], [number, number]]): Array<{ from: [number, number]; to: [number, number] }> {
  const [fu0, fu1] = [s.pieces[0]![0]![0], s.pieces[0]!.at(-1)![0]];
  const [fl0, fl1] = [s.pieces[1]![0]![0], s.pieces[1]!.at(-1)![0]];
  const up = (f: number) => halves[0][0] + ((f - fu0) * (halves[0][1] - halves[0][0])) / (fu1 - fu0);
  const low = (f: number) => halves[1][0] + ((f - fl0) * (halves[1][1] - halves[1][0])) / (fl1 - fl0);
  const mid = (fu1 + fl0) / 2;
  return [
    { from: [0, mid], to: [up(0), up(mid)] },
    { from: [mid, 1], to: [low(mid), low(1)] },
  ];
}

/**
 * What DOESN'T print, as an SVG the size of the print file (`w`×`h` px): everything outside the two halves,
 * shaded, plus the holes. Laid over the placement screen's print layout, so a parent sees which part of
 * their drawing sits behind the watch.
 */
export function strapShadeSvg(s: StrapSize, w: number, h: number): string {
  const box = { x: 0, y: 0, w, h };
  const pieces = strapPiecePaths(s, box).join(' ');
  const hs = strapHoles(s, box).map((o) => `<ellipse cx="${o.cx}" cy="${o.cy}" rx="${o.rx}" ry="${o.ry}" fill="#2B2118" fill-opacity="0.55"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="M0 0 H${w} V${h} H0 Z ${pieces}" fill="#2B2118" fill-opacity="0.55" fill-rule="evenodd"/>${hs}</svg>`;
}
