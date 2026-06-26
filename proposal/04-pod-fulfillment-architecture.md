# Snickerdoodle × Prodigi — POD fulfillment pipeline (architecture design)

> Status: **DESIGN** (not built). Grounded in the real codebase on branch `build/phase-0-trust-spine`; every existing seam is cited `file:symbol`. Anything depending on Prodigi's live API is flagged **TO-VERIFY** and must be confirmed against current Prodigi Print/Order API v4 docs before the adapter is coded.
>
> Binding constraints throughout: children's images are the most sensitive data; **no live child image leaves the VPC to any third-party processor (including the POD) before LG3 + LG6 are green**; price, print-spec, and ownership are **server-authoritative**; POD is **provider-agnostic** (Prodigi default); originals are **sacred / write-once**; uploads are private + signed-URL-only after an authz ALLOW.
>
> **Build progress:** **Phase 0 is built** (commit `4b60dd9`): DB catalogue (products/variants/print_templates/provider-map), DB-backed pricing, `order_item_artwork`, and the two code-gap fixes (authz-gated derivative grant; in-flight-order purge guard).
>
> **Decisions resolved (locked) — see §9:** O-1 reuse `DERIVATIVE`; O-2 per-item fulfilment state; O-4 re-validate at placeOrder + render; **O-5 order-scoped (= one Prodigi order per order, which bundles postage; Prodigi may still split into multiple *shipments*, invisible to the buyer)**; O-6 token-scoped guest/gift tracking; O-3 hold the whole fulfilment surface until LG3+LG6 are green (no partial launch); O-9 snapped rotation at launch; O-10 GBP-only, add-ons = non-printable variants; O-8 ML cap ~20/creation, ~500/account/mo (env-tunable); O-7 minimised buyer-delivery only, no child surname. **NEW:** availability = nightly Prodigi catalogue sync baseline + an optional checkout-time check if Prodigi exposes a fast one (POD is made-to-order, so this is *availability*, not stock-count). **Shipping price** (flat vs Prodigi pass-through) deferred to Phase 3 — leaning flat at launch.

---

## 1. Overview + end-to-end flow

The pipeline turns a kept child's creation into a physically fulfilled keepsake without ever trusting the client for price, print geometry, or ownership, and without a live child image reaching Prodigi before the compliance gates close.

**The chain (each hop idempotent and independently retryable):**

```
upload ─▶ ingest ORIGINAL (exists)
        ─▶ bg-removal  (self-hosted, in-VPC)        ─▶ DERIVATIVE: cutout
        ─▶ product preview on a REAL Prodigi variant (server print-template drives the canvas)
        ─▶ constrained positioning (client proposes a NORMALISED transform; server validates)
        ─▶ DPI gate (server: warn / upscale / block)
        ─▶ tiered upscale (self-hosted: classical resample → CPU ML, in-VPC) ─▶ DERIVATIVE: upscaled
        ─▶ capture order spec (server-validated, frozen onto the order line)
        ─▶ [payment]  markOrderPaid  ──(same guarded UPDATE)──▶ enqueue fulfilment
        ─▶ render print file (self-hosted sharp compositing at full print res) ─▶ DERIVATIVE: printfile
        ─▶ ⛔ CHILD-IMAGE TRANSFER GATE ⛔  (single chokepoint)
        ─▶ submit to POD (provider-ingestion signed URL; Prodigi pulls the file)
        ─▶ track status (webhook, read-back-verified + idempotent; reconciliation poll safety net)
        ─▶ stamp fulfilledAt → retention purge closes the loop
```

**Three principles hold the whole design together:**
1. **Server-authoritative spec.** The client sends `variantId + qty + a normalised placement` — never a price, never a SKU, never pixel crops, never a "print-ready" flag. The server owns price (`src/pricing`), print geometry (new print-template catalogue), the validated transform, the rendered bytes, and ownership re-checks at every signed-URL mint.
2. **Self-hosted ML, in-region, scale-to-zero.** Background-removal and upscale run on **our** CPU compute (no standing GPU, no third party sees the image). Tiered upscale: classical `sharp` Lanczos resample for the common case; CPU ML super-resolution only for large enlargements, on a post-payment job.
3. **The gate is the single chokepoint.** Exactly one function authorises bytes leaving the VPC to a POD. Until LG3 + LG6 are green and a signed Article 28 DPA exists for the POD, that function hard-blocks **live child images**, while the entire pipeline is buildable/testable against the **Prodigi sandbox with brand-safe non-child art**.

---

## 2. Integration with what is already built

The pipeline **extends**, it does not rewrite. Verified facts about the current code (each checked against source):

