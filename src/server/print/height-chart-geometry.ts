/**
 * The HEIGHT CHART's ruler — pure maths + a pure SVG, no I/O, client-safe. One answer shared by
 * the print renderer (src/server/print/heightChart.ts), the mockup compositor, the positioner and
 * the order-time DPI gate, so the ruler you see is the ruler that prints.
 *
 * Prodigi prints NO markings on the canvas — the cm and ft/in scale is drawn INTO the print file.
 * The scale is in TRUE physical units from the print file's own DPI (Prodigi's printAreaSizes are
 * the physical canvas: 1200×7200px @150dpi = 8×48″), so a mark at "100" sits exactly 100 cm above
 * the floor once the chart hangs with its bottom edge {@link HEIGHT_CHART_FLOOR_CM} above it.
 *
 * Layout: a white RULER BAND down the left edge (cm ticks on the outer edge — where you'd hold the
 * pencil — feet & inches on the inner edge of the band); the drawing is placed in the ART AREA to
 * its right, never underneath the ruler. The digits are drawn as stroked paths (a tiny built-in
 * marker-style font), so the browser and the print renderer can't disagree and no font file is
 * needed to print.
 */
import { mmToPx, type TemplateGeom } from './geometry';

export const HEIGHT_CHART_KEY = 'heightChart';
export const isHeightChart = (key: string | null | undefined): boolean => !!key && (key === HEIGHT_CHART_KEY || key.startsWith(`${HEIGHT_CHART_KEY}-`));

/** Where the chart's BOTTOM EDGE hangs above the floor, in cm — the scale starts here.
 * FOUNDER DECISION PENDING (recommended 30 cm: clears a skirting board, and a 120 cm chart then
 * reads ~32–150 cm — about a 1-year-old to a 12-year-old; a 150 cm chart reads ~32–180 cm). */
export const HEIGHT_CHART_FLOOR_CM = 30;
/** The ruler band's width — wide enough that the cm and the ft labels sit in separate columns. */
export const RULER_BAND_MM = 64;
/** The wooden poster hangers clamp the top and bottom edges: no tick or label inside this. */
export const HANGER_MARGIN_MM = 25;

const INK = '#2B2118'; // cocoa — the brand's ink, never pure black
const CM_PER_IN = 2.54;

export interface HeightChartLayout {
  width: number;
  height: number;
  dpi: number;
  /** ruler band width (px), from x = 0 */
  bandPx: number;
  /** the art area: x = bandPx … width, full height */
  art: { x: number; width: number; height: number };
}

export function heightChartLayout(canvas: { width: number; height: number }, dpi: number): HeightChartLayout {
  const bandPx = Math.min(Math.round(canvas.width / 2), mmToPx(RULER_BAND_MM, dpi));
  return { width: canvas.width, height: canvas.height, dpi, bandPx, art: { x: bandPx, width: canvas.width - bandPx, height: canvas.height } };
}

/** The ART AREA as a placement geometry (no bleed: Prodigi's height-chart file carries none) — the
 * drawing's transform resolves against THIS, so contain/cover fit beside the ruler, not under it. */
export function heightChartArtGeom(t: TemplateGeom): TemplateGeom {
  const lay = heightChartLayout({ width: t.printWidthPx, height: t.printHeightPx }, t.requiredDpi);
  return { printWidthPx: lay.art.width, printHeightPx: lay.art.height, bleedMm: 0, requiredDpi: t.requiredDpi };
}

/** The y (px, from the top of the print file) of a mark `cm` above the FLOOR. Exact (unrounded). */
export function yForHeightCm(cm: number, layout: Pick<HeightChartLayout, 'height' | 'dpi'>, floorCm = HEIGHT_CHART_FLOOR_CM): number {
  return layout.height - ((cm - floorCm) / CM_PER_IN) * layout.dpi;
}

export interface RulerTick {
  /** exact y in px */
  y: number;
  /** cm above the floor (cm ticks) or inches above the floor (inch ticks) */
  value: number;
  kind: 'minor' | 'mid' | 'major';
  /** the label printed beside a major tick ("100", "4ft"), else null */
  label: string | null;
}

