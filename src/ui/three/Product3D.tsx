'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { clampTransform, computeLayerRect } from '@/server/print/geometry';
import type { PlacementTransform } from '@/lib/store';

/**
 * Tier-C interactive 3D preview (PREVIEW-state-of-the-art brief) — fully CLIENT-SIDE:
 * the drawing is painted onto a canvas texture in the browser and mapped onto a
 * PARAMETRIC model built in code (no marketplace GLBs — their licences forbid raw
 * model distribution; a cylinder and a box carry no licence at all). Nothing leaves
 * the page: the same image element the 2D preview shows becomes the texture.
 *
 * Honesty: the print-area texture is drawn through the SAME shared geometry as the
 * print renderer and compositor (cover-fit over the bleed canvas, trim-box window),
 * so the wrap shows the exact printed crop. The 3D view is additive — the Tier-B
 * photoreal still remains the default and the accessible representation (WebGL is
 * invisible to the accessibility tree).
 */

export type Product3DKind = 'mug' | 'framedPrint';

export interface Product3DProps {
  kind: Product3DKind;
  /** Same-origin-safe image source (data: URL or CORS-enabled signed URL). */
  image: string;
  /** Fallback source if the primary taints the canvas (e.g. a signed URL without CORS). */
  fallbackImage?: string | null;
  placement: PlacementTransform;
  /** Print area in mm (the wrap for the mug; the paper for the frame). */
  printWmm: number;
  printHmm: number;
  /** Frame colour name (framedPrint only): gold | black | white | natural. */
  frameColour?: string;
  className?: string;
}

const FRAME_FINISH: Record<string, { color: string; metalness: number; roughness: number }> = {
  gold: { color: '#C9A227', metalness: 0.85, roughness: 0.3 },
  black: { color: '#241f1b', metalness: 0.1, roughness: 0.55 },
  white: { color: '#F4F1EA', metalness: 0.05, roughness: 0.6 },
  natural: { color: '#C8A06A', metalness: 0.05, roughness: 0.65 },
};

/** Paint the PRINT AREA (trim box, white margins) with the placed design — the same
 * maths as the compositor's bleed-exact windowing, in 2D canvas form. */
function paintPlacement(img: HTMLImageElement, wMm: number, hMm: number, tf: PlacementTransform): HTMLCanvasElement {
  const W = 1024;
  const H = Math.max(8, Math.round((W * hMm) / wMm));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const t = clampTransform(tf);
  const pxPerMm = W / wMm;
  const rect = computeLayerRect(
    { printWidthPx: W, printHeightPx: H, bleedMm: 3, requiredDpi: pxPerMm * 25.4 },
    { width: img.naturalWidth || 1, height: img.naturalHeight || 1 },
    t,
  );
  const bleedPx = Math.round((rect.canvasWidth - W) / 2);
  const swap = t.rotationDeg % 180 !== 0;
  const iw = swap ? rect.height : rect.width; // pre-rotation draw size
  const ih = swap ? rect.width : rect.height;
  const cx = rect.x - bleedPx + rect.width / 2;
  const cy = rect.y - bleedPx + rect.height / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H); // trim-box clip — overflow is bleed, not visible print
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((t.rotationDeg * Math.PI) / 180);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
  return canvas;
}

function buildMug(texture: THREE.CanvasTexture, wrapWmm: number, wrapHmm: number): THREE.Group {
  const group = new THREE.Group();
  // 11oz-class proportions (mm): Ø82 body, 96 tall. The wrap arc = wrapWmm of the
  // circumference; the decal sits a hair off the body so it never z-fights.
  const R = 41;
  const H = 96;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, H, 96, 1, false),
    new THREE.MeshStandardMaterial({ color: '#f6f4f0', roughness: 0.32, metalness: 0.02 }),
  );
  group.add(body);
  // handle: a half-torus on +x
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(24, 6.5, 24, 48, Math.PI),
    new THREE.MeshStandardMaterial({ color: '#f6f4f0', roughness: 0.32, metalness: 0.02 }),
  );
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(R + 3, 0, 0);
  group.add(handle);
  // print wrap: open cylinder segment, arc length = wrapWmm (capped just short of full)
  const theta = Math.min((wrapWmm / (2 * Math.PI * R)) * 2 * Math.PI, Math.PI * 1.96);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // Cylinder UVs run u with theta — mirror horizontally so the art reads correctly
  // from OUTSIDE the mug (cylinder u maps counter-clockwise seen from outside).
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.repeat.x = -1;
  texture.offset.x = 1;
  const printH = Math.min(wrapHmm, H - 4);
  // face the wrap's CENTRE toward the camera (camera starts on +z; handle on +x)
  const decal = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.35, R + 0.35, printH, 96, 1, true, Math.PI / 2 - theta / 2, theta),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.3, metalness: 0.02 }),
  );
  group.add(decal);
  return group;
}