| Concern | Where (verified) | Shape today | What the pipeline adds |
|---|---|---|---|
| Uploaded original | `src/db/schema.ts:assets` + `:storageObjects` | one write-once `ORIGINAL` storage_object per asset; `objectClass` enum = `['ORIGINAL','DERIVATIVE','CREATION_LAYER']` | writes `DERIVATIVE` rows (cutout / upscaled / printfile) the same way ingest writes originals |
| Bytes / signing | `src/storage/objects.ts:putObject`, `:presignDownload`, `:originalKey` | one deterministic key `assets/{assetId}/original`; **`presignDownload(key, ttlSeconds = 120)`** — single short-lived policy | a `derivativeKey()` sibling + a **separate provider-ingestion URL policy** (longer TTL) |
| Ingest | `src/server/ingest.ts:ingestOriginalAsset` | authz → `stripExif` → `putObject` → insert `assets` + `ORIGINAL`. Sets `purgeAfter`; **never sets `fulfilledAt`** | the render step mirrors this pattern; the fulfilment-complete step stamps `assets.fulfilledAt` (defined at `schema.ts`, currently written by no code) |
| Download grant | `src/server/assets.ts:getAssetDownloadGrant` | **hardcodes `eq(storageObjects.objectClass,'ORIGINAL')`** (line 109); routes through `getViewableAssetOrThrow` (the authz gate, line 105) | **NEW finding:** no code path can mint a derivative URL today. Must extend this to an `objectClass`-parameterised grant that STILL routes through the gate — never a raw `presignDownload` in the job |
| Catalogue / price | `src/pricing/catalogue.ts:CATALOGUE`, `:priceOf` | static `CatalogueKey → {pricePence,label}`; **zero print geometry** | DB-backed product/variant/print-template catalogue behind the same loader shape; engine stays pure |
| Pricing engine | `src/pricing/engine.ts` (`quote`, `priceBasket`) | pure: `RequestedLine[]` → server-trusted `Quote`; rejects client price | swap the **source** of `priceOf` from const to DB row; client still sends keys+qty only |
| Order / line | `src/db/schema.ts:orders` + `:orderItems` | `orderItems` = **`productKey + qty + unitPricePence + linePence` only** — no asset/spec/print-file link | the load-bearing gap: add `variantId`, an asset+placement spec, a print-file pointer, per-item state |
| Order placement | `src/server/orders.ts:placeOrder`, `:markOrderPaid` | re-prices via `quote()`; `markOrderPaid` flips `PENDING→PAID` idempotently via `.where(status='PENDING')` | `placeOrder` also re-validates each placement; `markOrderPaid`'s guarded UPDATE is the **exactly-once enqueue seam** |
| Order status | `src/db/schema.ts:orderStatus` | coarse `PENDING\|PAID\|FULFILLING\|SHIPPED\|CANCELLED` | per-item fulfilment state + an order-level roll-up |
| Studio | `src/app/studio/[creationId]/page.tsx` | 100% CSS demo: `MAGIC[]` filters, `upscale()`/`applyMagic()` = `setTimeout`, hardcoded `pricePence: 2200`, `printReady` boolean, `scale(zoom)` canvas | real calls to the in-region ML worker; real print-template-driven canvas; server DPI readout; persisted placement |
| Jobs | `src/app/api/jobs/retention/route.ts` | cron POST guarded by `Bearer JOBS_SECRET` (500-if-unconfigured, 401-if-mismatch); calls a `src/server/*` fn | copied verbatim for `api/jobs/fulfilment` + a reconciliation poll |
| Retention purge | `src/server/retention.ts:purgeExpiredAssets` | selects `keptInHome=false AND purgeAfter<=now` (line 36), cascades storage_objects + audits `PURGE_EXECUTED`; **no in-flight-order guard** | **must gain an in-flight-order exclusion** the moment `order_items.assetId` exists (see §6/§9) |
| Webhooks | `src/payments/webhook.ts:handleStripeEvent` + `src/db/schema.ts:webhookEvents` | verify → `markOrderPaid` → insert dedup row; idempotency ledger exists | POD webhook reuses verify+idempotency posture; a NEW `pod_webhook_events` ledger keyed on the provider event id |
| Authz | `src/authz/policy.ts:assertCanViewAsset`, `src/server/assets.ts:getViewableAssetOrThrow` | central gate; every byte requires an ALLOW | the provider-ingestion mint is a NEW call site through the SAME gate, not a bypass |
| Sub-processors | `src/db/schema.ts:subProcessorRole` (`'POD'`), `:subProcessors.dpaSignedAt`/`.transferMechanism` | the `POD` role + DPA columns already exist | the gate predicate reads these real columns |

**Designed vs TO-VERIFY split:** everything in §§2–4 and §6's orchestration shape is **designed against verified code**. Everything Prodigi-specific (API surface, SKUs, webhook signing, asset-fetch SLA) is **TO-VERIFY** and isolated in §5.

---

## 3. Data model

Three reconciliation decisions had to be made because the lenses disagreed. **Recommendations adopted below; each is an open question for the founder (§9).**

- **Print-file `objectClass`:** **reuse `DERIVATIVE`** (recommended). No migration; the `storage_one_original_per_asset` write-once index and the retention cascade already behave correctly. Distinguish kind by key prefix (`derivativeKey(assetId,'printfile')`). A new `PRINT`/`PRINT_FILE` enum value buys nothing and adds a migration. *(Open question O-1.)*
- **Fulfilment state granularity:** **per-item** (Lens 5 is correct — item A can ship while item B fails). Place it on the **artwork/spec row**, not the order, and not duplicated on `order_items`. *(Open question O-2.)*
- **`BLOCKED_GATE` state:** included so child-image lines can correctly *wait* (vs `FAILED`) and a non-child product path could ship live if the founder wants a partial launch. *(Product call, open question O-3.)*

### 3.1 SKU / print-template catalogue (provider-agnostic)

Three layers + a **separate provider mapping** so a second POD is a new adapter + SKU row, never a schema change. The static `catalogue.ts` becomes the **seed** for these tables; the pricing engine reads `pricePence` from `product_variants` via the loader (the only change is the *source* of `priceOf`, preserving "client never sends price").

```ts
// new enums (value-arrays in src/domain/types.ts, mirrored as pgEnum per the in-sync convention)
productCategory: ['PRINT','MUG','APPAREL','CUSHION','BLANKET','BOOK','PUZZLE','BAG','CARD','ADDON']
orientation:     ['PORTRAIT','LANDSCAPE','SQUARE']
fitMode:         ['CONTAIN','COVER']
providerSlug:    ['PRODIGI','MANUAL']   // MANUAL = hand-fulfil fallback; extensible

products(id, key UNIQUE /* 'framedPrint' — matches today's productKey */, category,
         label, blurb, active, sortOrder)

product_variants(id, productId→products, sku UNIQUE /* internal 'PRINT-A4-FRAME-OAK' */,
                 label, pricePence /* PRICE LIVES HERE — pricing reads this */, currency='GBP',
                 active)

// SERVER-AUTHORITATIVE print geometry. mm is source of truth (provider spec); px derived & stored
// so the Studio canvas and the renderer agree on bounds.
print_templates(id, variantId→product_variants UNIQUE,
                orientation, printWidthMm, printHeightMm, bleedMm=3, safeInsetMm=5,
                requiredDpi=300, printWidthPx, printHeightPx, aspectMilli /* w/h*1000, int */,
                fitMode='CONTAIN',
                minSourceWidthPx, minSourceHeightPx /* below this we MUST upscale — the DPI gate */)

// PROVIDER-AGNOSTIC. Prodigi's SKU lives HERE, never on the variant.
product_variant_providers(id, variantId→product_variants, provider /* providerSlug */,
                          providerSku /* e.g. 'GLOBAL-FAP-A4' */, providerConfig jsonb,
                          isDefault, active,
                          UNIQUE(variantId, provider),
                          UNIQUE(variantId) WHERE isDefault /* one default provider per variant */)
```

**Derived-px hazard (low):** `printWidthPx`/`aspectMilli` are computed from mm. Derive them in **one shared helper** (`mm/25.4*dpi`, consistent rounding) used by both the seeder and the renderer, and assert the relationship in the schema test that already guards enum drift — otherwise the canvas frame and output file can be off by a pixel.

