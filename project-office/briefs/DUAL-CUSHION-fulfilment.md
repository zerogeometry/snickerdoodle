# DUAL (double-sided) cushion fulfilment — VERIFIED (no code change)

**Status:** ✅ RESOLVED. Verified against Prodigi's real sandbox product spec on 2026-07-10.
The current design is correct; no fulfilment change needed.

## The question
The 12″/22″ square cushions are double-sided (`GLOBAL-CUSH-12X12-LIN-DUAL`,
`GLOBAL-CUSH-22X22-SUE-DUAL`). We send ONE asset to `printArea: 'default'`. Did the DUAL SKUs need
separate `front`/`back` print areas (which would have made a `default`-only submit print one side or
be rejected)?

## What the real spec says
`GET /v4.0/products/{sku}` (sandbox) returns, for BOTH DUAL SKUs **and** the single-sided ones:

```
printAreas: { "default": { "required": true } }
```

i.e. exactly ONE required `default` area — no `front`/`back`. And Prodigi's double-sided cushion
TEMPLATE is **2:1 double-wide** (measured from the PSD headers):

| template | px | ratio |
|---|---|---|
| square-cushion-double-sided-12x12 | 3750×1875 | **2.00** |
| square-cushion-single-sided-12x12 | 1875×1875 | 1.00 |
| square-cushion-double-sided-22x22 | 6750×3375 | **2.00** |
| square-cushion-single-sided-22x22 | 3375×3375 | 1.00 |

So Prodigi encodes both faces as ONE double-wide artwork sent to `default`. Our renderer already
produces exactly that: `render.ts` builds a double-wide `[front | back]` file for a DUAL cushion
(front = design; back = same image, or a solid palette colour), and `submit.ts` sends it to
`default`. **Correct — scenario (a).**

## Guardrails added
- `src/fulfillment/submit.ts`: the `default` line now carries the verified note (revisit only if a
  future SKU reports multiple required areas).
- `src/fulfillment/__tests__/submit.int.test.ts`: a test asserts a DUAL cushion line submits ONE
  asset to `default` (SKU `GLOBAL-CUSH-12X12-LIN-DUAL`). `render.int.test.ts` already asserts the
  double-wide `[front|back]` (and single-sided → one square face).

## How it was verified (network gotcha, for next time)
This machine sits behind a **TLS-intercepting proxy** — Node's bundled CA can't verify the re-signed
cert (`UNABLE_TO_VERIFY_LEAF_SIGNATURE` on every host), so the app's `getProduct()` fails with
`fetch failed`. The Windows cert store DOES trust the proxy CA, so **PowerShell `Invoke-RestMethod`
works** where Node doesn't:

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$key = (Get-Content .env | Where-Object { $_ -match '^PRODIGI_API_KEY=' }) -replace '^PRODIGI_API_KEY=',''
Invoke-RestMethod -Uri "https://api.sandbox.prodigi.com/v4.0/products/GLOBAL-CUSH-12X12-LIN-DUAL" -Headers @{ 'X-API-Key' = $key.Trim() } |
  Select-Object -Expand product | Select-Object description, printAreas | ConvertTo-Json -Depth 6
```

For Node to reach Prodigi from this machine, run it with the system CA:
`NODE_OPTIONS=--use-system-ca npm run dev` (Node ≥22), or set `NODE_EXTRA_CA_CERTS` to the proxy root
CA `.pem`. The dev route `GET /api/dev/prodigi?skus=…` (metadata-only, 404 in prod) reads the spec
once that's set.
