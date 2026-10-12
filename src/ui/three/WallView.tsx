'use client';

import { useEffect, useRef, useState } from 'react';
import { FRAME_FINISH, paintPlacement } from './models';
import type { PlacementTransform } from '@/lib/store';

/**
 * Tier-D "see it on your wall" (PREVIEW-state-of-the-art brief), framed prints.
 * Two layers, both privacy-clean:
 *  1. ROOM COMPOSITE (100% of devices, no WebGL): the framed print drawn at TRUE
 *     physical scale into a styled room, with a side-table + skirting as unconscious
 *     scale anchors — so a parent sees whether it's the size they pictured.
 *  2. WALL AR (mobile): <model-viewer> anchors a client-generated GLB to the real
 *     wall at fixed true scale. The design never leaves the page — WebXR keeps the
 *     GLB blob in-browser; iOS Quick Look auto-generates the USDZ on-device. Scene
 *     Viewer is deliberately NOT offered (it would fetch the child-artwork GLB by URL).
 */

export interface WallViewProps {
  image: string;
  fallbackImage?: string | null;
  placement: PlacementTransform;
  printWmm: number;
  printHmm: number;
  frameColour: string;
  className?: string;
}

const CANVAS_W = 640;
const CANVAS_H = 480;
const FLOOR_Y = 384; // wall above, floor below
const WALL_CM = 165; // real cm of wall shown from floor to top → the scale reference
const FRAME_FACE_MM = 22; // mirrors the 3D frame's face width

const cmPerPx = WALL_CM / FLOOR_Y;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}

function drawRoom(ctx: CanvasRenderingContext2D) {
  // wall: soft warm vertical gradient
  const wall = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  wall.addColorStop(0, '#F3EADB');
  wall.addColorStop(1, '#EADFC9');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, CANVAS_W, FLOOR_Y);
  // a gentle key-light glow upper-left
  const glow = ctx.createRadialGradient(140, 90, 20, 140, 90, 420);
  glow.addColorStop(0, 'rgba(255,251,240,0.55)');
  glow.addColorStop(1, 'rgba(255,251,240,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_W, FLOOR_Y);
  // floor
  const floor = ctx.createLinearGradient(0, FLOOR_Y, 0, CANVAS_H);
  floor.addColorStop(0, '#D8C3A0');
  floor.addColorStop(1, '#C9B08A');
  ctx.fillStyle = floor;
  ctx.fillRect(0, FLOOR_Y, CANVAS_W, CANVAS_H - FLOOR_Y);
  // skirting board (a real ~12cm scale cue)
  const skirtH = 12 / cmPerPx;
  ctx.fillStyle = '#F6F1E7';
  ctx.fillRect(0, FLOOR_Y - skirtH, CANVAS_W, skirtH);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, FLOOR_Y - 2, CANVAS_W, 2);

  // a side table (right) — a ~44cm-tall scale anchor + styling
  const tableH = 44 / cmPerPx;
  const tableW = 78 / cmPerPx;
  const tx = CANVAS_W - tableW - 26;
  const ty = FLOOR_Y - skirtH;
  ctx.fillStyle = '#B98D5E';
  ctx.fillRect(tx, ty - tableH, tableW, 6); // top
  ctx.fillRect(tx + 6, ty - tableH + 6, 6, tableH - 6); // legs
  ctx.fillRect(tx + tableW - 12, ty - tableH + 6, 6, tableH - 6);
  // a little plant on the table
  const potW = 26 / cmPerPx;
  const px = tx + tableW / 2 - potW / 2;
  const py = ty - tableH;
  ctx.fillStyle = '#C8623A';
  ctx.fillRect(px, py - 14, potW, 14); // pot
  ctx.fillStyle = '#93B97C';
  ctx.beginPath();
  ctx.ellipse(px + potW / 2, py - 22, potW * 0.7, 20, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw the framed print at true scale, centred over the wall a touch above middle. */
function drawFramedPrint(ctx: CanvasRenderingContext2D, design: HTMLCanvasElement, printWmm: number, printHmm: number, colour: string) {
  const outerWpx = ((printWmm + 2 * FRAME_FACE_MM) / 10) / cmPerPx;
  const outerHpx = ((printHmm + 2 * FRAME_FACE_MM) / 10) / cmPerPx;
  const facePx = (FRAME_FACE_MM / 10) / cmPerPx;
  const cx = CANVAS_W * 0.42;
  const cy = FLOOR_Y * 0.46;
  const x = cx - outerWpx / 2;
  const y = cy - outerHpx / 2;

  // soft cast shadow on the wall (down-right)
  ctx.save();
  ctx.shadowColor = 'rgba(46,39,35,0.28)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 10;
  ctx.shadowOffsetY = 16;
  const finish = FRAME_FINISH[colour] ?? FRAME_FINISH.gold!;
  // metallic-ish frame with a subtle sheen gradient
  const g = ctx.createLinearGradient(x, y, x + outerWpx, y + outerHpx);
  g.addColorStop(0, finish.color);
  g.addColorStop(0.5, finish.metalness > 0.5 ? '#EAD79A' : finish.color);
  g.addColorStop(1, finish.color);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, outerWpx, outerHpx);
  ctx.restore();

  // the print (design), inset by the frame face
  ctx.drawImage(design, x + facePx, y + facePx, outerWpx - 2 * facePx, outerHpx - 2 * facePx);
  // a thin inner bevel line
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + facePx, y + facePx, outerWpx - 2 * facePx, outerHpx - 2 * facePx);
}

