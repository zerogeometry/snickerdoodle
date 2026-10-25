import 'server-only';
import { Resvg } from '@resvg/resvg-js';

/**
 * DRAWN product mockups for the range-expansion products with no photo yet (height chart, bandana),
 * and the fallback for any whose founder-photographed layers (seedMockups → layered-flat) aren't
 * staged on this machine: a calm oat page, a soft shadow, the product drawn simply —
 * and the PRINT AREA at the print file's exact aspect, so the compositor lays the printed face on
 * it 1:1 (preview == print, registration drift 0). Same posture as the drawn phone cases
 * (phoneCaseMockup.ts): brand-safe by construction, nothing here is a child's image. A real photo
 * (Prodigi blank / founder layers) replaces any of these the moment it's staged.
 *
 * Shapes only — no text — so there are no fonts to bundle.
 */

export const DRAWN_PRODUCT_KEYS = ['socks', 'heightChart', 'wrappingPaper', 'teaTowel', 'petBandana', 'playingCards', 'plasticBauble'] as const;
export type DrawnProductKey = (typeof DRAWN_PRODUCT_KEYS)[number];
export const isDrawnProduct = (key: string): key is DrawnProductKey => (DRAWN_PRODUCT_KEYS as readonly string[]).includes(key);

export interface DrawnMockup {
  blank: Buffer;
  /** white = printable, on black — same canvas as the blank (omitted ⇒ the whole quad prints) */
  mask?: Buffer;
  /** detail drawn OVER the design (hangers, a cuff, a highlight) — same canvas */
  overlay?: Buffer;
  /** the print area, normalised TL,TR,BR,BL — its aspect IS the print file's */
  quad: [number, number][];
  material: 'PAPER' | 'LIGHT_FABRIC' | 'GLOSS';
  W: number;
  H: number;
}

const W = 1000;
const H = 1250;
const OAT = '#FBF5E9';
const INK = '#2B2118';
const HANGER: Record<string, string> = { natural: '#C9A27A', black: '#2B2118', white: '#F4F1EA' };
/** Brown kraft wrapping paper (D24) — the print multiplies over it, as CMYK on kraft does. */
const KRAFT = '#B98B5E';

type Rect = { x: number; y: number; w: number; h: number };

/** The largest rect of aspect `a` (w/h) inside maxW×maxH, centred on (cx, cy). */
function fit(a: number, maxW: number, maxH: number, cx = W / 2, cy = H / 2): Rect {
  let w = maxW;
  let h = w / a;
  if (h > maxH) {
    h = maxH;
    w = h * a;
  }
  return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) };
}

