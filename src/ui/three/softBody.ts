import * as THREE from 'three';

/**
 * Soft-goods geometry engine for the Tier-C spin views — the 3D sibling of the 2D
 * compositor's fabric registration. A product silhouette (a closed outline in mm,
 * optionally with holes such as a neck opening) is INFLATED into a soft pillow form
 * via its own signed-distance field, with a gentle per-product fold field baked in.
 *
 * The honesty rule carried over from the compositor: the PRINT is sampled from the
 * SAME height function as the fabric surface — the art follows the folds because it
 * literally lies on them, never eyeballed. Print placement mirrors the 2D seeder's
 * registration plan (face-cover = the front surface UV-mapped over the silhouette
 * bbox; panel = a patch rect with the print canvas aspect-locked inside it), so the
 * photo preview and the spin view can never disagree about where or how big the
 * print sits.
 *
 * Everything is parametric and code-built (no marketplace GLBs — licences forbid raw
 * model distribution; an inflated polygon carries none), shared client-side maths.
 */

export type Pt = [number, number];

/** Sample an absolute-command SVG path (M/L/C/Z, the subset our silhouettes use)
 * into a closed polygon. Curves are flattened at `samples` steps each. */
export function pathToPolygon(d: string, samples = 12): Pt[] {
  const nums = (s: string) => s.trim().split(/[\s,]+/).map(Number);
  const tokens = d.match(/[MLCZ][^MLCZ]*/gi) ?? [];
  const poly: Pt[] = [];
  let cur: Pt = [0, 0];
  for (const t of tokens) {
    const cmd = t[0]!.toUpperCase();
    const args = t.length > 1 ? nums(t.slice(1)) : [];
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < args.length; i += 2) {
        cur = [args[i]!, args[i + 1]!];
        poly.push(cur);
      }
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < args.length; i += 6) {
        const [x1, y1, x2, y2, x, y] = [args[i]!, args[i + 1]!, args[i + 2]!, args[i + 3]!, args[i + 4]!, args[i + 5]!];
        const [x0, y0] = cur;
        for (let s = 1; s <= samples; s++) {
          const u = s / samples;
          const v = 1 - u;
          poly.push([
            v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x,
            v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y,
          ]);
        }
        cur = [x, y];
      }
    }
    // Z closes implicitly — the polygon is treated as closed.
  }
  return poly;
}

export const scalePolygon = (poly: Pt[], s: number): Pt[] => poly.map(([x, y]) => [x * s, y * s]);

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function polygonBounds(polys: Pt[][]): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of polys)
    for (const [x, y] of poly) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return { x0, y0, x1, y1 };
}

/** Point-in-polygon (even-odd) + unsigned distance to the outline, with the nearest
 * boundary point (for clamping mesh vertices that fall just outside). */
function analyse(x: number, y: number, outline: Pt[], holes: Pt[][]): { inside: boolean; dist: number; nearest: Pt } {
  let dist = Infinity;
  let nearest: Pt = [x, y];
  let crossings = 0;
  const rings = [outline, ...holes];
  let inHole = false;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]!;
    let cross = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      // distance to segment
      const dx = xj - xi;
      const dy = yj - yi;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / len2)) : 0;
      const px = xi + t * dx;
      const py = yi + t * dy;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < dist * dist) {
        dist = Math.sqrt(d2);
        nearest = [px, py];
      }
      // even-odd ray cast (horizontal +x ray)
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) cross++;
    }
    if (r === 0) crossings = cross;
    else if (cross % 2 === 1) inHole = true;
  }
  return { inside: crossings % 2 === 1 && !inHole, dist, nearest };
}

export interface SoftBodyOptions {
  /** Closed silhouette in mm, y pointing DOWN (SVG/blank convention). */
  outline: Pt[];
  /** Holes (e.g. neck opening), same convention. */
  holes?: Pt[][];
  /** Max inflation of the front surface, mm. */
  puff: number;
  /** Back-surface inflation, mm (default 60% of puff). */
  backPuff?: number;
  /** Extra fold field (mm) added to the surface — the cloth character. It fades to
   * zero at the silhouette edge so the outline stays crisp. */
  fold?: (x: number, y: number) => number;
  /** Grid cells across the silhouette's longest side. */
  grid?: number;
  /** Rounded-edge plateau: distance (mm) at which the pillow reaches full height.
   * Default 22% of the smaller bbox side. */
  plateau?: number;
  /** Map the FRONT surface's UVs over the silhouette bbox (the 2D face-cover
   * registration) so a print texture covers the face; otherwise UVs are zero. */
  faceCoverUV?: boolean;
}

export interface SoftBody {
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  /** The front surface height (mm) at a point — THE shared truth the print patch
   * samples so art always lies on the fabric. 0 outside the silhouette. */
  heightAt: (x: number, y: number) => number;
  bounds: Bounds;
  /** Centre used when converting blank-space (y down) to scene space (y up). */
  centre: Pt;
}

/**
 * Inflate a silhouette into front+back pillow surfaces. Scene mapping: blank-space
 * (x right, y down) → three.js (x right, y up, z toward the viewer): a vertex at
 * (x, y, h) becomes (x − cx, cy − y, h).
 */
