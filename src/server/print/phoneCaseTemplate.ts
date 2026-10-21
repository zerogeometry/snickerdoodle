import 'server-only';
import sharp from 'sharp';

/**
 * Reads one of Prodigi's per-model phone-case print templates (PNG, the print file's artboard):
 * the WHITE shape inside the black outline is the case back you see; GREY enclosed by it is a
 * camera/flash cut-out (nothing prints there); the GREY around it is the bleed that wraps round
 * the sides. Returned as masks at the print file's exact pixel size, so the preview shows the real
 * case shape and holes for that phone.
 */
export interface TracedCase {
  W: number;
  H: number;
  /** 1 = the visible case back (outline included, holes excluded) */
  face: Uint8Array;
  /** 1 = a camera / flash cut-out */
  holes: Uint8Array;
  /** fraction of the artboard that is case back — a sanity figure for tests and the seed report */
  faceShare: number;
  holeCount: number;
}

const isGrey = (r: number, g: number, b: number) => Math.abs(r - 178) <= 14 && Math.abs(g - 178) <= 14 && Math.abs(b - 178) <= 14;

export async function traceCaseTemplate(png: Buffer, W: number, H: number): Promise<TracedCase> {
  const { data } = await sharp(png).flatten({ background: '#ffffff' }).resize(W, H, { fit: 'fill', kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
  const n = W * H;
  const grey = new Uint8Array(n);
  for (let i = 0; i < n; i++) grey[i] = isGrey(data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!) ? 1 : 0;

  // the bleed: grey reachable from the artboard's edge (the outline walls it off from the holes)
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (grey[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < W; x++) {
    seed(x);
    seed((H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) {
    seed(y * W);
    seed(y * W + W - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % W;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (i >= W) seed(i - W);
    if (i < n - W) seed(i + W);
  }

  // holes: ENCLOSED grey regions big enough to be a real cut-out — the anti-aliased edges of the
  // template's instruction text are grey too, but only specks, and must not become holes
  const minHole = (W * H) / 4000;
  const raw = new Uint8Array(n);
  const seen = new Uint8Array(n);
  let holeCount = 0;
  for (let i = 0; i < n; i++) {
    if (!grey[i] || outside[i] || seen[i]) continue;
    const comp: number[] = [];
    const s = [i];
    seen[i] = 1;
    while (s.length) {
      const j = s.pop()!;
      comp.push(j);
      const x = j % W;
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) {
        if (k >= 0 && k < n && grey[k] && !outside[k] && !seen[k]) {
          seen[k] = 1;
          s.push(k);
        }
      }
    }
    if (comp.length < minHole) continue;
    // a real cut-out is roughly round/oblong and solid — not a thin sliver of bleed trapped beside
    // a side-button notch (those run down the case edge and must not read as a camera)
    let cx0 = W, cx1 = 0, cy0 = H, cy1 = 0;
    for (const j of comp) {
      const x = j % W, y = (j / W) | 0;
      if (x < cx0) cx0 = x;
      if (x > cx1) cx1 = x;
      if (y < cy0) cy0 = y;
      if (y > cy1) cy1 = y;
    }
    const bw = cx1 - cx0 + 1, bh = cy1 - cy0 + 1;
    if (bw < W * 0.04 || bh < W * 0.04 || comp.length < bw * bh * 0.3) continue;
    holeCount++;
    for (const j of comp) raw[j] = 1;
  }
  // grow each cut-out by a few px so its own drawn outline counts as the hole
  const grow = Math.max(2, Math.round(W / 300));
  const holes = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!raw[y * W + x]) continue;
      for (let dy = -grow; dy <= grow; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -grow; dx <= grow; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < W) holes[yy * W + xx] = 1;
        }
      }
    }
  }

  const face = new Uint8Array(n);
  let faceCount = 0;
  for (let i = 0; i < n; i++) {
    face[i] = !outside[i] && !holes[i] ? 1 : 0;
    faceCount += face[i]!;
  }

  return { W, H, face, holes, faceShare: faceCount / n, holeCount };
}

/** A 1-bit mask as a greyscale PNG (white = 1), sized W×H. */
export function maskPng(mask: Uint8Array, W: number, H: number): Promise<Buffer> {
  const buf = Buffer.alloc(W * H);
  for (let i = 0; i < mask.length; i++) buf[i] = mask[i] ? 255 : 0;
  return sharp(buf, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
}
