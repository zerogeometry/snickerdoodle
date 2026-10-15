'use client';

import { IconArrowBackUp, IconBrush, IconColorPicker, IconEraser, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { Toggle } from '@/ui/primitives/Toggle';
import { toast } from '@/lib/store';
import { cutoutAlphaAction, removeBackgroundAction, saveCutoutMaskAction } from '@/app/actions/magic';

/** Matches TOUCHUP_EDGE on the server: the editing copy's longest side. */
const EDGE = 1600;
const BACKDROPS: [string, string][] = [
  ['white', '#ffffff'],
  ['black', '#111111'],
  ['navy', '#1f2b4d'],
  ['red', '#b3262a'],
  ['kraft', '#c8a57a'],
];
type Tool = 'tap' | 'erase' | 'restore';

/** sRGB → CIE Lab (D65) — perceptual distance, so "this colour" matches how people see it. */
function toLab(r: number, g: number, b: number): [number, number, number] {
  const lin = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * Touch up a cutout by hand — for what automatic removal can't decide (a painted background, a
 * stray mark). Tap a colour to remove it (everywhere, or just that area), erase / restore with a
 * brush (finger or stylus), undo, and see the result on the colours it'll be printed on. Works on
 * an editing copy; saving sends only a transparency mask, which the server applies to the
 * original — the original itself is never changed.
 */
export function CutoutTouchUp({
  open,
  onClose,
  assetId,
  imageDataUrl,
  hasCutout,
  intro,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  assetId: string | null;
  imageDataUrl: string;
  hasCutout: boolean;
  /** A line shown at the top, e.g. when automatic removal found no plain paper. */
  intro?: string;
  onSaved: (cutout: { url: string; sourceObjectId: string }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const work = useRef<{ w: number; h: number; rgb: Uint8ClampedArray; lab: Float32Array; alpha: Uint8ClampedArray; start: Uint8ClampedArray } | null>(null);
  const undo = useRef<Uint8ClampedArray[]>([]);
  const stroke = useRef<{ active: boolean; last: [number, number] | null }>({ active: false, last: null });
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>('tap');
  const [everywhere, setEverywhere] = useState(true);
  const [fussy, setFussy] = useState(28); // Lab distance tolerance
  const [brush, setBrush] = useState(28); // px at editing size
  const [backdrop, setBackdrop] = useState('#1f2b4d');
  const [keepWhite, setKeepWhite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0); // re-render trigger after pixel edits

  // ── load the editing copy + starting transparency ──
  useEffect(() => {
    if (!open || !assetId) return;
    let live = true;
    setReady(false);
    undo.current = [];
    (async () => {
      const img = await loadImage(imageDataUrl);
      const scale = Math.min(1, EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, w, h);
      const px = ctx.getImageData(0, 0, w, h).data;
      const rgb = new Uint8ClampedArray(w * h * 3);
      const lab = new Float32Array(w * h * 3);
      for (let k = 0; k < w * h; k++) {
        rgb[k * 3] = px[k * 4]!;
        rgb[k * 3 + 1] = px[k * 4 + 1]!;
        rgb[k * 3 + 2] = px[k * 4 + 2]!;
        const L = toLab(px[k * 4]!, px[k * 4 + 1]!, px[k * 4 + 2]!);
        lab[k * 3] = L[0];
        lab[k * 3 + 1] = L[1];
        lab[k * 3 + 2] = L[2];
      }
      const alpha = new Uint8ClampedArray(w * h).fill(255);
      if (hasCutout) {
        const res = await cutoutAlphaAction({ assetId });
        if (res.ok && res.mask) await readMaskInto(res.mask, alpha, w, h);
      }
      if (!live) return;
      work.current = { w, h, rgb, lab, alpha, start: alpha.slice() };
      setReady(true);
      setTick((t) => t + 1);
    })().catch(() => toast('couldn’t open the touch-up — try again'));
    return () => {
      live = false;
    };
  }, [open, assetId, imageDataUrl, hasCutout]);

  // ── draw: backdrop + image with the current transparency ──
  useEffect(() => {
    const wk = work.current, cv = canvasRef.current;
    if (!ready || !wk || !cv) return;
    const id = requestAnimationFrame(() => {
      const { w, h, rgb, alpha } = wk;
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d')!;
      const img = ctx.createImageData(w, h);
      const d = img.data;
      const br = parseInt(backdrop.slice(1, 3), 16), bg = parseInt(backdrop.slice(3, 5), 16), bb = parseInt(backdrop.slice(5, 7), 16);
      for (let k = 0; k < w * h; k++) {
        const a = alpha[k]! / 255;
        d[k * 4] = rgb[k * 3]! * a + br * (1 - a);
        d[k * 4 + 1] = rgb[k * 3 + 1]! * a + bg * (1 - a);
        d[k * 4 + 2] = rgb[k * 3 + 2]! * a + bb * (1 - a);
        d[k * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [ready, tick, backdrop]);

  const pushUndo = () => {
    const wk = work.current;
    if (!wk) return;
    undo.current.push(wk.alpha.slice());
    if (undo.current.length > 25) undo.current.shift();
  };

  const toImage = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const wk = work.current!;
    return [((e.clientX - r.left) / r.width) * wk.w, ((e.clientY - r.top) / r.height) * wk.h];
  };

  /** Remove a colour: soft falloff around the tolerance so edges stay smooth. */
  const removeColour = useCallback(
    (x: number, y: number) => {
      const wk = work.current;
      if (!wk) return;
      const { w, h, lab, alpha } = wk;
      // target = mean Lab of a 5×5 patch (steadier than one pixel)
      let L = 0, A = 0, B = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const k = (yy * w + xx) * 3;
          L += lab[k]!;
          A += lab[k + 1]!;
          B += lab[k + 2]!;
          n++;
        }
      }
      if (!n) return;
      L /= n;
      A /= n;
      B /= n;
      const hard = fussy * 0.7, soft = fussy;
      const factor = (k: number) => {
        const dE = Math.hypot(lab[k * 3]! - L, lab[k * 3 + 1]! - A, lab[k * 3 + 2]! - B);
        if (dE <= hard) return 0;
        if (dE >= soft) return 1;
        const t = (dE - hard) / (soft - hard);
        return t * t * (3 - 2 * t);
      };
      pushUndo();
      if (everywhere) {
        for (let k = 0; k < w * h; k++) {
          const f = factor(k);
          if (f < 1) alpha[k] = alpha[k]! * f;
        }
      } else {
        // only the connected area around the tap
        const seen = new Uint8Array(w * h);
        const stack = [Math.round(y) * w + Math.round(x)];
        while (stack.length) {
          const k = stack.pop()!;
          if (seen[k]) continue;
          seen[k] = 1;
          const f = factor(k);
          if (f >= 1) continue;
          alpha[k] = alpha[k]! * f;
          const kx = k % w;
          if (kx > 0) stack.push(k - 1);
          if (kx < w - 1) stack.push(k + 1);
          if (k >= w) stack.push(k - w);
          if (k < w * h - w) stack.push(k + w);
        }
      }
      setTick((t) => t + 1);
    },
    [everywhere, fussy],
  );

  /** Paint a soft round dab (erase → clear, restore → keep). */
  const dab = (x: number, y: number) => {
    const wk = work.current;
    if (!wk) return;
    const { w, h, alpha } = wk;
    const r = brush / 2, feather = Math.max(1.5, r * 0.25);
    const target = tool === 'erase' ? 0 : 255;
    for (let yy = Math.max(0, Math.floor(y - r - 1)); yy <= Math.min(h - 1, Math.ceil(y + r + 1)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - r - 1)); xx <= Math.min(w - 1, Math.ceil(x + r + 1)); xx++) {
        const dist = Math.hypot(xx - x, yy - y);
        if (dist > r) continue;
        const s = Math.min(1, (r - dist) / feather); // strength, soft rim
        const k = yy * w + xx;
        alpha[k] = alpha[k]! + (target - alpha[k]!) * s;
      }
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!work.current) return;
    const [x, y] = toImage(e);
    if (tool === 'tap') return removeColour(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
    pushUndo();
    stroke.current = { active: true, last: [x, y] };
    dab(x, y);
    setTick((t) => t + 1);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!stroke.current.active || tool === 'tap') return;
    const [x, y] = toImage(e);
    const [lx, ly] = stroke.current.last ?? [x, y];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - lx, y - ly) / Math.max(2, brush / 4)));
    for (let i = 1; i <= steps; i++) dab(lx + ((x - lx) * i) / steps, ly + ((y - ly) * i) / steps);
    stroke.current.last = [x, y];
    setTick((t) => t + 1);
  };
  const onUp = () => {
    stroke.current = { active: false, last: null };
  };

  const doUndo = () => {
    const wk = work.current, prev = undo.current.pop();
    if (!wk || !prev) return;
    wk.alpha.set(prev);
    setTick((t) => t + 1);
  };
  const reset = () => {
    const wk = work.current;
    if (!wk) return;
    pushUndo();
    wk.alpha.set(wk.start);
    setTick((t) => t + 1);
  };

  /** Re-run automatic removal with "keep the white inside shapes" on/off, then reload it. */
  const toggleKeepWhite = async (on: boolean) => {
    if (!assetId || busy) return;
    setBusy(true);
    try {
      const res = await removeBackgroundAction({ assetId, keepEnclosedPaper: on });
      if (!res.ok) return toast('couldn’t change that one — try the brush instead');
      const m = await cutoutAlphaAction({ assetId });
      const wk = work.current;
      if (m.ok && m.mask && wk) {
        pushUndo();
        await readMaskInto(m.mask, wk.alpha, wk.w, wk.h);
        wk.start.set(wk.alpha);
        setKeepWhite(on);
        setTick((t) => t + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const wk = work.current;
    if (!wk || !assetId) return;
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      c.width = wk.w;
      c.height = wk.h;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(wk.w, wk.h);
      for (let k = 0; k < wk.w * wk.h; k++) {
        const a = wk.alpha[k]!;
        img.data[k * 4] = a;
        img.data[k * 4 + 1] = a;
        img.data[k * 4 + 2] = a;
        img.data[k * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const res = await saveCutoutMaskAction({ assetId, mask: c.toDataURL('image/png') });
      if (!res.ok) return toast('that didn’t save — try again');
      toast('saved ✨');
      onSaved({ url: res.url, sourceObjectId: res.sourceObjectId });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="touch up" subtitle={intro ?? 'tap a colour to remove it, or brush bits away or back'} size="xl" fill>
      <div className="flex h-full flex-col gap-3">
        {/* see it on… */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="preview on a colour">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">see it on</span>
          {BACKDROPS.map(([name, hex]) => (
            <button
              key={name}
              type="button"
              aria-label={`preview on ${name}`}
              aria-pressed={backdrop === hex}
              onClick={() => setBackdrop(hex)}
              className={`h-11 w-11 rounded-full border-2 ${backdrop === hex ? 'border-cocoa ring-2 ring-honey' : 'border-cocoa/30'}`}
              style={{ background: hex }}
            />
          ))}
        </div>

        {/* the picture */}
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-paper-2 p-2">
          {ready ? (
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              aria-label="your drawing — tap or brush to edit"
              className="max-h-full max-w-full touch-none select-none rounded-lg"
              style={{ cursor: tool === 'tap' ? 'crosshair' : 'pointer' }}
            />
          ) : (
            <div role="status" className="h-48 w-full animate-pulse rounded-lg bg-line" aria-label="getting your drawing ready" />
          )}
        </div>

        {/* tools — thumb zone */}
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="tool">
            <Chip active={tool === 'tap'} onClick={() => setTool('tap')}>
              <Icon icon={IconColorPicker} size={15} /> tap a colour
            </Chip>
            <Chip active={tool === 'erase'} onClick={() => setTool('erase')}>
              <Icon icon={IconEraser} size={15} /> erase
            </Chip>
            <Chip active={tool === 'restore'} onClick={() => setTool('restore')}>
              <Icon icon={IconBrush} size={15} /> bring back
            </Chip>
            <span className="ml-auto flex gap-1.5">
              <button type="button" onClick={doUndo} aria-label="undo" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa">
                <Icon icon={IconArrowBackUp} size={17} />
              </button>
              <button type="button" onClick={reset} aria-label="start again" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa">
                <Icon icon={IconRefresh} size={17} />
              </button>
            </span>
          </div>

          {tool === 'tap' ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5" role="group" aria-label="where">
                <Chip active={everywhere} onClick={() => setEverywhere(true)}>everywhere</Chip>
                <Chip active={!everywhere} onClick={() => setEverywhere(false)}>just that area</Chip>
              </div>
              <label className="flex min-w-[180px] flex-1 items-center gap-2 text-xs font-bold text-cocoa">
                how fussy
                <input type="range" min={8} max={60} value={fussy} onChange={(e) => setFussy(Number(e.target.value))} className="flex-1 accent-[var(--color-cta)]" aria-label="how close a colour has to be" />
              </label>
            </div>
          ) : (
            <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
              brush size
              <input type="range" min={6} max={120} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="flex-1 accent-[var(--color-cta)]" aria-label="brush size" />
            </label>
          )}

          {hasCutout ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2">
              <span className="text-xs text-cocoa">
                <b>keep the white inside shapes</b>
                <span className="block text-[11px] text-ink-soft">for the whites of eyes, a snowman, a cloud</span>
              </span>
              <Toggle on={keepWhite} onChange={(on) => void toggleKeepWhite(on)} label="keep the white inside shapes" />
            </div>
          ) : null}

          <Button size="lg" className="w-full" onClick={save} disabled={!ready || busy}>
            {busy ? 'saving…' : 'looks good — save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Read a greyscale mask (data URL) into an alpha array of the editing size. */
async function readMaskInto(maskUrl: string, alpha: Uint8ClampedArray, w: number, h: number) {
  const img = await loadImage(maskUrl);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  for (let k = 0; k < w * h; k++) alpha[k] = d[k * 4]!;
}
