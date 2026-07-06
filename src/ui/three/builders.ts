import * as THREE from 'three';
import { buildMug, buildFrame } from './models';
import { buildPrintPatch, buildSoftBody, containRect, pathToPolygon, polygonBounds, scalePolygon, type Pt, type SoftBody } from './softBody';

/**
 * Parametric 3D builders for the WHOLE launch range — every printable product gets a
 * "spin it around" view built in code (no licensed GLBs). Soft goods inflate their
 * silhouette via softBody.ts; rigid goods are primitive assemblies like the existing
 * mug/frame. The print always registers the way the 2D seeder registers it:
 *   face-cover → the front surface IS the print (UV over the silhouette bbox);
 *   panel     → a patch with the print canvas aspect-locked inside the same region
 *               constants the seeder uses, composited MULTIPLY (ink on fabric, the
 *               3D twin of the compositor's LIGHT_FABRIC blend);
 *   band/window → the existing mug wrap / frame window builders.
 * giftWrap prints nothing → no 3D.
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

// ── garment silhouettes (verbatim from scripts/make-garment-blanks.mjs, blank
//    canvas 1300×1500 px — the SAME shapes the 2D tiles photograph) ────────────
const TEE_PATH =
  'M500 360 C560 348 740 348 800 360 L1010 402 C1120 430 1160 520 1150 610 L1010 690 C980 700 940 690 905 660 L880 600 ' +
  'C872 760 872 1050 878 1210 C880 1240 855 1258 820 1258 L480 1258 C445 1258 420 1240 422 1210 C428 1050 428 760 420 600 ' +
  'L395 660 C360 690 320 700 290 690 L150 610 C140 520 180 430 290 402 L500 360 Z';
const TEE_NECK = 'M500 360 C560 348 740 348 800 360 C812 396 760 430 650 430 C540 430 488 396 500 360 Z';
const BODY_PATH =
  'M530 400 C575 388 725 388 770 400 L880 448 C955 495 1010 600 1040 730 L1062 845 C1068 888 1046 912 1008 902 L940 878 ' +
  'C918 795 895 715 866 655 L848 618 C853 795 851 990 855 1125 C893 1160 899 1232 861 1263 C821 1293 742 1293 713 1256 ' +
  'C691 1224 609 1224 587 1256 C558 1293 479 1293 439 1263 C401 1232 407 1160 445 1125 C449 990 447 795 452 618 L434 655 ' +
  'C405 715 382 795 360 878 L292 902 C254 912 232 888 238 845 L260 730 C290 600 345 495 420 448 L530 400 Z';
const BODY_NECK = 'M530 400 C575 388 725 388 770 400 C780 432 735 462 650 462 C565 462 520 432 530 400 Z';
// Chest print regions as fractions of the 1300×1500 blank — MUST match seed-mockups.
const TEE_REGION = { x0: 0.4, y0: 0.36, x1: 0.6, y1: 0.6 };
const BODY_REGION = { x0: 0.4, y0: 0.36, x1: 0.6, y1: 0.58 };
const BLANK_W = 1300;
const BLANK_H = 1500;

/** Fold fields are authored in blank-px space and scaled with the garment so the
 * cloth character is identical at every size. Amplitudes are px (→ mm × scale). */
const teeFoldPx = (x: number, y: number) => 3.4 * Math.sin(x * 0.013 + 1.2) * Math.sin(y * 0.005 + 0.5) + 2.2 * Math.sin((x + 0.6 * y) * 0.007);
const bodyFoldPx = (x: number, y: number) => 3 * Math.sin(x * 0.015 + 0.8) * Math.sin(y * 0.0055) + 2 * Math.sin((x + 0.5 * y) * 0.008);

function buildGarment(args: {
  path: string;
  neck: string;
  region: { x0: number; y0: number; x1: number; y1: number };
  scale: number; // mm per blank px
  puffMm: number;
  foldPx: (x: number, y: number) => number;
  texture: THREE.Texture;
  printWmm: number;
  printHmm: number;
}): THREE.Group {
  const { scale: s } = args;
  const outline = scalePolygon(pathToPolygon(args.path), s);
  const neck = scalePolygon(pathToPolygon(args.neck), s);
  const body = buildSoftBody({
    outline,
    holes: [neck],
    puff: args.puffMm,
    grid: 150, // garments show their curvature up close — keep facets invisible
    fold: (x, y) => s * args.foldPx(x / s, y / s),
  });
  const group = new THREE.Group();
  const mat = cotton();
  group.add(new THREE.Mesh(body.front, mat), new THREE.Mesh(body.back, mat));

  // Ribbed collar: a soft tube following the neck opening at fabric height.
  const [ccx, ccy] = body.centre;
  const collarPts = neck.filter((_, i) => i % 2 === 0).map(([x, y]) => new THREE.Vector3(x - ccx, ccy - y, Math.max(1.5, body.heightAt(x, y + 6 * s))));
  const collar = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(collarPts, true), 72, 7 * s, 10, true),
    cotton('#f4efe4'),
  );
  group.add(collar);

  // Print patch: the seeder's region (blank fractions → mm), print canvas contained.
  const region = {
    x: args.region.x0 * BLANK_W * s,
    y: args.region.y0 * BLANK_H * s,
    w: (args.region.x1 - args.region.x0) * BLANK_W * s,
    h: (args.region.y1 - args.region.y0) * BLANK_H * s,
  };
  const rect = containRect(region, args.printWmm, args.printHmm);
  const patch = new THREE.Mesh(buildPrintPatch(body, rect), inkOnFabric(args.texture));
  patch.renderOrder = 1;
  group.add(patch);
  return centred(group);
}

