# Product + mockup onboarding — what to capture

> So the real product photos + SKUs you gather drop straight into the compositor with no
> rework. The compositor composites the child's design onto a **blank product photo** in our
> own VPC (the child's image never leaves us). The blank photos are brand-safe and can come
> from anywhere — Prodigi's free downloads, a commissioned shoot, or licensed stock. For each
> product, I need the four things below.

## For each product, give me:

### 1. The SKU(s) + variant info
- The **Prodigi SKU** for each size/colour you want to sell (I validate every one against the
  live sandbox before wiring — exactly like the 20 I already did, so typos/renames are caught).
- The **sizes** and **colours** offered, and which is the **default**.
- The **retail price** per size (our price; Prodigi's cost is separate).
- If colour is a Prodigi *attribute* of one SKU (e.g. the framed print's 8 frame colours) vs a
  *separate SKU per colour* (e.g. the coloured mugs) — if you're unsure, just give me the SKUs
  and I'll work it out from the API.

### 2. The blank product PHOTO (one per product, or per colour if the product colour changes the shot)
- A clean photo of the **empty product with no design on it**.
- **sRGB**, JPEG/PNG/WebP, **longest edge ≥ 1500px** (bigger is fine, I downscale).
- **Plain, even background** — ideally our oat tone (`#FBF5E9`) or plain white; soft, even light.
- **Straight-on / flat** for the first pass (framed print, card, jigsaw, cushion, mug front).
  An angled "hero" shot (tee on a model, mug 3/4, tote on a shoulder) is great too — that's the
  PERSPECTIVE tier; just tell me which shots are angled.
- Prodigi's free product photography (prodigi.com/downloads) is a fine source — just confirm
  with them in writing that commercial use is OK (their page says "free" but has no formal
  licence). Commissioned/owned photos are cleaner long-term.

### 3. The print area (I author this — you just need the photo)
- I trace the **print quad** (the 4 corners of where the design actually prints on that photo)
  and register it to **Prodigi's real print area for that SKU** — so the preview matches what's
  actually printed (your "strictly Prodigi's mapping" requirement). If Prodigi publishes a print
  template / bleed spec for the SKU, point me at it; otherwise I derive it from the product specs.

### 4. The material (one word, so the blend looks right)
One of: **PAPER · LIGHT_FABRIC · DARK_FABRIC · CERAMIC · GLOSS**. (DARK_FABRIC triggers an
underbase so a dark tee doesn't crush the art to black.) Optional but improves realism.

## How to hand it over
- A **folder of blank photos** named by product/SKU (e.g. `framed-print-a4.jpg`, `mug-11oz-white.jpg`), plus
- a short **list/sheet** of the SKUs with sizes/colours/prices/material (a CSV or even a paste is fine).

I'll then: validate the SKUs against the sandbox → upload each blank to `template_assets` →
author the print quad per blank → run the live sync → and the catalogue + customize go photoreal
**per product as each lands** (anything not yet done keeps the SVG fallback — never a broken state).

## Nice-to-haves (later tiers, not needed for the first pass)
- **Angled hero shots** → PERSPECTIVE tier (tee/mug/tote at an angle).
- A **lighting/shadow map** + **texture/weave map** per hero product → the "shot in a studio"
  polish (I can derive these from the blank).
- **Displacement maps** (fabric folds, true mug wrap) → the final realism tier.