### 3.2 Extended order / line-item spec

`order_items` stays the **priced ledger line** (keep `unitPricePence`/`linePence` as the pricing record of truth). Add `variantId` to it, and carry the **server-authoritative print spec** in a separate `order_item_artwork` row (one per printable line; add-ons like gift-wrap have none).

```ts
fulfillmentState: ['PENDING','RENDERING','RENDER_FAILED','READY','SUBMITTED',
                   'IN_PRODUCTION','SHIPPED','DELIVERED','CANCELLED','BLOCKED_GATE','ERROR']

// order_items GAINS:  variantId uuid → product_variants  (nullable during migration; backfill
//                     from productKey, then enforce for printable categories)

order_item_artwork(
  id,
  orderItemId → order_items (onDelete cascade) UNIQUE,   // one artwork per item
  assetId     → assets,                                   // the kept source; authz gates every mint
  variantId   → product_variants,
  controllerAccountId → accounts,                         // copied from asset; authz + audit anchor

  templateSnapshot jsonb NOT NULL,  // {printWidthMm..,requiredDpi,bleedMm,safeInsetMm} FROZEN at order time
  transform        jsonb NOT NULL,  // {scale,offsetX,offsetY,rotationDeg} in NORMALISED 0..1 print-area units
                                    //   — server-clamped against templateSnapshot before insert; renderer
                                    //     reads ONLY the stored value, never the request
  sourceObjectId → storage_objects, // the DERIVATIVE (cutout/upscaled) the render starts from
  printObjectId  → storage_objects, // the rendered printfile DERIVATIVE; null until render
  renderedDpi   integer,            // resolved at render (audit + DPI gate)
  upscaled      boolean default false,
  status        fulfillmentState default 'PENDING',
  renderError   text,
  providerItemId text,              // POD line id (ori_…) for webhook correlation
  INDEX(assetId), INDEX(status)
)
```

**Invariants encoded:**
- **Transform is normalised + server-validated.** Client *proposes* `{scale,offsetX,offsetY,rotationDeg}`; the server clamps it so the art covers the safe area and stays within the print area against `templateSnapshot`, then persists. The renderer reads only the stored value — same posture as pricing.
- **Geometry is snapshotted at order time** — a later template edit can't retroactively change a placed order's print bounds (the snapshot is the only geometry the renderer trusts for that line; live previews read the live template).
- **The print file is a `DERIVATIVE`** under the existing `assets→storage_objects` cascade, so signed-URL minting already routes through `assertCanViewAsset`, retention purge already deletes it, and no new bucket/policy is needed.

### 3.3 Fulfilment & shipment model

Order-level provider submission + append-only status history (mirrors the existing audit-record pattern). One provider order per order at launch (relax to per-`(order,provider)` if split-shipping later).

```ts
fulfillment_orders(
  id, orderId → orders,
  provider providerSlug default 'PRODIGI',
  providerOrderId text,                     // Prodigi ord_… once accepted
  status fulfillmentState default 'PENDING',
  idempotencyKey text UNIQUE NOT NULL,      // WE generate; deterministic from orderId (see §6) so a
                                            //   retry never double-orders physically
  submittedAt timestamptz, lastError text,
  UNIQUE(orderId), INDEX(provider, providerOrderId)
)

fulfillment_shipments(
  id, fulfillmentOrderId → fulfillment_orders (cascade),
  carrier, trackingNumber, trackingUrl, dispatchedAt
)

fulfillment_status_history(            // append-only audit of every provider/webhook/poll update
  id, fulfillmentOrderId → fulfillment_orders (cascade),
  status fulfillmentState,
  source text,                         // 'WEBHOOK' | 'POLL' | 'SUBMIT' | 'MANUAL'
  detail jsonb,                        // raw provider slice — NO child image
  createdAt, INDEX(fulfillmentOrderId, createdAt)
)
```

**New audit-event values** (the enum has none for fulfilment today): `FULFILLMENT_SUBMITTED`, `FULFILLMENT_STATUS_CHANGED`, `FULFILLMENT_SHIPPED`, `FULFILLMENT_FAILED`, `FULFILLMENT_CANCELLED`, and **`CHILD_IMAGE_EGRESS`** (logged on every byte sent to a POD — the evidence the transfer gate was honoured). `PROVIDER_DELETION_REQUESTED`/`PROVIDER_DELETION_CONFIRMED` already exist and must be wired for DSAR erasure.

### 3.4 Two gaps no integration section covered (must be designed, not assumed)

- **Guest/gift order tracking.** `getOrdersForAccount` filters by `accountId`; guest orders have `accountId=null` and never appear. POD status for a guest/gift buyer needs a **token-scoped read path** (reusing the gift-link token discipline). Low severity but a real gap in a core flow.
- **Shipping address.** There is **no address table or column anywhere** in the schema. Prodigi's `recipient` block needs a new, **minimised** buyer-delivery model (name + delivery address + contact for the buyer/grandparent — **never a child surname**, no profiling). This is a whole missing table, not an `order_items` extension.

### 3.5 How it coexists

```
assets ──< storage_objects        (ORIGINAL + DERIVATIVE cutout/upscaled + DERIVATIVE printfile)
  │                                  ▲ printObjectId points here
  ▼
order_item_artwork >── order_items >── orders ──< fulfillment_orders ──< fulfillment_shipments
  │ (assetId, variantId, transform, templateSnapshot, printObjectId, per-item status)     │
  ▼                                                                                        ──< fulfillment_status_history
product_variants ──< print_templates
       │            ──< product_variant_providers (Prodigi sku)
       ▼
     products
```

---

## 4. Render pipeline

### 4.1 Positioning model (server-authoritative)

The user positions art within the product's print area. The client expresses placement as a **resolution-independent transform in normalised print-area (trim-box) coordinates** so it re-renders identically server-side at any DPI:

```ts
interface Placement {
  assetId: string; variantId: string;
  cx: number; cy: number;          // centre of art in normalised trim-box coords (0.5,0.5 = centred)
  scale: number;                   // art width as a fraction of trim-box width; height from aspect
  rotationDeg: number;             // usually 0; stylus rotate allowed (TO-DECIDE: free vs 0/90/180/270)
  srcWidthPx?: number; srcHeightPx?: number;  // ADVISORY only — server re-derives true dims from storage
}
```

