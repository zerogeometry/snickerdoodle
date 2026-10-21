import 'server-only';
import sharp from 'sharp';
import { PHONE_MODELS, type CaseFinish, type CaseGrade } from '@/lib/phone-cases';
import { maskPng, type TracedCase } from './phoneCaseTemplate';

/**
 * A DRAWN phone-case mockup (no photography yet): the case back at the exact proportions of
 * Prodigi's print file for that phone, with the camera cut-out where that family of phone has
 * it. The child's design is warped onto the whole print area (the wrap), clipped to the case
 * shape; the camera cut-out rides on top as the overlay (nothing prints there). Camera layouts
 * are per FAMILY, close but not to-the-millimetre — Prodigi's per-model print templates would make
 * them exact (brief: PHONE-TABLET-CASES.md §4). Brand-safe by construction: nothing here is a
 * child's image.
 */

type Box = { x0: number; y0: number; x1: number; y1: number }; // fractions of the case body
type Camera = { shape: 'island' | 'slot' | 'bar' | 'pill'; box: Box; lenses: number };

/** Where the camera sits on the BACK of the case (viewed from behind: it's top-LEFT). */
export function cameraFor(model: string): Camera {
  const m = model.toLowerCase();
  // iPhone 17 Pro / Pro Max, 18 Pro / Pro Max: the full-width camera plateau across the top
  if (/iphone 1[78] pro/.test(m)) return { shape: 'bar', box: { x0: 0.04, y0: 0.025, x1: 0.96, y1: 0.205 }, lenses: 3 };
  // iPhone 17 Air: a slim full-width bar
  if (/iphone 17 air/.test(m)) return { shape: 'bar', box: { x0: 0.04, y0: 0.03, x1: 0.96, y1: 0.12 }, lenses: 1 };
  // iPhone 16e: one lens
  if (/iphone 16e/.test(m)) return { shape: 'island', box: { x0: 0.07, y0: 0.03, x1: 0.31, y1: 0.145 }, lenses: 1 };
  // iPhone Pro (13–16): the big square island, three lenses
  if (/iphone 1[3-6] pro/.test(m)) return { shape: 'island', box: { x0: 0.06, y0: 0.025, x1: 0.5, y1: 0.235 }, lenses: 3 };
  // iPhone 13–17 base / Plus / mini: a smaller island, two lenses
  if (/iphone/.test(m)) return { shape: 'island', box: { x0: 0.06, y0: 0.025, x1: 0.42, y1: 0.2 }, lenses: 2 };
  // Galaxy S Ultra: a tall slot of four lenses; other S models: three
  if (/galaxy .*ultra/.test(m)) return { shape: 'slot', box: { x0: 0.08, y0: 0.03, x1: 0.3, y1: 0.33 }, lenses: 4 };
  if (/galaxy/.test(m)) return { shape: 'slot', box: { x0: 0.09, y0: 0.03, x1: 0.28, y1: 0.27 }, lenses: 3 };
  // Pixel 8: the full-width visor; Pixel 9: the pill island
  if (/pixel 8/.test(m)) return { shape: 'bar', box: { x0: 0.0, y0: 0.1, x1: 1.0, y1: 0.2 }, lenses: 2 };
  return { shape: 'pill', box: { x0: 0.12, y0: 0.08, x1: 0.88, y1: 0.19 }, lenses: 2 };
}

export interface DrawnCase {
  blank: Buffer;
  mask: Buffer;
  overlay: Buffer;
  /** the print area on the blank, normalised TL,TR,BR,BL */
  quad: [number, number][];
  W: number;
  H: number;
}

const W = 1000;
const H = 1250;
const OAT = '#FBF5E9';

/** Draws the mockup for one phone × grade × finish. Throws for a phone we don't know. With
 * Prodigi's traced template for that phone ({@link traceCaseTemplate}) the case shape and camera
 * holes are EXACT; without one, a drawn case with the camera per family. */
