import 'server-only';
import { drawnKit, type DrawnMockup } from './drawnMockups';
import { strapHoles, strapPiecePaths, strapSizeForCanvas } from '@/lib/watch-strap';

const { W, H, OAT, INK, SHADOW_DEFS, fit, svg, png, quadOf } = drawnKit;

/**
 * The DRAWN Apple Watch strap — the strap's mockup until the founder's photos are in (seedMockups → 'drawn-strap'),
 * in the same calm style as the other drawn products (drawnMockups.ts). `print` is the print file's px: the two
 * sizes have different files, so the shape picks the strap.
 */
export function drawWatchStrapMockup(print: { w: number; h: number }): DrawnMockup {
  const a = print.w / print.h;
  // the strap laid out straight, buckle half on top: the print file runs the whole length, but only the two
  // leather halves print (Prodigi's template, traced in src/lib/watch-strap.ts) — the middle sits behind the
  // watch and the holes are punched through. So the art shows exactly where it will be on the strap.
  const strap = strapSizeForCanvas(print.w, print.h);
  const r = fit(a, 420, 1180, W / 2, H / 2);
  const [upper, lower] = strapPiecePaths(strap, r) as [string, string];
  const holes = strapHoles(strap, r);
  const holeEls = (fill: string, extra = '') => holes.map((o) => `<ellipse cx="${o.cx}" cy="${o.cy}" rx="${o.rx}" ry="${o.ry}" fill="${fill}"${extra}/>`).join('');
  // the watch over the gap: the middle of the file, between the halves (y fractions from the trace)
  const gapTop = r.y + strap.pieces[0]!.at(-1)![0] * r.h, gapBottom = r.y + strap.pieces[1]![0]![0] * r.h;
  const cx = r.x + r.w / 2;
  // the case just covers the gap (a little onto each half, where the lugs clip in) — never onto the print
  const caseW = r.w * 1.65, caseH = gapBottom - gapTop + r.w * 0.16;
  const caseY = (gapTop + gapBottom) / 2 - caseH / 2;
  const screen = { x: cx - caseW * 0.4, y: caseY + caseW * 0.1, w: caseW * 0.8, h: caseH - caseW * 0.2 };
  const crown = `<rect x="${cx + caseW / 2 - 2}" y="${caseY + caseH * 0.25}" width="${r.w * 0.16}" height="${caseH * 0.2}" rx="4" fill="#3A3633"/>`;
  // the buckle: a black frame across the top end
  const top = r.y + strap.pieces[0]![0]![0] * r.h;
  const buckle = `<rect x="${r.x - r.w * 0.02}" y="${top - r.w * 0.34}" width="${r.w * 1.04}" height="${r.w * 0.42}" rx="${r.w * 0.12}" fill="none" stroke="#2B2B2B" stroke-width="${r.w * 0.09}"/>`;
  return {
    blank: png(svg(`${SHADOW_DEFS}<g filter="url(#s)" opacity="0.18" transform="translate(10 14)"><path d="${upper}"/><path d="${lower}"/></g><path d="${upper}" fill="#fff"/><path d="${lower}" fill="#fff"/>`, OAT)),
    mask: png(svg(`<path d="${upper}" fill="#fff"/><path d="${lower}" fill="#fff"/>${holeEls('#000')}`, '#000')),
    overlay: png(
      svg(
        `${SHADOW_DEFS}<path d="${upper}" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="2"/><path d="${lower}" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="2"/>` +
          holeEls(OAT, ` stroke="${INK}" stroke-opacity="0.35" stroke-width="1.5"`) + buckle +
          `<rect x="${cx - caseW / 2 + 8}" y="${caseY + 12}" width="${caseW}" height="${caseH}" rx="${caseW * 0.28}" fill="#000" opacity="0.2" filter="url(#s)"/>` +
          `<rect x="${cx - caseW / 2}" y="${caseY}" width="${caseW}" height="${caseH}" rx="${caseW * 0.28}" fill="#3A3633"/>${crown}` +
          `<rect x="${screen.x}" y="${screen.y}" width="${screen.w}" height="${screen.h}" rx="${screen.w * 0.24}" fill="#151515"/>` +
          `<path d="M${screen.x + screen.w * 0.12} ${screen.y + screen.h * 0.3} Q${screen.x + screen.w * 0.3} ${screen.y + screen.h * 0.08} ${screen.x + screen.w * 0.62} ${screen.y + screen.h * 0.1}" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="6" stroke-linecap="round"/>`,
      ),
    ),
    quad: quadOf(r),
    material: 'PAPER',
    W, H,
  };
}
