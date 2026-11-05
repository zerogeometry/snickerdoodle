/**
 * Draws the floating background doodles the way a child would: wobbly lines, lopsided shapes, ends
 * that overshoot or don't quite meet, crayon pressure that thickens and thins, and zigzag colouring
 * that wanders over the lines. Deterministic (seeded), so the output only changes when this changes.
 *
 *   node scripts/brand/doodle-paths.mjs        → writes src/ui/components/doodlePaths.ts
 *
 * Each shape becomes a few <path>s grouped by stroke width (round caps, so neighbouring pieces of
 * one line join seamlessly into a single wobbly crayon stroke). No filters, no runtime randomness.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom through the control points → a dense polyline. */
function smooth(pts, closed = false, per = 8) {
  const n = pts.length;
  const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(closed ? [...pts[0]] : [...pts[n - 1]]);
  return out;
}

/** A hand-drawn loop around (cx, cy): lumpy radius, and the pen runs past the start (or stops short). */
function loop(r, cx, cy, rx, ry, { lumps = 0.08, overshoot = 0.12, start = r() * Math.PI * 2 } = {}) {
  const k = 14;
  const sweep = Math.PI * 2 * (1 + (r() < 0.75 ? overshoot * (0.5 + r()) : -overshoot * 0.4));
  const ph = [r() * 6.28, r() * 6.28];
  const pts = [];
  for (let i = 0; i <= k; i++) {
    const a = start + (sweep * i) / k;
    const f = 1 + lumps * (Math.sin(a * 2 + ph[0]) * 0.6 + Math.sin(a * 3 + ph[1]) * 0.4) + (r() - 0.5) * lumps * 0.6;
    // the overshooting tail drifts outward a little, as a real pen does
    const drift = i > k * 0.9 ? 1 + (i / k - 0.9) * 0.5 : 1;
    pts.push([cx + Math.cos(a) * rx * f * drift, cy + Math.sin(a) * ry * f * drift]);
  }
  return smooth(pts, false, 6);
}

/** Wobble a dense polyline sideways with low-frequency noise + a little tremor. */
function wobble(r, pts, amp) {
  const f = [0.35 + r() * 0.25, 0.9 + r() * 0.5];
  const ph = [r() * 6.28, r() * 6.28];
  let s = 0;
  return pts.map((p, i) => {
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    const o = amp * (0.65 * Math.sin(s * f[0] + ph[0]) + 0.35 * Math.sin(s * f[1] + ph[1])) + (r() - 0.5) * amp * 0.08;
    return [p[0] + nx * o, p[1] + ny * o];
  });
}

/** A crayon stroke: split into short overlapping pieces whose width follows the "pressure". */
function crayon(r, pts, base, out) {
  const ph = r() * 6.28;
  const f = 0.25 + r() * 0.2;
  let s = 0;
  const w = pts.map((p, i) => {
    if (i) s += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const t = i / (pts.length - 1);
    const press = 1 + 0.3 * Math.sin(s * f + ph) + 0.18 * (1 - t) - (t > 0.85 ? (t - 0.85) * 2.2 : 0);
    return base * press;
  });
  const step = 3;
  for (let i = 0; i < pts.length - 1; i += step) {
    const seg = pts.slice(i, Math.min(pts.length, i + step + 1));
    if (seg.length < 2) continue;
    const ww = w.slice(i, i + step + 1);
    const avg = Math.round((ww.reduce((a, b) => a + b, 0) / ww.length) * 4) / 4;
    const d = `M${seg.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`;
    (out[avg] ??= []).push(d);
  }
}

/** Back-and-forth colouring-in inside a box, not quite staying in the lines. */
function scribble(r, x0, y0, x1, y1, rows, inside = () => true) {
  const pts = [];
  for (let i = 0; i <= rows; i++) {
    const y = y0 + ((y1 - y0) * i) / rows + (r() - 0.5) * 2;
    let xs = [];
    for (let x = x0; x <= x1; x += 0.8) if (inside(x, y)) xs.push(x);
    if (!xs.length) continue;
    const a = xs[0] - 0.8 - r() * 1.8; // over the line a bit
    const b = xs[xs.length - 1] + 0.4 + r() * 1.5;
    pts.push(i % 2 ? [b, y] : [a, y]);
    const drop = ((y1 - y0) / rows) * (0.6 + r() * 0.8); // slanted, unevenly spaced strokes
    pts.push(i % 2 ? [a, y + drop] : [b, y + drop]);
  }
  return pts;
}

