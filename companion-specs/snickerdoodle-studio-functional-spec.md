# Snickerdoodle — Studio Functional Specification

*Prepared for Simon, Launch Mode Ltd · The full functional scope of the creation/editing Studio, with build priorities*

> **Priority legend:** **[Core]** = MVP, needed for first launch · **[Enhanced]** = v1.x, soon after · **[Later]** = nice-to-have / future. The "MVP cut" at the end pulls the Core items into a buildable first version.

> **Two principles that govern everything below.** (1) **Non-destructive by default** — the original upload is never overwritten; every edit is reversible and the untouched original is always recoverable. This is both good UX *and* the technical backbone of the "this stays yours / delete any time" trust promise. (2) **AI is invisible plumbing** — generative features are dressed as warm, plain-language "magic edits," never exposed as raw AI controls.

---

## 1. Workspace & canvas
- **[Core]** Canvas dimension presets tied to product (card, A4/A3 print, square cushion, mug wrap, tee panel, tote, book cover, etc.).
- **[Core]** Orientation: portrait / landscape / square.
- **[Core]** Custom canvas dimensions (with unit toggle: mm / cm / px / in).
- **[Core]** Zoom (fit-to-screen, %, pinch-to-zoom) and pan.
- **[Core]** Bleed and safe-area guides for print products.
- **[Enhanced]** Background fill: transparent / solid colour / brand pattern.
- **[Enhanced]** Snapping, alignment guides, centre guides.
- **[Later]** Rulers, custom guides, grid overlay.

## 2. Importing artwork
- **[Core]** Upload from device (file picker) and **camera capture** (photograph the drawing in-app).
- **[Core]** Import from the Keepsake Home gallery.
- **[Core]** Auto-crop / straighten a photographed drawing (deskew, trim to artwork).
- **[Enhanced]** Multiple images onto one canvas (collage / multi-drawing).
- **[Enhanced]** Re-import / replace source while keeping edits.

## 3. Layers
- **[Core]** Layer panel: add, delete, duplicate, reorder (drag).
- **[Core]** Per-layer **visibility** (show/hide) and **opacity**.
- **[Core]** Per-layer **lock**.
- **[Core]** Layer types: image, paint, text, sticker/shape, background, AI-generated.
- **[Enhanced]** Rename layers; group layers.
- **[Enhanced]** Merge / flatten layers.
- **[Later]** Blend modes (normal, multiply, screen, overlay).
- **[Later]** Clipping masks.

## 4. Background tools
- **[Core]** **Remove background** (one-tap AI cut-out of the drawing/subject).
- **[Core]** Transparent background output.
- **[Enhanced]** Mask refine / edge clean-up (smooth, feather, restore erased bits).
- **[Enhanced]** Replace background with a solid colour or brand pattern.
- **[Later]** Replace background with a generated scene (ties to §13).

## 5. Draw & paint tools
- **[Core]** Paint/brush tool with adjustable **size (stylus sizes)**, **colour**, **opacity**.
- **[Core]** **Smoothness / stabilisation** setting (line smoothing for shaky hands — child- and parent-friendly).
- **[Core]** Brush hardness / softness.
- **[Enhanced]** Brush styles on-brand: crayon, pencil, marker, watercolour, felt-tip.
- **[Enhanced]** Fill / bucket tool; eyedropper (sample any colour on canvas).
- **[Enhanced]** Pressure sensitivity (stylus / Apple Pencil) support.
- **[Later]** Symmetry / mirror drawing mode (delightful for kids).
- **[Later]** Shape-assist / straight-line lock.

## 6. Eraser
- **[Core]** Eraser with adjustable **size** and **opacity**.
- **[Core]** Eraser **smoothness** (shares the stabilisation setting).
- **[Enhanced]** Hardness/softness; "erase to original" (restore source pixels) vs "erase to transparent."
- **[Later]** Magic eraser (AI object/blemish removal).

## 7. Colour & swatches
- **[Core]** Colour picker (wheel / sliders / hex).
- **[Core]** Brand palette swatches (Honey, Cinnamon, Sky, Berry, Meadow, etc.) + recently used.
- **[Enhanced]** Custom saved swatches.
- **[Enhanced]** **Recolour / colour-replace** (swap one colour across the artwork for another).
- **[Later]** Eyedropper from a reference image; palette extraction from the drawing.