The Studio canvas renders the real trim box, **bleed band**, and **safe-area inset** from `print_template` (the dashed guide in the demo becomes real geometry, not a fixed CSS inset). Placement is per-product and recomputed on product switch (no lost edits). **Live DPI on the client is advisory** — it only drives the warning UI; the bind happens server-side.

### 4.2 DPI gate (server, pure, unit-tested)

```
placedWidthPx_onPrint = scale * (printWidthPx - 2*bleedPx)         // art width at trim
effectiveDpi          = srcWidthPx / (placedWidthPx_onPrint / targetDpi)   // from TRUE source dims
```

Three bands: **OK** (≥ requiredDpi) · **WARN** (≥ ~150 dpi → offer one-tap upscale) · **BLOCK** (too low even after the largest upscale tier). `assertPlacementPrintable(placement, template)` is a pure function returning `{band, effectiveDpi, suggestedUpscaleTier}` — the badge becomes a real readout of this, not state. **Binding point (recommended): re-validate at BOTH `placeOrder` (reject BLOCK before payment) AND render (defence in depth)** — matching the existing pricing posture. *(Open question O-4.)*

### 4.3 Self-hosted ML — in-region, scale-to-zero, no standing GPU

A small **containerised in-region (UK/EU) HTTP microservice** the Next app calls over a private network — **not** a third-party API, so no third party ever sees the image. Runs on scale-to-zero compute (Cloud Run / Container App style; idles to zero → no standing cost, no GPU). `src/ml/client.ts` is the only seam that talks to it; invariant (mirroring the generative rule): **exactly one image buffer + an op name in, one buffer out**.

Two launch ops, both deterministic / self-hosted → **zero third-party image exposure at Phase-1 launch**:
- **`removeBackground`** — a `rembg`/U²-Net-class ONNX model on **CPU** → RGBA cutout PNG. The warm "Remove bg" magic edit, made real.
- **`upscale` (TIERED)** — budget-critical:
  - **Tier 0 — classical resample (common case):** in-process with **`sharp`** (already a dependency), Lanczos3 + mild sharpen. Instant, no ML, no service hop. Covers most phone-photo→A4 enlargements.
  - **Tier 1 — CPU ML super-resolution (large enlargements only):** a Real-ESRGAN x2/x4-class ONNX model on **CPU** in the same scale-to-zero container, invoked only when Tier 0 can't reach `requiredDpi`. Slower (run as a job), rare, costs only when used.
  - `pickUpscaleTier(effectiveDpi, requiredDpi, placedSize)` (pure, unit-tested) decides Tier0 / Tier1 / BLOCK. **Per-account/per-creation ML-op budget cap** mirrors the generative cap *(value TBD — O-8)*.

### 4.4 Server-side render (sharp compositing at print resolution)

`assertCanViewAsset` first, then **re-apply the validated `Placement` server-side** at the spec's pixel resolution; the client's rendered pixels are discarded.

```ts
// src/print/render.ts (server-only)
async function renderPrintFile(db, viewer, placement): Promise<{printObjectId, key, sha256}> {
  const asset = await getViewableAssetOrThrow(db, placement.assetId, viewer);   // 1. authz
  const src   = await loadObjectBuffer(db, asset.id, chooseSourceKind(placement)); // 2. our bytes, not client's
  const meta  = await sharp(src).metadata();                                     // 3. TRUE dims (ignore client claim)
  const spec  = printSpecFromTemplate(placement.variantId);
  const dpi   = assertPlacementPrintable({...placement, srcWidthPx: meta.width, srcHeightPx: meta.height}, spec);
  if (dpi.band === 'BLOCK') throw new PrintError('insufficient resolution');     // 4. re-validate (defence in depth)
  const layer = computeLayerRect(placement, spec, meta);                         // 5. pure, unit-tested geometry
  const printBuffer = await sharp({ create: { width: spec.printWidthPx, height: spec.printHeightPx,
        channels: 4, background: spec.background === 'transparent'
          ? {r:0,g:0,b:0,alpha:0} : hexToRgb(spec.background.hex) } })           // 6. composite onto full canvas+bleed
    .composite([{ input: await sharp(src).rotate(placement.rotationDeg)
                                         .resize(layer.w, layer.h, {fit:'fill'}).toBuffer(),
                  left: layer.left, top: layer.top }])
    .withMetadata({ density: spec.targetDpi })                                   // embed DPI for the POD
    .toColourspace('srgb').toFormat(spec.format, spec.format==='jpeg'?{quality:92}:{}).toBuffer();
  return await putDerivative(db, asset.id, 'printfile', printBuffer, spec);       // 7. write-once DERIVATIVE
}
```

`computeLayerRect` is the **single source of geometric truth** (shared in spirit with the client preview math, but the server number wins) — pure and exhaustively tested (centred / off-centre / rotated / scaled-past-bleed clamp / aspect mismatch). Output is rendered to exactly `printWidthPx × printHeightPx (+bleed)`, so we send Prodigi `fillPrintArea` with a 1:1 asset and **Prodigi's auto-crop is a no-op** — the user's positioning, not Prodigi, decides what's kept. **Colour: sRGB only at launch** (CMYK soft-proof deferred); confirm Prodigi accepts sRGB and does its own CMYK conversion.

### 4.5 Derivatives are write-once, gated, retention-aware

`src/print/derivatives.ts` writes derivatives the way `ingest.ts` writes originals: `derivativeKey(assetId, kind)` (kind ∈ `cutout`/`upscaled`/`printfile`), `objectClass:'DERIVATIVE'`, write-once, `exifStripped:true` (sharp re-encode drops metadata), KMS alias propagated. **The original is never mutated (NN8);** derivatives are regenerable from original + stored `Placement` and **cascade-delete with the asset**, so the existing retention purge already removes them. **Every derivative signed URL must go through the (new) `objectClass`-parameterised, `assertCanViewAsset`-gated grant — never a raw `presignDownload` in a job.**

### 4.6 When each stage runs (timing decision)

Background-removal and Tier-0 upscale run **interactively in the Studio** (needed for the quick, gratifying preview). The **final print-file render + POD submit run on a JOB after `markOrderPaid`**, not in the checkout request, because (a) full-res sharp + possible Tier-1 ML is too slow for a request, (b) no wasted compute on abandoned carts, (c) it reuses the scale-to-zero `api/jobs/*` + `JOBS_SECRET` pattern. *(Founder confirm O-7: the print file does not exist at the instant "add to basket"/checkout completes.)*