export default function WallView({ image, fallbackImage, placement, printWmm, printHmm, frameColour, className }: WallViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arHostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [arState, setArState] = useState<'idle' | 'loading' | 'ready' | 'unsupported'>('idle');
  const isTouch = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

  // Room composite — the universal, WebGL-free path.
  useEffect(() => {
    let disposed = false;
    (async () => {
      let img: HTMLImageElement;
      try {
        img = await loadImage(image);
      } catch {
        if (!fallbackImage) return setFailed(true);
        try {
          img = await loadImage(fallbackImage);
        } catch {
          return setFailed(true);
        }
      }
      if (disposed) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return setFailed(true);
      try {
        drawRoom(ctx);
        const design = paintPlacement(img, printWmm, printHmm, placement);
        drawFramedPrint(ctx, design, printWmm, printHmm, frameColour);
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [image, fallbackImage, placement, printWmm, printHmm, frameColour]);

  // Wall AR — mobile only; mounts <model-viewer> with a client-built GLB on demand.
  const launchAr = async () => {
    if (arState === 'loading') return;
    setArState('loading');
    try {
      await import('@google/model-viewer');
      const { buildFrameGlbUrl } = await import('./frameGlb');
      const url = await buildFrameGlbUrl({ image, fallbackImage, placement, printWmm, printHmm, frameColour });
      const host = arHostRef.current;
      if (!host) return;
      host.replaceChildren();
      const mv = document.createElement('model-viewer') as HTMLElement & { canActivateAR?: boolean; activateAR?: () => void };
      mv.setAttribute('src', url);
      mv.setAttribute('alt', 'your framed keepsake, to place on your wall');
      mv.setAttribute('ar', '');
      mv.setAttribute('ar-modes', 'webxr quick-look'); // NOT scene-viewer (privacy)
      mv.setAttribute('ar-placement', 'wall');
      mv.setAttribute('ar-scale', 'fixed'); // true physical size, not pinch-resizable
      mv.setAttribute('camera-controls', '');
      mv.setAttribute('shadow-intensity', '1');
      mv.setAttribute('style', 'width:100%;height:320px;background:transparent;--poster-color:transparent');
      host.appendChild(mv);
      // Give it a tick to load, then check AR capability and auto-enter if possible.
      const t = setTimeout(() => {
        if (mv.canActivateAR) {
          setArState('ready');
          mv.activateAR?.();
        } else {
          setArState('unsupported');
        }
      }, 900);
      mv.addEventListener('load', () => {
        clearTimeout(t);
        if (mv.canActivateAR) {
          setArState('ready');
          mv.activateAR?.();
        } else {
          setArState('unsupported');
        }
      });
    } catch {
      setArState('unsupported');
    }
  };

  if (failed) {
    return (
      <div className={`flex items-center justify-center rounded-2xl bg-oat p-6 text-center text-xs text-ink-faint ${className ?? ''}`}>
        the room view isn’t available here — the photo preview shows exactly what prints
      </div>
    );
  }

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        role="img"
        aria-label="your framed keepsake shown at true size in a room, with a side table for scale"
        className="w-full rounded-2xl"
      />
      <div ref={arHostRef} />
      <div className="mt-2 flex flex-col items-center gap-1">
        {isTouch ? (
          <>
            <button
              type="button"
              onClick={launchAr}
              disabled={arState === 'loading'}
              className="rounded-full border border-cinnamon bg-paper-2 px-4 py-1.5 text-xs font-bold text-cocoa disabled:opacity-60"
            >
              {arState === 'loading' ? 'getting it ready…' : 'view on your real wall'}
            </button>
            {arState === 'unsupported' ? (
              <p className="text-[11px] text-ink-faint">your device can’t open the live wall view — the room preview above is true-to-size</p>
            ) : null}
          </>
        ) : (
          <p className="text-[11px] text-ink-faint">open snickerdoodle on your phone to place it on your real wall</p>
        )}
        <p className="text-[11px] text-ink-faint">shown true-to-size · the photo view is the exact print</p>
      </div>
    </div>
  );
}
