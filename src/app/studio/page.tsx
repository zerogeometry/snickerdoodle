'use client';

import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowsHorizontal,
  IconArrowsVertical,
  IconCheck,
  IconCircleCheck,
  IconMinus,
  IconPlus,
  IconZoomReset,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { Toggle } from '@/ui/primitives/Toggle';
import { toast, useUpload } from '@/lib/store';
import { startGuestUpload } from '@/app/actions/guestUpload';
import { cutoutAlphaAction, removeBackgroundAction, saveStudioAction, studioStateAction } from '@/app/actions/magic';
import { StudioToolbar } from '@/ui/studio/StudioToolbar';
import { ColourPicker } from '@/ui/studio/ColourPicker';
import { AddedOptions, type PenStyle, type ShapeStyle, type TextStyle } from '@/ui/studio/AddedOptions';
import { boxOf, drawObject, drawStroke, drawTextured, hits, moveObject, scaleObject, type Frame } from '@/ui/studio/objects-canvas';
import { CARD_FONTS } from '@/lib/card-fonts';
import { flipObjects, rotateObjects, type ShapeKind, type StudioObject } from '@/lib/studio-objects';
import type { ToolId } from '@/ui/studio/tools';
import {
  IDENTITY,
  buildWork,
  dab,
  flipGeometry,
  geometryIsIdentity,
  geometryMatrix,
  hasTransparency,
  loadImage,
  maskToDataUrl,
  printReadiness,
  readMask,
  removeColour,
  rotateGeometry,
  rotatedSize,
  type Crop,
  type Geometry,
  type Work,
} from '@/ui/studio/engine';

const BACKDROPS: { name: string; value: string }[] = [
  { name: 'see-through', value: 'checker' },
  { name: 'white', value: '#ffffff' },
  { name: 'black', value: '#111111' },
  { name: 'navy', value: '#1f2b4d' },
  { name: 'red', value: '#b3262a' },
  { name: 'kraft', value: '#c8a57a' },
];
const HISTORY_CAP = 25;

interface Snapshot {
  alpha: Uint8ClampedArray;
  geo: Geometry;
  objects: StudioObject[];
  /** "background removed" travels with history, so undoing it lets you remove it again. */
  cut: boolean;
  keepWhite: boolean;
}
const ADDING: ToolId[] = ['draw', 'text', 'shapes', 'select'];
/** Tools where tapping something you've added picks it up to move / change. */
const EDITING: ToolId[] = ['text', 'shapes', 'select'];
/** The image tools — nothing to do on a blank canvas. */
const IMAGE_ONLY: ToolId[] = ['removeBg', 'removeColour', 'erase', 'restore', 'compare'];
const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * The Studio (Phase 1: the image tools). Full screen, app-like; the original upload is never
 * changed — edits are a transparency mask + a geometry recipe, saved to a 'design' the products
 * are made from. "your range" (top-left) always takes the parent back to their drawing's range.
 */
