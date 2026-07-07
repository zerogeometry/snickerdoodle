import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPrintPatch, buildSoftBody, containRect, pathToPolygon, polygonBounds, scalePolygon } from '../softBody';
import { buildProduct } from '../builders';
import { SPINNABLE, has3D } from '../spinnable';

/**
 * The 3D print-registration guarantees (headline: preview = print, in 3D too):
 *  - a print patch spans EXACTLY the rect it is given, with UVs [0,1] over it;
 *  - the patch lies ON the soft body's own surface (same height function);
 *  - containRect is the seeder's aspect-locked panel-contain, so 3D print size
 *    equals the 2D photo view's;
 *  - every SPINNABLE product builds a model within sane physical bounds.
 */

const square: [number, number][] = [
  [0, 0], [100, 0], [100, 100], [0, 100],
];

describe('softBody engine', () => {
  it('inflates inside the silhouette and stays flat at the boundary', () => {
    const body = buildSoftBody({ outline: square, puff: 10 });
    expect(body.heightAt(50, 50)).toBeGreaterThan(5);
    expect(body.heightAt(0, 50)).toBeLessThanOrEqual(0.2); // boundary → ~0
    expect(body.heightAt(-10, 50)).toBe(0); // outside → 0
    expect(body.heightAt(200, 200)).toBe(0);
  });

  it('respects holes (a neck opening deflates to zero inside the hole)', () => {
    const hole: [number, number][] = [[40, 40], [60, 40], [60, 60], [40, 60]];
    const body = buildSoftBody({ outline: square, holes: [hole], puff: 10 });
    expect(body.heightAt(50, 50)).toBe(0); // inside the hole
    expect(body.heightAt(20, 20)).toBeGreaterThan(0); // fabric proper
  });

  it('emits front+back geometry with positions and normals', () => {
    const body = buildSoftBody({ outline: square, puff: 8 });
    for (const geo of [body.front, body.back]) {
      expect(geo.getAttribute('position').count).toBeGreaterThan(100);
      expect(geo.getAttribute('normal')).toBeTruthy();
      expect(geo.getIndex()!.count % 3).toBe(0);
    }
  });

  it('print patch spans the exact rect with UV [0,1] and sits ON the surface', () => {
    const body = buildSoftBody({ outline: square, puff: 10 });
    const rect = { x: 25, y: 30, w: 50, h: 40 };
    const lift = 0.6;
    const patch = buildPrintPatch(body, rect, lift);
    const pos = patch.getAttribute('position');
    const uv = patch.getAttribute('uv');
    const [cx, cy] = body.centre;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx; // back to blank space
      const y = cy - pos.getY(i);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      // the patch vertex lies on the body's own height function + the lift
      expect(Math.abs(pos.getZ(i) - (body.heightAt(x, y) + lift))).toBeLessThan(1e-6);
      minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i));
      minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i));
    }
    expect(minX).toBeCloseTo(rect.x, 6);
    expect(maxX).toBeCloseTo(rect.x + rect.w, 6);
    expect(minY).toBeCloseTo(rect.y, 6);
    expect(maxY).toBeCloseTo(rect.y + rect.h, 6);
    // BOTH UV axes span exactly [0,1] over the rect — the painted canvas maps 1:1
    expect(minU).toBeCloseTo(0, 6);
    expect(maxU).toBeCloseTo(1, 6);
    expect(minV).toBeCloseTo(0, 6);
    expect(maxV).toBeCloseTo(1, 6);
  });

  it('faceCoverAspect keeps mm-per-texel UNIFORM (no stretch on a heart-shaped bbox)', () => {
    // a bbox whose aspect (2:1) differs from the square canvas — bbox-linear UVs
    // would stretch the art 2×; cover UVs must stay uniform and crop instead.
    const wide: [number, number][] = [[0, 0], [200, 0], [200, 100], [0, 100]];
    const body = buildSoftBody({ outline: wide, puff: 5, faceCoverUV: true, faceCoverAspect: 1 });
    const pos = body.front.getAttribute('position');
    const uv = body.front.getAttribute('uv');
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minU = Math.min(minU, uv.getX(i)); maxU = Math.max(maxU, uv.getX(i));
      minV = Math.min(minV, uv.getY(i)); maxV = Math.max(maxV, uv.getY(i));
    }
    // mm-per-uv equal on both axes: 200mm spans ΔU, 100mm spans ΔV → ΔU = 2·ΔV… with a
    // square canvas cover-fit over a 200×100 bbox, U spans [0,1] and V the middle half.
    expect(maxU - minU).toBeCloseTo(1, 5);
    expect(maxV - minV).toBeCloseTo(0.5, 5);
    expect((200 / (maxU - minU)) / (100 / (maxV - minV))).toBeCloseTo(1, 5); // uniform scale
  });

  it('containRect is the aspect-locked panel-contain the seeder uses', () => {
    // canvas 240×300 into a 260×360 region → width-limited, centred
    const r = containRect({ x: 0, y: 0, w: 260, h: 360 }, 240, 300);
    expect(r.w).toBeCloseTo(260);
    expect(r.h).toBeCloseTo((260 / 240) * 300);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo((360 - r.h) / 2);
    expect(r.w / r.h).toBeCloseTo(240 / 300, 5);
  });

  it('pathToPolygon flattens M/L/C/Z paths and scalePolygon scales', () => {
    const poly = pathToPolygon('M0 0 L10 0 C10 10 0 10 0 10 Z', 4);
    expect(poly.length).toBeGreaterThan(4);
    const b = polygonBounds([scalePolygon(poly, 2)]);
    expect(b.x1).toBeCloseTo(20);
    expect(b.y1).toBeCloseTo(20);
  });
});

