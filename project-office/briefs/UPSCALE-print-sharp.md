# Upscale to print quality — the model, what it costs, what we measured

> **Build note, 2026-10-27.** Covers the one-tap "upscale to print quality" fix (Studio spec §15,
> proposal/03 P1 acceptance 4) and the CPU super-resolution tier behind it. Code: `src/ml/superRes.ts`,
> `src/server/print/upscale.ts`, `src/server/print/geometry.ts` (`upscaleTierFor`, `readinessState`),
> `src/server/magic.ts` (`upscaleForPrint`), the positioner pill.

## How it behaves

| The drawing vs the product | What the pill says | What happens |
|---|---|---|
| Enough pixels | ✓ print-ready · 300 dpi | nothing |
| Up to **2×** short | ✓ print-ready · gently enhanced | classical (Lanczos) resample at render — instant, no tap |
| More than 2× short, above the floor | ⚠ a little small for this size + **upscale to print quality** | one tap → ✓ at once; the super-resolved copy is made in the background |
| Below the floor (`minimumDpi`) | ✗ too small to print well + **fit a size that prints well** | refused at the pill, at checkout and at render. No upscale can invent detail |

- **The DPI gate always judges the source's real pixels**, never the upscaled copy's. Upscaling makes
  it sharper; it doesn't add detail, so it can't be used to slip under the floor. A print-sharp copy,
  print file or mockup can't be passed off as the source either (`resolvePrintSource`; also fixed in
  `placeOrder`).
- **Fulfilment never ships the soft version.** If nobody tapped, the render makes the copy itself.
  If super-resolution can't run (model missing, source over the size cap), it falls back to classical.
  The source has already cleared the floor, so it still prints, just softer up close, and the pill says so.
- **The original is never touched.** The copy is its own DERIVATIVE (`…/derivatives/upscale-<source>.<hash>-animev3x4`),
  made once per source version and reused by every render. An edited cutout gets a fresh copy and the
  stale one is deleted. It goes with the asset under the normal retention/deletion cascade.
- Budget: one `ml_operations` UPSCALE row per copy made; cache hits are free.

## Model choice

**Real-ESRGAN `realesr-animevideov3`** (SRVGGNetCompact: 16 small conv layers, ×4), from the
xinntao/Real-ESRGAN v0.2.5.0 release. **Licence: BSD-3-Clause** (repo + released weights). Keep the
copyright notice if we ever redistribute the weights. Shipping them inside our own server image is fine.

- Why this one: it's tuned for flat colour and clean lines (anime/cartoon), which is what children's
  drawings are. It's also the smallest Real-ESRGAN model: 2.5 MB, about 0.6M parameters.
- Rejected: `realesr-general-x4v3`. It's twice the layers and measured ~2× slower, and it's tuned for photos.
  RRDB Real-ESRGAN x4plus (64 MB) is far too slow on a CPU. A hosted API was never an option
  (no child image leaves the VPC).
- Converted to ONNX by `scripts/ml/convert-realesrgan.py`. It needs no PyTorch, and it unpickles through an
  allow-list so a tampered checkpoint can't run code. The output matches an independent numpy
  re-implementation of the network to 3e-6.
- Committed at `models/sr/realesr-animevideov3-x4.onnx` (2.4 MB). Its sha256 is pinned in code
  (`SR_MODEL_SHA256`), and a different file is refused (classical fallback). Source checkpoint sha256:
  `b8a8376811077954d82ca3fcf476f1ac3da3e8a68a4f4d71363008000a18b75d`.
- Runtime: `onnxruntime-node` 1.31.1 (MIT), CPU only. `.npmrc` skips its CUDA download. Only the
  Linux x64 binary (~46 MB) ships in the build (`next.config.ts` trace excludes).

## Measured (this dev box: 4 vCPU, heavily shared, so treat as upper-ish bounds)

Tiled at 128 px with a 10 px overlap, one SR job at a time per process.

| Input | Threads | Time | Process RSS peak |
|---|---|---|---|
| 1000×750 (0.75 MP) | 1 | 14.1 s | 311 MB (from 158) |
| 1000×750 | 2 | 7.8 s | 286 MB |
| 1600×1200 (1.9 MP) | 1 | 34.7 s | 398 MB |
| 1600×1200 | 2 | 20.3 s | 399 MB |
| 1000×1000, uncontended best | 2 | 9.7 s | 271 MB |

The classical Lanczos ×4 of the same 1 MP image takes about 0.8 s. Turning the ORT memory arena off
made SR 3× slower for no real memory saving, so it stays on.

**Settings for the Lightsail box (2 vCPU / 2 GB):**
- `SR_THREADS` defaults to *cores − 1*, which is 1 there, so the web app and Postgres keep a core.
  Expect about 15–35 s per tier-1 picture. The tap still answers in ~0.2 s (measured end-to-end in
  the app), because the copy is finished in the background (`after()`).
- `SR_MAX_INPUT_MP` defaults to 2 MP, giving a 32 MP output and roughly +250 MB peak memory. Bigger
  sources already have plenty of real detail and get the classical tier. A tier-1 enlargement is
  rare for a modern phone photo (12 MP). It's the WhatsApp'd / screenshotted / scanned-small case.
- `SR_DISABLED=1` turns the tier off; `SR_MODEL_PATH` overrides the model location.

## Monthly cost impact: about £0

- **Compute:** £0 extra. It runs on the Lightsail box we already pay for, with no GPU and no new
  service. A tier-1 job is a 15–35 s CPU burst, and at launch volume (a handful a day) that sits well
  inside the burstable baseline. If tier-1 jobs ever run all day, the signal is CPU-credit exhaustion
  on the Lightsail graph; the fix is a bigger bundle, not a GPU.
- **Storage:** a print-sharp copy is about 3–15 MB of PNG per tier-1 source. That's pennies a month
  in S3 at our volumes, and it's deleted with the keepsake.
- **Build/image:** +46 MB of runtime binary and +2.4 MB of model.

## Open / to confirm

1. **Should "add to basket" wait for the tap?** At the moment, a >2× placement can be added without
   tapping. The pill shows ⚠ and the server upscales at fulfilment anyway, so quality is the same.
   Requiring the tap would make the ✗→✓ moment mandatory, at the cost of one extra tap.
2. **Studio design derivative overstates detail (found, not fixed — Studio is being rebuilt).**
   `saveStudio` Lanczos-enlarges the design up to 4× when stickers or text are added
   (`OVERLAY_EDGE`). The DPI gate then reads the enlarged pixel size, so a sticker can lift a
   low-res drawing over the floor. The fix is to judge a design by the original's pixels mapped
   through its crop. That belongs to whoever owns `studio-doc.ts`.
3. The Netlify test site traces onnxruntime-node into the function bundle. It should fit (only the
   Linux x64 binary is included), but this is unverified. If it's too big, set `SR_DISABLED=1` there.
4. Not yet measured on the real Lightsail instance; the figures above come from the shared dev box.
