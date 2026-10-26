import * as THREE from 'three';
import { buildMug, buildFrame } from './models';
import { buildPrintPatch, buildSoftBody, pathToPolygon, polygonBounds, type Pt } from './softBody';

/**
 * Parametric 3D builders for the SPINNABLE products — built in code (no licensed
 * GLBs). Soft goods inflate their silhouette via softBody.ts; rigid goods are
 * primitive assemblies like the existing mug/frame. The print always registers the
 * way the 2D seeder registers it:
 *   face-cover → the front surface IS the print (UV over the silhouette bbox);
 *   panel     → a patch composited MULTIPLY (ink on fabric, the 3D twin of the
 *               compositor's LIGHT_FABRIC blend — the sack's physical panel);
 *   band/window → the existing mug wrap / frame window builders.
 * giftWrap prints nothing → no 3D. Wearables have no 3D (see spinnable.ts).
 */

// ── materials ────────────────────────────────────────────────────────────────
const cotton = (color = '#ffffff') =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.92, metalness: 0, sheen: 0.35, sheenRoughness: 0.7, side: THREE.DoubleSide });
const fleece = (color: string) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 1, metalness: 0, sheen: 0.9, sheenRoughness: 0.9, side: THREE.DoubleSide });
const paper = (color = '#f2efe8') => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
const ceramic = (color = '#f6f4f0') => new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.02 });

/** The printed design over fabric: MULTIPLY, unlit — the framebuffer already holds
 * the LIT fabric, so ink × lit-fabric mirrors the compositor's LIGHT_FABRIC blend
 * (white background vanishes; folds show through the print). */
const inkOnFabric = (tex: THREE.Texture) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshBasicMaterial({ map: tex, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
};
/** The printed design AS a lit surface (all-over prints, paper faces). */
const printedSurface = (tex: THREE.Texture, opts: { roughness?: number; sheen?: number } = {}) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return new THREE.MeshPhysicalMaterial({ map: tex, roughness: opts.roughness ?? 0.9, metalness: 0, sheen: opts.sheen ?? 0.3, sheenRoughness: 0.7, side: THREE.FrontSide });
};

/** Centre a group at the origin so the orbit pivot is the model's own middle. */
function centred(group: THREE.Group): THREE.Group {
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  group.position.sub(c);
  const wrap = new THREE.Group();
  wrap.add(group);
  return wrap;
}

// NOTE: parametric GARMENT models (tees, bodysuit, apron) were removed by founder
// decision (2026-07-07) — they didn't meet the visual bar. Wearables present as flat
// product photos in 2D; a spin view returns only if a properly-made 3D garment model
// (licensed/commissioned GLB, print-area UV = the Prodigi canvas) is added.

// ── soft goods: cushions, blanket, sack ──────────────────────────────────────
function heartPolygon(widthMm: number): Pt[] {
  // Classic parametric heart, y flipped to blank convention (y down), scaled to width.
  const pts: Pt[] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    pts.push([16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
  }
  const b = polygonBounds([pts]);
  const s = widthMm / (b.x1 - b.x0);
  return pts.map(([x, y]) => [(x - b.x0) * s, (y - b.y0) * s]);
}
const circlePolygon = (dMm: number): Pt[] =>
  Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * Math.PI * 2;
    return [(dMm / 2) * (1 + Math.cos(t)), (dMm / 2) * (1 + Math.sin(t))] as Pt;
  });
function roundedRectPolygon(w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 12; i++) {
      const a = a0 + (i / 12) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(w - r, r, -Math.PI / 2);
  corner(w - r, h - r, 0);
  corner(r, h - r, Math.PI / 2);
  corner(r, r, Math.PI);
  return pts;
}

