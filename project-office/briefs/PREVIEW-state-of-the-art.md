# Customize / position / preview — state of the art & our roadmap

> Prepared 2026-07-04 after the founder set the bar at Contrado's 3D preview ("we need better —
> I don't mind how long it takes"). Method: 5-angle research sweep (leader teardowns incl. live
> source-code inspection, client-side 3D, 2.5D displacement, AR standards, editor UX), key claims
> adversarially re-verified, plus a critic pass on licensing/fidelity/accessibility/low-end gaps.

## 0. The two headline facts
1. **Contrado's 3D is not magic.** Their designer loads **Three.js r124 (a 2020 release)**,
   applies **server-baked texture images** (`/estore/contrado3d/ge3dtmodeltextureimages`) to a
   garment model, with click-drag orbit + zoom. Their storefront is AngularJS 1.x + jQuery 1.7.
   Casetify's 2024-rebuilt customizer is client-side **PixiJS** (WebGL 2D). Verified from their
   live bundles.
2. **No leader ships the design to a third party to render.** The two best experiences
   (Contrado, Casetify) render **client-side WebGL**; Vistaprint/Moonpig render in their own
   stack. Our children's-data constraint (nothing leaves the VPC) is **not a handicap** — it's
   how the leaders already work. Everything below is self-hosted or in-browser.

## 1. What "industry leading" concretely means (distilled checklist)
- **Live design-view ↔ product-view toggle** — see the product update as you edit.
- **Print truth**: bleed / safe / visible guide lines (Zazzle draws three, labelled), print-area
  grid, **live DPI warning recomputed as you scale** (Printful: 150dpi floor, warn + offer fixes,
  never a dead end — maps directly onto our tiered-upscale story).
- **Direct manipulation**: drag, corner-scale + rotate handles, **pinch zoom/rotate on the
  artwork** (two-pointer), snap-to-centre/edges with transient alignment guides, rotation snaps
  at 0/90/180/270, fit/fill one-taps, named placement presets (centre chest ≈8″×8″ 3–3.5″ below
  collar; left chest 2.5–5″), undo/redo (drag coalesced to one entry).
- **Photoreal or 3D on-product preview** (client WebGL at the leaders).
- **Accessibility is specified, not optional**: WCAG 2.5.1 (A) = every pinch gesture needs a
  single-pointer alternative (buttons/slider); 2.5.7 (AA) = every drag needs a non-drag
  alternative (Figma-style arrow-key nudge 1/10). Moonpig rebuilt its editor in **SVG not
  canvas** for exactly this, after ~20% editor drop-off.
- iOS has **no Vibration API** — "snap ticks" must be visual (guide flash), not haptic.

## 2. The four build tiers (all in-VPC / client-side)

### Tier A — editor excellence (universal, fastest)
Raise the Positioner to the checklist above. Konva/react-konva is the best substrate for a
bespoke React editor (Transformer handles, `rotationSnaps`, documented objects-snapping recipe,
mobile events); @use-gesture for pinch (scale+angle from two pointers, `touch-action` owned);
60fps via CSS transform/opacity only, rasterise on commit. Keyboard nudge + zoom/rotate buttons
for WCAG. This uplifts EVERY product on every device including low-end Android.

