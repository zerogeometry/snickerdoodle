'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { paintPlacement } from './models';
import { buildProduct } from './builders';
import type { PlacementTransform } from '@/lib/store';

/**
 * Tier-C interactive 3D preview (PREVIEW-state-of-the-art brief) — fully CLIENT-SIDE:
 * the drawing is painted onto a canvas texture in the browser and mapped onto a
 * PARAMETRIC model built in code (models.ts — shared with the AR GLB export so the
 * spun model and the wall-anchored model are identical). Nothing leaves the page.
 *
 * Honesty: the print-area texture is drawn through the SAME shared geometry as the
 * print renderer and compositor (cover-fit over the bleed canvas, trim-box window),
 * so the wrap shows the exact printed crop. The 3D view is additive — the Tier-B
 * photoreal still remains the default and the accessible representation (WebGL is
 * invisible to the accessibility tree).
 */

export interface Product3DProps {
  /** Product key — any SPINNABLE product (builders.ts dispatches the model). */
  kind: string;
  /** Same-origin-safe image source (data: URL or CORS-enabled signed URL). */
  image: string;
  /** Fallback source if the primary taints the canvas (e.g. a signed URL without CORS). */
  fallbackImage?: string | null;
  placement: PlacementTransform;
  /** The variant's print canvas in mm (from the catalogue payload). */
  printWmm: number;
  printHmm: number;
  /** The chosen variant attributes (colour drives the frame finish / blanket back;
   * size drives the cushion shape). */
  attributes?: Record<string, string>;
  className?: string;
}

export { webglAvailable } from './models';

export default function Product3D({ kind, image, fallbackImage, placement, printWmm, printHmm, attributes, className }: Product3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let cleanupResize: (() => void) | null = null;
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
      const model = buildProduct(kind, texture, printWmm, printHmm, attributes ?? {});
      if (!model) return setFailed(true);
      scene.add(model);

      // fit the camera to the model — near/far scale with it (a large blanket is
      // 1500mm; a fixed far plane would clip it when zoomed out to maxDistance)
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) + maxDim * 0.35;
      camera.position.set(0, maxDim * 0.08, dist);
      camera.near = Math.max(0.5, maxDim / 200);
      camera.far = (dist + maxDim) * 3;
      camera.updateProjectionMatrix();

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

      // Track the host's size (orientation change, responsive relayout) — the canvas
      // is otherwise frozen at its mount-time dimensions.
      const ro = new ResizeObserver(() => {
        if (!renderer || disposed) return;
        const w = host.clientWidth || W;
        const h = host.clientHeight || H;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      });
      ro.observe(host);
      cleanupResize = () => ro.disconnect();
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
      cleanupResize?.();
      controls?.dispose();
      if (renderer) {
        renderer.dispose();
        renderer.domElement.remove();
      }
    };
  }, [kind, image, fallbackImage, placement, printWmm, printHmm, attributes]);

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