function buildCushion(texture: THREE.Texture, printWmm: number, size: string): THREE.Group {
  const outline = size === 'heart' ? heartPolygon(printWmm) : size.includes('round') ? circlePolygon(printWmm) : roundedRectPolygon(printWmm, printWmm, printWmm * 0.09);
  const body = buildSoftBody({
    outline,
    puff: printWmm * 0.17,
    backPuff: printWmm * 0.14,
    plateau: printWmm * 0.3,
    fold: (x, y) => printWmm * 0.006 * Math.sin(x * (24 / printWmm)) * Math.sin(y * (20 / printWmm)),
    faceCoverUV: true,
    faceCoverAspect: 1, // all cushion canvases are square — cover-crops the heart's 1.106 bbox
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(body.front, printedSurface(texture, { roughness: 0.92, sheen: 0.4 })), new THREE.Mesh(body.back, cotton('#f4efe6')));
  return centred(group);
}

function buildBlanket(texture: THREE.Texture, wMm: number, hMm: number, colour: string): THREE.Group {
  const back: Record<string, string> = { white: '#f6f2ea', pink: '#f3cdd7', blue: '#bfd8ea' };
  const body = buildSoftBody({
    outline: roundedRectPolygon(wMm, hMm, 14),
    puff: 7,
    backPuff: 5,
    plateau: 60,
    grid: 110,
    // draped waves along the length + a soft diagonal — the fleece character
    fold: (x, y) => 6 * Math.sin(y * 0.012) + 2.5 * Math.sin(x * 0.02 + y * 0.008),
    faceCoverUV: true,
    faceCoverAspect: wMm / hMm, // equals the bbox aspect — explicit, not load-bearing
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(body.front, printedSurface(texture, { roughness: 1, sheen: 0.7 })), new THREE.Mesh(body.back, fleece(back[colour] ?? back.white!)));
  return centred(group);
}

// Christmas sack: 19×30″ (483 wide) with a cinched top band; official 320×500 panel
// sits above the bottom seam (the seeder's panel-physical registration in real mm).
const SACK_PATH =
  'M120 40 L363 40 C420 60 455 100 458 160 C468 350 466 550 452 690 C448 735 420 755 380 758 L103 758 C63 755 35 735 31 690 ' +
  'C17 550 15 350 25 160 C28 100 63 60 120 40 Z';
function buildSack(texture: THREE.Texture): THREE.Group {
  const outline = pathToPolygon(SACK_PATH); // authored directly in mm (483×~760)
  const body = buildSoftBody({
    outline,
    puff: 26,
    backPuff: 18,
    plateau: 90,
    fold: (x, y) => 2.4 * Math.sin(x * 0.06) * Math.max(0, 1 - y / 700) ** 1.4 + 1.4 * Math.sin(x * 0.018 + y * 0.01),
  });
  const group = new THREE.Group();
  const mat = cotton('#f3ead9'); // natural cotton, slightly cream
  group.add(new THREE.Mesh(body.front, mat), new THREE.Mesh(body.back, mat));
  const rect = { x: (483 - 320) / 2, y: 760 - 0.06 * 760 - 500, w: 320, h: 500 };
  const patch = new THREE.Mesh(buildPrintPatch(body, rect), inkOnFabric(texture));
  patch.renderOrder = 1;
  group.add(patch);
  // drawstring: a soft rope across the cinch
  const rope = new THREE.Mesh(new THREE.TorusGeometry(150, 5, 12, 48, Math.PI * 0.9), cotton('#e3d5bd'));
  rope.position.set(0, 760 / 2 - 60, 20);
  rope.rotation.z = Math.PI * 0.05;
  group.add(rope);
  return centred(group);
}

// ── rigid goods: storybook, jigsaw, calendar, card, bauble ───────────────────
function buildStorybook(texture: THREE.Texture, wMm: number, hMm: number): THREE.Group {
  const group = new THREE.Group();
  const coverMat = paper('#efe9dd');
  const face = printedSurface(texture, { roughness: 0.55, sheen: 0.1 }); // gloss hardcover
  const front = new THREE.Mesh(new THREE.BoxGeometry(wMm, hMm, 4), [coverMat, coverMat, coverMat, coverMat, face, coverMat]);
  front.position.z = 7.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(wMm, hMm, 4), coverMat);
  back.position.z = -7.5;
  const pages = new THREE.Mesh(new THREE.BoxGeometry(wMm - 5, hMm - 6, 11), paper('#faf7f0'));
  pages.position.x = 2; // pages sit proud of the spine side
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 9.5, hMm, 24, 1, false, Math.PI, Math.PI), coverMat);
  spine.position.x = -wMm / 2;
  group.add(front, back, pages, spine);
  return centred(group);
}