function buildFrame(texture: THREE.CanvasTexture, wMm: number, hMm: number, colour: string): THREE.Group {
  const group = new THREE.Group();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  // the print: a thin board, textured on the front face only
  const board = 4;
  const printMats = [
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }), // +x edge
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#f2efe8', roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75, metalness: 0 }), // +z front
    new THREE.MeshStandardMaterial({ color: '#efece4', roughness: 0.85 }), // back
  ];
  const print = new THREE.Mesh(new THREE.BoxGeometry(wMm, hMm, board), printMats);
  group.add(print);
  // the frame: four mitred-ish bars around the print
  const finish = FRAME_FINISH[colour] ?? FRAME_FINISH.gold!;
  const mat = new THREE.MeshStandardMaterial(finish);
  const face = 22; // frame face width (mm)
  const depth = 30;
  const zOff = (depth - board) / 2 - 2; // frame proud of the print
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

/** True when a WebGL context is obtainable — the offer gate for the 3D view. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function Product3D({ kind, image, fallbackImage, placement, printWmm, printHmm, frameColour, className }: Product3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let raf = 0;

    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = src;
      });

    (async () => {
      let img: HTMLImageElement;
      try {
        img = await loadImg(image);
      } catch {
        if (!fallbackImage) return setFailed(true);
        try {
          img = await loadImg(fallbackImage);
        } catch {
          return setFailed(true);
        }
      }
      if (disposed) return;

      const W = host.clientWidth || 360;
      const H = host.clientHeight || 360;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, W / H, 1, 5000);

      const texture = new THREE.CanvasTexture(paintPlacement(img, printWmm, printHmm, placement));
      const model = kind === 'mug' ? buildMug(texture, printWmm, printHmm) : buildFrame(texture, printWmm, printHmm, frameColour ?? 'gold');
      scene.add(model);

      // fit the camera to the model
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) + maxDim * 0.35;
      camera.position.set(0, maxDim * 0.08, dist);

      // warm, soft studio light
      scene.add(new THREE.HemisphereLight('#fffdf6', '#c9bda9', 1.1));
      const key = new THREE.DirectionalLight('#fff6e6', 1.6);
      key.position.set(0.6 * dist, 0.8 * dist, dist);
      scene.add(key);
      const fill = new THREE.DirectionalLight('#eef3f8', 0.5);
      fill.position.set(-dist, 0.2 * dist, 0.4 * dist);
      scene.add(fill);

      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        return setFailed(true);
      }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H);
      renderer.setClearColor(0x000000, 0);
      host.appendChild(renderer.domElement);

      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = !reducedMotion;
      controls.minDistance = dist * 0.5;
      controls.maxDistance = dist * 1.8;
      controls.minPolarAngle = 0.6;
      controls.maxPolarAngle = 2.2;

      const render = () => renderer && renderer.render(scene, camera);
      // Always render on interaction too: in a background/throttled tab rAF never
      // fires, and reduced-motion opts out of the loop entirely — 'change' covers both.
      controls.addEventListener('change', render);
      if (!reducedMotion) {
        const loop = () => {
          if (disposed) return;
          controls!.update();
          render();
          raf = requestAnimationFrame(loop);
        };
        loop();
      }

      // WebGL uploads from a tainted canvas throw at first render — catch → fallback
      try {
        render();
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      controls?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, [kind, image, fallbackImage, placement, printWmm, printHmm, frameColour]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-[#FBF5E9] p-6 text-center text-xs text-[#9C8E7E] ${className ?? ''}`}>
        the spin-around view isn’t available here — the photo preview shows exactly what prints
      </div>
    );
  }
  return (
    <div
      ref={hostRef}
      role="img"
      aria-label="a 3D preview of your keepsake — drag to spin it around; the photo view remains the exact print preview"
      className={`h-full w-full touch-none ${className ?? ''}`}
    />
  );
}