---

## 5. Provider-agnostic POD adapter + Prodigi (sandbox-first)

**All Prodigi field names live ONLY inside the adapter's mapping layer; callers use neutral domain types.** This keeps the constitution's provider-agnostic rule.

### 5.1 The port (designed, provider-neutral)

```ts
interface PodAdapter {
  readonly provider: string;                          // 'prodigi'
  getQuote(req): Promise<PodQuote[]>;                  // optional; our pricing is independent (COGS only)
  createOrder(req: PodCreateOrderRequest): Promise<PodOrderHandle>;  // idempotencyKey REQUIRED
  getStatus(providerOrderId): Promise<PodStatusEvent>;
  cancel(providerOrderId): Promise<PodCancelResult>;
  verifyAndParseWebhook(req): Promise<PodStatusEvent>; // verify/authenticate → neutral event
  mapStatus(providerStatus): FulfillmentState;
}
// neutral types: PodAddress (no child surname), PodLineSpec {orderItemId, providerSku, copies,
//   sizing:'fill'|'fit'|'stretch', attributes?, printAssetKey /* adapter mints the ingestion URL itself */},
//   PodOrderStatus = 'submitted'|'in_production'|'shipped'|'complete'|'cancelled'|'error'
```

`src/fulfillment/providers/prodigi.ts` implements it; `src/fulfillment/orchestrator.ts` is provider-blind. SKU + print-geometry come from the catalogue tables (§3.1), never from a provider SDK call site.

### 5.2 Prodigi API v4 (TO-VERIFY against current docs before coding the adapter)

> The lens that fetched docs self-flagged these; treat the **entire** Prodigi surface as must-confirm.

- **Base URLs (TO-VERIFY):** sandbox `https://api.sandbox.prodigi.com/v4.0`, live `https://api.prodigi.com/v4.0`. Auth header `X-API-Key` (credentials differ sandbox vs live).
- **Create order (TO-VERIFY):** `POST /v4.0/orders` — one-step, validate-on-create. Payload field names (TO-VERIFY): `merchantReference`, `idempotencyKey`, `shippingMethod` (`Budget|Standard|StandardPlus|Express|Overnight`), optional `callbackUrl`, `recipient{name,email,phoneNumber,address{line1,line2,townOrCity,stateOrCounty,postalOrZipCode,countryCode}}`, `items[]{merchantReference, sku, copies, sizing:'fillPrintArea'|'fitPrintArea'|'stretchToPrintArea', attributes, assets[]{printArea:'default', url, md5Hash?}}`, `metadata` (≤2000 chars).
- **Other endpoints (TO-VERIFY):** `GET /v4.0/orders/{id}`, `POST /v4.0/orders/{id}/actions/cancel` (`cancelled`/`failedToCancel`/`actionNotAvailable`), `POST /v4.0/quotes`, `GET /v4.0/products/{sku}` (dimensions, attributes, print areas with `required`, variant print-area resolutions). ID prefixes `ord_/ori_/ast_/shp_/evt_`.
- **Sizing (TO-VERIFY):** `fillPrintArea` (default) centre-crops to the print-area aspect; we render to exact `printAreaPx(+bleed)` so this is a **no-op** — our crop wins.
- **Status → neutral mapping (TO-VERIFY the stage/detail strings):**

  | Prodigi (TO-VERIFY) | Neutral | Our `orderStatus` |
  |---|---|---|
  | `InProgress` / `downloadAssets`,`allocateProductionLocation`,`printReadyAssetsPrepared` | `submitted` | `FULFILLING` |
  | `InProgress` / `inProgress` | `in_production` | `FULFILLING` |
  | detail `shipping` (shipment present) | `shipped` | `SHIPPED` |
  | stage `Complete` | `complete` | `SHIPPED`/done |
  | stage `Cancelled` | `cancelled` | `CANCELLED` |
  | any detail `Error` | `error` | (per-item `ERROR` + ops alert) |

### 5.3 The load-bearing Prodigi risk: async fetch vs our 120s URLs

**Verified in our code:** `presignDownload` defaults to `ttlSeconds = 120`. **TO-VERIFY in Prodigi:** Prodigi downloads the asset **asynchronously after order creation** and retains a copy ~30 days, accepting a private signed URL. A 120s URL will very likely be **dead before Prodigi's fetch worker pulls it** → `downloadAssets` error → silently unfulfilled order.

**Design:** a **separate provider-ingestion URL policy**, distinct from the 120s interactive policy:
- Longer TTL — **TO-VERIFY against Prodigi's actual fetch SLA**; plan **hours, recommend ~24h** (a guess until confirmed), comfortably inside Prodigi's 30-day retention, re-mintable on retry. The URL only needs to survive until first successful fetch.
- GET-only, single object key (the **printfile** derivative, never the sacred original), IP/path-scoped if the bucket allows.
- Minted **only after the authz ALLOW** through the (new) `objectClass`-parameterised grant, **and only after the transfer gate passes** — every mint logs `CHILD_IMAGE_EGRESS`.

### 5.4 Sandbox & test environment (TO-VERIFY)

Sandbox does not charge or fulfil; orders viewable on a separate dashboard. **TO-VERIFY:** exact sandbox **test SKUs**, whether sandbox simulates the full status progression and fires callbacks (check the Prodigi Postman public collection). Our dev fallback (`markOrderPaid` immediately when Stripe absent) maps onto a **mock POD adapter** for pure-local dev; the **sandbox adapter** is used in staging.

### 5.5 Webhooks (TO-VERIFY authenticity — safety-critical)

**TO-VERIFY:** Prodigi callbacks appear to use CloudEvents v1.0 (`type=com.prodigi.order.status.stage.changed#<Stage>`, `subject=order id`, `data=order snapshot`, `id=evt_…`). **No HMAC/signature scheme surfaced in the docs.** Until a signature is confirmed, `verifyAndParseWebhook` MUST **treat the callback as untrusted and do an authoritative `getStatus(providerOrderId)` read-back before mutating order state** — the same defence as the Stripe verify posture, plus the `pod_webhook_events` idempotency ledger. Resolve our order by `merchantReference`/subject; require it to exist and be `PAID`+ before transitioning. **We must not advance an order on an unsigned, unverified POST.**

---

## 6. Fulfilment orchestration + failure modes

