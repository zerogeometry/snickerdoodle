# DUAL (double-sided) cushion fulfilment — verify before selling

**Status:** BLOCKED on Prodigi's real product spec. Not urgent (pre-launch, gate closed, no
real orders). MUST be nailed before the 12″/22″ square cushions sell as double-sided.

## The two DUAL SKUs
- `GLOBAL-CUSH-12X12-LIN-DUAL` — 12″ linen, double-sided
- `GLOBAL-CUSH-22X22-SUE-DUAL` — 22″ suede, double-sided

(The heart `GLOBAL-CUSH-SH-SCSSS` and 18″ round `GLOBAL-CUSH-18R-SCSSS` are single-sided.)
Defined in `src/server/catalogue.ts` (cushion DEF).

## Current behaviour
- `src/server/print/render.ts` renders a DUAL cushion as ONE double-wide file `[front | back]`
  (front = the child's design; back = the same image, or a solid palette colour).
- `src/fulfillment/submit.ts` (~line 386) sends that ONE file to `assets: [{ printArea: 'default' }]`.

## The open question
Prodigi's DUAL SKU **very likely** exposes separate `front` / `back` print areas (that's how they
let you print a different image per side), and both may be `required`. If so, one double-wide file
sent to `default` will print only one side or be **rejected for a missing area**.

Two scenarios, and the exact change each needs:

- **(a) DUAL = single `default` area (double-wide is right).** No code change. Add a fulfilment test
  asserting a DUAL line submits ONE asset to `default`.
- **(b) DUAL = separate `front` + `back` areas (both required).** The double-wide is wrong. Change:
  1. `render.ts`: for a DUAL cushion, render a SINGLE square face (like single-sided) instead of the
     double-wide. (A keepsake wants the same drawing both sides — founder call.)
  2. `submit.ts`: make the print-area list per-variant (from the frozen `providerConfig`), and fan
     the SAME presigned file out to each required area (`front` + `back`), defaulting to `['default']`
     for every other product. Add `printAreas?: string[]` to the variant DEF → `providerConfig` →
     read at submit.
  3. Fulfilment test: a DUAL line submits an asset for every required area (same URL); a single-sided
     cushion still submits just `default`.
  4. (If the colour-BACK option must survive, render the back face separately and send the front file
     to `front`, the back file to `back` — a bigger change; confirm the product decision first.)

## Verify the spec (I could not, from the agent sandbox)
`GET /v4.0/products/{sku}` needs `X-API-Key`; the agent environment has **no external network**
(Bash and the Next dev server both fail: `HTTP 000` / `TypeError: fetch failed`). Prodigi's public
product page and API docs don't name the cushion print areas (docs only give examples: `default`,
`spine`, `lid`), and the template PSD layer names don't extract via `strings`.

A dev-only route is committed to read it from a **networked** machine (metadata only — no image, no
order, 404 in production):

```
# in a normal terminal (real network), with the dev server running:
curl "http://localhost:3000/api/dev/prodigi?skus=GLOBAL-CUSH-12X12-LIN-DUAL,GLOBAL-CUSH-22X22-SUE-DUAL,GLOBAL-CUSH-SH-SCSSS"
```

Read the `printAreas` object per SKU (names + `required`). That decides scenario (a) vs (b); the
follow-up above is then a ~30-minute, fully-scoped change with tests.