### Tier B — 2.5D photoreal everywhere (server-side upgrade of our compositor)
The smartmockups/Photoshop-mockup technique, fully documented + open-source
(kashifulhaque/product-mockup-node-python — scripts verified line-by-line):
perspective-warp onto the print quad → **displacement map** (design follows folds) →
**lighting map** (hardlight highlights) → **adjustment map** (multiply shadows/colour cast) →
mask composite. **Maps are auto-derived from the product photo itself** (grayscale −30%
brightness onto grey50, blur 0x10; lighten vs grey50; DivideSrc vs #f1f1f1) — authoring is
minutes per photo (mask + 4 corners + strength), no Photoshop, no depth model needed.
Engine note: sharp CANNOT warp (no perspective — issue #2095); libvips `mapim` can (7–30ms CPU)
via **wasm-vips**, or shell out to ImageMagick. CPU-only, scale-to-zero friendly. Realism
ceiling: photo-indistinguishable for the fixed pose; no rotation/drape — that's Tier C.

### Tier C — true 3D for hero products (client-side, the Contrado-matcher)
react-three-fiber (or `<model-viewer>`) + GLB product models; the user's placement renders to a
**CanvasTexture bound to a UV print-area island** (the production pattern; drei `Decal` distorts
on curved cloth — avoid for garments). Canonical OSS exists (adrianhajdin/project_threejs_ai,
981★). three.js = 182KB gz, lazy-load the route; textures ≤2048–4096; drei PerformanceMonitor +
AdaptiveDpr; **detect-gpu tier-0 → fall back to Tier B stills** (our compositor stays
first-class). `<model-viewer>` brings keyboard camera controls + ARIA out of the box — WebGL
canvases are invisible to the accessibility tree, so the static mockup remains the accessible
default and 3D is progressive enhancement (also the prefers-reduced-motion path).
**⚠ Model licensing trap (critic-verified):** TurboSquid's royalty-free licence FORBIDS serving
models in open formats (glTF/GLB) to browsers; Sketchfab Standard bars standalone redistribution.
Compliant paths: **parametric models we build in code** (mug = cylinder, framed print = box —
zero licence, trivial), **commissioned models with explicit web-distribution terms** (~£75–400,
garments via the Marvelous Designer bake-the-drape workflow: simulate once, bake wrinkles to
normal maps, ship a static PBR mesh), or CC0.
Recurring cost nobody advertises: calibrating each garment's UV print area 1:1 against the
fulfiller's print template (per size/colourway) so 3D placement doesn't lie — budget it.

### Tier D — AR "see it on your wall" (framed prints; days on top of Tier C plumbing)
`<model-viewer>` with `ar-placement="wall"` + `ar-scale="fixed"` (true physical size).
Client-side GLTFExporter builds the framed-print GLB (frame + artwork texture) in the browser;
**iOS USDZ is auto-generated on-device** by model-viewer/three's USDZExporter — no server
conversion (Google's usd_from_gltf is archived), no third party. **Drop Scene Viewer** (would
have Google's native app fetch the child-artwork GLB by URL; also crashing on Android 16) —
ship `webxr quick-look` + a Posterlounge-style QR handoff for desktop. Etsy proves fully
on-device wall AR. Zero-AR sibling for 100% device coverage: true-scale room-scene composites
(and "photo of your own wall" done client-side with entered wall measurements).

## 3. The honesty guardrail (re-scope "preview == print")
Colorimetric preview==print is impossible and even fulfillers disclaim it (Printful Color
Matching Disclaimer; DTG white underbase shifts colours on dark garments; sRGB→CMYK gamut
clipping hits exactly the neon felt-tip colours in kids' art). Re-scope the non-negotiable as:
- **Placement/content/crop truth is CONTRACTUAL** — the flat design view (our aspect-locked
  compositor) remains the authority; it already guarantees preview crop == print crop.
- **Photoreal/3D/AR views are honest-but-illustrative** — soft copy note ("colours print true to
  your file; screens vary"), never the order-of-record.
- UK legal weight: personalised goods are **exempt from 14-day change-of-mind returns**, so the
  preview is the de-facto "as described" representation. Keep the design view authoritative.

## 4. Conversion evidence (weighted honestly)
- The ubiquitous "94% conversion lift from 3D/AR" is a 2020 Shopify social-post claim, no
  methodology — treat as marketing.
- The rigorous study (Tan, Chandukala & Reddy, *Journal of Marketing* 2022): AR lifts sales most
  for **expensive, narrower-appeal products and channel-new customers** — directionally a good
  match for personalised keepsakes and first-visit gift-buyers, but it measured cosmetics try-on.
- Moonpig's editor rebuild evidence is about reducing **editor drop-off (~20%)** — supporting
  Tier A as the highest-certainty conversion work, before any 3D.

## 5. Recommended sequence
1. **Prodigi submission first** (already agreed — completes the money loop).
2. **Tier A** editor excellence — one increment, universal payoff, zero new infra.
3. **Tier B** displacement compositor — 1–2 increments + minutes-per-photo authoring; every
   product gets photoreal fabric/fold realism on the pipeline we already run.
4. **Tier C** heroes: mug + framed print first (parametric, no licence risk), then a
   commissioned tee/hoodie GLB with baked drape (this is the "beat Contrado" moment — their
   tech is 2020-era; ours would be newer, faster, and fully private).
5. **Tier D** wall AR for framed prints + room-scene composites.

## Sources (highlights)
Contrado designer live source (Three.js r124 bundles, ge3dtmodeltextureimages, bleed/stitch
overlays, low-res warning — verified verbatim); Casetify customizer-2024 bundle (Vue3+PixiJS);
Moonpig engineering blog (SVG editor, accessibility patterns); Cimpress Rendering Platform docs;
Zazzle guide-lines help + RealView PR; Printful/Printify feature docs + DPI/safe-area helps;
usage.imagemagick.org/mapping; kashifulhaque/product-mockup-node-python (scripts verified);
sharp#2095; libvips#3140 (mapim perf); kleisauke/wasm-vips; modelviewer.dev AR docs; three.js
GLTFExporter/USDZExporter docs; google/usd_from_gltf (archived 2024-06-06); WebKit AR Quick Look;
Apple forums (no WebXR-AR in iOS Safari); Etsy AR (on-device); Posterlounge/Postery AR pages;
TurboSquid RF licence; Sketchfab licences; Tan et al. JM 2022; WCAG 2.5.1/2.5.7; Konva
Transformer/snapping docs; @use-gesture docs; web.dev animations; Mux LQIP analysis; detect-gpu.