/** Straight-ish line drawn by hand: a slight bow + tremor, densified so it can wobble. */
function line(r, a, b, bow = 0.6) {
  const pts = [];
  const n = Math.max(4, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.4));
  const k = (r() - 0.5) * 2 * bow;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    const off = Math.sin(t * Math.PI) * k;
    pts.push([a[0] + (b[0] - a[0]) * t + (nx / len) * off, a[1] + (b[1] - a[1]) * t + (ny / len) * off]);
  }
  return pts;
}

const SHAPES = {
  heart(r) {
    const out = {};
    const pts = smooth(
      [
        [24, 41],
        [13, 31],
        [6.5, 21],
        [8, 12],
        [15, 9],
        [22, 14.5],
        [26, 10],
        [33, 7.5],
        [40.5, 12],
        [41, 21.5],
        [35, 31],
        [24.5, 41.5],
        [21.5, 39.8],
      ],
      false,
      6,
    );
    crayon(r, wobble(r, pts, 0.7), 3.1, out);
    const inHeart = (x, y) => y > 14 + Math.abs(x - 24) * 0.12 && y < 39 - Math.abs(x - 24) * 0.95 && x > 9 && x < 39;
    crayon(r, wobble(r, scribble(r, 9, 13, 39, 36, 7, inHeart), 0.35), 1.6, out);
    return { w: 48, h: 48, out };
  },
  star(r) {
    const out = {};
    const pts = [];
    const spin = -Math.PI / 2 + (r() - 0.5) * 0.3;
    for (let i = 0; i < 10; i++) {
      const a = spin + (i * Math.PI) / 5;
      const R = i % 2 ? 8 + r() * 3 : 18 + r() * 5; // arms of different lengths
      pts.push([24 + Math.cos(a) * R, 25 + Math.sin(a) * R]);
    }
    pts.push([pts[0][0] + 2.2, pts[0][1] + 1.6]); // last arm doesn't quite meet the first
    const dense = pts.flatMap((p, i) => (i ? line(r, pts[i - 1], p, 0.5).slice(1) : [p]));
    crayon(r, wobble(r, dense, 0.45), 3, out);
    return { w: 48, h: 48, out };
  },
  cloud(r) {
    const out = {};
    const pts = smooth(
      [
        [9, 31],
        [5.5, 25],
        [10, 18.5],
        [17, 18],
        [20, 10.5],
        [30, 7.5],
        [37, 13],
        [40, 11.5],
        [48, 15],
        [51, 23],
        [49, 30],
        [41, 32.2],
        [26, 31.4],
        [11.5, 32.5],
        [8, 29.5],
      ],
      false,
      6,
    );
    crayon(r, wobble(r, pts, 0.8), 3, out);
    return { w: 58, h: 40, out };
  },
  squiggle(r) {
    const out = {};
    const pts = [];
    for (let x = 3; x <= 61; x += 0.9) {
      const amp = 6 + 2.5 * Math.sin(x * 0.13 + 1);
      pts.push([x, 12 + Math.sin(x * 0.42) * amp * (0.85 + r() * 0.15)]);
    }
    crayon(r, wobble(r, pts, 0.5), 3, out);
    return { w: 64, h: 24, out };
  },
  sun(r) {
    const out = {};
    crayon(r, wobble(r, loop(r, 24, 24, 9.5, 9, { lumps: 0.07 }), 0.4), 3, out);
    // a face — kids' suns are always smiling
    crayon(r, line(r, [20.3, 21], [20.6, 22.6], 0.1), 2.6, out);
    crayon(r, line(r, [27.4, 20.6], [27.5, 22.3], 0.1), 2.6, out);
    crayon(r, smooth([[19, 26.5], [23.5, 29.6], [29, 25.8]], false, 6), 2.2, out);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + (r() - 0.5) * 0.35;
      const r0 = 13 + r() * 1.5;
      const r1 = r0 + 4.5 + r() * 5;
      crayon(r, line(r, [24 + Math.cos(a) * r0, 24 + Math.sin(a) * r0], [24 + Math.cos(a) * r1, 24 + Math.sin(a) * r1], 0.5), 2.6, out);
    }
    return { w: 48, h: 48, out };
  },
  balloon(r) {
    const out = {};
    crayon(r, wobble(r, loop(r, 17, 17, 12, 14.5, { lumps: 0.06, start: Math.PI * 0.55 }), 0.5), 3, out);
    crayon(r, smooth([[15, 31.5], [13.2, 35], [20, 35.2], [18, 31.4]], false, 5), 2.2, out); // the knot
    crayon(r, wobble(r, smooth([[17, 35.5], [21, 40], [14.5, 44], [19.5, 50]], false, 8), 0.3), 1.7, out);
    crayon(r, smooth([[9.5, 15], [10.5, 10], [14, 7]], false, 6), 1.9, out); // the shine
    crayon(r, line(r, [9.4, 18.4], [9.5, 19.6], 0.05), 1.9, out);
    return { w: 34, h: 52, out };
  },
  house(r) {
    const out = {};
    const body = [
      [11.5, 21],
      [10.5, 39],
      [33.5, 39.8],
      [32.5, 20.5],
    ];
    const dense = [...line(r, body[0], body[1], 0.7), ...line(r, body[1], body[2], 0.6).slice(1), ...line(r, body[2], body[3], 0.7).slice(1)];
    crayon(r, wobble(r, dense, 0.35), 2.8, out);
    // the roof overshoots the walls on both sides
    crayon(r, wobble(r, [...line(r, [6, 23.5], [21.5, 8], 0.6), ...line(r, [21.5, 8], [38, 22.5], 0.6).slice(1)], 0.3), 3, out);
    crayon(r, line(r, [19, 39.4], [19.5, 30], 0.3).concat(line(r, [19.5, 30], [25, 30.5], 0.2).slice(1), line(r, [25, 30.5], [25.3, 39.6], 0.3).slice(1)), 2.2, out); // door
    crayon(r, wobble(r, loop(r, 16, 26, 2.6, 2.4, { lumps: 0.1 }), 0.15), 1.8, out); // round window
    crayon(r, [...line(r, [29, 13], [29, 6.5], 0.2), ...line(r, [29, 6.5], [32.5, 6.8], 0.2).slice(1), ...line(r, [32.5, 6.8], [32.8, 16], 0.2).slice(1)], 2.2, out); // chimney
    crayon(r, wobble(r, smooth([[31, 5], [34, 2.5], [37.5, 4], [40, 1.8], [44, 3]], false, 6), 0.2), 1.7, out); // curly smoke
    return { w: 48, h: 44, out };
  },
};

const seeds = { heart: 11, star: 7, cloud: 23, squiggle: 5, sun: 31, balloon: 17, house: 3 };
const lines = [];
for (const [name, draw] of Object.entries(SHAPES)) {
  const { w, h, out } = draw(rng(seeds[name]));
  const strokes = Object.entries(out)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([width, ds]) => `{ w: ${Number(width)}, d: '${ds.join('')}' }`);
  lines.push(`  ${name}: { vb: [${w}, ${h}], strokes: [${strokes.join(', ')}] },`);
}

const file = `// GENERATED by scripts/brand/doodle-paths.mjs — edit the generator, not this file.
// The floating doodles, drawn like a child would: wobbly, lopsided, uneven crayon pressure.

export type DoodleStroke = { w: number; d: string };
export type DoodlePath = { vb: [number, number]; strokes: DoodleStroke[] };

export const DOODLE_PATHS = {
${lines.join('\n')}
} satisfies Record<string, DoodlePath>;
`;
writeFileSync(path.join(ROOT, 'src', 'ui', 'components', 'doodlePaths.ts'), file);
console.log(`doodlePaths.ts  ${(file.length / 1024).toFixed(1)} KB`);
