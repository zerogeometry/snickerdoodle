# Prodigi asset coverage — blanks, templates, stock mockups

> Source-of-truth for onboarding the founder's 40-product list (Google Sheet) into the catalogue.
> All Prodigi assets are **brand-safe, non-child** — the residency/DPA/no-retention rules do NOT
> apply to them; only the child's *design* must stay in our VPC.
>
> **Downloaded so far (in `.prodigi-assets/`, gitignored):** 22 blank zips (43 photos) + 28 template
> zips (36 PSDs), pulled straight from prodigi.com/downloads via the browser. **NOT yet downloaded:**
> the *sample* (stock-mockup) zips — the founder chose these for 3D tiles; easy second pass.

## How each asset is used
- **Blank photo** (no design) → the input our in-VPC FLAT compositor paints the child's art onto.
  Needs to be roughly straight-on. ~2000–2500px, real studio shots.
- **Template (PSD)** → the *exact* print canvas + bleed/safe-area, per size. Read for the print-file
  render geometry (e.g. cushion 24″ = 3600×3600px → 150 DPI; greetings-card A4 spread = 10039×3567px
  → 300 DPI). This is how we hit "strictly Prodigi's mapping."
- **Sample / stock mockup** (Prodigi's styled photo with *their* sample design) → the catalogue tile
  for products we can't personalise yet (the founder's choice for 3D), until the perspective tier lands.

## Coverage by product (✓ = downloaded · ○ = available, not yet pulled · — = none at Prodigi)

| Product | Tier | Blank | Template | Sample | Onboarding status |
|---|---|:--:|:--:|:--:|---|
| Stretched canvas | flat | — | — | ○ | stock mockup only |
| Eco canvas | flat | — | — | ○ | stock mockup only |
| Classic frame (8 colours) | flat | ✓ | — | ○ | **compositable** (quad from blank; print spec from product page) |
| Glow-in-dark framed poster | flat | — | — | — | gap — derive from classic frame |
| Kiss-cut sticker | flat | — | — | ○ | stock mockup only |
| Wall sticker | flat | — | — | — | gap |
| Magnets | flat | — | ✓ | ○ | template ✓, stock mockup for tile |
| Mousemats | flat | ✓ | ✓ | ○ | **compositable + print-accurate** ✅ |
| Large mug 15oz | 3D | — | ✓ | — | template ✓, needs blank/mockup |
| Coloured mug 11oz | 3D | ✓ | ✓ | ○ | blank+template ✓ (perspective tier for true wrap) |
| Travel mug | 3D | — | ✓ | ○ | template ✓, stock mockup |
| Water bottle | 3D | ✓ | ✓ | ○ | blank+template ✓ (copper + steel) |
| Cushion | flat-lay | ✓ | ✓ | ○ | **compositable + print-accurate** ✅ |
| Tea towel | flat-lay | ✓ | ✓ | — | **compositable + print-accurate** ✅ (blank is US variant) |
| Apron | flat-lay | ✓ | ✓ | ○ | **compositable + print-accurate** ✅ |
| Pillow case | flat-lay | ✓ | ✓ | — | **compositable** (template = pillow shams) |
| Duvet cover | 3D | ✓ | ✓ | ○ | blank+template ✓ |
| Curtains | 3D | ✓ | — | — | blank ✓, no template |
| Clock | flat (round) | ✓ | ✓ | ○ | **compositable + print-accurate** ✅ |
| Fleece blanket | flat-lay | ✓ | ✓ | ○ | **compositable + print-accurate** ✅ (std + premium) |
| Dog bandana | 3D | ✓ | ✓ | ○ | blank+template ✓ |
| Towels | flat-lay | — | ✓ | ○ | template ✓, needs blank/mockup |
| Ceramic Xmas ornament | flat-ish | ✓ | ✓ | — | blank+template ✓ |
| Christmas baubles | 3D | — | ✓ | — | template ✓, needs mockup |
| Christmas sack | flat-lay | ✓ | ✓ | — | blank+template ✓ |
| Greetings cards | flat | — | ✓ | ○ | template ✓ (classic + fine-art), stock mockup for tile |
| Invitations | flat | — | ✓ | — | template ✓, needs mockup |
| Wrapping paper | flat | — | — | ○ | stock mockup only |
| Calendars | flat | ✓ | ✓ | — | **compositable + print-accurate** ✅ |
| Cotton tote (LTOTE) | flat-lay | — | — | — | gap (canvas/woven tote covered instead) |
| Canvas tote | flat-lay | ✓ | ✓ | ○ | **compositable + print-accurate** ✅ |
| Ankle socks | 3D | — | ✓ | — | template ✓, needs mockup |
| Tube socks | 3D | — | ✓ | — | template ✓, needs mockup |
| **Men's tee** | 3D | — | — | — | **GAP** |
| **Men's hoodie** | 3D | — | — | — | **GAP** |
| **Women's tee** | 3D | — | — | — | **GAP** |
| **Women's hoodie** | 3D | — | — | — | **GAP** |
| **Baby bodysuit (LS+SS)** | 3D | — | — | — | **GAP** |
| **Baby tee** | 3D | — | — | — | **GAP** |
| **Baby bib** | 3D | — | — | — | **GAP** |
| **Kids tee / hoodie / sweatshirt** | 3D | — | — | — | **GAP** |

## The one real gap: apparel
Prodigi's free downloads have **no blanks/templates/samples for the garment range** (tees, hoodies,
sweatshirts, bodysuits, bibs) — only a generic "Gildan 64000" sample that isn't in this list.
Options: the garment brands' own mockup assets (Stanley/Stella, Bella+Canvas, LAT Apparel), a
commissioned flat-lay shoot, or Prodigi's per-product-page lifestyle photos (styled, with a design).
Founder decision needed.

## Recommended onboarding order
1. **Photoreal now (FLAT, full coverage ✅):** mousemat, cushion, tea towel, apron, clock, fleece
   blanket, calendar, canvas tote, classic frame — blank + template in hand → wire via
   `setMockupTemplate`, quad traced from the blank, print geometry from the PSD.
2. **Stock-mockup tiles (founder's 3D choice):** pull the *sample* zips for canvas, stickers,
   wrapping paper, cards, magnets, mugs, water bottle, etc.; show as the tile until the perspective
   tier lands.
3. **Perspective tier later:** mugs, bottles, socks, baubles, curtains, draped textiles (true wrap/fold).
4. **Apparel:** pending the founder's source decision.

## Still needed from the founder (separate from images)
- **Retail prices** per product (catalogue is server-priced — can't list a SKU without one).
- The **apparel image source** decision above.