export async function drawPhoneCase(modelName: string, grade: CaseGrade, finish: CaseFinish, traced?: TracedCase): Promise<DrawnCase> {
  const model = PHONE_MODELS.find((m) => m.name === modelName);
  const px = model?.[grade];
  if (!model || !px) throw new Error(`no ${grade} case for ${modelName}`);
  if (traced) return fromTemplate(traced, grade, finish);

  // the case body at the print file's exact aspect, centred, ~88% of the height
  const ch = Math.round(H * 0.88);
  const cw = Math.round((ch * px.w) / px.h);
  const x = Math.round((W - cw) / 2);
  const y = Math.round((H - ch) / 2);
  const r = Math.round(cw * (grade === 'tough' ? 0.17 : 0.15)); // tough corners are chunkier
  const quad: [number, number][] = [[x / W, y / H], [(x + cw) / W, y / H], [(x + cw) / W, (y + ch) / H], [x / W, (y + ch) / H]];

  const cam = cameraFor(model.name);
  const bx = (f: number) => x + f * cw;
  const by = (f: number) => y + f * ch;
  const camW = (cam.box.x1 - cam.box.x0) * cw;
  const camH = (cam.box.y1 - cam.box.y0) * ch;
  const camR = cam.shape === 'slot' || cam.shape === 'pill' ? Math.min(camW, camH) / 2 : Math.min(camW, camH) * 0.28;

  // blank: oat page, soft shadow, white case body (what shows where the design doesn't reach)
  const blankSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>
    <rect width="${W}" height="${H}" fill="${OAT}"/>
    <rect x="${x + 6}" y="${y + 16}" width="${cw}" height="${ch}" rx="${r}" fill="#2B2118" opacity="0.22" filter="url(#s)"/>
    <rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${r}" fill="#ffffff"/>
  </svg>`;
  // mask: white = where the design prints (the case back), black elsewhere
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#000"/>
    <rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${r}" fill="#fff"/>
  </svg>`;
  // overlay (over the design): the camera cut-out showing the phone through it, the case edge,
  // and the finish — a soft gloss sheen, or nothing for matte
  // lenses laid out INSIDE the camera area so they always fit: a column for a tall slot or a
  // two-lens island, a triangle for three in an island, a row along a bar/pill
  const bx0 = bx(cam.box.x0), by0 = by(cam.box.y0);
  const n = cam.lenses;
  const pts: [number, number][] =
    cam.shape === 'bar' || cam.shape === 'pill'
      ? Array.from({ length: n }, (_, i) => [camH * 0.62 + i * camH * 0.95, camH / 2])
      : cam.shape === 'island' && n === 3
        ? [[camW * 0.28, camH * 0.27], [camW * 0.28, camH * 0.73], [camW * 0.72, camH * 0.5]]
        : Array.from({ length: n }, (_, i) => [camW / 2, (camH * (i + 0.5)) / n]);
  const rr0 =
    cam.shape === 'bar' || cam.shape === 'pill' ? camH * 0.36 : cam.shape === 'island' && n === 3 ? Math.min(camW, camH) * 0.2 : Math.min(camW * 0.36, camH / n / 2.4);
  const lenses = pts
    .map(([px0, py0]) => {
      const cx = bx0 + px0, cy = by0 + py0, rr = rr0;
      return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="#15110d" stroke="#5a5a5a" stroke-width="${rr * 0.18}"/><circle cx="${cx - rr * 0.25}" cy="${cy - rr * 0.25}" r="${rr * 0.22}" fill="#ffffff" opacity="0.35"/>`;
    })
    .join('');
  const sheen =
    finish === 'gloss'
      ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.06"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="c"><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${r}"/></clipPath></defs>
         <rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="${r}" fill="url(#g)" clip-path="url(#c)"/>`
      : '';
  const rim = grade === 'tough' ? `<rect x="${x + 3}" y="${y + 3}" width="${cw - 6}" height="${ch - 6}" rx="${r - 3}" fill="none" stroke="#1d1a17" stroke-width="7" opacity="0.85"/>` : `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${ch - 2}" rx="${r}" fill="none" stroke="#2B2118" stroke-opacity="0.18" stroke-width="2"/>`;
  const overlaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${sheen}
    ${rim}
    <rect x="${bx(cam.box.x0)}" y="${by(cam.box.y0)}" width="${camW}" height="${camH}" rx="${camR}" fill="#26211c" stroke="#0c0a08" stroke-width="3"/>
    ${lenses}
  </svg>`;

  const [blank, mask, overlay] = await Promise.all([
    sharp(Buffer.from(blankSvg)).png().toBuffer(),
    sharp(Buffer.from(maskSvg)).greyscale().png().toBuffer(),
    sharp(Buffer.from(overlaySvg)).png().toBuffer(),
  ]);
  return { blank, mask, overlay, quad, W, H };
}

// ── from Prodigi's traced template: exact shape + holes ───────────────────────────────────

/** A W×H single-channel canvas with `mask` (aw×ah) placed at (ax, ay), smoothly resized. */
async function placeMask(mask: Uint8Array, mw: number, mh: number, aw: number, ah: number, ax: number, ay: number, blur = 0): Promise<Uint8Array> {
  let img = sharp(await maskPng(mask, mw, mh)).resize(aw, ah, { fit: 'fill' }).extend({ left: ax, top: ay, right: W - aw - ax, bottom: H - ah - ay, background: '#000' });
  if (blur > 0) img = sharp(await img.png().toBuffer()).blur(blur);
  const { data } = await img.extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

async function fromTemplate(t: TracedCase, grade: CaseGrade, finish: CaseFinish): Promise<DrawnCase> {
  // the whole print artboard (bleed included) at its exact aspect, centred, ~94% of the height
  const ah = Math.round(H * 0.94);
  const aw = Math.round((ah * t.W) / t.H);
  const ax = Math.round((W - aw) / 2);
  const ay = Math.round((H - ah) / 2);
  const quad: [number, number][] = [[ax / W, ay / H], [(ax + aw) / W, ay / H], [(ax + aw) / W, (ay + ah) / H], [ax / W, (ay + ah) / H]];

  const caseAll = new Uint8Array(t.W * t.H); // the case body, holes included (for the shadow + rim)
  for (let i = 0; i < caseAll.length; i++) caseAll[i] = t.face[i] || t.holes[i] ? 1 : 0;
  const [face, body, holes, bodySoft, shadow] = await Promise.all([
    placeMask(t.face, t.W, t.H, aw, ah, ax, ay),
    placeMask(caseAll, t.W, t.H, aw, ah, ax, ay),
    placeMask(t.holes, t.W, t.H, aw, ah, ax, ay),
    placeMask(caseAll, t.W, t.H, aw, ah, ax, ay, grade === 'tough' ? 3.5 : 1.4),
    placeMask(caseAll, t.W, t.H, aw, ah, Math.min(ax + 6, W - aw), Math.min(ay + 16, H - ah), 14),
  ]);

  const n = W * H;
  const blankRaw = Buffer.alloc(n * 3);
  const overlayRaw = Buffer.alloc(n * 4);
  const oat = [0xfb, 0xf5, 0xe9];
  const cocoa = [0x2b, 0x21, 0x18];
  for (let i = 0; i < n; i++) {
    const x = i % W;
    const y = (i / W) | 0;
    // blank: oat page → soft shadow → the white case body
    const sh = (shadow[i]! / 255) * 0.22;
    const b = body[i]! / 255;
    for (let c = 0; c < 3; c++) {
      const under = oat[c]! * (1 - sh) + cocoa[c]! * sh;
      blankRaw[i * 3 + c] = Math.round(under * (1 - b) + 255 * b);
    }
    // overlay: the camera holes show the phone through them; the case edge; the gloss sheen
    let r = 0, g = 0, bl = 0, a = 0;
    const hole = holes[i]! / 255;
    if (hole > 0) {
      r = 0x22; g = 0x1d; bl = 0x18; a = hole;
    }
    const soft = bodySoft[i]! / 255;
    const edge = Math.min(1, 4 * soft * (1 - soft)) * (body[i]! > 0 || soft > 0.02 ? 1 : 0);
    const edgeA = grade === 'tough' ? edge * 0.85 : edge * 0.25;
    if (edgeA > a) {
      r = grade === 'tough' ? 0x1d : 0x2b; g = grade === 'tough' ? 0x1a : 0x21; bl = grade === 'tough' ? 0x17 : 0x18; a = edgeA;
    }
    if (finish === 'gloss' && face[i]! > 0 && a === 0) {
      const t01 = (x - ax) / aw + (y - ay) / ah; // 0 top-left → 2 bottom-right
      const sheen = t01 < 0.7 ? 0.3 * (1 - t01 / 0.7) : 0;
      if (sheen > 0) {
        r = 255; g = 255; bl = 255; a = sheen * (face[i]! / 255);
      }
    }
    overlayRaw[i * 4] = r;
    overlayRaw[i * 4 + 1] = g;
    overlayRaw[i * 4 + 2] = bl;
    overlayRaw[i * 4 + 3] = Math.round(a * 255);
  }
  const [blank, mask, overlay] = await Promise.all([
    sharp(blankRaw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(),
    sharp(Buffer.from(face), { raw: { width: W, height: H, channels: 1 } }).png().toBuffer(),
    sharp(overlayRaw, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(),
  ]);
  return { blank, mask, overlay, quad, W, H };
}