/** Every tick on the ruler: cm (1 / 5 / 10) and inches (1 / 6 / 12), within the hanger margins. */
export function rulerTicks(layout: HeightChartLayout, floorCm = HEIGHT_CHART_FLOOR_CM): { cm: RulerTick[]; inch: RulerTick[] } {
  const margin = (HANGER_MARGIN_MM / 25.4) * layout.dpi;
  const inside = (y: number) => y >= margin && y <= layout.height - margin;
  const topCm = floorCm + (layout.height / layout.dpi) * CM_PER_IN;
  const cm: RulerTick[] = [];
  for (let v = Math.ceil(floorCm); v <= Math.floor(topCm); v++) {
    const y = yForHeightCm(v, layout, floorCm);
    if (!inside(y)) continue;
    const kind = v % 10 === 0 ? 'major' : v % 5 === 0 ? 'mid' : 'minor';
    cm.push({ y, value: v, kind, label: kind === 'major' ? String(v) : null });
  }
  const inch: RulerTick[] = [];
  for (let v = Math.ceil(floorCm / CM_PER_IN); v <= Math.floor(topCm / CM_PER_IN); v++) {
    const y = yForHeightCm(v * CM_PER_IN, layout, floorCm);
    if (!inside(y)) continue;
    const kind = v % 12 === 0 ? 'major' : v % 6 === 0 ? 'mid' : 'minor';
    inch.push({ y, value: v, kind, label: kind === 'major' ? `${v / 12}ft` : null });
  }
  return { cm, inch };
}

// ── A tiny stroked "marker" font: digits + the letters c m f t. Glyphs live in a box 1 unit tall
// (cap height; y down, baseline at 1) and `w` wide; drawn with round caps at ~0.13 of the height.
const GLYPHS: Record<string, { w: number; d: string }> = {
  '0': { w: 0.6, d: 'M0.3 0C0.05 0 0 0.3 0 0.5S0.05 1 0.3 1 0.6 0.7 0.6 0.5 0.55 0 0.3 0Z' },
  '1': { w: 0.4, d: 'M0.05 0.22L0.3 0V1' },
  '2': { w: 0.6, d: 'M0.03 0.22C0.08 0.02 0.52-0.04 0.56 0.22 0.6 0.45 0.2 0.65 0.02 1H0.6' },
  '3': { w: 0.6, d: 'M0.05 0.1C0.2-0.05 0.58 0 0.55 0.25 0.53 0.42 0.4 0.47 0.25 0.48 0.45 0.48 0.6 0.58 0.6 0.74 0.6 1.02 0.15 1.05 0.02 0.88' },
  '4': { w: 0.6, d: 'M0.45 1V0L0 0.7H0.6' },
  '5': { w: 0.6, d: 'M0.55 0H0.1L0.05 0.45C0.25 0.35 0.6 0.4 0.6 0.68 0.6 1 0.2 1.05 0.02 0.88' },
  '6': { w: 0.6, d: 'M0.5 0.05C0.2 0 0 0.3 0 0.62 0 0.9 0.15 1 0.3 1 0.5 1 0.6 0.85 0.6 0.68 0.6 0.48 0.45 0.38 0.3 0.38 0.15 0.38 0.03 0.48 0 0.6' },
  '7': { w: 0.6, d: 'M0 0H0.6L0.2 1' },
  '8': { w: 0.6, d: 'M0.3 0.47C0.08 0.47 0.05 0.25 0.08 0.18 0.12 0.03 0.48 0.03 0.52 0.18 0.55 0.25 0.52 0.47 0.3 0.47 0.05 0.47 0 0.65 0 0.75 0 0.95 0.15 1 0.3 1S0.6 0.95 0.6 0.75 0.55 0.47 0.3 0.47Z' },
  '9': { w: 0.6, d: 'M0.1 0.95C0.4 1 0.6 0.7 0.6 0.38 0.6 0.1 0.45 0 0.3 0 0.1 0 0 0.15 0 0.32 0 0.52 0.15 0.62 0.3 0.62 0.45 0.62 0.57 0.52 0.6 0.4' },
  c: { w: 0.5, d: 'M0.5 0.5C0.4 0.38 0 0.38 0 0.7S0.4 1.02 0.5 0.9' },
  m: { w: 0.6, d: 'M0 1V0.42M0 0.55C0.05 0.38 0.3 0.38 0.3 0.55V1M0.3 0.55C0.35 0.38 0.6 0.38 0.6 0.55V1' },
  f: { w: 0.4, d: 'M0.4 0.05C0.3-0.02 0.15 0 0.15 0.2V1M0 0.42H0.35' },
  t: { w: 0.4, d: 'M0.15 0.1V0.88C0.15 1 0.28 1.02 0.38 0.96M0 0.42H0.35' },
};
const GAP = 0.2;