export function buildSoftBody(opts: SoftBodyOptions): SoftBody {
  const { outline, holes = [], puff, fold } = opts;
  const backPuff = opts.backPuff ?? puff * 0.6;
  const bounds = polygonBounds([outline]);
  const bw = bounds.x1 - bounds.x0;
  const bh = bounds.y1 - bounds.y0;
  const plateau = opts.plateau ?? 0.22 * Math.min(bw, bh);
  const fadeDist = 0.1 * Math.min(bw, bh);
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;

  const heightFor = (dist: number, x: number, y: number): number => {
    const base = puff * Math.sqrt(Math.min(1, dist / plateau));
    const fade = Math.min(1, dist / fadeDist);
    return base + (fold ? fold(x, y) * fade : 0);
  };
  const heightAt = (x: number, y: number): number => {
    const a = analyse(x, y, outline, holes);
    return a.inside ? heightFor(a.dist, x, y) : 0;
  };

  const grid = opts.grid ?? 96;
  const nx = bw >= bh ? grid : Math.max(8, Math.round((grid * bw) / bh));
  const ny = bw >= bh ? Math.max(8, Math.round((grid * bh) / bw)) : grid;

  // Sample the grid once; clamp outside vertices to their nearest boundary point.
  const W = nx + 1;
  const H = ny + 1;
  const px = new Float64Array(W * H);
  const py = new Float64Array(W * H);
  const pz = new Float64Array(W * H); // front height
  const inside = new Uint8Array(W * H);
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const i = gy * W + gx;
      const x = bounds.x0 + (bw * gx) / nx;
      const y = bounds.y0 + (bh * gy) / ny;
      const a = analyse(x, y, outline, holes);
      inside[i] = a.inside ? 1 : 0;
      if (a.inside) {
        px[i] = x;
        py[i] = y;
        pz[i] = heightFor(a.dist, x, y);
      } else {
        px[i] = a.nearest[0];
        py[i] = a.nearest[1];
        pz[i] = 0;
      }
    }
  }

  const makeSurface = (sign: 1 | -1, depth: number): THREE.BufferGeometry => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const map = new Int32Array(W * H).fill(-1);
    const vertexOf = (i: number): number => {
      if (map[i] === -1) {
        const z = sign === 1 ? pz[i]! : -(pz[i]! * (depth / (puff || 1)));
        positions.push(px[i]! - cx, cy - py[i]!, z);
        uvs.push((px[i]! - bounds.x0) / bw, 1 - (py[i]! - bounds.y0) / bh);
        map[i] = positions.length / 3 - 1;
      }
      return map[i]!;
    };
    for (let gy = 0; gy < ny; gy++) {
      for (let gx = 0; gx < nx; gx++) {
        const i00 = gy * W + gx;
        const i10 = i00 + 1;
        const i01 = i00 + W;
        const i11 = i01 + 1;
        const tri = (a: number, b: number, c: number) => {
          if (inside[a] || inside[b] || inside[c]) {
            if (sign === 1) indices.push(vertexOf(a), vertexOf(c), vertexOf(b));
            else indices.push(vertexOf(a), vertexOf(b), vertexOf(c));
          }
        };
        // grid y is DOWN in blank space → flipped to scene y up; windings account for it
        tri(i00, i10, i11);
        tri(i00, i11, i01);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(opts.faceCoverUV ? uvs : uvs.map(() => 0), 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  return { front: makeSurface(1, puff), back: makeSurface(-1, backPuff), heightAt, bounds, centre: [cx, cy] };
}

/**
 * A print patch lying ON the soft body: a fine grid over `rect` (blank-space mm)
 * sampling the body's own height function + a small normal offset. UVs span [0,1]
 * over the rect — the rect IS the print canvas (aspect-locked by the caller via
 * {@link containRect}), so the painted placement maps 1:1, exactly like the 2D
 * panel registration.
 */
export function buildPrintPatch(body: SoftBody, rect: { x: number; y: number; w: number; h: number }, lift = 0.6): THREE.BufferGeometry {
  const [cx, cy] = body.centre;
  const n = 40;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let gy = 0; gy <= n; gy++) {
    for (let gx = 0; gx <= n; gx++) {
      const x = rect.x + (rect.w * gx) / n;
      const y = rect.y + (rect.h * gy) / n;
      positions.push(x - cx, cy - y, body.heightAt(x, y) + lift);
      uvs.push(gx / n, 1 - gy / n);
    }
  }
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const a = gy * (n + 1) + gx;
      indices.push(a, a + n + 2, a + 1, a, a + n + 1, a + n + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Aspect-locked CONTAIN of a w:h canvas inside a region — the same registration the
 * 2D seeder uses for panel-contain, so 3D print size/position equals the photo view. */
export function containRect(region: { x: number; y: number; w: number; h: number }, canvasW: number, canvasH: number): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(region.w / canvasW, region.h / canvasH);
  const w = canvasW * scale;
  const h = canvasH * scale;
  return { x: region.x + (region.w - w) / 2, y: region.y + (region.h - h) / 2, w, h };
}