## 8. Adjustments (colour & light)
- **[Core]** Brightness, contrast, saturation.
- **[Core]** Warmth / temperature.
- **[Enhanced]** Hue shift, vibrance, exposure.
- **[Enhanced]** One-tap **auto-enhance**.
- **[Later]** Curves / levels (advanced).

## 9. Preset filters & styles
- **[Core]** Preset style filters: watercolour, crayon, pencil sketch, bold poster, soft pastel, black-and-white.
- **[Core]** Filter **intensity** slider.
- **[Enhanced]** Live thumbnail previews of each filter on the actual artwork.
- **[Later]** Saveable custom preset "looks."

## 10. Transform, scale & crop
- **[Core]** Move, **scale (with aspect-ratio lock)**, rotate.
- **[Core]** Flip horizontal / vertical.
- **[Core]** Crop (free + product aspect presets).
- **[Core]** On-canvas handles (corner scale, rotate handle).
- **[Enhanced]** Align & distribute; numeric position/size entry.
- **[Enhanced]** Fit-to-product / auto-place (snap artwork neatly into the print area).
- **[Later]** Skew / perspective / warp.

## 11. Text
- **[Core]** Add / edit text.
- **[Core]** Font selection (brand set: Fraunces, Mulish, Caveat "child's hand," plus a few extras).
- **[Core]** Size, colour, weight, alignment.
- **[Core]** **Layering + opacity** (text is a layer; §3 applies).
- **[Enhanced]** Letter / line spacing; outline; soft shadow.
- **[Enhanced]** Curved / arced text.
- **[Later]** Text-on-path; auto-fit to area.

## 12. Stickers, frames & embellishments
- **[Core]** Brand doodle stickers (stars, hearts, suns, squiggles).
- **[Core]** Frames / borders (incl. the signature "framed in gold").
- **[Enhanced]** Basic shapes (circle, heart, banner) with fill/stroke.
- **[Later]** Seasonal sticker packs; decorative corners.

## 13. Generative "magic edits" (AI)
*Presented as warm one-tap actions, never as raw AI.*
- **[Core]** Remove background (also in §4).
- **[Core]** Tidy / clean the lines (smooth scanned wobble while keeping character).
- **[Core]** Brighten / enhance.
- **[Core]** **Upscale to print quality** (critical — see §15).
- **[Enhanced]** "Make it [style]" — watercolour, storybook, etc.
- **[Enhanced]** Add a background (generated scene).
- **[Enhanced]** **Describe-an-edit** free-text prompt.
- **[Enhanced]** Photo restore/repair (faded or damaged photos).
- **[Later]** Generate variations; generate a matching set (a "world" around the drawing).
- **Safety/trust:** every AI edit preserves the child's original work and likeness, runs on no-retention/no-training processors, and the untouched original is always kept (ties to the Trust & Data Spine).

## 14. Product application & live preview
- **[Core]** Apply current creation to a product; **live preview on the product mock-up**.
- **[Core]** Switch products without losing edits.
- **[Core]** Per-product placement: position, scale, rotate within the print area.
- **[Enhanced]** Pattern / repeat fill (e.g. all-over wrapping paper, leggings).
- **[Enhanced]** Per-product variant options (size, colour, frame finish).

## 15. Print quality & resolution
- **[Core]** Live **resolution / DPI indicator** with a clear "print-ready ✓ / too small ✗" status per chosen product.
- **[Core]** Low-resolution warning **with the one-tap AI upscale fix** offered inline.
- **[Enhanced]** Bleed/safe-area enforcement before "add to basket."
- **[Later]** Colour-profile / CMYK soft-proofing awareness.

## 16. History, versioning & autosave
- **[Core]** Multi-step **undo / redo**.
- **[Core]** **Autosave** to the Keepsake Home.
- **[Core]** Always-recoverable **original** (non-destructive).
- **[Enhanced]** History panel (step list); before/after compare (edited vs original).
- **[Later]** Named version snapshots ("keep this version").

## 17. Save, export & output
- **[Core]** Save to Keepsake Home.
- **[Core]** Add to basket (with the chosen product).
- **[Core]** Duplicate creation (branch a new edit).
- **[Enhanced]** Share to a wishlist; share to social (with privacy controls and watermark options).
- **[Enhanced]** Download (where the product/licence allows).