/** Width of a label in glyph units (× the cap height for px). */
export function labelWidthUnits(text: string): number {
  let w = 0;
  for (const ch of text) w += (GLYPHS[ch]?.w ?? 0.6) + GAP;
  return Math.max(0, w - GAP);
}

/** SVG for a label with its baseline-left at (x, yBaseline), cap height h px. */
function labelSvg(text: string, x: number, yBaseline: number, h: number): string {
  let cx = x;
  const parts: string[] = [];
  for (const ch of text) {
    const g = GLYPHS[ch];
    // drawn in unit space under scale(h), so the stroke width is in units too (0.13 of the height)
    if (g) parts.push(`<path transform="translate(${r2(cx)} ${r2(yBaseline - h)}) scale(${r2(h)})" stroke-width="0.13" d="${g.d}"/>`);
    cx += ((g?.w ?? 0.6) + GAP) * h;
  }
  return parts.join('');
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The ruler BAND as an SVG of exactly `layout.bandPx × layout.height` px (white, cocoa ink).
 * Tick lines are centred on their exact y (a 0.5 mm stroke), so the printed scale is exact to
 * well under a pixel. Labels sit just above-centre of their tick.
 */
export function rulerBandSvg(layout: HeightChartLayout, floorCm = HEIGHT_CHART_FLOOR_CM): string {
  const mm = layout.dpi / 25.4;
  const { cm, inch } = rulerTicks(layout, floorCm);
  const band = layout.bandPx;
  const stroke = Math.max(1, 0.5 * mm);
  const len = { minor: 5 * mm, mid: 9 * mm, major: 14 * mm } as const;
  const capH = 6 * mm;
  const ticks: string[] = [];
  for (const t of cm) ticks.push(`M0 ${r2(t.y)}H${r2(len[t.kind])}`);
  for (const t of inch) ticks.push(`M${r2(band)} ${r2(t.y)}H${r2(band - len[t.kind])}`);
  const labels: string[] = [];
  for (const t of cm) if (t.label) labels.push(labelSvg(t.label, len.major + 2 * mm, t.y + capH / 2, capH));
  for (const t of inch) if (t.label) labels.push(labelSvg(t.label, band - len.major - 2 * mm - labelWidthUnits(t.label) * capH, t.y + capH / 2, capH));
  // the units, once each, just above the lowest labelled ticks' columns
  const lowCm = cm.find((t) => t.label);
  const units: string[] = []; // (the ft labels carry their own unit: "4ft")
  if (lowCm) units.push(labelSvg('cm', len.major + 2 * mm, lowCm.y - capH * 1.4, capH * 0.8));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${band}" height="${layout.height}" viewBox="0 0 ${band} ${layout.height}">` +
    `<rect width="${band}" height="${layout.height}" fill="#ffffff"/>` +
    `<path d="${ticks.join('')}" stroke="${INK}" stroke-width="${r2(stroke)}" fill="none"/>` +
    `<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">${labels.concat(units).join('')}</g>` +
    `</svg>`
  );
}