// ── soft goods: cushions, blanket, sack, apron ───────────────────────────────
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

// Apron (child default): bib + skirt silhouette in mm; centre chest-to-hem panel.
const APRON_PATH =
  'M170 16 C170 6 290 6 290 16 L298 120 C362 150 412 202 426 262 L434 520 C434 542 420 550 400 550 L60 550 C40 550 26 542 26 520 ' +
  'L34 262 C48 202 98 150 162 120 Z';
function buildApron(texture: THREE.Texture, printWmm: number, printHmm: number): THREE.Group {
  const outline = pathToPolygon(APRON_PATH);
  const body = buildSoftBody({
    outline,
    puff: 9,
    backPuff: 4,
    plateau: 60,
    fold: (x, y) => 1.6 * Math.sin(x * 0.03 + 1) * Math.sin(y * 0.012) + 1.1 * Math.sin((x + y) * 0.012),
  });
  const group = new THREE.Group();
  const mat = cotton('#f7f4ed');
  group.add(new THREE.Mesh(body.front, mat), new THREE.Mesh(body.back, mat));
  // The seeder's apron region fractions {0.24–0.76, 0.38–0.92} applied to THIS
  // silhouette's bbox — same registration constants, same relative placement.
  const b = polygonBounds([outline]);
  const rect = containRect(
    { x: b.x0 + 0.24 * (b.x1 - b.x0), y: b.y0 + 0.38 * (b.y1 - b.y0), w: 0.52 * (b.x1 - b.x0), h: 0.54 * (b.y1 - b.y0) },
    printWmm,
    printHmm,
  );
  const patch = new THREE.Mesh(buildPrintPatch(body, rect), inkOnFabric(texture));
  patch.renderOrder = 1;
  group.add(patch);
  // neck strap: a thin tube arc over the bib
  const strap = new THREE.Mesh(new THREE.TorusGeometry(62, 4, 10, 40, Math.PI), new THREE.MeshStandardMaterial({ color: '#3a332c', roughness: 0.7 }));
  strap.position.set(0, 550 / 2 - 8, 4);
  group.add(strap);
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

function buildBauble(texture: THREE.Texture, wMm: number): THREE.Group {
  const group = new THREE.Group();
  const R = wMm / 2;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 7, 72), ceramic());
  disc.rotation.x = Math.PI / 2; // flat face toward the viewer
  group.add(disc);
  // Print face: a CircleGeometry facing +z — its UVs are the inscribed circle of the
  // square canvas, upright (a rotated cylinder cap would show the print sideways).
  // The circle crop = the 2D face-cover mask crop of the 82×82 canvas.
  const face = new THREE.Mesh(new THREE.CircleGeometry(R - 0.5, 72), printedSurface(texture, { roughness: 0.35, sheen: 0 }));
  face.position.z = 3.6;
  group.add(face);
  const gold = new THREE.MeshStandardMaterial({ color: '#C9A227', metalness: 0.85, roughness: 0.3 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 7, 20), gold);
  cap.position.y = R + 2.5;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(4, 1.1, 8, 24), gold);
  loop.position.y = R + 9;
  group.add(cap, loop);
  return centred(group);
}

// ── dispatcher ───────────────────────────────────────────────────────────────
export { has3D } from './spinnable';

export function buildProduct(kind: string, texture: THREE.Texture, printWmm: number, printHmm: number, attrs: Record<string, string> = {}): THREE.Group | null {
  switch (kind) {
    case 'mug':
      return buildMug(texture as THREE.CanvasTexture, printWmm, printHmm);
    case 'framedPrint':
      return buildFrame(texture as THREE.CanvasTexture, printWmm, printHmm, attrs.colour ?? 'gold');
    case 'kidsTee':
      return buildGarment({ path: TEE_PATH, neck: TEE_NECK, region: TEE_REGION, scale: 0.44, puffMm: 13, foldPx: teeFoldPx, texture, printWmm, printHmm });
    case 'adultTee':
      return buildGarment({ path: TEE_PATH, neck: TEE_NECK, region: TEE_REGION, scale: 0.66, puffMm: 18, foldPx: teeFoldPx, texture, printWmm, printHmm });
    case 'babyBodysuit':
      return buildGarment({ path: BODY_PATH, neck: BODY_NECK, region: BODY_REGION, scale: 0.485, puffMm: 11, foldPx: bodyFoldPx, texture, printWmm, printHmm });
    case 'cushion':
      return buildCushion(texture, printWmm, attrs.size ?? 'heart');
    case 'blanket':
      return buildBlanket(texture, printWmm, printHmm, attrs.colour ?? 'white');
    case 'sack':
      return buildSack(texture);
    case 'apron':
      return buildApron(texture, printWmm, printHmm);
    case 'storybook':
      return buildStorybook(texture, printWmm, printHmm);
    case 'jigsaw':
      return buildJigsaw(texture, printWmm, printHmm);
    case 'calendar':
      return buildCalendar(texture, printWmm, printHmm);
    case 'card':
      return buildCard(texture, printWmm, printHmm);
    case 'bauble':
      return buildBauble(texture, printWmm);
    default:
      return null;
  }
}