const svg = (body: string, bg = 'none') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg !== 'none' ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''}${body}</svg>`;
const SHADOW_DEFS = `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter></defs>`;
const png = (s: string) => Buffer.from(new Resvg(s, { fitTo: { mode: 'original' } }).render().asPng());

/** A path in rect-normalised coordinates → absolute path data (absolute commands M L H V C Q Z). */
function rel(r: Rect, d: string): string {
  const out: string[] = [];
  let cmd = 'M';
  let n = 0; // index of the number within the current command's arguments
  for (const tok of d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? []) {
    if (/[A-Za-z]/.test(tok)) {
      cmd = tok.toUpperCase();
      n = 0;
      out.push(tok);
      continue;
    }
    const v = parseFloat(tok);
    const isX = cmd === 'H' ? true : cmd === 'V' ? false : n % 2 === 0;
    n++;
    out.push(String(Math.round((isX ? r.x + v * r.w : r.y + v * r.h) * 10) / 10));
  }
  return out.join(' ');
}

const quadOf = (r: Rect): [number, number][] => [
  [r.x / W, r.y / H],
  [(r.x + r.w) / W, r.y / H],
  [(r.x + r.w) / W, (r.y + r.h) / H],
  [r.x / W, (r.y + r.h) / H],
];

/** A shape (path data, absolute) as a white-on-black mask. */
const maskOf = (d: string) => png(svg(`<path d="${d}" fill="#fff"/>`, '#000'));

/**
 * Draw the mockup for one variant. `print` is the print file's px (incl. any bleed — these
 * products have none); `attrs` the variant's attributes (hanger colour, size…).
 */
export function drawProductMockup(key: DrawnProductKey, attrs: Record<string, string>, print: { w: number; h: number }): DrawnMockup {
  const a = print.w / print.h;
  switch (key) {
    case 'socks': {
      // one sock, side on: the all-over print shows through the sock's shape; a ribbed cuff on top
      const r = fit(a, 760, 1000);
      const sock = rel(r, 'M0.2 0.02 H0.62 V0.52 C0.62 0.6 0.7 0.64 0.8 0.67 C0.95 0.71 0.99 0.8 0.98 0.88 C0.97 0.97 0.88 0.995 0.77 0.985 L0.36 0.97 C0.22 0.96 0.15 0.87 0.17 0.74 Z');
      const cuffH = r.h * 0.1;
      const ribs = Array.from({ length: 9 }, (_, i) => {
        const x = r.x + r.w * (0.22 + (i * 0.38) / 8);
        return `<path d="M${x} ${r.y + r.h * 0.025} V${r.y + r.h * 0.02 + cuffH}" stroke="#000" stroke-opacity="0.12" stroke-width="3"/>`;
      }).join('');
      return {
        blank: png(svg(`${SHADOW_DEFS}<path d="${sock}" fill="#000" opacity="0.18" filter="url(#s)" transform="translate(10 16)"/><path d="${sock}" fill="#fff"/>`, OAT)),
        mask: maskOf(sock),
        overlay: png(svg(`<rect x="${r.x + r.w * 0.2}" y="${r.y + r.h * 0.02}" width="${r.w * 0.42}" height="${cuffH}" fill="#fff" fill-opacity="0.35"/>${ribs}<path d="${sock}" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="3"/>`)),
        quad: quadOf(r),
        material: 'LIGHT_FABRIC',
        W, H,
      };
    }
    case 'heightChart': {
      // a tall canvas on wooden poster hangers, hung from a cord
      const r = fit(a, 700, 1060, W / 2, H / 2 + 20);
      const wood = HANGER[attrs.colour ?? ''] ?? HANGER.natural!;
      const bar = (y: number) => `<rect x="${r.x - 10}" y="${y}" width="${r.w + 20}" height="22" rx="6" fill="${wood}" stroke="${INK}" stroke-opacity="0.45" stroke-width="2"/>`;
      return {
        blank: png(svg(`${SHADOW_DEFS}<rect x="${r.x + 10}" y="${r.y + 14}" width="${r.w}" height="${r.h}" fill="#000" opacity="0.18" filter="url(#s)"/><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#fff"/>`, OAT)),
        overlay: png(svg(`<path d="M${r.x + 6} ${r.y - 4} L${W / 2} ${r.y - 70} L${r.x + r.w - 6} ${r.y - 4}" fill="none" stroke="${INK}" stroke-opacity="0.6" stroke-width="3"/>${bar(r.y - 12)}${bar(r.y + r.h - 10)}`)),
        quad: quadOf(r),
        material: 'PAPER',
        W, H,
      };
    }
    case 'wrappingPaper': {
      // a flat sheet with its corner lifting (a roll shows the length you get, as one long sheet)
      const r = fit(a, 820, 1100);
      const c = Math.round(Math.min(r.w, r.h) * 0.14);
      const curl = `M${r.x + r.w} ${r.y + r.h - c} L${r.x + r.w - c} ${r.y + r.h} L${r.x + r.w - c * 0.95} ${r.y + r.h - c * 0.95} Z`;
      const sheet = attrs.colour === 'kraft' ? KRAFT : '#fff';
      const back = attrs.colour === 'kraft' ? '#A57A50' : '#F3EDE2';
      return {
        blank: png(svg(`${SHADOW_DEFS}<rect x="${r.x + 10}" y="${r.y + 14}" width="${r.w}" height="${r.h}" fill="#000" opacity="0.16" filter="url(#s)"/><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${sheet}"/>`, OAT)),
        overlay: png(svg(`<path d="M${r.x + r.w} ${r.y + r.h - c} L${r.x + r.w} ${r.y + r.h} L${r.x + r.w - c} ${r.y + r.h} Z" fill="${OAT}"/><path d="${curl}" fill="${back}" stroke="${INK}" stroke-opacity="0.25" stroke-width="2"/>`)),
        quad: quadOf(r),
        material: 'PAPER',
        W, H,
      };
    }
    case 'teaTowel': {
      // a towel hanging from its loop, a stitched hem
      const r = fit(a, 760, 1040, W / 2, H / 2 + 30);
      const towel = rel(r, 'M0.01 0 H0.99 Q1 0 1 0.01 V0.99 Q1 1 0.99 1 H0.01 Q0 1 0 0.99 V0.01 Q0 0 0.01 0 Z');
      const hem = 14;
      return {
        blank: png(svg(`${SHADOW_DEFS}<path d="${towel}" fill="#000" opacity="0.16" filter="url(#s)" transform="translate(10 14)"/><path d="${towel}" fill="#fff"/>`, OAT)),
        mask: maskOf(towel),
        overlay: png(svg(`<path d="M${W / 2 - 30} ${r.y + 4} Q${W / 2} ${r.y - 80} ${W / 2 + 30} ${r.y + 4}" fill="none" stroke="#E9E1D2" stroke-width="12" stroke-linecap="round"/><rect x="${r.x + hem}" y="${r.y + hem}" width="${r.w - 2 * hem}" height="${r.h - 2 * hem}" fill="none" stroke="#000" stroke-opacity="0.14" stroke-width="2" stroke-dasharray="8 7"/>`)),
        quad: quadOf(r),
        material: 'LIGHT_FABRIC',
        W, H,
      };
    }
    case 'petBandana': {
      // laid flat: the tie band across the top, the triangle hanging from it (shape approximate
      // until Prodigi's bandana template is traced)
      const r = fit(a, 900, 900);
      const shape = rel(r, 'M0 0.02 Q0 0 0.02 0 H0.98 Q1 0 1 0.02 V0.2 Q1 0.24 0.96 0.24 H0.74 L0.53 0.97 Q0.5 1.02 0.47 0.97 L0.26 0.24 H0.04 Q0 0.24 0 0.2 Z');
      return {
        blank: png(svg(`${SHADOW_DEFS}<path d="${shape}" fill="#000" opacity="0.16" filter="url(#s)" transform="translate(8 12)"/><path d="${shape}" fill="#fff"/>`, OAT)),
        mask: maskOf(shape),
        overlay: png(svg(`<path d="${shape}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="3"/>`)),
        quad: quadOf(r),
        material: 'LIGHT_FABRIC',
        W, H,
      };
    }
    case 'plasticBauble': {
      // the plastic BALL (D24): the print file wraps the ball, so the visible face is a circle inside
      // the print area; a chrome cap + silver string on top, and a soft gloss highlight over the print
      const r = fit(a, 620, 660, W / 2, H / 2 + 60);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2, ry = r.h / 2;
      const ball = `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
      const capW = rx * 0.34, capH = ry * 0.13, capY = r.y - capH * 0.7;
      return {
        blank: png(svg(`${SHADOW_DEFS}<path d="${ball}" fill="#000" opacity="0.18" filter="url(#s)" transform="translate(12 18)"/><path d="${ball}" fill="#fff"/>`, OAT)),
        mask: maskOf(ball),
        overlay: png(
          svg(
            `<defs><radialGradient id="g" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="0.85" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></radialGradient>` +
              `<linearGradient id="c" x1="0" x2="1"><stop offset="0" stop-color="#8E8E8E"/><stop offset="0.45" stop-color="#F2F2F2"/><stop offset="1" stop-color="#7A7A7A"/></linearGradient></defs>` +
              `<path d="${ball}" fill="url(#g)"/>` +
              `<path d="M${cx} ${capY} C${cx - 40} ${capY - 140} ${cx + 40} ${capY - 140} ${cx} ${capY}" fill="none" stroke="#B9B6AE" stroke-width="4"/>` +
              `<rect x="${cx - capW / 2}" y="${capY}" width="${capW}" height="${capH}" rx="6" fill="url(#c)" stroke="${INK}" stroke-opacity="0.35" stroke-width="2"/>` +
              `<path d="${ball}" fill="none" stroke="${INK}" stroke-opacity="0.2" stroke-width="2"/>`,
          ),
        ),
        quad: quadOf(r),
        material: 'GLOSS',
        W, H,
      };
    }
    case 'playingCards': {
      // one card (the drawing on its back) leaning on its white presentation box
      const r = fit(a, 560, 760, W / 2 + 60, H / 2 + 40);
      const rad = Math.round(r.w * 0.06);
      const box = { x: r.x - 190, y: r.y - 120, w: r.w * 0.82, h: r.h * 0.6 };
      const card = `M${r.x + rad} ${r.y} H${r.x + r.w - rad} Q${r.x + r.w} ${r.y} ${r.x + r.w} ${r.y + rad} V${r.y + r.h - rad} Q${r.x + r.w} ${r.y + r.h} ${r.x + r.w - rad} ${r.y + r.h} H${r.x + rad} Q${r.x} ${r.y + r.h} ${r.x} ${r.y + r.h - rad} V${r.y + rad} Q${r.x} ${r.y} ${r.x + rad} ${r.y} Z`;
      return {
        blank: png(
          svg(
            `${SHADOW_DEFS}<rect x="${box.x + 10}" y="${box.y + 14}" width="${box.w}" height="${box.h}" rx="10" fill="#000" opacity="0.15" filter="url(#s)"/>` +
              `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" fill="#fff" stroke="${INK}" stroke-opacity="0.2" stroke-width="2"/>` +
              `<path d="M${box.x} ${box.y + box.h * 0.22} H${box.x + box.w}" stroke="${INK}" stroke-opacity="0.15" stroke-width="2"/>` +
              `<path d="${card}" fill="#000" opacity="0.18" filter="url(#s)" transform="translate(10 14)"/><path d="${card}" fill="#fff"/>`,
            OAT,
          ),
        ),
        mask: maskOf(card),
        overlay: png(svg(`<path d="${card}" fill="none" stroke="${INK}" stroke-opacity="0.25" stroke-width="2"/>`)),
        quad: quadOf(r),
        material: 'PAPER',
        W, H,
      };
    }
  }
}