function buildJigsaw(texture: THREE.Texture, wMm: number, hMm: number): THREE.Group {
  const group = new THREE.Group();
  const edge = paper('#e8e2d4');
  const face = printedSurface(texture, { roughness: 0.6, sheen: 0 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(wMm, hMm, 3.5), [edge, edge, edge, edge, face, edge]);
  group.add(board);
  return centred(group);
}

function buildCalendar(texture: THREE.Texture, wMm: number, hMm: number): THREE.Group {
  const group = new THREE.Group();
  const edge = paper('#efe9dd');
  const page = new THREE.Mesh(new THREE.BoxGeometry(wMm, hMm, 1.4), [edge, edge, edge, edge, printedSurface(texture, { roughness: 0.5, sheen: 0.05 }), edge]);
  group.add(page);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 1.2, 8, 24), new THREE.MeshStandardMaterial({ color: '#b9b6ae', metalness: 0.8, roughness: 0.35 }));
  ring.position.set(0, hMm / 2 + 4, 0);
  group.add(ring);
  return centred(group);
}

function buildCard(texture: THREE.Texture, wMm: number, hMm: number): THREE.Group {
  // A folded card standing slightly open, fold on the left (portrait 7×5).
  const group = new THREE.Group();
  const inner = paper('#fffdf8');
  const openAngle = 0.42; // ~24°
  const frontGeo = new THREE.BoxGeometry(wMm, hMm, 0.7);
  frontGeo.translate(wMm / 2, 0, 0); // hinge at x=0
  const front = new THREE.Mesh(frontGeo, [inner, inner, inner, inner, printedSurface(texture, { roughness: 0.7, sheen: 0.05 }), inner]);
  // rotation.y > 0 swings the far edge AWAY from the camera — the front panel must
  // swing toward it (negative) or the plain back panel stands in front of the print.
  front.rotation.y = -openAngle / 2;
  const backGeo = new THREE.BoxGeometry(wMm, hMm, 0.7);
  backGeo.translate(wMm / 2, 0, 0);
  const back = new THREE.Mesh(backGeo, inner);
  back.rotation.y = openAngle / 2;
  group.add(front, back);
  return centred(group);
}

// ── the baubles: made from the founder's OWN photo layers (founder, 26 Oct: "use the same print map and
// layers for the rear side") — public/three/bauble/<set>/{product,printmap,overlay}.png, cropped to the
// ornament by scripts/export-bauble-3d-layers.mjs. Each face is the shop photo's recipe: the product, the
// drawing laid into the print map, the overlay (gloss, edge) on top. Per Prodigi's product sheets the
// CERAMIC disc is a "single-sided print" (its rear: the same layers, no print) and the PLASTIC BALL a
// "double-sided print" (its rear: the same drawing again, reading the right way round).

const LAYER_EDGE = 768;
const layerCache = new Map<string, Promise<HTMLImageElement>>();
function layerImage(set: 'ceramic' | 'ball', layer: 'product' | 'printmap' | 'overlay'): Promise<HTMLImageElement> {
  const src = `/three/bauble/${set}/${layer}.png`;
  let p = layerCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    layerCache.set(src, p);
  }
  return p;
}

