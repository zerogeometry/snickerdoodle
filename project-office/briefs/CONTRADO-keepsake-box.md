# Contrado keepsake box — evaluation pack

> The keepsake box was deferred at launch because **Prodigi has no tracked keepsake box** (its metal
> tin is untracked-only + lid-only). This pack is the ready-to-execute plan to add it via **Contrado**
> as a post-launch product. Prepared 2026-07-02. Owner action needed on 3 items (see §6).

## 1. Recommended product — Contrado "Custom Memory Box"
A genuine keepsake/memory box, not packaging — and a *better* product than the Prodigi tin:

- **Sizes:** A5, A4, A3 (they nest inside each other). A5 = bits & bobs, A4 = photos, A3 = a cuddly toy.
- **Made from** soft binding fabric over 0.12″ reinforced card — sturdy, built to last.
- **Personalisation:** the child's artwork printed **full-colour on the lid**; choose from **14 side-panel
  colours/patterns**; and a **suede-style interior lining** in soft pink / pale blue / ivory beige / black.
  (Contrado's jewellery box also offers an **inside-lid message** of ~15–20 words — confirm whether the
  memory box supports the same; if so it's the emotional hook: "for Ivy, age 4 — keep the magic".)
- **UK-made** (London, in-house), **worldwide tracked delivery ~1–4 days.**

**Why Contrado over the Prodigi tin:** tracked (Prodigi's tin isn't), richer personalisation (lid + sides +
lining + message vs lid-only), premium feel, and UK-made — which also *helps* the data-residency gate (§5).

## 2. How the dropship model works
Contrado runs a wholesale/dropship model (no minimums):
1. Customer buys from us and pays **us**.
2. We forward the order to Contrado and pay the **wholesale (dropshipper) price** = their RRP minus an
   **exclusive discount that tiers up to ~40% off** in volume (mix-and-match qualifies; no need for 10 of one).
3. Contrado **prints, packs and ships direct to the customer**, tracked, in Contrado-neutral packaging
   (own-label dispatch note + thank-you available).
- Pricing has a base RRP with a **margin slider** — we set our own retail above the recommended price.

## 3. Provisional pricing (fill in once trade cost is known)
Their per-size **retail** and **trade** prices aren't public (JS product pages / account-gated). Once we have
the **ex-VAT trade cost per size (incl. or excl. tracked delivery — confirm which)**, our shelf price follows
the SAME model as the launch 14 (25% markup on cost + card fees, free tracked delivery baked in, VAT on top,
then a charm `.x9`/`.95`). Sensitivity so you can see the shape:

| If our trade cost (ex-VAT, all-in) is… | …our retail lands ≈ | net ≈ |
|---|--:|--:|
| £18 (≈ A5) | **£33–35** | ~£5–6 |
| £24 (≈ A4) | **£43–46** | ~£7–8 |
| £32 (≈ A3) | **£56–60** | ~£9–10 |

That puts the box in the **cushion → framed-print tier** — a premium keepsake, which fits. (Numbers are
illustrative at ~28% net, matching the loaded range; you'll fine-tune per size as you did for the 14.)

## 4. Integration into Snickerdoodle
- Contrado's dropship is **Shopify-app-first**; we're a custom Next.js app, so we'd use their **API** (confirm
  it's available to dropship accounts + get the endpoint/auth) or, worst case, a **manual order-forwarding**
  fallback at first.
- It becomes a normal product in `DEFS` (category `FESTIVE`? no — a new `KEEPSAKE`/`BOX` category or reuse) with
  its own **provider = a new `CONTRADO` provider slug** in `product_variant_providers` (Prodigi is the other).
  The fulfilment worker routes by provider.
- **Single-image invariant still holds:** only the ONE lid image is ever sent to Contrado — same rule as the
  generative processor. Side-panel/lining choices are Contrado presets, not our data.

## 5. ⚠️ Compliance gate — a NEW processor of a child's image (LG3 + LG6)
This is the load-bearing part. Contrado would be a **new processor of children's images**, so — exactly like
Prodigi — **no live child image may go to them until this is closed** (docs/05; CLAUDE.md non-negotiables 3, 4, 8).
Require from Contrado, in writing, before wiring live:

- [ ] **Article 28 DPA** (controller → processor) — do they offer one to trade/dropship partners? *(ask)*
- [ ] **No-retention / delete-after-fulfilment** of the uploaded lid image (and **no training** on it).
- [ ] **UK/EU data residency** — where the image is stored + processed. UK-made helps, but confirm servers +
      any **sub-processors**, with our right to be told and to object.
- [ ] **Deletion on request**, honoured + confirmed (ties to our cascading-deletion job).
- [ ] **Security**: TLS in transit, encryption at rest, access controls.
- [ ] Add Contrado to the **sub-processor register** + the transfer-risk assessment; add this to the LG3/LG6
      launch-gate tracker before the box goes live.

If Contrado **can't** provide a DPA / no-retention / API, fall back to §7.

## 6. What we need from you (the only blockers)
1. **Open a Contrado trade/dropship account** (or request a wholesale price list) → gives us the **per-size trade
   cost** (and whether it includes tracked delivery). Then I finalise the retail prices.
2. **Request their DPA + data-handling/residency statement** (the §5 checklist) — the go/no-go for children's data.
3. **Confirm API access** for a non-Shopify store (else we start with manual order-forwarding).

Once those land, wiring it in is small: add the product to `DEFS`, add the `CONTRADO` provider + fulfilment route,
seed, price, ship.

## 7. Fallback if Contrado doesn't clear the gate
- **Printify** UK print-provider with a memory/keepsake box + a DPA (their box coverage + tracked status varies
  by provider — verify per provider).
- A **UK personalised-gift dropshipper** (e.g. Bags of Love-type) with white-label + a DPA.
- Worst case, keep the box **out of the range** — the jigsaw already gives a *tracked keepsake tin* moment.

## Sources
Contrado memory box (sizes/lid/linings/14 panels), dropship + wholesale model, UK-made + tracked delivery —
contrado.com/custom-memory-box, /wholesale, /faq (drop-shipping). Article 28 requirements — ICO / UK GDPR Art. 28.
