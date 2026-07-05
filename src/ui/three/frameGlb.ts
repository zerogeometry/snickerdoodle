import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { buildFrame, paintPlacement } from './models';
import type { PlacementTransform } from '@/lib/store';

/**
 * Build a framed-print GLB entirely in the browser, at TRUE physical scale, from the
 * SAME parametric model as the live spin view (models.ts). Feeds <model-viewer>'s
 * wall AR: the drawing is a client-side canvas texture, so nothing leaves the page —
 * model-viewer's WebXR path keeps the blob in-browser and its Quick Look path
 * auto-generates the iOS USDZ on-device (no server, no third party). We deliberately
 * DO NOT offer Scene Viewer (it would fetch the child-artwork GLB by URL from Google's
 * native app — a privacy leak the research flagged).
 *
 * GLB units are METRES for AR true-scale, so the mm model is scaled ÷1000.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}

export async function buildFrameGlbUrl(args: {
  image: string;
  fallbackImage?: string | null;
  placement: PlacementTransform;
  printWmm: number;
  printHmm: number;
  frameColour: string;
}): Promise<string> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(args.image);
  } catch {
    if (!args.fallbackImage) throw new Error('image load failed');
    img = await loadImage(args.fallbackImage);
  }

  const texCanvas = paintPlacement(img, args.printWmm, args.printHmm, args.placement);
  const texture = new THREE.CanvasTexture(texCanvas);
  const model = buildFrame(texture, args.printWmm, args.printHmm, args.frameColour);
  // mm → m for AR true scale; wall AR anchors the model's -z face to the wall, so face
  // the print outward (+z toward the viewer is model-viewer's default forward).
  model.scale.setScalar(0.001);

  const scene = new THREE.Scene();
  scene.add(model);

  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(scene, { binary: true })) as ArrayBuffer;
  texture.dispose();
  return URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
}