/** The print map's box (where the drawing goes), from its alpha. */
function alphaBox(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y += 2) {
    for (let x = 0; x < c.width; x += 2) {
      if (d[(y * c.width + x) * 4 + 3]! < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 > x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: c.width, h: c.height };
}

/**
 * One face of a bauble as a texture: product, then the drawing clipped to the print map, then the overlay.
 * `mirror` draws it flipped — for a REAR face, which the turned-round surface flips back, so a printed
 * rear reads the right way round. Starts as a plain disc; fills in when the layers load.
 */
function baubleFace(set: 'ceramic' | 'ball', drawing: CanvasImageSource | null, mirror: boolean): THREE.Texture {
  // (no browser — the model's shape is still built: a plain white face)
  if (typeof document === 'undefined') return new THREE.DataTexture(new Uint8Array([247, 246, 242, 255]), 1, 1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = LAYER_EDGE;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#f7f6f2';
  g.beginPath();
  g.arc(LAYER_EDGE / 2, LAYER_EDGE / 2, LAYER_EDGE / 2, 0, Math.PI * 2);
  g.fill();
  void Promise.all([layerImage(set, 'product'), layerImage(set, 'printmap'), layerImage(set, 'overlay')])
    .then(([product, printmap, overlay]) => {
      g.clearRect(0, 0, LAYER_EDGE, LAYER_EDGE);
      g.save();
      if (mirror) {
        g.translate(LAYER_EDGE, 0);
        g.scale(-1, 1);
      }
      g.drawImage(product, 0, 0, LAYER_EDGE, LAYER_EDGE);
      if (drawing) {
        // the drawing fills the print map's box (the print file IS that area), clipped to its shape
        const box = alphaBox(printmap);
        const k = LAYER_EDGE / printmap.width;
        const ink = document.createElement('canvas');
        ink.width = ink.height = LAYER_EDGE;
        const ig = ink.getContext('2d')!;
        ig.drawImage(drawing, box.x * k, box.y * k, box.w * k, box.h * k);
        ig.globalCompositeOperation = 'destination-in';
        ig.drawImage(printmap, 0, 0, LAYER_EDGE, LAYER_EDGE);
        g.globalCompositeOperation = 'multiply'; // ink on the glaze: the product's own light and shade come through
        g.drawImage(ink, 0, 0);
        // …and only on the product (multiply would paint into its hole and round its edge)
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(product, 0, 0, LAYER_EDGE, LAYER_EDGE);
        g.globalCompositeOperation = 'source-over';
      }
      // (the flat photo's glass-rim highlight would show as a seam where the ball's halves meet — the 3D
      // light gives the ball its shine; the disc keeps its edge blur)
      if (set === 'ceramic') g.drawImage(overlay, 0, 0, LAYER_EDGE, LAYER_EDGE);
      g.restore();
      tex.needsUpdate = true;
    })
    .catch(() => {
      /* stays the plain disc */
    });
  return tex;
}

/**
 * The CERAMIC ornament (Prodigi XMAS-PORC-BAUB): a flat glossy disc, 7.5 cm, hole near the top, gold
 * string. FRONT = the shop photo's layers with the drawing; REAR = the same layers, no print.
 */
function buildCeramicOrnament(texture: THREE.Texture, wMm: number): THREE.Group {
  const group = new THREE.Group();
  const R = wMm / 2;
  const T = 4.5; // thickness, mm
  const drawing = texture.image as CanvasImageSource;
  // (a touch of the face's own colour as glow, so white glaze reads white under the studio light, not grey)
  const faceMat = (tex: THREE.Texture) => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(0.22, 0.22, 0.22), roughness: 0.28, metalness: 0.02, alphaTest: 0.5 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), faceMat(baubleFace('ceramic', drawing, false)));
  front.position.z = T / 2;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), faceMat(baubleFace('ceramic', null, true)));
  back.position.z = -T / 2;
  back.rotation.y = Math.PI;
  // the glazed rim between the two faces
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.995, R * 0.995, T, 96, 1, true), ceramic('#f7f6f2'));
  rim.rotation.x = Math.PI / 2;
  group.add(front, back, rim);
  // the gold string through the hole (where the founder's product photo has it), up to a knot
  const holeY = R * 0.79;
  const gold = new THREE.MeshStandardMaterial({ color: '#C9A227', metalness: 0.85, roughness: 0.35 });
  const loop = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, holeY, T / 2 + 0.6),
    new THREE.Vector3(-R * 0.18, holeY + R * 0.55, 1),
    new THREE.Vector3(0, holeY + R * 0.95, 0),
    new THREE.Vector3(R * 0.18, holeY + R * 0.55, -1),
    new THREE.Vector3(0, holeY, -T / 2 - 0.6),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(loop, 64, 0.45, 8, false), gold));
  return centred(group);
}