describe('buildProduct — the full range', () => {
  const MM: Record<string, [number, number]> = {
    mug: [209, 98], framedPrint: [279, 356],
    cushion: [280, 280], blanket: [600, 1000], sack: [320, 500],
    storybook: [148, 210], jigsaw: [250, 200], calendar: [297, 210],
    card: [127, 178], bauble: [82, 82],
  };

  it('every SPINNABLE product builds a centred model within physical bounds', () => {
    for (const kind of SPINNABLE) {
      const [w, h] = MM[kind]!;
      const model = buildProduct(kind, new THREE.Texture(), w, h, { colour: 'gold', size: 'heart' });
      expect(model, kind).toBeTruthy();
      const box = new THREE.Box3().setFromObject(model!);
      const size = box.getSize(new THREE.Vector3());
      expect(size.x, `${kind} width`).toBeGreaterThan(10);
      // Envelope guard only (the camera auto-fits; garments never reach true-scale AR).
      // The adult tee's nominal width is ~1210mm: its TORSO anchors to the verified
      // 555mm and the drawn flat-lay sleeves are stylised-wide.
      expect(size.x, `${kind} width`).toBeLessThan(1300);
      expect(size.y, `${kind} height`).toBeLessThan(1700);
      const centre = box.getCenter(new THREE.Vector3());
      expect(Math.abs(centre.x), `${kind} centred x`).toBeLessThan(size.x * 0.25 + 1);
      expect(Math.abs(centre.y), `${kind} centred y`).toBeLessThan(size.y * 0.25 + 1);
    }
  });

  it('giftWrap has no 3D; unknown kinds return null', () => {
    expect(has3D('giftWrap')).toBe(false);
    expect(buildProduct('giftWrap', new THREE.Texture(), 10, 10)).toBeNull();
  });

  it('sack print patch spans the official 320mm panel (physical registration in mm)', () => {
    const model = buildProduct('sack', new THREE.Texture(), 320, 500)!;
    // the patch is the only mesh with MultiplyBlending (ink-on-fabric)
    let patchWidth = 0;
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.material as THREE.Material).blending === THREE.MultiplyBlending) {
        const box = new THREE.Box3().setFromObject(mesh);
        patchWidth = box.getSize(new THREE.Vector3()).x;
      }
    });
    expect(patchWidth).toBeCloseTo(320, 0); // Prodigi's 320×500mm sack panel, true mm
  });
});
