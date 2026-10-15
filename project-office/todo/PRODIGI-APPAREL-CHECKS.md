# To-do — Prodigi specifics to confirm (tees, family set, print sharpness)

> Owner: Simon. Opened 2026-10-15. The tees are live in the shop with the best preview we can
> build from Prodigi's API data + approximations; these items turn the approximations into facts.
> Each item says where the number lives in code, so the fix is a one-line change + a re-seed
> (`POST /api/jobs/seed-catalogue`, then `/api/jobs/seed-mockups`).

## Ask Prodigi (support email)

- [ ] **Does the print stay a fixed size on every tee size?** Their API lists ONE print area per
      style for every size — kids Mini Creator 2.0 (TEE-SS-STTK909) 3070×3070px = 26×26cm for 3–4y
      through 12–14y; adult Sparker 2.0 (TEE-SS-STTM559) 4677×5881px = 39.6×49.8cm for XS–2XL.
      Do they print our file at that physical size on a 3–4y / an XS, or scale it down per size?
      → if they scale: per-size print sizes in `src/lib/garments.ts` (`KIDS_TEE_PRINT_MM` /
      `ADULT_TEE_PRINT_MM` become per-size) — the preview + DPI gate follow automatically.
- [ ] **Where does the print sit?** Distance from the collar seam to the top of the print area, per
      style (and per size if it changes). → `TEE_PHOTO.panelTop` in `src/lib/garments.ts` (today a
      measured guess from the packshot).
- [ ] **Does a see-through PNG print with no white box on coloured tees, and how are part-see-through
      pixels handled?** We send see-through files and make edges firm (solid or nothing) on coloured
      tees (`src/server/print/apparel.ts`). Confirm that's right for their DTG lab (uk9).
- [ ] **Resolution:** we send garment files at 150dpi (exactly half their print-area pixels, same
      shape). Confirm they'd rather have that than an upscaled 300dpi file.
- [ ] **Colour range + costs per colour** for the kids tee (we priced white £8, colours £9 cost from
      their quote) and confirm every colour is made at the GB lab.
- [ ] **Minimum sharpness per product** (the viewing-distance rule in `minimumDpi`,
      `src/server/print/geometry.ts`) — any product where they'd refuse or warn on our floor?
- [ ] **Their DPA + how long they keep print files** (also on LAUNCH-GATES #5).

## Get from Stanley/Stella (free image bank / spec sheets)

- [ ] **Size charts** for Mini Creator 2.0 (STTK184) and Sparker 2.0 (STTU171): half-chest per size.
      → `KIDS_TEE_CHEST_MM` / `ADULT_TEE_CHEST_MM` in `src/lib/garments.ts` (today rounded estimates).
- [ ] **Flat front packshots per colour, kids AND adult** — today every colour is re-coloured from
      one kids photo, and the adult tee uses the kids photo too. Drop them into
      `.prodigi-assets/blanks/prodigi-garment-photos/`, then re-run
      `npx tsx scripts/derive-garment-photo-blanks.mjs` (it prints the new `TEE_PHOTO` numbers).
- [ ] **Colour hexes** from their colour card → `hex` in `src/lib/garments.ts`.

## Order samples (the real test)

- [ ] Kids tee 3–4y + 12–14y and adult S + XL, in white and one dark colour, printed with a
      calibration design (ruler, fine lines, soft edges, colour patches, a cut-out). Measure the print
      size + position, compare colour to the preview, update the numbers above.
- [ ] A 1024px drawing on the 24×32″ framed print — the most-stretched case the new sharpness rule
      allows (`minimumDpi`). If it's too soft, raise `ACUITY_K` in `geometry.ts`.

## Shipping & where things are made (re-quoted 2026-10-15)

- [ ] **Keep an eye on "Standard = tracked".** Every shop product quotes a tracked Standard service
      today (jigsaws moved from Express to Standard: Evri Standard 48). Prodigi picks the carrier —
      ask them to confirm Standard stays tracked for these SKUs. Cards are untracked (95p post).
- [ ] **28×40″ frame (withdrawn):** it's made at Prodigi's NL lab. Before it returns: is it
      delivered duty/VAT-paid to GB (no charge on the doorstep), and how long does it take?
- [ ] **Cards are made on Guernsey (lab uk7)** — not the UK, but UK-adequate. Note it in the DPIA.
- [ ] **Baby bodysuit (hidden):** Standard is untracked Royal Mail First Class from lab uk2; tracked
      means Express (£10.75) on a £9 item. Ask for a bodysuit made at the tee lab (uk9) — ideally a
      Stanley/Stella organic one — so it ships tracked with the tees. Also confirm which print area
      the 18–24 months size gets (two labs list 180×180mm and 127×170mm).
