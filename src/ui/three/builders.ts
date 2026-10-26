import * as THREE from 'three';
import { buildMug, buildFrame } from './models';
import { buildSoftBody, polygonBounds, type Pt } from './softBody';

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
    case 'storybook':
      return buildStorybook(texture, printWmm, printHmm);
    case 'jigsaw':
      return buildJigsaw(texture, printWmm, printHmm);
    case 'calendar':
      return buildCalendar(texture, printWmm, printHmm);
    case 'card':
      return buildCard(texture, printWmm, printHmm);
    default:
      return null;
  }
}