**Trigger = the Stripe webhook → `markOrderPaid`.** Enqueue fulfilment as a **conditional state flip in the SAME guarded UPDATE/transaction** as `PENDING→PAID` (`.where(status='PENDING')`) — **not** a separate call after it. *(NEW finding:* `handleStripeEvent` inserts the dedup row **after** `markOrderPaid`; a non-idempotent enqueue placed after the flip would re-fire on a Stripe retry if the process crashes before the dedup insert. The same-UPDATE flip is a hard requirement, not implicit.)*

**Worker = the jobs endpoint pattern.** `src/app/api/jobs/fulfilment/route.ts` copies `retention/route.ts` (`Bearer JOBS_SECRET`, 500/401 guards). It claims due items with `SELECT … FOR UPDATE SKIP LOCKED` so overlapping cron ticks never double-submit, then steps each through **render → gate → submit**.

**Status = a second webhook** (`api/webhooks/pod/route.ts`) + a lower-frequency **reconciliation poll** (`getStatus` for items `SUBMITTED`/`IN_PRODUCTION` older than N hours) — the safety net for the single biggest silent-failure source: **dropped webhooks**. Never rely on the webhook alone.

**Idempotency / retries / partial failure:**
- **Idempotent submit:** the `idempotencyKey` is **order-scoped** (deterministic from `orderId`) because submission is **one Prodigi order per order, many items**. *(Reconciles the three lenses' disagreement — O-5.)* The `READY→SUBMITTED` transition is guarded exactly like `markOrderPaid`'s conditional UPDATE.
- **Retries:** `attempts++` with capped exponential backoff; transient (5xx/timeout) retries, permanent (4xx/validation) → `FAILED` with reason. Mirrors retention's "leave it for next run rather than half-doing it."
- **Partial failure is first-class:** state is **per item**. Item A `SHIPPED` + item B `FAILED` is valid; `order.status` is a roll-up (`SHIPPED` only when all live items shipped; a sticky attention flag otherwise). A failed item never blocks the others and never silently refunds — it raises an ops alert.
- **Render before submit:** render in-VPC, write the `printfile` object, *then* submit. Render failure → `FAILED`, never a blank/low-DPI submission.

**Address / cancellation / reprints:** address validated/normalised before submit (buyer delivery data only, never a child surname). Cancellation possible only while `READY`/`SUBMITTED`-not-in-production; past `IN_PRODUCTION` it's a Stripe refund + ops, not a provider cancel. Reprints create a **new fulfilment item** referencing the same `assetId` + frozen spec — the frozen spec is what makes a faithful reprint possible.

**Audit:** every transition appends a `fulfillment_status_history` + `audit_records` row (`actorType:'SYSTEM'`), exactly as the retention purge audits `PURGE_EXECUTED`. `CHILD_IMAGE_EGRESS` is mandatory on every byte-to-POD.

**Adversarial failure catalogue** (the headline ones, all in the risk register §10): (a) print spec lost because `order_items` is spec-blind today; (b) inline submit → duplicate physical prints on Stripe retry; (c) the gate reduced to one env flag; (d) a child photo with `childSubjectId=null` slipping the gate; (e) **retention purge deleting an in-flight order's source** (`purgeExpiredAssets` has no open-order guard); (f) dropped POD webhook stranding an item without the reconciliation poll; (g) a printfile derivative outliving the original after erasure.

---

## 7. Compliance & the child-image transfer gate

**Invariant:** *no live child image leaves the VPC to any third-party POD until LG3 (transfer risk assessment) + LG6 / Article 28 DPA with the POD are green.* `LAUNCH-GATES.md` confirms these are **not started**, and `subProcessors` has no Prodigi DPA row yet. **Live child-image submission must be code-blocked now.** The whole pipeline is buildable/testable against the **Prodigi sandbox with brand-safe non-child art**.

The gate is a **server-side predicate, not an env boolean** (a lone flag is exactly what gets flipped in prod by accident) — the **single chokepoint** every `submitOrder` passes through, the way every signed-URL mint passes through authz:

```ts
// src/fulfillment/gate.ts — the ONLY place that authorises bytes → POD
function assertPodEgressAllowed(item, asset, env): void {
  const isChildImage = asset.childSubjectId !== null;     // resolved server-side; never trust the client
  if (env.POD_MODE === 'SANDBOX') {
    if (isChildImage) throw new GateError('child image may not be sent even to sandbox');
    return;                                                // non-child test art → OK
  }
  if (isChildImage) {                                      // LIVE + child → BOTH gates must be green,
    const pod = lookupSubProcessor('POD');                //   verified against the register, not a flag
    const lg3 = env.LG3_TRANSFER_ASSESSMENT_SIGNED_OFF;   // set ONLY by the documented DP sign-off process
    const dpa = pod?.dpaSignedAt != null && pod?.transferMechanism != null;  // LG6 for the POD
    if (!(lg3 && dpa)) throw new GateError('LG3+DPA not green — child-image POD egress blocked');
  }
}
```

Properties that make it trustworthy:
- **Child-ness resolved server-side** from `asset.childSubjectId`. Residual leak: a photo *of* a child with `childSubjectId=null` reads as non-child → default-deny posture for PHOTO assets near children + content-safety screening + treat unlinked photos conservatively (risk in §10).
- **Sandbox can never carry a child image** — the test path is brand-safe-only by construction, so building the full loop now cannot leak a real child's art.
- **Live + child + gate-not-green ⇒ `BLOCKED_GATE`**, not `FAILED` (it's correctly *waiting*). A sweep releases blocked items when the gate flips green. *(Enables an optional partial launch of a non-child path — O-3.)*
- **Two-person / register-backed flip:** the sign-off flag alone can't open the gate; a real signed-contract `dpaSignedAt` + `transferMechanism` must also exist in the `sub_processors` register.
- **Tested exhaustively as a launch gate** (matrix: child × {sandbox, live} × {gate green, gate not green}) — like the authz matrix.

**Additional compliance wiring:** Prodigi independently retains the asset ~30 days — record this in the DPIA/processor record. **Erasure (DSAR) must cascade derivatives DB+storage AND drive `requestAssetDeletion` to the POD** (`PROVIDER_DELETION_REQUESTED`/`PROVIDER_DELETION_CONFIRMED` audit events already exist; the design must wire them, not just define them). **Retention vs in-flight orders:** `purgeExpiredAssets` needs an "asset referenced by a non-terminal order" exclusion the moment `order_items.assetId` exists (the purge is already live).

---

## 8. Phased build plan

Each phase is small, deployable, and lands its tests in the same PR (visibility/pricing/ownership/deletion changes **require** tests per CLAUDE.md). The ML track runs in parallel.

### Phase 0 — schema + catalogue foundations (no provider calls)
- Add `products`/`product_variants`/`print_templates`/`product_variant_providers` (§3.1); seed from the current static catalogue; one shared mm→px helper.
- Swap the pricing loader source to the DB; engine stays pure.
- Add `variantId` to `order_items` + the `order_item_artwork` table (§3.2); extend `getAssetDownloadGrant` to an `objectClass`-parameterised grant (still through `getViewableAssetOrThrow`); add `derivativeKey`/`putDerivative`.
- **Add the in-flight-order guard to `purgeExpiredAssets`.**
- **Acceptance:** pricing tests still green (client price still discarded); schema/enum-drift test passes; a derivative URL can be minted **only** through the authz-gated grant (unit test: cross-family/removed viewer denied, no bytes); purge test: an asset in a non-terminal order is NOT purged.

### Phase 1 — positioning + DPI + render (self-hosted; no POD)
- Real Studio canvas from `print_template` (trim/bleed/safe-area); persist a server-validated normalised `transform`.
- `assertPlacementPrintable` / `pickUpscaleTier` / `computeLayerRect` (pure, exhaustive matrix tests).
- `renderPrintFile` (sharp compositing; authz-gated; output dims == template, embedded density == targetDpi).
- **Acceptance:** low-res → WARN → upscale → in-spec, end to end; render output is pixel-exact to the template; BLOCK throws; authz deny produces no print file; original never mutated.

### Phase 2 — self-hosted ML worker (parallel track)
- In-region scale-to-zero container; `src/ml/client.ts` single-image contract; `removeBackground` + tiered `upscale` (Tier 0 inline sharp, Tier 1 CPU ML).
- **Acceptance:** bg-removal produces an RGBA cutout DERIVATIVE; Tier-0 covers the common enlargement; Tier-1 invoked only for large enlargements; ML client invariant (exactly one image; output re-encoded, no EXIF); per-account budget cap enforced. **No third party sees the image.**

### Phase 3 — one-product vertical slice in Prodigi **sandbox** (gate-blocked for live)
- Adapter port + Prodigi sandbox impl for **one** product (e.g. A4 framed print) — confirm all §5 TO-VERIFY items against live docs first.
- Provider-ingestion URL policy; `fulfillment_orders` + idempotency; `api/jobs/fulfilment` (render→gate→submit) hung off the same-UPDATE enqueue; POD webhook (read-back-verified) + `pod_webhook_events`; reconciliation poll.
- **Acceptance (sandbox, non-child art only):** create→studio→pay→job renders printfile→sandbox submit→status tracked to SHIPPED; idempotent submit (retry never double-orders); ingestion URL is the long-TTL policy (not 120s); **live submit blocked while the gate flag is off**; gate matrix test green; address model holds buyer-only data.

### Phase 4 — generalise + close the loop
- Map remaining catalogue keys (per-product Prodigi SKUs + geometry from `GET /v4.0/products/{sku}`); cancellation/reprint paths; order-status surfacing on Family/Orders incl. the **guest/gift token-scoped read path**; stamp `assets.fulfilledAt` on fulfilment-complete so retention closes; wire DSAR provider-deletion handshake.
- **Acceptance:** per-item partial-failure handled (A ships while B retried); guest-order status visible via token; fulfilledAt drives purge after +30d (kept survives); DSAR cascades derivatives + requests+confirms POD deletion.

### Phase 5 — go-live gate (HARD BLOCKER, not code)
- LG3 transfer risk assessment + LG6 Article 28 DPA with Prodigi signed; `sub_processors` POD row populated (`dpaSignedAt`+`transferMechanism`); DPIA/Children's-Code records updated (incl. Prodigi's 30-day retention).
- **Only then** may the gate flag flip for live child images — **a STOP-AND-ASK if requested before the gates are green.**

---

## 9. Open questions to confirm (founder / Prodigi)

**Schema / product decisions (founder):**
- **O-1.** Print-file `objectClass`: reuse `DERIVATIVE` (recommended — no migration) vs add `PRINT`/`PRINT_FILE`?
- **O-2.** Fulfilment-state granularity & location: per-item on `order_item_artwork` (recommended) vs per-order vs on `order_items`?
- **O-3.** Partial launch: ship a non-child product path live behind `BLOCKED_GATE` while child products wait, or hold the entire fulfilment surface until the gate is green? (Decides whether `BLOCKED_GATE` is real or dead enum surface.)
- **O-4.** DPI/upscale binding point: re-validate at both `placeOrder` and render (recommended) — confirm a BLOCK line can't be priced/paid then fail at render.
- **O-5.** Idempotency-key scope: order-scoped (recommended; one Prodigi order per order) vs item-scoped.
- **O-6.** Guest/gift order tracking: confirm a token-scoped status read path (no design exists yet).
- **O-7.** Shipping-address model: confirm minimised buyer-delivery fields (no child surname) and the new table.
- **O-8.** ML-op budget cap value (mirrors the generative cap).
- **O-9.** Rotation: free vs snapped to 0/90/180/270 at launch (free complicates coverage validation + renderer).
- **O-10.** Currency: GBP-only at launch (no per-currency variant rows)? Add-ons as `category='ADDON'` variants with no print template?

**Prodigi (TO-VERIFY against live docs/support — do before coding the adapter):**
- **O-11.** Create-order payload field names, `sizing` keywords, ID prefixes, base/sandbox URLs, `X-API-Key` auth.
- **O-12.** **Asset-fetch SLA + retry** (sets the provider-ingestion TTL; ~24h is a *guess*).
- **O-13.** **Are callbacks signed (HMAC)?** If not, mandatory `getStatus` read-back before mutating state.
- **O-14.** Sandbox test SKUs + whether it simulates full status progression and fires callbacks.
- **O-15.** Per-product SKUs + print geometry (trim/bleed/required-DPI/format/background) for all 10 catalogue keys via `GET /v4.0/products/{sku}`.
- **O-16.** Does Prodigi **pull** via signed URL (assumed) or require a push/upload? (Decides whether we need the ingestion URL policy or a push path.)
- **O-17.** Prodigi data residency / UK-EU fulfilment region (directly shapes the LG3 transfer assessment).
- **O-18.** Confirm sRGB accepted (Prodigi does its own CMYK conversion) so no ICC/CMYK step at launch.
- **O-19.** Controller/legal sign-off that LG3 + LG6 are required-and-pending before any real child-image URL reaches Prodigi.

---

## 10. Risk register

| # | Risk | Sev | Mitigation (designed) |
|---|---|---|---|
| 1 | **`order_items` carries no asset/spec/print-file link** — a PAID order is unfulfillable, positioning work lost at checkout | High | Persist the server-authoritative, frozen spec on `order_item_artwork` at order time (§3.2); never re-trust the client at fulfilment. Lands with tests before any submit code. |
| 2 | **Catalogue has zero print geometry** — DPI gate + SKU map can't be server-authoritative | High | Print-template catalogue (§3.1); DPI gate is a server computation; price↔SKU resolved server-side only. |
| 3 | **No code path mints a derivative/print-file signed URL** (`getAssetDownloadGrant` hardcodes `'ORIGINAL'`, line 109) — invites an authz-bypassing raw `presignDownload` | High | Extend the grant to be `objectClass`-parameterised while STILL routing through `getViewableAssetOrThrow`; forbid raw presign in jobs. |
| 4 | **Retention purge deletes an in-flight order's source** (`purgeExpiredAssets` line 36 has no open-order guard; purge is live) | High | Add an "asset referenced by a non-terminal order" exclusion to the purge query, with a test in the same PR. |
| 5 | **Live child image to Prodigi before LG3+LG6** | High | Single-chokepoint gate predicate reading `sub_processors.dpaSignedAt`+`transferMechanism` AND a sign-off flag; sandbox = non-child-only by construction; build/test on sandbox with brand-safe art; exhaustive gate matrix; STOP-AND-ASK to flip early. |
| 6 | **Child photo with `childSubjectId=null` slips the gate** | High | Default-deny for PHOTO assets near children; content-safety screening; treat unlinked photos conservatively until classified. |
| 7 | **Print-file derivative outlives the original after erasure** | High | Erasure cascades derivatives DB+storage AND drives `requestAssetDeletion` to the POD to confirmation (audit events exist, must be wired). |
| 8 | **120s signed URL expires before Prodigi's async fetch** | High | Separate provider-ingestion policy, longer TTL (~24h, TO-VERIFY), single-object GET-only, gated + logged. |
| 9 | **Webhook authenticity unconfirmed** | High/Med | No HMAC surfaced → treat callback as untrusted, authoritative `getStatus` read-back before mutating; reuse Stripe idempotency posture; never advance on an unsigned POST. |
| 10 | **Client positioning transform trusted instead of re-validated** | High | Store normalised 0..1, clamp against `templateSnapshot` before insert, renderer reads only the stored value; re-validate at placeOrder + render; test in same PR. |
| 11 | **Inline fulfilment enqueue double-fires on Stripe retry** (dedup row inserted after `markOrderPaid`) | Med | Enqueue is a conditional state flip in the SAME guarded UPDATE/transaction as `PENDING→PAID`, not a separate call. |
| 12 | **Three lenses gave three print-file `objectClass` values** | Med | Reconciled: reuse `DERIVATIVE` (no migration; cascade + write-once index already correct). |
| 13 | **Per-order vs per-item fulfilment state unresolved** | Med | Reconciled: per-item state on `order_item_artwork`. |
| 14 | **Provider deletion not wired despite cascade existing** (Prodigi keeps asset ~30d) | Med | Wire the `PROVIDER_DELETION_REQUESTED/CONFIRMED` handshake into DSAR erasure. |
| 15 | **Dropped POD webhook strands an item forever** | Med | Reconciliation poll (`getStatus`) on the jobs endpoint + aged-item ops alert. |
| 16 | **Prodigi auto-crop discards part of the child's art** | Med | Render to exact `printAreaPx(+bleed)`, send `fillPrintArea` 1:1 → Prodigi crop is a no-op; crop+DPI re-validated server-side. |
| 17 | **Derivative bytes addressable without authz** | Med | All derivative grants through the `assertCanViewAsset`-gated path; never a convenience presign. |
| 18 | **Provider lock-in if Prodigi specifics leak past the adapter** | Med/Low | SKUs, sizing keywords, CloudEvents shapes, `ord_/ori_` IDs stay inside the adapter; SKU lives in `product_variant_providers`, never on the variant; orchestrator is provider-blind. |
| 19 | **Partial failure silently refunds/blocks the whole order** | Med | Per-item `fulfillmentState` + order-level roll-up + attention flag; A ships while B is retried/refunded independently. |
| 20 | **Guest/gift orders have no status read path** (`accountId=null`) | Low | Token-scoped read path (O-6) reusing gift-link token discipline. |
| 21 | **No shipping-address model exists** | Low | New minimised buyer-delivery table (no child surname); easy to over-collect when wiring Prodigi `recipient`. |
| 22 | **`fulfilledAt`/`purgeAfter` never set post-ingest** — retention loop open | Med | Fulfilment-complete step stamps `assets.fulfilledAt` so the existing purge runs at +30d. |
| 23 | **Standing GPU / cost creep from ML** | Low | CPU-only, scale-to-zero, Tier-1 only for large enlargements as a post-payment job, per-account cap; a future GPU is a deliberate costed decision, not the launch default. |
| 24 | **Derived px disagrees with renderer if rounded inconsistently** | Low | One shared mm→px helper for seeder + renderer; assert in the schema test. |
| 25 | **`templateSnapshot` drifts from `print_templates`** | Low | Intentional (immutability for placed orders); ensure the snapshot is the ONLY geometry the renderer trusts for that line; previews read the live template. |
| 26 | **Address/customer-data minimisation drift** | Low | Buyer delivery details only; never a child surname or profiling; keep to the documented minimisation set. |

---

### Designed vs TO-VERIFY — quick separation
- **Designed (verified against code):** every existing-seam citation; the catalogue/order/fulfilment schema; the positioning/DPI/render math; the orchestration shape (same-UPDATE enqueue, jobs pattern, reconciliation poll); the self-hosted ML topology; the gate predicate; the retention guard; the derivative-grant extension.
- **TO-VERIFY (Prodigi live docs, before adapter code):** every item in §5.2–5.5 and O-11…O-18 — API URLs/auth, create-order payload, sizing keywords, ID prefixes, asset-fetch SLA (→ ingestion TTL), webhook signing, sandbox SKUs + callback behaviour, per-product geometry, pull-vs-push, data residency, sRGB acceptance.