export default function StudioPage() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const setAssetId = useUpload((s) => s.setAssetId);
  const setCutout = useUpload((s) => s.setCutout);
  const setAspect = useUpload((s) => s.setAspect);

  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const picRef = useRef<HTMLCanvasElement | null>(null); // the editing copy with its alpha, unrotated
  const workRef = useRef<Work | null>(null);
  const sourceAlpha = useRef<Uint8ClampedArray | null>(null); // the upload's own transparency
  const origSize = useRef<[number, number]>([1, 1]);
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);

  const [ready, setReady] = useState(false);
  const [assetId, setLocalAssetId] = useState<string | null>(upload?.assetId ?? null);
  const [geo, setGeo] = useState<Geometry>(IDENTITY);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [everywhere, setEverywhere] = useState(true);
  const [fussy, setFussy] = useState(28);
  const [brush, setBrush] = useState(36);
  const [backdrop, setBackdrop] = useState('checker');
  const [keepWhite, setKeepWhite] = useState(false);
  const [hadCutout, setHadCutout] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tick, setTick] = useState(0); // redraw after pixel edits
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [leaving, setLeaving] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [, setHistoryTick] = useState(0);
  const lastBgPush = useRef(0);
  // ── added things (phase 2) ──
  const [objects, setObjects] = useState<StudioObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pen, setPen] = useState<PenStyle>({ colour: '#2b2118', width: 0.012, smooth: 0.5, stylusOnly: false, texture: 'crayon' });
  const [textStyle, setTextStyle] = useState<TextStyle>({ font: 'caveat', colour: '#2b2118', texture: 'smooth' });
  const [shapeStyle, setShapeStyle] = useState<ShapeStyle>({ fill: '#f6c445', stroke: '#2b2118', strokeWidth: 0.05, texture: 'smooth' });
  const liveStroke = useRef<number[] | null>(null);
  const lastEditPush = useRef(0);
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const scratch = !!upload?.scratch;

  const transparent = useMemo(() => (workRef.current ? hasTransparency(workRef.current.alpha) : false), [tick, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── make sure the upload is a stored (screened) asset ──
  const ensureAsset = useCallback(async (): Promise<string | null> => {
    if (assetId) return assetId;
    if (!upload) return null;
    const blob = await fetch(upload.dataUrl).then((r) => r.blob());
    const fd = new FormData();
    fd.append('image', blob, upload.name || 'drawing.png');
    fd.append('termsAccepted', 'true');
    const res = await startGuestUpload(fd);
    if (res.ok && res.assetId) {
      setAssetId(res.assetId);
      setLocalAssetId(res.assetId);
      return res.assetId;
    }
    toast(res.blocked ? 'we couldn’t use that image — try another' : 'hmm, that didn’t work — try again');
    return null;
  }, [assetId, upload, setAssetId]);

  // ── load the editing copy + where the parent left off ──
  useEffect(() => {
    if (!upload) return;
    let live = true;
    (async () => {
      const img = await loadImage(upload.dataUrl);
      origSize.current = [img.naturalWidth, img.naturalHeight];
      const { work } = buildWork(img);
      sourceAlpha.current = work.alpha.slice();
      const id = await ensureAsset();
      let g = IDENTITY;
      if (id) {
        const st = await studioStateAction({ assetId: id });
        if (st.ok) {
          g = st.geometry;
          // a fresh blank canvas starts on white paper (switch to see-through in background)
          if (upload.scratch && st.objects.length === 0 && !st.mask && geometryIsIdentity(g)) g = { ...g, background: '#ffffff' };
          setObjects(st.objects);
          if (st.mask) {
            await readMask(st.mask, work.alpha, work.w, work.h);
            setHadCutout(true);
          }
        }
      }
      if (!live) return;
      workRef.current = work;
      const pic = document.createElement('canvas');
      pic.width = work.w;
      pic.height = work.h;
      picRef.current = pic;
      setGeo(g);
      setReady(true);
      setTick((t) => t + 1);
    })().catch(() => toast('couldn’t open the studio — try again'));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload?.dataUrl]);

  // canvas text needs the card fonts loaded first
  useEffect(() => {
    void Promise.all(CARD_FONTS.map((f) => document.fonts.load(`40px ${f.css}`).catch(() => null))).then(() => setTick((t) => t + 1));
  }, []);

  // ── stage size ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  // ── refresh the editing copy's pixels after an alpha edit ──
  useEffect(() => {
    const work = workRef.current, pic = picRef.current;
    if (!work || !pic) return;
    const ctx = pic.getContext('2d')!;
    const img = ctx.createImageData(work.w, work.h);
    const a = comparing && sourceAlpha.current ? sourceAlpha.current : work.alpha;
    for (let k = 0; k < work.w * work.h; k++) {
      img.data[k * 4] = work.rgb[k * 3]!;
      img.data[k * 4 + 1] = work.rgb[k * 3 + 1]!;
      img.data[k * 4 + 2] = work.rgb[k * 3 + 2]!;
      img.data[k * 4 + 3] = a[k]!;
    }
    ctx.putImageData(img, 0, 0);
  }, [tick, comparing, ready]);

  // ── view maths ──
  const shownGeo = comparing ? IDENTITY : geo;
  const cropping = tool === 'crop' && !comparing;
  const viewMatrix = useCallback(
    (g: Geometry) => {
      const work = workRef.current;
      if (!work || !stageSize.w) return new DOMMatrix();
      const [gw, gh] = rotatedSize(work.w, work.h, g.rotate);
      const rect = cropping ? { x: 0, y: 0, w: gw, h: gh } : { x: g.crop.x * gw, y: g.crop.y * gh, w: g.crop.w * gw, h: g.crop.h * gh };
      const pad = 24;
      const s = Math.min((stageSize.w - pad * 2) / rect.w, (stageSize.h - pad * 2) / rect.h) * view.zoom;
      return new DOMMatrix()
        .translate(stageSize.w / 2 + view.panX, stageSize.h / 2 + view.panY)
        .scale(s)
        .translate(-(rect.x + rect.w / 2), -(rect.y + rect.h / 2));
    },
    [stageSize, view, cropping],
  );

  // ── draw ──
  useEffect(() => {
    const cv = canvasRef.current, work = workRef.current, pic = picRef.current;
    if (!cv || !work || !pic || !stageSize.w) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(stageSize.w * dpr);
    cv.height = Math.round(stageSize.h * dpr);
    cv.style.width = `${stageSize.w}px`;
    cv.style.height = `${stageSize.h}px`;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, stageSize.w, stageSize.h);

    const g = shownGeo;
    const V = viewMatrix(g);
    const [gw, gh] = rotatedSize(work.w, work.h, g.rotate);
    const content = cropping ? { x: 0, y: 0, w: gw, h: gh } : { x: g.crop.x * gw, y: g.crop.y * gh, w: g.crop.w * gw, h: g.crop.h * gh };

    // backdrop under the picture (only meaningful where it's see-through)
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.transform(V.a, V.b, V.c, V.d, V.e, V.f);
    ctx.beginPath();
    ctx.rect(content.x, content.y, content.w, content.h);
    ctx.clip();
    if (g.background && !comparing) {
      ctx.fillStyle = g.background;
      ctx.fillRect(content.x, content.y, content.w, content.h);
    } else if (backdrop === 'checker' || !(transparent || comparing)) {
      const tile = 12 / V.a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(content.x, content.y, content.w, content.h);
      ctx.fillStyle = '#ece4d6';
      for (let y = content.y; y < content.y + content.h; y += tile) {
        for (let x = content.x + (Math.floor((y - content.y) / tile) % 2 ? tile : 0); x < content.x + content.w; x += tile * 2) ctx.fillRect(x, y, tile, tile);
      }
    } else {
      ctx.fillStyle = backdrop;
      ctx.fillRect(content.x, content.y, content.w, content.h);
    }
    const G = geometryMatrix(work.w, work.h, g);
    ctx.transform(G.a, G.b, G.c, G.d, G.e, G.f);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(pic, 0, 0);
    ctx.restore();

    // added things — in geometry px (no G matrix), clipped to the picture, each with its texture
    if (!comparing) {
      const f: Frame = { gw, gh };
      const M = new DOMMatrix([dpr, 0, 0, dpr, 0, 0]).multiply(V);
      for (const o of objects) drawTextured(ctx, { texture: o.texture, draw: (c) => drawObject(c, o, f) }, f, M, content);
      const live = liveStroke.current;
      if (live) drawTextured(ctx, { texture: pen.texture, draw: (c) => drawStroke(c, { colour: pen.colour, width: pen.width, points: live }, f) }, f, M, content);

      // selection: dashed box, corner resize handle, top turn handle (screen space)
      const sel = tool && EDITING.includes(tool) ? objects.find((o) => o.id === selectedId) : null;
      if (sel) {
        const b = boxOf(sel, f);
        const a = (b.rotation * Math.PI) / 180;
        const pt = (lx: number, ly: number) => V.transformPoint(new DOMPoint(b.cx + lx * Math.cos(a) - ly * Math.sin(a), b.cy + lx * Math.sin(a) + ly * Math.cos(a)));
        const pad = 6 / V.a;
        const c = [pt(-b.w / 2 - pad, -b.h / 2 - pad), pt(b.w / 2 + pad, -b.h / 2 - pad), pt(b.w / 2 + pad, b.h / 2 + pad), pt(-b.w / 2 - pad, b.h / 2 + pad)];
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = '#2b2118';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        c.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        const handle = (q: DOMPoint, fill: string) => {
          ctx.beginPath();
          ctx.arc(q.x, q.y, 10, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.stroke();
        };
        handle(c[2]!, '#f6c445'); // resize
        if (sel.type !== 'stroke') handle(pt(0, -b.h / 2 - pad - 28 / V.a), '#8fb5d6'); // turn
        ctx.restore();
      }
    }

    // crop overlay: dim outside the box, chunky corner handles
    if (cropping) {
      const c = geo.crop;
      const p0 = V.transformPoint(new DOMPoint(c.x * gw, c.y * gh));
      const p1 = V.transformPoint(new DOMPoint((c.x + c.w) * gw, (c.y + c.h) * gh));
      const f0 = V.transformPoint(new DOMPoint(0, 0));
      const f1 = V.transformPoint(new DOMPoint(gw, gh));
      ctx.fillStyle = 'rgba(43,33,24,0.55)';
      ctx.beginPath();
      ctx.rect(f0.x, f0.y, f1.x - f0.x, f1.y - f0.y);
      ctx.rect(p1.x, p0.y, p0.x - p1.x, p1.y - p0.y); // reverse winding → hole
      ctx.fill('evenodd');
      ctx.strokeStyle = '#fffbf2';
      ctx.lineWidth = 2;
      ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      ctx.fillStyle = '#f6c445';
      ctx.strokeStyle = '#2b2118';
      for (const [x, y] of [[p0.x, p0.y], [p1.x, p0.y], [p0.x, p1.y], [p1.x, p1.y]] as const) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [tick, stageSize, view, geo, shownGeo, backdrop, transparent, comparing, cropping, viewMatrix, ready, objects, selectedId, tool, pen]);

  // ── history ──
  const snapshot = (): Snapshot => ({ alpha: workRef.current!.alpha.slice(), geo, objects, cut: hadCutout, keepWhite });
  const pushUndo = (s: Snapshot = snapshot()) => {
    undoStack.current.push(s);
    if (undoStack.current.length > HISTORY_CAP) undoStack.current.shift();
    redoStack.current = [];
    setDirty(true);
    setHistoryTick((t) => t + 1);
  };
  const restore = (s: Snapshot) => {
    workRef.current!.alpha.set(s.alpha);
    setGeo(s.geo);
    setObjects(s.objects);
    setHadCutout(s.cut);
    setKeepWhite(s.keepWhite);
    if (selectedId && !s.objects.some((o) => o.id === selectedId)) setSelectedId(null);
    setTick((t) => t + 1);
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev || !workRef.current) return;
    redoStack.current.push(snapshot());
    restore(prev);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (!next || !workRef.current) return;
    undoStack.current.push(snapshot());
    restore(next);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  };

  // ── pointer handling: tools, pinch-zoom, pan ──
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const gesture = useRef<{ kind: 'paint' | 'pan' | 'pinch' | 'crop' | 'stroke' | 'move' | 'scale' | 'turn'; obj?: StudioObject; startDist?: number; startAngle?: number; smooth?: [number, number]; startSnap?: Snapshot; last?: [number, number]; z0?: number; pan0?: [number, number]; d0?: number; m0?: [number, number]; handle?: string; crop0?: Crop; g0?: [number, number] } | null>(null);

  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };
  const toImage = (sx: number, sy: number): [number, number] => {
    const work = workRef.current!;
    const M = viewMatrix(geo).multiply(geometryMatrix(work.w, work.h, geo)).inverse();
    const p = M.transformPoint(new DOMPoint(sx, sy));
    return [p.x, p.y];
  };
  const toGeoSpace = (sx: number, sy: number): [number, number] => {
    const p = viewMatrix(geo).inverse().transformPoint(new DOMPoint(sx, sy));
    return [p.x, p.y];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!workRef.current || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [sx, sy] = local(e);
    pointers.current.set(e.pointerId, { x: sx, y: sy, type: e.pointerType });

    // two fingers → pinch / pan (cancel any half-done stroke)
    if (pointers.current.size === 2) {
      if (gesture.current?.kind === 'stroke' && liveStroke.current) {
        liveStroke.current = null; // a pinch started mid-line: drop the half-drawn stroke
        undoStack.current.pop();
        setTick((t) => t + 1);
      }
      if (gesture.current?.kind === 'paint' && gesture.current.startSnap) {
        workRef.current.alpha.set(gesture.current.startSnap.alpha);
        undoStack.current.pop();
        setTick((t) => t + 1);
      }
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', z0: view.zoom, pan0: [view.panX, view.panY], d0: Math.hypot(a!.x - b!.x, a!.y - b!.y), m0: [(a!.x + b!.x) / 2, (a!.y + b!.y) / 2] };
      return;
    }

    const frame = (): Frame => {
      const [gw, gh] = rotatedSize(workRef.current!.w, workRef.current!.h, geo.rotate);
      return { gw, gh };
    };
    if (tool === 'draw' && !(pen.stylusOnly && e.pointerType === 'touch')) {
      const f = frame();
      const [gx, gy] = toGeoSpace(sx, sy);
      pushUndo();
      liveStroke.current = [gx / f.gw, gy / f.gh, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5];
      gesture.current = { kind: 'stroke', smooth: [gx, gy] };
      setTick((t) => t + 1);
      return;
    }
    if (tool && EDITING.includes(tool)) {
      const f = frame();
      const [gx, gy] = toGeoSpace(sx, sy);
      const sel = objects.find((o) => o.id === selectedId);
      if (sel) {
        // the handles first
        const b = boxOf(sel, f);
        const a = (b.rotation * Math.PI) / 180;
        const V = viewMatrix(geo);
        const pt = (lx: number, ly: number) => V.transformPoint(new DOMPoint(b.cx + lx * Math.cos(a) - ly * Math.sin(a), b.cy + lx * Math.sin(a) + ly * Math.cos(a)));
        const pad = 6 / V.a;
        const rz = pt(b.w / 2 + pad, b.h / 2 + pad);
        const tn = pt(0, -b.h / 2 - pad - 28 / V.a);
        if (Math.hypot(rz.x - sx, rz.y - sy) < 24) {
          pushUndo();
          gesture.current = { kind: 'scale', obj: sel, startDist: Math.hypot(gx - b.cx, gy - b.cy) };
          return;
        }
        if (sel.type !== 'stroke' && Math.hypot(tn.x - sx, tn.y - sy) < 24) {
          pushUndo();
          gesture.current = { kind: 'turn', obj: sel, startAngle: Math.atan2(gy - b.cy, gx - b.cx) };
          return;
        }
      }
      const slop = 10 / viewMatrix(geo).a;
      const hit = [...objects].reverse().find((o) => (tool === 'text' ? o.type === 'text' : tool === 'shapes' ? o.type === 'shape' : true) && hits(o, f, gx, gy, slop));
      if (hit) {
        setSelectedId(hit.id);
        pushUndo();
        gesture.current = { kind: 'move', obj: hit, g0: [gx, gy] };
        return;
      }
      if (tool === 'text') {
        // a new text box where they tapped
        pushUndo();
        const o: StudioObject = { id: newId(), type: 'text', text: 'your words', font: textStyle.font, colour: textStyle.colour, size: 0.12, x: gx / f.gw, y: gy / f.gh, rotation: 0, texture: textStyle.texture };
        setObjects((os) => [...os, o]);
        setSelectedId(o.id);
        return;
      }
      setSelectedId(null);
      if (tool === 'select') return;
    }
    if (tool === 'removeColour') {
      const [ix, iy] = toImage(sx, sy);
      if (ix < 0 || iy < 0 || ix >= workRef.current.w || iy >= workRef.current.h) return;
      pushUndo();
      removeColour(workRef.current, ix, iy, fussy, everywhere);
      setTick((t) => t + 1);
      return;
    }
    if (tool === 'erase' || tool === 'restore') {
      const snap = snapshot();
      pushUndo(snap);
      const [ix, iy] = toImage(sx, sy);
      const size = brushInImage() * (e.pointerType === 'pen' ? 0.5 + (e.pressure || 0.5) : 1);
      dab(workRef.current, ix, iy, size, tool);
      gesture.current = { kind: 'paint', startSnap: snap, last: [ix, iy] };
      setTick((t) => t + 1);
      return;
    }
    if (tool === 'crop') {
      const work = workRef.current;
      const [gw, gh] = rotatedSize(work.w, work.h, geo.rotate);
      const V = viewMatrix(geo);
      const c = geo.crop;
      const corners: Record<string, DOMPoint> = {
        tl: V.transformPoint(new DOMPoint(c.x * gw, c.y * gh)),
        tr: V.transformPoint(new DOMPoint((c.x + c.w) * gw, c.y * gh)),
        bl: V.transformPoint(new DOMPoint(c.x * gw, (c.y + c.h) * gh)),
        br: V.transformPoint(new DOMPoint((c.x + c.w) * gw, (c.y + c.h) * gh)),
      };
      const hit = Object.entries(corners).find(([, p]) => Math.hypot(p.x - sx, p.y - sy) < 26)?.[0];
      const [gx, gy] = toGeoSpace(sx, sy);
      const inside = gx >= c.x * gw && gx <= (c.x + c.w) * gw && gy >= c.y * gh && gy <= (c.y + c.h) * gh;
      if (hit || inside) {
        pushUndo();
        gesture.current = { kind: 'crop', handle: hit ?? 'move', crop0: { ...c }, g0: [gx / gw, gy / gh] };
        return;
      }
    }
    // otherwise: drag to pan
    gesture.current = { kind: 'pan', pan0: [view.panX, view.panY], m0: [sx, sy] };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const gst = gesture.current;
    if (!gst || !workRef.current) return;
    const [sx, sy] = local(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: sx, y: sy, type: e.pointerType });

    if (gst.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid: [number, number] = [(a!.x + b!.x) / 2, (a!.y + b!.y) / 2];
      const zoom = Math.min(8, Math.max(0.5, gst.z0! * (d / gst.d0!)));
      const k = zoom / gst.z0!;
      const cx = stageSize.w / 2, cy = stageSize.h / 2;
      setView({ zoom, panX: mid[0] - cx - k * (gst.m0![0] - cx - gst.pan0![0]), panY: mid[1] - cy - k * (gst.m0![1] - cy - gst.pan0![1]) });
      return;
    }
    if (gst.kind === 'stroke' && liveStroke.current) {
      const [gw, gh] = rotatedSize(workRef.current.w, workRef.current.h, geo.rotate);
      const [gx, gy] = toGeoSpace(sx, sy);
      // smoothing: follow the pointer with a little lag, which irons out wobble
      const k = 1 - pen.smooth * 0.85;
      const [px0, py0] = gst.smooth!;
      const nx = px0 + (gx - px0) * k, ny = py0 + (gy - py0) * k;
      const last = liveStroke.current;
      const lx = last[last.length - 3]! * gw, ly = last[last.length - 2]! * gh;
      if (Math.hypot(nx - lx, ny - ly) >= 0.6 && last.length < 4000 * 3) {
        last.push(nx / gw, ny / gh, e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5);
      }
      gst.smooth = [nx, ny];
      setTick((t) => t + 1);
      return;
    }
    if ((gst.kind === 'move' || gst.kind === 'scale' || gst.kind === 'turn') && gst.obj) {
      const [gw, gh] = rotatedSize(workRef.current.w, workRef.current.h, geo.rotate);
      const f: Frame = { gw, gh };
      const [gx, gy] = toGeoSpace(sx, sy);
      const o0 = gst.obj;
      let next: StudioObject;
      if (gst.kind === 'move') next = moveObject(o0, f, gx - gst.g0![0], gy - gst.g0![1]);
      else if (gst.kind === 'scale') {
        const b = boxOf(o0, f);
        next = scaleObject(o0, f, Math.hypot(gx - b.cx, gy - b.cy) / Math.max(1, gst.startDist!));
      } else {
        const b = boxOf(o0, f);
        const deg = ((Math.atan2(gy - b.cy, gx - b.cx) - gst.startAngle!) * 180) / Math.PI;
        next = o0.type === 'stroke' ? o0 : { ...o0, rotation: Math.round((o0.rotation + deg) * 2) / 2 };
      }
      setObjects((os) => os.map((o) => (o.id === o0.id ? next : o)));
      return;
    }
    if (gst.kind === 'pan') {
      setView((v) => ({ ...v, panX: gst.pan0![0] + sx - gst.m0![0], panY: gst.pan0![1] + sy - gst.m0![1] }));
      return;
    }
    if (gst.kind === 'paint' && (tool === 'erase' || tool === 'restore')) {
      const [ix, iy] = toImage(sx, sy);
      const [lx, ly] = gst.last!;
      const size = brushInImage() * (e.pointerType === 'pen' ? 0.5 + (e.pressure || 0.5) : 1);
      const steps = Math.max(1, Math.ceil(Math.hypot(ix - lx, iy - ly) / Math.max(2, size / 4)));
      for (let i = 1; i <= steps; i++) dab(workRef.current, lx + ((ix - lx) * i) / steps, ly + ((iy - ly) * i) / steps, size, tool);
      gst.last = [ix, iy];
      setTick((t) => t + 1);
      return;
    }
    if (gst.kind === 'crop') {
      const work = workRef.current;
      const [gw, gh] = rotatedSize(work.w, work.h, geo.rotate);
      const [gx, gy] = toGeoSpace(sx, sy);
      const u = Math.min(1, Math.max(0, gx / gw)), v = Math.min(1, Math.max(0, gy / gh));
      const c0 = gst.crop0!;
      const MIN = 0.05;
      let { x, y, w, h } = c0;
      if (gst.handle === 'move') {
        x = Math.min(1 - w, Math.max(0, c0.x + u - gst.g0![0]));
        y = Math.min(1 - h, Math.max(0, c0.y + v - gst.g0![1]));
      } else {
        const right = c0.x + c0.w, bottom = c0.y + c0.h;
        if (gst.handle!.includes('l')) { x = Math.min(u, right - MIN); w = right - x; }
        if (gst.handle!.includes('r')) { w = Math.max(MIN, u - c0.x); }
        if (gst.handle!.includes('t')) { y = Math.min(v, bottom - MIN); h = bottom - y; }
        if (gst.handle!.includes('b')) { h = Math.max(MIN, v - c0.y); }
      }
      setGeo((g) => ({ ...g, crop: { x, y, w, h } }));
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gesture.current?.kind === 'stroke' && liveStroke.current) {
      const points = liveStroke.current;
      liveStroke.current = null;
      setObjects((os) => [...os, { id: newId(), type: 'stroke', colour: pen.colour, width: pen.width, points, texture: pen.texture }]);
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const [sx, sy] = [e.nativeEvent.offsetX, e.nativeEvent.offsetY];
    const zoom = Math.min(8, Math.max(0.5, view.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    const k = zoom / view.zoom, cx = stageSize.w / 2, cy = stageSize.h / 2;
    setView({ zoom, panX: sx - cx - k * (sx - cx - view.panX), panY: sy - cy - k * (sy - cy - view.panY) });
  };
  const zoomBy = (f: number) => setView((v) => ({ zoom: Math.min(8, Math.max(0.5, v.zoom * f)), panX: v.panX * f, panY: v.panY * f }));
  const fit = () => setView({ zoom: 1, panX: 0, panY: 0 });

  /** The brush slider is in SCREEN px — convert to editing-copy px at the current zoom. */
  const brushInImage = () => {
    const work = workRef.current!;
    const scale = viewMatrix(geo).a; // geometry-space units per image px are 1
    return brush / Math.max(0.0001, Math.abs(scale) || 1) / (work ? 1 : 1);
  };

  // ── tools ──
  const runRemoveBg = async (keep: boolean) => {
    const id = await ensureAsset();
    if (!id || !workRef.current) return;
    setBusy('lifting the drawing off the paper…');
    try {
      const res = await removeBackgroundAction({ assetId: id, keepEnclosedPaper: keep });
      if (!res.ok) {
        if (res.reason === 'nochange') {
          toast('no plain paper on this one — tap the colour you’d like gone');
          setTool('removeColour');
        } else toast(res.reason === 'budget' ? 'that’s all your magic edits for now' : 'couldn’t do that — try again');
        return;
      }
      const m = await cutoutAlphaAction({ assetId: id });
      if (m.ok && m.mask) {
        pushUndo();
        await readMask(m.mask, workRef.current.alpha, workRef.current.w, workRef.current.h);
        setHadCutout(true);
        setKeepWhite(keep);
        if (backdrop === 'checker') setBackdrop('#1f2b4d');
        setTick((t) => t + 1);
        toast('background removed ✨');
      }
    } finally {
      setBusy(null);
    }
  };

  const onTool = (id: ToolId) => {
    if (id === 'rotate') {
      pushUndo();
      setGeo((g) => rotateGeometry(g));
      setObjects((os) => rotateObjects(os));
      return;
    }
    // keep the selection only where it can still be edited
    if (selected && !(id === 'select' || (id === 'text' && selected.type === 'text') || (id === 'shapes' && selected.type === 'shape'))) setSelectedId(null);
    if (id === 'startAgain') return setConfirmStart(true);
    setTool((t) => (t === id ? null : id));
    if (id === 'removeBg' && !hadCutout && !busy) void runRemoveBg(keepWhite);
  };

  const startAgain = () => {
    if (!workRef.current || !sourceAlpha.current) return;
    pushUndo();
    workRef.current.alpha.set(sourceAlpha.current);
    setGeo(scratch ? { ...IDENTITY, background: '#ffffff' } : IDENTITY);
    setObjects([]);
    setSelectedId(null);
    setHadCutout(false);
    setKeepWhite(false);
    setBackdrop('checker');
    setTick((t) => t + 1);
    setConfirmStart(false);
    fit();
  };

  const save = async (then: () => void) => {
    const work = workRef.current;
    if (!work) return then();
    if (!dirty) return then();
    const id = await ensureAsset();
    if (!id) return;
    setBusy('saving…');
    try {
      const see = hasTransparency(work.alpha);
      const res = await saveStudioAction({ assetId: id, mask: see ? maskToDataUrl(work) : null, geometry: geo, objects, clearCutout: !see });
      if (!res.ok) return toast(res.reason === 'text' ? 'some of those words can’t be printed — please change them' : 'that didn’t save — try again');
      setCutout(res.design);
      setAspect(res.aspect);
      setDirty(false);
      toast('saved ✨');
      then();
    } finally {
      setBusy(null);
    }
  };
  const backToRange = () => router.push('/start-creating');

  // ── added-thing actions ──
  const updateSelected = (patch: Partial<StudioObject>, group = false) => {
    if (!selectedId) return;
    if (!group || Date.now() - lastEditPush.current > 800) pushUndo();
    lastEditPush.current = Date.now();
    setObjects((os) => os.map((o) => (o.id === selectedId ? ({ ...o, ...patch } as StudioObject) : o)));
  };
  const deleteSelected = () => {
    if (!selectedId) return;
    pushUndo();
    setObjects((os) => os.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  };
  const duplicateSelected = () => {
    const o = objects.find((x) => x.id === selectedId);
    if (!o || !workRef.current) return;
    pushUndo();
    const [gw, gh] = rotatedSize(workRef.current.w, workRef.current.h, geo.rotate);
    const copy = { ...moveObject(o, { gw, gh }, Math.min(gw, gh) * 0.04, Math.min(gw, gh) * 0.04), id: newId() } as StudioObject;
    setObjects((os) => [...os, copy]);
    setSelectedId(copy.id);
  };
  const reorder = (dir: 1 | -1) => {
    const i = objects.findIndex((o) => o.id === selectedId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= objects.length) return;
    pushUndo();
    const next = objects.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    setObjects(next);
  };
  const addShape = (shape: ShapeKind) => {
    if (!workRef.current) return;
    pushUndo();
    // in the middle of what's on screen
    const [cxG, cyG] = toGeoSpace(stageSize.w / 2, stageSize.h / 2);
    const [gw, gh] = rotatedSize(workRef.current.w, workRef.current.h, geo.rotate);
    const o: StudioObject = { id: newId(), type: 'shape', shape, fill: shapeStyle.fill, stroke: shapeStyle.stroke, strokeWidth: shapeStyle.strokeWidth, texture: shapeStyle.texture, x: cxG / gw, y: cyG / gh, w: 0.25, h: 0.25, rotation: 0 };
    setObjects((os) => [...os, o]);
    setSelectedId(o.id);
    setTool('select');
  };
  const onBack = () => (dirty ? setLeaving(true) : backToRange());

  // ── keyboard (desktop) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? redo() : undo();
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        return redo();
      }
      if (mod) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        return deleteSelected();
      }
      if (e.key === ' ') {
        e.preventDefault();
        return setComparing(true);
      }
      const map: Record<string, ToolId> = { g: 'removeBg', c: 'removeColour', e: 'erase', b: 'restore', s: 'seeOn', k: 'background', p: 'draw', t: 'text', h: 'shapes', v: 'select', l: 'select', r: 'rotate', f: 'flip', x: 'crop' };
      const id = map[e.key.toLowerCase()];
      if (id && !(scratch && IMAGE_ONLY.includes(id))) onTool(id);
      if (e.key === '+' || e.key === '=') zoomBy(1.2);
      if (e.key === '-') zoomBy(1 / 1.2);
      if (e.key === '0') fit();
    };
    const onUpKey = (e: KeyboardEvent) => e.key === ' ' && setComparing(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUpKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUpKey);
    };
  });

  // ── empty state ──
  if (!upload) {
    return (
      <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-oat px-6 text-center">
        <h1 className="font-display text-3xl text-cocoa">nothing in the studio yet</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">pop a drawing in first, then open the studio from your range.</p>
        <Button href="/start-creating" size="lg" className="mt-6">
          upload a drawing
        </Button>
      </main>
    );
  }

  const disabled: Partial<Record<ToolId, string>> = {};
  if (geo.background) disabled.seeOn = 'the background is filled in';
  else if (!transparent) disabled.seeOn = 'remove the background first';
  if (!transparent && !geo.background) disabled.background = 'remove the background first';
  const readiness = printReadiness(origSize.current[0], origSize.current[1], geo);

  const options = tool && ADDING.includes(tool) ? (
    <AddedOptions
      tool={tool}
      pen={pen}
      setPen={setPen}
      textStyle={textStyle}
      setTextStyle={setTextStyle}
      shapeStyle={shapeStyle}
      setShapeStyle={setShapeStyle}
      objects={objects}
      selected={selected}
      baseLabel={scratch ? 'your canvas' : 'your drawing'}
      onSelect={(id) => setSelectedId(id)}
      onUpdate={updateSelected}
      onAddShape={addShape}
      onDelete={deleteSelected}
      onDuplicate={duplicateSelected}
      onForward={() => reorder(1)}
      onBack={() => reorder(-1)}
    />
  ) : (
    <ToolOptions
      tool={tool}
      hadCutout={hadCutout}
      busy={!!busy}
      keepWhite={keepWhite}
      onKeepWhite={(on) => void runRemoveBg(on)}
      onRemoveBg={() => void runRemoveBg(keepWhite)}
      everywhere={everywhere}
      setEverywhere={setEverywhere}
      fussy={fussy}
      setFussy={setFussy}
      brush={brush}
      setBrush={setBrush}
      backdrop={backdrop}
      setBackdrop={setBackdrop}
      onFlip={(axis) => {
        pushUndo();
        setGeo((g) => flipGeometry(g, axis));
        setObjects((os) => flipObjects(os, axis));
      }}
      onResetCrop={() => {
        pushUndo();
        setGeo((g) => ({ ...g, crop: { x: 0, y: 0, w: 1, h: 1 } }));
      }}
      onDoneCrop={() => setTool(null)}
      background={geo.background}
      setBackground={(bg) => {
        // dragging the device colour picker fires continuously — one undo step per burst
        if (Date.now() - lastBgPush.current > 600) pushUndo();
        lastBgPush.current = Date.now();
        setGeo((g) => ({ ...g, background: bg }));
      }}
    />
  );

  return (
    <div className="fixed inset-0 flex flex-col bg-oat">
      {/* header: always a clear way back to the range */}
      <header className="pt-safe kraft z-20 flex min-h-[60px] items-center gap-2 border-b-2 border-cocoa/10 px-3 md:px-5">
        <button type="button" onClick={onBack} className="press flex min-h-11 items-center gap-1.5 rounded-[14px] border-2 border-cocoa bg-paper px-3 text-sm font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
          <Icon icon={IconArrowLeft} size={17} /> your range
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="hidden font-display text-lg text-cocoa min-[420px]:inline">studio</span>
          <span className={`hidden truncate rounded-pill px-2.5 py-1 text-[11px] font-extrabold sm:inline-flex ${readiness.good ? 'bg-leaf-pale text-green-save' : 'bg-honey-band text-cocoa'}`}>
            {readiness.good ? '✓ ' : ''}
            {readiness.label}
          </span>
        </div>
        <button type="button" onClick={undo} disabled={!undoStack.current.length} aria-label="undo" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa disabled:opacity-40">
          <Icon icon={IconArrowBackUp} size={18} />
        </button>
        <button type="button" onClick={redo} disabled={!redoStack.current.length} aria-label="redo" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa disabled:opacity-40">
          <Icon icon={IconArrowForwardUp} size={18} />
        </button>
        <Button size="md" onClick={() => void save(backToRange)} disabled={!!busy}>
          <Icon icon={IconCheck} size={16} /> done
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <StudioToolbar
          active={tool}
          disabled={disabled}
          onTool={onTool}
          onHold={(id, down) => id === 'compare' && setComparing(down)}
          hidden={scratch ? IMAGE_ONLY : []}
        />

        {/* stage */}
        <div ref={stageRef} className="relative order-first min-h-0 flex-1 overflow-hidden bg-paper-2 md:order-none">
          {ready ? (
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onWheel={onWheel}
              aria-label="your drawing — use the tools to edit it"
              className="absolute inset-0 touch-none select-none"
              style={{ cursor: tool === 'removeColour' || tool === 'draw' ? 'crosshair' : tool === 'erase' || tool === 'restore' ? 'cell' : tool === 'text' ? 'text' : tool === 'select' ? 'move' : 'grab' }}
            />
          ) : (
            <div role="status" className="flex h-full items-center justify-center text-sm text-ink-soft">
              <span className="animate-pulse">getting your drawing ready…</span>
            </div>
          )}
          {comparing ? <span className="absolute left-3 top-3 rounded-pill bg-cocoa px-3 py-1 text-xs font-extrabold text-paper">your original</span> : null}
          {busy ? (
            <div role="status" className="absolute inset-x-0 top-3 mx-auto w-fit rounded-pill border-2 border-cocoa bg-paper px-4 py-1.5 text-xs font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
              {busy}
            </div>
          ) : null}
          <span className={`absolute left-3 bottom-3 rounded-pill px-2.5 py-1 text-[11px] font-extrabold sm:hidden ${readiness.good ? 'bg-leaf-pale text-green-save' : 'bg-honey-band text-cocoa'}`}>
            {readiness.label}
          </span>
          {/* zoom */}
          <div className="absolute bottom-3 right-3 flex gap-1.5" role="group" aria-label="zoom">
            <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="zoom out" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa">
              <Icon icon={IconMinus} size={16} />
            </button>
            <button type="button" onClick={fit} aria-label="fit to screen" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa">
              <Icon icon={IconZoomReset} size={16} />
            </button>
            <button type="button" onClick={() => zoomBy(1.25)} aria-label="zoom in" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa">
              <Icon icon={IconPlus} size={16} />
            </button>
          </div>
        </div>

        {/* options: a strip above the toolbar on phones, a side panel on bigger screens */}
        <div className="order-first max-h-[38vh] overflow-y-auto overscroll-contain border-t-2 border-cocoa/10 bg-paper px-3 py-2.5 md:hidden">{options}</div>
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l-2 border-cocoa/10 bg-paper p-4 md:block">{options}</aside>
      </div>

      {/* leaving with unsaved changes */}
      <Modal open={leaving} onClose={() => setLeaving(false)} title="save your changes?" subtitle="you’ve edited this drawing">
        <div className="flex flex-col gap-2">
          <Button size="lg" className="w-full" onClick={() => void save(backToRange)}>
            save &amp; go back
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={backToRange}>
            leave without saving
          </Button>
          <Button variant="ghost" size="md" className="w-full" onClick={() => setLeaving(false)}>
            keep editing
          </Button>
        </div>
      </Modal>

      <Modal open={confirmStart} onClose={() => setConfirmStart(false)} title="start again?" subtitle={scratch ? 'clears everything on the canvas' : 'clears every edit — your original upload is never changed'}>
        <div className="flex flex-col gap-2">
          <Button size="lg" className="w-full" onClick={startAgain}>
            {scratch ? 'yes, a clean canvas' : 'yes, back to the original'}
          </Button>
          <Button variant="ghost" size="md" className="w-full" onClick={() => setConfirmStart(false)}>
            keep my edits
          </Button>
        </div>
      </Modal>
      <noscript>
        <Link href="/start-creating">back to your range</Link>
      </noscript>
    </div>
  );
}

