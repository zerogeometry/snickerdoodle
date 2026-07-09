import * as THREE from 'three';
import { clampTransform, computeLayerRect } from '@/server/print/geometry';
import type { PlacementTransform } from '@/lib/store';

/**
 * Parametric 3D product models built in code (no marketplace GLBs — their licences
 * forbid raw model distribution to browsers; a cylinder and a box carry no licence).
 * Shared by the live spin view (Product3D) AND the AR GLB export (frameGlb), so the
 * thing you rotate on screen is byte-for-byte the thing that anchors to your wall.
 *
 * Placement is painted through the SAME shared print geometry as the renderer and the
 * compositor (cover-fit over the bleed canvas, trim-box window) — the wrap shows the
 * exact printed crop, so 3D can't drift from what prints.
 */

export const FRAME_FINISH: Record<string, { color: string; metalness: number; roughness: number }> = {
  gold: { color: '#C9A227', metalness: 0.85, roughness: 0.3 },
  black: { color: '#241f1b', metalness: 0.1, roughness: 0.55 },
  white: { color: '#F4F1EA', metalness: 0.05, roughness: 0.6 },
  natural: { color: '#C8A06A', metalness: 0.05, roughness: 0.65 },
  brown: { color: '#6B4A32', metalness: 0.05, roughness: 0.6 },
  'dark grey': { color: '#4D4C4A', metalness: 0.08, roughness: 0.55 },
  'light grey': { color: '#C6C4BF', metalness: 0.05, roughness: 0.6 },
  silver: { color: '#B9B6AE', metalness: 0.8, roughness: 0.35 },
};

/** Paint the PRINT AREA (trim box, white margins) with the placed design onto a 2D
 * canvas — the compositor's bleed-exact windowing in canvas form. */
export function paintPlacement(img: HTMLImageElement | HTMLCanvasElement, wMm: number, hMm: number, tf: PlacementTransform): HTMLCanvasElement {
  const W = 1024;
  const H = Math.max(8, Math.round((W * hMm) / wMm));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const iw0 = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const ih0 = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const t = clampTransform(tf);
  const pxPerMm = W / wMm;
  const rect = computeLayerRect(
    { printWidthPx: W, printHeightPx: H, bleedMm: 3, requiredDpi: pxPerMm * 25.4 },
    { width: iw0 || 1, height: ih0 || 1 },
    t,
  );
  const bleedPx = Math.round((rect.canvasWidth - W) / 2);
  const swap = t.rotationDeg % 180 !== 0;
  const iw = swap ? rect.height : rect.width;
  const ih = swap ? rect.width : rect.height;
  const cx = rect.x - bleedPx + rect.width / 2;
  const cy = rect.y - bleedPx + rect.height / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((t.rotationDeg * Math.PI) / 180);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
  return canvas;
}

export function buildMug(texture: THREE.CanvasTexture, wrapWmm: number, wrapHmm: number): THREE.Group {
  const group = new THREE.Group();
  const R = 41;
  const H = 96;
  // Glazed ceramic: a clearcoat over a slightly rough body gives the sharp glaze highlight while the
  // scene environment (Product3D) supplies the soft studio reflection — reads as real porcelain, not
  // matte CGI. `glaze()` is shared by the body, handle and the printed decal so the sheen is uniform.
  const glaze = (extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color: '#f7f5f1', roughness: 0.5, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.16, envMapIntensity: 1, ...extra });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 96, 1, false), glaze());
  group.add(body);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(24, 6.5, 24, 48, Math.PI),
    glaze(),
  );
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(R + 3, 0, 0);
  group.add(handle);
  const theta = Math.min((wrapWmm / (2 * Math.PI * R)) * 2 * Math.PI, Math.PI * 1.96);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.repeat.x = -1;
  texture.offset.x = 1;
  const printH = Math.min(wrapHmm, H - 4);
  const decal = new THREE.Mesh(
    // Centre the print band on +Z (facing the camera) so the FRONT view shows the art dead-centre
    // with the handle to the side — not tucked behind the handle at +X. Display-only; print unaffected.
    new THREE.CylinderGeometry(R + 0.35, R + 0.35, printH, 96, 1, true, -theta / 2, theta),
    glaze({ map: texture, color: '#ffffff', roughness: 0.45 }), // white base so the art keeps its true colour
  );
  group.add(decal);
  return group;
}

export function buildFrame(texture: THREE.CanvasTexture, wMm: number, hMm: number, colour: string): THREE.Group {
  const group = new THREE.Group();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const board = 4;
  const printMats = [
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75, metalness: 0 }),
    new THREE.MeshStandardMaterial({ color: '#efece4', roughness: 0.85 }),
  ];
  const print = new THREE.Mesh(new THREE.BoxGeometry(wMm, hMm, board), printMats);
  group.add(print);
  const finish = FRAME_FINISH[colour] ?? FRAME_FINISH.gold!;
  const mat = new THREE.MeshStandardMaterial(finish);
  const face = 22;
  const depth = 30;
  const zOff = (depth - board) / 2 - 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(wMm + 2 * face, face, depth), mat);
  top.position.set(0, hMm / 2 + face / 2, zOff);
  const bottom = top.clone();
  bottom.position.y = -(hMm / 2 + face / 2);
  const left = new THREE.Mesh(new THREE.BoxGeometry(face, hMm, depth), mat);
  left.position.set(-(wMm / 2 + face / 2), 0, zOff);
  const right = left.clone();
  right.position.x = wMm / 2 + face / 2;
  group.add(top, bottom, left, right);
  return group;
}

/** True when a WebGL context is obtainable — the offer gate for any 3D/AR view. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