/**
 * The PLASTIC BALL (Prodigi XMAS-PLAS-BAUB): 8 cm, shatterproof, chrome cap, silver string. Each half
 * wears the shop photo's layers with the drawing (printed both sides), projected flat onto it the way a
 * pad-printed ball looks.
 */
function buildPlasticBall(texture: THREE.Texture, wMm: number): THREE.Group {
  const group = new THREE.Group();
  const R = wMm / 2;
  const drawing = texture.image as CanvasImageSource;
  const half = (rear: boolean) => {
    const geo = new THREE.SphereGeometry(R, 72, 48);
    const pos = geo.attributes.position!, uv = geo.attributes.uv!;
    for (let i = 0; i < pos.count; i++) {
      // the photo's ball fills its square crop: x, y across the ball → u, v (the rear's mirror undoes the flip)
      const u = (pos.getX(i) / R + 1) / 2;
      uv.setXY(i, u, (pos.getY(i) / R + 1) / 2);
    }
    uv.needsUpdate = true;
    // keep just this half (front: +z, rear: −z)
    const idx = geo.index!;
    const keep: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (rear ? z <= 0 : z >= 0) keep.push(a, b, c);
    }
    geo.setIndex(keep);
    const face = baubleFace('ball', drawing, rear);
    const mat = new THREE.MeshPhysicalMaterial({ map: face, emissiveMap: face, emissive: new THREE.Color(0.18, 0.18, 0.18), roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.1 });
    return new THREE.Mesh(geo, mat);
  };
  group.add(half(false), half(true));
  const chrome = new THREE.MeshStandardMaterial({ color: '#d8d8d8', metalness: 1, roughness: 0.18 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.22, R * 0.2, 32), chrome);
  cap.position.y = R * 0.98;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.06, R * 0.015, 8, 24), chrome);
  ring.position.y = R * 1.13;
  group.add(cap, ring);
  const silver = new THREE.MeshStandardMaterial({ color: '#c9c9c9', metalness: 0.8, roughness: 0.35 });
  const loop = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, R * 1.13, 0),
    new THREE.Vector3(-R * 0.22, R * 1.6, 0),
    new THREE.Vector3(0, R * 1.95, 0),
    new THREE.Vector3(R * 0.22, R * 1.6, 0),
    new THREE.Vector3(0, R * 1.13, 0),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(loop, 64, 0.35, 8, true), silver));
  return centred(group);
}

// ── dispatcher ───────────────────────────────────────────────────────────────
export { has3D } from './spinnable';

export function buildProduct(kind: string, texture: THREE.Texture, printWmm: number, printHmm: number, attrs: Record<string, string> = {}): THREE.Group | null {
  switch (kind) {
    case 'mug':
      return buildMug(texture as THREE.CanvasTexture, printWmm, printHmm, attrs.colour ?? 'white');
    case 'framedPrint':
      return buildFrame(texture as THREE.CanvasTexture, printWmm, printHmm, attrs.colour ?? 'gold');
    case 'cushion':
      return buildCushion(texture, printWmm, attrs.size ?? 'heart');
    case 'blanket':
      return buildBlanket(texture, printWmm, printHmm, attrs.colour ?? 'white');
    case 'sack':
      return buildSack(texture);
    case 'storybook':
      return buildStorybook(texture, printWmm, printHmm);
    case 'jigsaw':
      return buildJigsaw(texture, printWmm, printHmm);
    case 'calendar':
      return buildCalendar(texture, printWmm, printHmm);
    case 'card':
      return buildCard(texture, printWmm, printHmm);
    case 'bauble':
      // two different objects (founder, 26 Oct): a one-sided ceramic disc, or a ball printed both sides
      return attrs.size === 'plastic ball' ? buildPlasticBall(texture, printWmm) : buildCeramicOrnament(texture, printWmm);
    default:
      return null;
  }
}