function ToolOptions(p: {
  tool: ToolId | null;
  hadCutout: boolean;
  busy: boolean;
  keepWhite: boolean;
  onKeepWhite: (on: boolean) => void;
  onRemoveBg: () => void;
  everywhere: boolean;
  setEverywhere: (v: boolean) => void;
  fussy: number;
  setFussy: (v: number) => void;
  brush: number;
  setBrush: (v: number) => void;
  backdrop: string;
  setBackdrop: (v: string) => void;
  onFlip: (axis: 'h' | 'v') => void;
  onResetCrop: () => void;
  onDoneCrop: () => void;
  background: string | null;
  setBackground: (bg: string | null) => void;
}) {
  const hint = (t: string) => <p className="text-xs text-ink-soft">{t}</p>;
  switch (p.tool) {
    case 'removeBg':
      return (
        <div className="flex flex-col gap-2.5">
          {p.hadCutout ? (
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-green-save">
              <Icon icon={IconCircleCheck} size={16} /> background removed
            </p>
          ) : (
            <Button variant="design" size="md" onClick={p.onRemoveBg} disabled={p.busy}>
              remove background
            </Button>
          )}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2">
            <span className="text-xs text-cocoa">
              <b>keep the white inside shapes</b>
              <span className="block text-[11px] text-ink-soft">for the whites of eyes, a snowman, a cloud</span>
            </span>
            <Toggle on={p.keepWhite} onChange={p.onKeepWhite} label="keep the white inside shapes" />
          </div>
          {hint('tidy any bits with the eraser or bring back.')}
        </div>
      );
    case 'removeColour':
      return (
        <div className="flex flex-col gap-2.5">
          {hint('tap the colour you’d like gone.')}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2">
            <span className="text-xs text-cocoa">
              <b>only the patch I tap</b>
              <span className="block text-[11px] text-ink-soft">
                {p.everywhere ? 'off: removes that colour everywhere it appears' : 'on: removes just the patch you touch — it stops at outlines'}
              </span>
            </span>
            <Toggle on={!p.everywhere} onChange={(on) => p.setEverywhere(!on)} label="only the patch I tap" />
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
            how fussy
            <input type="range" min={8} max={60} value={p.fussy} onChange={(e) => p.setFussy(Number(e.target.value))} className="flex-1 accent-[var(--color-cta)]" aria-label="how close a colour has to be to go" />
          </label>
          {hint('low = only that exact colour · high = similar shades too')}
        </div>
      );
    case 'erase':
    case 'restore':
      return (
        <div className="flex flex-col gap-2.5">
          {hint(p.tool === 'erase' ? 'brush over anything you don’t want.' : 'brush over anything you want back — exactly as it was.')}
          <label className="flex items-center gap-2 text-xs font-bold text-cocoa">
            brush size
            <input type="range" min={6} max={140} value={p.brush} onChange={(e) => p.setBrush(Number(e.target.value))} className="flex-1 accent-[var(--color-cta)]" aria-label="brush size" />
            <span aria-hidden className="inline-block rounded-full border-2 border-cocoa bg-paper-2" style={{ width: Math.min(40, Math.max(8, p.brush / 3)), height: Math.min(40, Math.max(8, p.brush / 3)) }} />
          </label>
          {hint('two fingers to zoom in for the fiddly bits.')}
        </div>
      );
    case 'seeOn':
      return (
        <div className="flex flex-col gap-2.5">
          {hint('how it’ll look on…')}
          <div className="flex flex-wrap gap-2" role="group" aria-label="preview on a colour">
            {BACKDROPS.map((b) => (
              <button
                key={b.value}
                type="button"
                aria-label={b.name}
                aria-pressed={p.backdrop === b.value}
                onClick={() => p.setBackdrop(b.value)}
                className={`h-11 w-11 rounded-full border-2 ${p.backdrop === b.value ? 'border-cocoa ring-2 ring-honey' : 'border-cocoa/30'}`}
                style={b.value === 'checker' ? { background: 'repeating-conic-gradient(#ece4d6 0 25%, #fff 0 50%) 50% / 12px 12px' } : { background: b.value }}
              />
            ))}
          </div>
        </div>
      );
    case 'background':
      return (
        <div className="flex flex-col gap-2.5">
          {hint('fill the see-through parts with a colour.')}
          <button
            type="button"
            aria-pressed={!p.background}
            onClick={() => p.setBackground(null)}
            className={`flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 text-xs font-extrabold ${!p.background ? 'border-cocoa bg-cocoa text-paper' : 'border-cocoa/25 bg-paper text-cocoa'}`}
          >
            <span aria-hidden className="h-6 w-6 rounded-full border border-cocoa/30" style={{ background: 'repeating-conic-gradient(#ece4d6 0 25%, #fff 0 50%) 50% / 8px 8px' }} />
            <span className="flex flex-col items-start text-left leading-tight">
              see-through
              <span className="text-[11px] font-normal opacity-80">white on cards &amp; prints</span>
            </span>
          </button>
          <ColourPicker value={p.background} onChange={(hex) => p.setBackground(hex)} label="background colour" />
        </div>
      );
    case 'flip':
      return (
        <div className="flex flex-wrap gap-2">
          <Chip onClick={() => p.onFlip('h')}>
            <Icon icon={IconArrowsHorizontal} size={15} /> left ↔ right
          </Chip>
          <Chip onClick={() => p.onFlip('v')}>
            <Icon icon={IconArrowsVertical} size={15} /> top ↕ bottom
          </Chip>
        </div>
      );
    case 'crop':
      return (
        <div className="flex flex-col gap-2.5">
          {hint('drag the corners, or drag the box to move it.')}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={p.onResetCrop}>
              reset
            </Button>
            <Button size="sm" onClick={p.onDoneCrop}>
              done cropping
            </Button>
          </div>
        </div>
      );
    default:
      return hint('pick a tool to start — tap the arrow to see what each one does.');
  }
}

export const dynamic = 'force-dynamic';