## 18. Trust, privacy & safety (in-studio)
- **[Core]** Persistent, quiet "this stays yours" reassurance.
- **[Core]** Delete this creation (and its source) in one place.
- **[Core]** Original always preserved; nothing public by default.
- **[Enhanced]** Plain-English note on what each AI edit does with the image.

## 19. Input, platform & accessibility
- **[Core]** Mouse, touch **and stylus** input, all first-class.
- **[Core]** Keyboard shortcuts (desktop); **[Enhanced]** customisable.
- **[Enhanced]** Tooltips / first-run coachmarks.
- **[Core]** Accessibility: sufficient contrast, labelled controls, reduced-motion respect.

### 19a. Touch & stylus interaction model (mobile & tablet) **[Core]**
The Studio must be fully usable by finger or stylus on phone and tablet — this is a primary input mode, not an afterthought.

**Touch gestures**
- **Tap** to select; **drag** to move; **pinch** to zoom; **two-finger rotate** to rotate the canvas; **two-finger drag** to pan.
- **Long-press** for a contextual menu (duplicate, delete, bring forward, etc.).
- **Two-finger tap = undo**, **three-finger tap = redo** (standard drawing-app conventions).
- Large touch targets (≥44px), generous spacing, no hover-only controls.

**Stylus (Apple Pencil / S-Pen / generic active pen)**
- **Pressure** drives brush/eraser size and/or opacity (user-mappable).
- **[Enhanced]** Tilt for shading; **[Later]** barrel-button shortcuts.
- **Low-latency inking** with the smoothness/stabilisation setting applied live.
- **Palm rejection**, and a **"stylus only" mode** so a resting hand or finger doesn't leave marks.
- **[Enhanced]** Hover preview of the brush where the device supports pen hover.

**Responsive layout**
- **Tablet:** near-desktop — docked tool rail plus collapsible side panel, with a floating quick-control for brush size/colour.
- **Phone:** single canvas with a bottom toolbar; tool options, layers and magic edits open as **bottom sheets**; one panel at a time.
- Quick-access **floating brush HUD** (size + colour) on touch devices so the common controls are always a thumb away.
- Orientation-aware: portrait and landscape both supported.

**Performance**
- **[Core]** Smooth, responsive inking and transforms on mid-range mobile hardware; large-image edits and AI calls run without freezing the canvas (progress shown, canvas stays interactive where possible).

## 20. Settings & defaults
- **[Enhanced]** Default smoothing/stabilisation level.
- **[Enhanced]** Default units (mm/in) and canvas.
- **[Enhanced]** Snapping on/off; autosave frequency.

---

## The MVP cut (what to build first)

A first Studio that feels complete without boiling the ocean:

**Canvas:** product-tied presets + custom size, zoom/pan, bleed/safe guides.
**Import:** upload + camera, auto-crop/straighten, from gallery.
**Layers:** add/delete/duplicate/reorder, visibility, opacity, lock.
**Paint & erase:** brush + eraser with size, opacity, **smoothness**, colour.
**Colour:** picker + brand swatches.
**Adjust:** brightness, contrast, saturation, warmth.
**Filters:** a handful of preset styles + intensity.
**Transform:** move/scale (aspect lock)/rotate/flip/crop with on-canvas handles.
**Text:** add/edit, brand fonts, size/colour/align, as an opacity-controlled layer.
**Stickers:** brand doodles + frames.
**Magic edits (AI):** remove background, tidy lines, brighten, **upscale-to-print**.
**Product:** apply + live preview + placement + switch products.
**Print:** DPI/print-ready indicator + inline upscale fix.
**History:** undo/redo, autosave, recoverable original.
**Output:** save to Keepsake Home, add to basket, duplicate.
**Trust:** "stays yours," delete, original preserved.
**Platform:** mouse/touch/stylus, mobile bottom sheets, accessible.

Everything tagged **[Enhanced]** or **[Later]** is a fast-follow once this core loop is solid.

---

*The single most important non-obvious item on this list is §15 print quality. A child's phone-photographed drawing is often too low-resolution for a large print or blanket — so the DPI indicator plus a one-tap AI upscale isn't a nicety, it's what stops a wave of disappointing, refund-triggering products. Build it in Core.*
