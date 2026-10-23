'use client';

import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowsHorizontal,
  IconArrowsVertical,
  IconBackground,
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
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { toast, useUpload } from '@/lib/store';
import { uploadGuestImage } from '@/lib/guestUpload';
import { cutoutAlphaAction, removeBackgroundAction, saveStudioAction, studioStateAction } from '@/app/actions/magic';
import { StudioToolbar } from '@/ui/studio/StudioToolbar';
import { StudioTray } from '@/ui/studio/Tray';
import { ToolGlyph } from '@/ui/studio/ToolGlyph';
import { ColourPicker } from '@/ui/studio/ColourPicker';
import { AddedOptions, type DrawingLayer, type PenStyle, type ShapeStyle, type TextStyle } from '@/ui/studio/AddedOptions';
import { boxOf, drawObject, drawStroke, drawTextured, hits, inBox, moveObject, scaleObject, turnObject, type Box, type Frame } from '@/ui/studio/objects-canvas';
import { AngleControl } from '@/ui/studio/AngleControl';
import { CARD_FONTS, cardFontCss } from '@/lib/card-fonts';
import { flipObjects, MAX_TEXT_LENGTH, TEXT_LINE_HEIGHT, type ShapeKind, type StudioObject, type TextObject } from '@/lib/studio-objects';
import { IDENTITY_PLACE, normAngle, snapAngle, turnObjects, visualAngle, type Placement } from '@/lib/studio-geometry';
import { toolById, type ToolId } from '@/ui/studio/tools';
import { PanelHeader, Section, Segmented, SizeDot, SliderRow, Stack, ToggleRow } from '@/ui/studio/panel';
import { TOO_MANY_COPY } from '@/lib/rateLimitCopy';
import { forgetMockupsFor } from '@/lib/mockupPrefetch';
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
  turnGeometry,
  rotatedSize,
  type Crop,
  type Geometry,
  type Work,
} from '@/ui/studio/engine';

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
/** The drawing itself, as a selectable layer (once unlocked). */
const DRAWING = '__drawing';

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
  const [keepWhite, setKeepWhite] = useState(false);
  const [hadCutout, setHadCutout] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tick, setTick] = useState(0); // redraw after pixel edits
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [leaving, setLeaving] = useState(false);
  const guardRef = useRef(false); // the back-gesture guard's history entry is in place
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
  // typing straight INTO a text box on the picture (founder, 22 Oct): which one, and the one editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRef = useRef<string | null>(null);
  const inlineRef = useRef<HTMLTextAreaElement>(null);
  /** A tap on words (or a new box) opens the editor when the finger LIFTS — unless it dragged. */
  const pendingEdit = useRef<{ id: string; sx: number; sy: number; isNew: boolean } | null>(null);
  const viewBeforeEdit = useRef<{ zoom: number; panX: number; panY: number } | null>(null);
  // the drawing layer is locked until the parent unlocks it (then it moves / sizes / turns)
  const [drawingUnlocked, setDrawingUnlocked] = useState(false);
  // a continuous turn (slider / dial / drag) works from where it started, so it never drifts
  const turnBase = useRef<{ geo: Geometry; objects: StudioObject[]; at: number } | null>(null);
  const scratch = !!upload?.scratch;

  const transparent = useMemo(() => (workRef.current ? hasTransparency(workRef.current.alpha) : false), [tick, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── make sure the upload is a stored (screened) asset ──
  const ensureAsset = useCallback(async (): Promise<string | null> => {
    if (assetId) return assetId;
    if (!upload) return null;
    const blob = await fetch(upload.dataUrl).then((r) => r.blob());
    const res = await uploadGuestImage(blob, upload.name || 'drawing.png', { termsAccepted: true });
    if (res.ok && res.assetId) {
      setAssetId(res.assetId);
      setLocalAssetId(res.assetId);
      return res.assetId;
    }
    toast(res.blocked ? 'we couldn’t use that image — try another' : res.tooMany ? TOO_MANY_COPY : 'hmm, that didn’t work — try again');
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
      // phones: the picture fills the stage edge to edge (the controls float over it)
      const pad = typeof window !== 'undefined' && window.innerWidth < 768 ? 6 : 24;
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
    } else {
      const tile = 12 / V.a;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(content.x, content.y, content.w, content.h);
      ctx.fillStyle = '#ece4d6';
      for (let y = content.y; y < content.y + content.h; y += tile) {
        for (let x = content.x + (Math.floor((y - content.y) / tile) % 2 ? tile : 0); x < content.x + content.w; x += tile * 2) ctx.fillRect(x, y, tile, tile);
      }
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
      // (the words being typed into are shown by the editor over the picture, not twice)
      for (const o of objects) if (o.id !== editingId) drawTextured(ctx, { texture: o.texture, draw: (c) => drawObject(c, o, f) }, f, M, content);
      const live = liveStroke.current;
      if (live) drawTextured(ctx, { texture: pen.texture, draw: (c) => drawStroke(c, { colour: pen.colour, width: pen.width, points: live }, f) }, f, M, content);

      // selection: dashed box, corner resize handle, top turn handle (screen space)
      const selB = tool && EDITING.includes(tool) ? selectedBox(f) : null;
      if (selB) {
        const b = selB.box;
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
        if (selB.turnable) handle(pt(0, -b.h / 2 - pad - 28 / V.a), '#8fb5d6'); // turn
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedBox is a plain helper over objects/selectedId/geo, all listed
  }, [tick, stageSize, view, geo, shownGeo, transparent, comparing, cropping, viewMatrix, ready, objects, selectedId, tool, pen, drawingUnlocked, editingId]);

  /** The drawing's outline in the frame: its own rectangle, turned with the design and its placement. */
  const drawingBox = (f: Frame, g: Geometry = geo): Box => {
    const p = g.place ?? IDENTITY_PLACE;
    const w = workRef.current?.w ?? f.gw, h = workRef.current?.h ?? f.gh;
    return { cx: p.x * f.gw, cy: p.y * f.gh, w: w * p.scale, h: h * p.scale, rotation: visualAngle(g) + p.angle };
  };
  /** What's selected, as a box with handles — an added thing, or the unlocked drawing. */
  const selectedBox = (f: Frame): { box: Box; turnable: boolean; obj: StudioObject | null } | null => {
    if (selectedId === DRAWING) return drawingUnlocked && tool === 'select' ? { box: drawingBox(f), turnable: true, obj: null } : null;
    const o = objects.find((x) => x.id === selectedId);
    return o ? { box: boxOf(o, f), turnable: true, obj: o } : null;
  };

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
  const gesture = useRef<{ kind: 'paint' | 'pan' | 'pinch' | 'crop' | 'stroke' | 'move' | 'scale' | 'turn' | 'spin'; obj?: StudioObject; drawing?: boolean; place0?: Placement; spin0?: number; startDist?: number; startAngle?: number; smooth?: [number, number]; startSnap?: Snapshot; last?: [number, number]; z0?: number; pan0?: [number, number]; d0?: number; m0?: [number, number]; handle?: string; crop0?: Crop; g0?: [number, number] } | null>(null);

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
    // the canvas never takes focus itself: the words editor keeps it until we say otherwise
    e.preventDefault();
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
    if (tool === 'rotate') {
      // drag round the middle of the design to turn it (snaps gently at every 45°)
      const f = frame();
      const c = viewMatrix(geo).transformPoint(new DOMPoint(f.gw / 2, f.gh / 2));
      turnBase.current = null;
      gesture.current = { kind: 'spin', startAngle: Math.atan2(sy - c.y, sx - c.x), spin0: visualAngle(geo), m0: [c.x, c.y] };
      return;
    }
    if (tool && EDITING.includes(tool)) {
      const f = frame();
      const [gx, gy] = toGeoSpace(sx, sy);
      // a tap off the words being typed: that's them finished (it doesn't start a new box)
      const wasEditing = !!editingRef.current;
      if (wasEditing) endEdit();
      const selB = selectedBox(f);
      if (selB) {
        // the handles first
        const b = selB.box;
        const sel = selB.obj;
        const drawing = !sel;
        const place0 = geo.place ?? IDENTITY_PLACE;
        const a = (b.rotation * Math.PI) / 180;
        const V = viewMatrix(geo);
        const pt = (lx: number, ly: number) => V.transformPoint(new DOMPoint(b.cx + lx * Math.cos(a) - ly * Math.sin(a), b.cy + lx * Math.sin(a) + ly * Math.cos(a)));
        const pad = 6 / V.a;
        const rz = pt(b.w / 2 + pad, b.h / 2 + pad);
        const tn = pt(0, -b.h / 2 - pad - 28 / V.a);
        if (Math.hypot(rz.x - sx, rz.y - sy) < 24) {
          pushUndo();
          gesture.current = { kind: 'scale', obj: sel ?? undefined, drawing, place0, startDist: Math.hypot(gx - b.cx, gy - b.cy) };
          return;
        }
        if (selB.turnable && Math.hypot(tn.x - sx, tn.y - sy) < 24) {
          pushUndo();
          gesture.current = { kind: 'turn', obj: sel ?? undefined, drawing, place0, startAngle: Math.atan2(gy - b.cy, gx - b.cx) };
          return;
        }
      }
      const slop = 10 / viewMatrix(geo).a;
      const hit = [...objects].reverse().find((o) => (tool === 'text' ? o.type === 'text' : tool === 'shapes' ? o.type === 'shape' : true) && hits(o, f, gx, gy, slop));
      if (hit) {
        setSelectedId(hit.id);
        pushUndo();
        gesture.current = { kind: 'move', obj: hit, g0: [gx, gy] };
        // words: a TAP (no drag) opens them for typing, right there
        if (hit.type === 'text' && !wasEditing) pendingEdit.current = { id: hit.id, sx, sy, isNew: false };
        return;
      }
      // the unlocked drawing sits underneath everything added
      if (tool === 'select' && drawingUnlocked && !scratch && inBox(drawingBox(f), gx, gy)) {
        setSelectedId(DRAWING);
        pushUndo();
        gesture.current = { kind: 'move', drawing: true, place0: geo.place ?? IDENTITY_PLACE, g0: [gx, gy] };
        return;
      }
      if (tool === 'text' && !wasEditing) {
        // a new text box where they tapped — ready to type into as the finger lifts
        pushUndo();
        const o: StudioObject = { id: newId(), type: 'text', text: 'your words', font: textStyle.font, colour: textStyle.colour, size: 0.12, x: gx / f.gw, y: gy / f.gh, rotation: 0, texture: textStyle.texture };
        setObjects((os) => [...os, o]);
        setSelectedId(o.id);
        pendingEdit.current = { id: o.id, sx, sy, isNew: true };
        return;
      }
      if (wasEditing) return;
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
    if (gst.kind === 'spin') {
      const deg = ((Math.atan2(sy - gst.m0![1], sx - gst.m0![0]) - gst.startAngle!) * 180) / Math.PI;
      turnDesign(snapAngle(gst.spin0! + deg), true);
      return;
    }
    if ((gst.kind === 'move' || gst.kind === 'scale' || gst.kind === 'turn') && gst.drawing && gst.place0) {
      const [gw, gh] = rotatedSize(workRef.current.w, workRef.current.h, geo.rotate);
      const [gx, gy] = toGeoSpace(sx, sy);
      const p0 = gst.place0;
      let p: Placement;
      if (gst.kind === 'move') p = { ...p0, x: p0.x + (gx - gst.g0![0]) / gw, y: p0.y + (gy - gst.g0![1]) / gh };
      else if (gst.kind === 'scale') p = { ...p0, scale: Math.min(8, Math.max(0.05, p0.scale * (Math.hypot(gx - p0.x * gw, gy - p0.y * gh) / Math.max(1, gst.startDist!)))) };
      else {
        const deg = ((Math.atan2(gy - p0.y * gh, gx - p0.x * gw) - gst.startAngle!) * 180) / Math.PI;
        // snap the drawing's tilt AS SEEN (the design's turn + its own) at every 45°
        const seen = snapAngle(visualAngle(geo) + p0.angle + deg);
        p = { ...p0, angle: normAngle(seen - visualAngle(geo)) };
      }
      setGeo((g) => ({ ...g, place: p }));
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
        next = turnObject(o0, f, snapAngle((o0.rotation ?? 0) + deg));
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
    const pe = pendingEdit.current;
    pendingEdit.current = null;
    if (pe && pointers.current.size === 1) {
      const [sx, sy] = local(e);
      if (pe.isNew || Math.hypot(sx - pe.sx, sy - pe.sy) < 8) startEdit(pe.id, sy);
    }
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

  // ── typing into words on the picture ──
  /** Open a text box for typing, in place. Call it INSIDE the tap or click — phones only raise the
   * keyboard for a focus that happens during one. `atY` (stage px) lets a phone lift low words up
   * out of the keyboard's way while typing. */
  const startEdit = (id: string, atY?: number) => {
    inlineRef.current?.focus({ preventScroll: true });
    editingRef.current = id;
    setSelectedId(id);
    setEditingId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 768 && atY !== undefined && atY > stageSize.h * 0.36) {
      viewBeforeEdit.current = view;
      setView((v) => ({ ...v, panY: v.panY + (stageSize.h * 0.24 - atY) }));
    }
  };
  /** Done typing: an empty box goes; the view settles back if it was lifted for the keyboard. */
  const endEdit = () => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    setEditingId(null);
    const o = objects.find((x) => x.id === id);
    if (o?.type === 'text' && !o.text.trim()) {
      setObjects((os) => os.filter((x) => x.id !== id));
      setSelectedId(null);
    }
    if (document.activeElement === inlineRef.current) inlineRef.current?.blur();
    if (viewBeforeEdit.current) {
      setView(viewBeforeEdit.current);
      viewBeforeEdit.current = null;
    }
  };
  // a brand-new box: its placeholder is selected, so the first key replaces it
  useEffect(() => {
    const o = editingId ? objects.find((x) => x.id === editingId) : null;
    if (o?.type === 'text' && o.text === 'your words') inlineRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a box opens
  }, [editingId]);

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
        } else toast(res.reason === 'budget' ? 'that’s all your magic edits for now' : res.reason === 'too-many' ? TOO_MANY_COPY : 'couldn’t do that — try again');
        return;
      }
      const m = await cutoutAlphaAction({ assetId: id });
      if (m.ok && m.mask) {
        pushUndo();
        await readMask(m.mask, workRef.current.alpha, workRef.current.w, workRef.current.h);
        setHadCutout(true);
        setKeepWhite(keep);
        setTick((t) => t + 1);
        toast('background removed ✨');
      }
    } finally {
      setBusy(null);
    }
  };

  /**
   * Turn the whole design to `visual`° (as seen). A continuous gesture (`group`) works from where
   * it started — one undo step, and no drift from re-turning already-turned things.
   */
  const turnDesign = (visual: number, group = false) => {
    const work = workRef.current;
    if (!work) return;
    const now = Date.now();
    if (!group || !turnBase.current || now - turnBase.current.at > 900) {
      pushUndo();
      turnBase.current = { geo, objects, at: now };
    } else turnBase.current.at = now;
    const b = turnBase.current;
    const t = turnGeometry(b.geo, visual, work.w, work.h);
    setGeo(t.geo);
    setObjects(turnObjects(b.objects, t.delta, t.f0, t.f1));
  };

  const onTool = (id: ToolId) => {
    endEdit();
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
    setDrawingUnlocked(false);
    setObjects([]);
    setSelectedId(null);
    setHadCutout(false);
    setKeepWhite(false);
    setTick((t) => t + 1);
    setConfirmStart(false);
    fit();
  };

  const save = async (then: (saved: boolean) => void) => {
    const work = workRef.current;
    if (!work) return then(false);
    if (!dirty) return then(false);
    const id = await ensureAsset();
    if (!id) return;
    setBusy('saving…');
    try {
      const see = hasTransparency(work.alpha);
      const res = await saveStudioAction({ assetId: id, mask: see ? maskToDataUrl(work) : null, geometry: geo, objects, clearCutout: !see });
      if (!res.ok) return toast(res.reason === 'text' ? 'some of those words can’t be printed — please change them' : 'that didn’t save — try again');
      // the design is re-saved in place (same id, new pixels): drop the old pictures of it
      const prev = useUpload.getState().upload?.cutout?.sourceObjectId;
      for (const id of new Set([prev, res.design?.sourceObjectId])) if (id) forgetMockupsFor(id);
      setCutout(res.design);
      setAspect(res.aspect);
      setDirty(false);
      toast('saved ✨');
      then(true);
    } finally {
      setBusy(null);
    }
  };
  // Leaving on purpose (done / save / leave without saving). While the back-gesture guard below
  // holds an extra history entry, REPLACE it — so a later "back" from the range lands on the studio
  // once, not twice.
  // `saved`: a design was just saved — the range opens at "your masterpiece, made real" on a
  // phone (with its loader right there) rather than back at the top.
  const backToRange = (saved = false) => {
    const to = saved ? '/start-creating?edited=1' : '/start-creating';
    if (guardRef.current) {
      guardRef.current = false;
      router.replace(to);
    } else router.push(to);
  };

  // ── added-thing actions ──
  const updateSelected = (patch: Partial<StudioObject>, group = false) => {
    if (!selectedId) return;
    if (!group || Date.now() - lastEditPush.current > 800) pushUndo();
    lastEditPush.current = Date.now();
    setObjects((os) => os.map((o) => (o.id === selectedId ? ({ ...o, ...patch } as StudioObject) : o)));
  };
  /** Turn what's selected to `deg`° from its panel (slider, exact number, quarter turns). */
  const turnSelected = (deg: number, group = false) => {
    const o = objects.find((x) => x.id === selectedId);
    const work = workRef.current;
    if (!o || !work) return;
    const [gw, gh] = rotatedSize(work.w, work.h, geo.rotate);
    updateSelected(turnObject(o, { gw, gh }, deg) as Partial<StudioObject>, group);
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

  // The phone's BACK GESTURE (iOS swipe, Android back) with unsaved edits: ask, exactly like the
  // "your range" button — instead of silently dropping the edits (a removed background lost on the
  // way back to the range). Once there are edits, an extra history entry for this same page sits on
  // top; stepping back off it lands here again, and we ask.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirty || guardRef.current) return;
    window.history.pushState({ ...window.history.state, sdStudioGuard: true }, '', window.location.href);
    guardRef.current = true;
  }, [dirty]);
  useEffect(() => {
    const onPop = () => {
      if (!guardRef.current || window.history.state?.sdStudioGuard) return;
      guardRef.current = false;
      if (dirtyRef.current) {
        window.history.pushState({ ...window.history.state, sdStudioGuard: true }, '', window.location.href);
        guardRef.current = true;
        setLeaving(true);
      } else {
        window.history.back(); // nothing to save: carry on back
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
      if (tool === 'rotate' && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        const step = (e.shiftKey ? 0.1 : 1) * (e.key === ']' ? 1 : -1);
        return turnDesign(visualAngle(geo) + step, true);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && selectedId !== DRAWING) {
        e.preventDefault();
        return deleteSelected();
      }
      if (e.key === ' ') {
        e.preventDefault();
        return setComparing(true);
      }
      const map: Record<string, ToolId> = { g: 'removeBg', c: 'removeColour', e: 'erase', b: 'restore', k: 'background', p: 'draw', t: 'text', h: 'shapes', v: 'select', l: 'select', r: 'rotate', f: 'flip', x: 'crop' };
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

  // the words editor sits exactly on the box being typed into (stage px), or waits out of sight
  const inlineObj = editingId ? (objects.find((o) => o.id === editingId && o.type === 'text') as TextObject | undefined) : undefined;
  let inlineStyle: React.CSSProperties = { left: 0, top: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' };
  if (inlineObj && workRef.current && stageSize.w) {
    const [gw, gh] = rotatedSize(workRef.current.w, workRef.current.h, geo.rotate);
    const b = boxOf(inlineObj, { gw, gh });
    const V = viewMatrix(geo);
    const c = V.transformPoint(new DOMPoint(b.cx, b.cy));
    const fontPx = Math.max(4, inlineObj.size * Math.min(gw, gh)) * V.a;
    // iPhone zooms the whole page in when a field under 16px is focused — so small words are laid
    // out at 16px and scaled down to their real size (same look, no zoom)
    const k = fontPx < 16 ? fontPx / 16 : 1;
    inlineStyle = {
      left: c.x,
      top: c.y,
      width: (b.w * V.a + fontPx * 0.8) / k, // room for the caret at the end of the longest line
      height: (b.h * V.a) / k,
      transform: `translate(-50%, -50%) rotate(${b.rotation}deg)${k < 1 ? ` scale(${k})` : ''}`,
      fontFamily: cardFontCss(inlineObj.font),
      fontSize: fontPx / k,
      lineHeight: TEXT_LINE_HEIGHT,
      color: inlineObj.colour,
      caretColor: inlineObj.colour,
      outline: 'none', // the dashed selection box already shows it's being typed into
    };
  }

  const disabled: Partial<Record<ToolId, string>> = {};
  if (!transparent && !geo.background) disabled.background = 'remove the background first';
  const readiness = printReadiness(origSize.current[0], origSize.current[1], geo);

  const drawingLayer: DrawingLayer | null = scratch
    ? null
    : {
        unlocked: drawingUnlocked,
        selected: selectedId === DRAWING,
        place: geo.place ?? IDENTITY_PLACE,
        onToggleLock: () => {
          // unlocking picks it up, ready to move; locking puts it down
          if (drawingUnlocked) {
            if (selectedId === DRAWING) setSelectedId(null);
            setDrawingUnlocked(false);
          } else {
            setDrawingUnlocked(true);
            setSelectedId(DRAWING);
          }
        },
        onSize: (scale) => {
          if (Date.now() - lastEditPush.current > 800) pushUndo();
          lastEditPush.current = Date.now();
          setGeo((g) => ({ ...g, place: { ...(g.place ?? IDENTITY_PLACE), scale } }));
        },
        onReset: () => {
          pushUndo();
          setGeo((g) => ({ ...g, place: null }));
        },
        // its tilt AS SEEN: the design's own turn plus the drawing's
        angle: normAngle(visualAngle(geo) + (geo.place?.angle ?? 0)),
        onTurn: (seen, group) => {
          if (!group || Date.now() - lastEditPush.current > 800) pushUndo();
          lastEditPush.current = Date.now();
          setGeo((g) => ({ ...g, place: { ...(g.place ?? IDENTITY_PLACE), angle: normAngle(seen - visualAngle(g)) } }));
        },
      };
  const onFlip = (axis: 'h' | 'v') => {
    pushUndo();
    setGeo((g) => flipGeometry(g, axis));
    setObjects((os) => flipObjects(os, axis));
  };
  const onResetCrop = () => {
    pushUndo();
    setGeo((g) => ({ ...g, crop: { x: 0, y: 0, w: 1, h: 1 } }));
  };
  const setBackground = (bg: string | null) => {
    // dragging the device colour picker fires continuously — one undo step per burst
    if (Date.now() - lastBgPush.current > 600) pushUndo();
    lastBgPush.current = Date.now();
    setGeo((g) => ({ ...g, background: bg }));
  };

  const toolOptions = tool && ADDING.includes(tool) ? (
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
      drawing={drawingLayer}
      onSelect={(id) => setSelectedId(id)}
      onTurn={turnSelected}
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
      onFlip={onFlip}
      onResetCrop={onResetCrop}
      onDoneCrop={() => setTool(null)}
      onTool={onTool}
      angle={visualAngle(geo)}
      onAngle={(v, group) => turnDesign(v, group)}
      background={geo.background}
      setBackground={setBackground}
    />
  );
  // every tool's panel: what it's for in a line, then its options (actions show nothing extra)
  const def = tool ? toolById(tool) : null;
  // PHONES: the same options as one slim frosted row over the picture (no pane, no "where to start")
  const tray =
    tool && def?.kind === 'mode'
      ? StudioTray({
          tool,
          onTool,
          busy: !!busy,
          hadCutout,
          keepWhite,
          onKeepWhite: (on) => void runRemoveBg(on),
          onRemoveBg: () => void runRemoveBg(keepWhite),
          everywhere,
          setEverywhere,
          fussy,
          setFussy,
          brush,
          setBrush,
          angle: visualAngle(geo),
          onAngle: (v, group) => turnDesign(v, group),
          onFlip,
          onResetCrop,
          onDoneCrop: () => setTool(null),
          background: geo.background,
          setBackground,
          pen,
          setPen,
          textStyle,
          setTextStyle,
          shapeStyle,
          setShapeStyle,
          objects,
          selected,
          baseLabel: scratch ? 'your canvas' : 'your drawing',
          drawing: drawingLayer,
          onSelect: (id) => {
            endEdit();
            setSelectedId(id);
          },
          onEditWords: () => selected?.type === 'text' && startEdit(selected.id),
          onTurn: turnSelected,
          onUpdate: updateSelected,
          onAddShape: addShape,
          onDelete: deleteSelected,
          onDuplicate: duplicateSelected,
          onForward: () => reorder(1),
          onBack: () => reorder(-1),
        })
      : null;
  const options =
    def && def.kind === 'mode' ? (
      <div className="flex flex-col gap-4">
        <PanelHeader tool={def} hint={def.hint} />
        {toolOptions}
      </div>
    ) : (
      <StartHere scratch={scratch} onTool={onTool} />
    );

  return (
    <div className="fixed inset-0 flex flex-col bg-oat">
      {/* header: always a clear way back to the range */}
      <header className="pt-safe kraft z-20 flex min-h-[60px] items-center gap-2 border-b-2 border-cocoa/10 px-3 md:px-5">
        {/* narrow phones: just the arrow (the words come back from 400px) — the header never wraps */}
        <button type="button" onClick={onBack} aria-label="back to your range" className="press flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-[14px] border-2 border-cocoa bg-paper px-2.5 text-sm font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] min-[400px]:px-3">
          <Icon icon={IconArrowLeft} size={17} /> <span className="hidden whitespace-nowrap min-[400px]:inline">your range</span>
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
        <Button size="md" onClick={() => void save((saved) => backToRange(saved))} disabled={!!busy}>
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
          tray={tray}
          trayKey={tool ?? undefined}
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
          {/* the WORDS EDITOR: typing happens in the box on the picture — same font, size, colour and
              angle as it prints (texture shows again when you're done). Always mounted while a words
              tool is up, so a tap can focus it at once and the keyboard comes up. */}
          {ready && tool && EDITING.includes(tool) ? (
            <textarea
              ref={inlineRef}
              aria-label="your words"
              value={inlineObj?.text ?? ''}
              maxLength={MAX_TEXT_LENGTH}
              wrap="off"
              spellCheck
              autoCapitalize="sentences"
              tabIndex={inlineObj ? 0 : -1}
              aria-hidden={inlineObj ? undefined : true}
              onChange={(e) => inlineObj && updateSelected({ text: e.target.value.slice(0, MAX_TEXT_LENGTH) }, true)}
              onBlur={() => endEdit()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  endEdit();
                }
              }}
              className="absolute z-10 m-0 resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 text-center outline-none focus-visible:outline-none"
              style={inlineStyle}
            />
          ) : null}
          {/* PHONES: what's in use, in a quiet dark-glass line over the top of the picture (reads on any
              drawing); with nothing picked, a nudge toward the toolbar + how print-ready it is */}
          <div className="pointer-events-none absolute left-2.5 right-[64px] top-2.5 flex flex-col items-start gap-1.5 md:hidden" aria-live="polite">
            {comparing ? (
              <span className="studio-glass-ink rounded-pill px-3 py-1.5 text-[12px] font-extrabold text-paper">your original</span>
            ) : editingId ? null /* typing: the words are lifted up here, clear of the keyboard — nothing over them */ : def && def.kind === 'mode' ? (
              <div className="studio-glass-ink flex max-w-full items-center gap-2 rounded-[16px] py-1.5 pl-2 pr-3 text-paper [--glyph-ring:var(--color-cocoa)]">
                <ToolGlyph tool={def} size={16} />
                <span className="min-w-0">
                  <span className="block text-[12px] font-extrabold leading-tight">{def.label}</span>
                  <span className="line-clamp-2 block text-[11px] leading-snug text-paper/80">{def.hint}</span>
                </span>
              </div>
            ) : (
              <>
                <span className="studio-glass-ink rounded-pill px-3 py-1.5 text-[12px] font-bold text-paper">pick a tool below — the yellow arrow shows what each one does</span>
                <span className={`rounded-pill px-2.5 py-1 text-[11px] font-extrabold ${readiness.good ? 'bg-leaf-pale text-green-save' : 'bg-honey-band text-cocoa'}`}>
                  {readiness.good ? '✓ ' : ''}
                  {readiness.label}
                </span>
              </>
            )}
          </div>
          {comparing ? <span className="absolute left-3 top-3 hidden rounded-pill bg-cocoa px-3 py-1 text-xs font-extrabold text-paper md:inline">your original</span> : null}
          {busy ? (
            <div role="status" className="absolute inset-x-0 top-[72px] mx-auto w-fit rounded-pill border-2 border-cocoa bg-paper px-4 py-1.5 text-xs font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] md:top-3">
              {busy}
            </div>
          ) : null}
          {/* zoom: a slim column floating top-right over the picture */}
          <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5" role="group" aria-label="zoom">
            <button type="button" onClick={() => zoomBy(1.25)} aria-label="zoom in" className="studio-glass press flex h-11 w-11 items-center justify-center rounded-full text-cocoa">
              <Icon icon={IconPlus} size={17} />
            </button>
            <button type="button" onClick={fit} aria-label="fit to screen" className="studio-glass press flex h-11 w-11 items-center justify-center rounded-full text-cocoa">
              <Icon icon={IconZoomReset} size={17} />
            </button>
            <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="zoom out" className="studio-glass press flex h-11 w-11 items-center justify-center rounded-full text-cocoa">
              <Icon icon={IconMinus} size={17} />
            </button>
          </div>
        </div>

        {/* options: the frosted row over the picture on phones (tray, above); a side panel on bigger screens */}
        <aside aria-label="tool options" className="hidden w-80 shrink-0 overflow-y-auto border-l-2 border-cocoa/10 bg-paper p-5 md:block">{options}</aside>
      </div>

      {/* leaving with unsaved changes */}
      <Modal open={leaving} onClose={() => setLeaving(false)} title="save your changes?" subtitle="you’ve edited this drawing">
        <div className="flex flex-col gap-2">
          <Button size="lg" className="w-full" onClick={() => void save((saved) => backToRange(saved))}>
            save &amp; go back
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => backToRange()}>
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
  onFlip: (axis: 'h' | 'v') => void;
  onResetCrop: () => void;
  onDoneCrop: () => void;
  background: string | null;
  setBackground: (bg: string | null) => void;
  onTool: (id: ToolId) => void;
  angle: number;
  onAngle: (visual: number, group?: boolean) => void;
}) {
  const jump = (id: ToolId, label: string) => (
    <Button variant="secondary" size="sm" className="flex-1" onClick={() => p.onTool(id)}>
      <Icon icon={toolById(id).icon} size={15} /> {label}
    </Button>
  );
  switch (p.tool) {
    case 'removeBg':
      return (
        <Stack>
          <Section>
            {p.hadCutout ? (
              <p className="flex min-h-11 items-center gap-1.5 rounded-xl bg-leaf-pale px-3 text-[13px] font-bold text-green-save">
                <Icon icon={IconCircleCheck} size={16} /> background removed
              </p>
            ) : (
              <Button variant="design" size="md" className="w-full" onClick={p.onRemoveBg} disabled={p.busy}>
                <Icon icon={IconBackground} size={16} /> remove background
              </Button>
            )}
            <ToggleRow title="keep the white inside shapes" note="for the whites of eyes, a snowman, a cloud" on={p.keepWhite} onChange={p.onKeepWhite} />
          </Section>
          <Section label="tidy up">
            <div className="flex gap-2">
              {jump('erase', 'eraser')}
              {jump('restore', 'bring back')}
            </div>
          </Section>
        </Stack>
      );
    case 'removeColour':
      return (
        <Stack>
          <Section label="where">
            <Segmented
              label="where to remove the colour"
              value={p.everywhere ? 'all' : 'patch'}
              onChange={(v) => p.setEverywhere(v === 'all')}
              options={[
                { value: 'all', label: 'everywhere' },
                { value: 'patch', label: 'just that patch' },
              ]}
            />
            <p className="text-[11px] leading-snug text-ink-soft">
              {p.everywhere ? 'that colour goes wherever it appears in the picture.' : 'only the patch you tap goes — it stops at outlines. handy when the same colour is in the drawing too.'}
            </p>
          </Section>
          <Section label="how fussy">
            <SliderRow label="match" min={8} max={60} value={p.fussy} onChange={p.setFussy} ariaLabel="how close a colour has to be to go" display={p.fussy < 20 ? 'exact' : p.fussy > 42 ? 'loose' : 'close'} />
            <p className="text-[11px] text-ink-soft">exact = only that colour · loose = similar shades too</p>
          </Section>
        </Stack>
      );
    case 'erase':
    case 'restore':
      return (
        <Stack>
          <Section label="brush">
            <SliderRow label="size" min={6} max={140} value={p.brush} onChange={p.setBrush} ariaLabel="brush size" display={<SizeDot px={p.brush / 4} />} />
            <p className="text-[11px] text-ink-soft">pinch or scroll to zoom in for the fiddly bits.</p>
          </Section>
          <Section label="switch to">{p.tool === 'erase' ? <div className="flex">{jump('restore', 'bring back')}</div> : <div className="flex">{jump('erase', 'eraser')}</div>}</Section>
        </Stack>
      );
    case 'background':
      return (
        <Stack>
          <Section label="background">
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
          </Section>
          <Section label="or fill with">
            <ColourPicker value={p.background} onChange={(hex) => p.setBackground(hex)} label="background colour" />
          </Section>
        </Stack>
      );
    case 'rotate':
      return (
        <Stack>
          <AngleControl
            angle={p.angle}
            onAngle={p.onAngle}
            what="the design"
            hint={
              <>
                or drag on the picture to turn it — it clicks gently into place at every 45°. <span className="hidden md:inline">[ and ] nudge by 1° (with shift, 0.1°).</span>
              </>
            }
          />
        </Stack>
      );
    case 'flip':
      return (
        <Stack>
          <Section label="mirror">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={() => p.onFlip('h')}>
                <Icon icon={IconArrowsHorizontal} size={15} /> sideways
              </Button>
              <Button variant="secondary" size="sm" onClick={() => p.onFlip('v')}>
                <Icon icon={IconArrowsVertical} size={15} /> upside down
              </Button>
            </div>
          </Section>
        </Stack>
      );
    case 'crop':
      return (
        <Stack>
          <Section>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" onClick={p.onResetCrop}>
                reset
              </Button>
              <Button size="sm" onClick={p.onDoneCrop}>
                done cropping
              </Button>
            </div>
          </Section>
        </Stack>
      );
    default:
      return null;
  }
}

/** No tool picked: the likeliest first steps, one tap away. */
function StartHere({ scratch, onTool }: { scratch: boolean; onTool: (id: ToolId) => void }) {
  const picks: ToolId[] = scratch ? ['draw', 'text', 'shapes', 'background'] : ['removeBg', 'text', 'crop', 'draw'];
  return (
    <Stack>
      <header>
        <h2 className="font-display text-[17px] leading-tight text-cocoa">{scratch ? 'a blank canvas' : 'where to start'}</h2>
        <p className="mt-0.5 text-xs text-ink-soft">pick a tool — or tap the toolbar’s arrow to see what each one does.</p>
      </header>
      <Section label="most loved">
        <div className="grid grid-cols-2 gap-2">
          {picks.map((id) => {
            const t = toolById(id);
            return (
              <button key={id} type="button" onClick={() => onTool(id)} className="press flex min-h-[72px] flex-col items-start justify-between gap-1 rounded-[14px] border-2 border-cocoa/20 bg-paper p-2.5 text-left hover:border-cocoa">
                <Icon icon={t.icon} size={20} className="text-cocoa" />
                <span className="text-xs font-extrabold text-cocoa">{t.label}</span>
              </button>
            );
          })}
        </div>
      </Section>
    </Stack>
  );
}

export const dynamic = 'force-dynamic';
