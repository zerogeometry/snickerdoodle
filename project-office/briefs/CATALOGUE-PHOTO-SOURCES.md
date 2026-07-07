# Catalogue photo sources — provenance of every blank

> Every product photo the catalogue composites onto, with its source link. All images are
> **Prodigi's own photography** (their downloads library or their product pages for the exact
> SKUs we sell through their API). Brand-safe, non-child assets — staged in `.prodigi-assets/`
> (gitignored; original zips kept in `.prodigi-assets/_zips/`). Verified live 2026-07-07.
>
> Licence posture: the downloads-library zips are published by Prodigi explicitly for
> integrators. The three garment/book images come from Prodigi PRODUCT PAGES (same owner, same
> purpose — selling their products — but not in the formal downloads area); worth a one-line
> confirmation in the open Prodigi support thread. Replace the two derived garment whites with
> our own sample photography when the Prodigi samples arrive.

## From Prodigi's downloads library (prodigi.com/downloads → "Blank photography")

| Product | Local blank | Source zip |
|---|---|---|
| Framed print (all 4 colours) | `prodigi-classic-frame-blanks/` | <https://www.prodigi.com/download/blanks/prodigi-classic-frame-blanks.zip> |
| Cushion (square / round / heart) | `prodigi-cushions-blank-assets/` | <https://www.prodigi.com/download/blanks/prodigi-cushions-blank-assets.zip> |
| Jigsaw (30 / 110 / 252 pc) | `prodigi-jigsaw-puzzle-blank-assets/` | <https://www.prodigi.com/download/blanks/prodigi-jigsaw-puzzle-blank-assets.zip> |
| Fleece blanket | `prodigi-fleece-blanket-blank-asset/` | <https://www.prodigi.com/download/blanks/prodigi-fleece-blanket-blank-asset.zip> |
| Calendar | `prodigi-calendar-blank-assets/` | <https://www.prodigi.com/download/blanks/prodigi-calendar-blank-assets.zip> |
| Ceramic bauble | `prodigi-ceramic-christmas-tree-ornament-blank-asset/` | <https://www.prodigi.com/download/blanks/prodigi-ceramic-christmas-tree-ornament-blank-asset.zip> |
| Christmas sack | `prodigi-christmas-sack-blank-asset/` | <https://www.prodigi.com/download/blanks/prodigi-christmas-sack-blank-asset.zip> |
| Apron | `prodigi-apron-blank-asset/` | <https://www.prodigi.com/download/blanks/prodigi-apron-blank-asset.zip> |
| Mug 11oz | `prodigi-11oz-mug-blank-asset/` | <https://www.prodigi.com/download/blanks/prodigi-11oz-mug-blank-asset.zip> |

(Other staged-but-not-yet-live sets — totes, clock, water bottles, tea towel, duvet, pillow
case, mousemat, curtains, bandanas, latte mug, premium blanket — follow the same URL pattern:
`https://www.prodigi.com/download/blanks/<folder-name>.zip`.)

## From Prodigi product pages (derived — see `scripts/derive-garment-photo-blanks.mjs`)

| Product | Local blank | Source image | Product page |
|---|---|---|---|
| Kids tee + adult tee | `derived/tee-photo.png` (white, derived from the blue packshot's colour channel) | <https://www.prodigi.com/img/products/additional/stanley-stella-mini-creator-sttk909/minicreator20_sttk184_1.webp> | [Stanley/Stella Mini Creator STTK909](https://www.prodigi.com/products/kids-clothing/kids-t-shirts/stanley-stella-mini-creator-sttk909/) |
| Baby bodysuit | `derived/bodysuit-photo.png` (white, derived from the red packshot) | <https://www.prodigi.com/img/products/additional/lat-apparel-4411/lat-4411-front_red.webp> | [LAT / Rabbit Skins 4411](https://www.prodigi.com/products/kids-clothing/baby-bodysuits/lat-apparel-4411/) |
| Storybook | `derived/storybook-blank.jpg` (back-cover shot, sample thumbnails in-painted, portrait crop — derived 2026-07-02; closest gallery match `prodigi-hardcover-photo-book-2.webp`) | gallery at `prodigi.com/img/products/additional/hardcover-photo-book/` | [Hardcover photo book](https://www.prodigi.com/products/books-and-magazines/hardcover-photo-book/) |

## No photo (by design)

| Product | Presentation |
|---|---|
| Greetings card | `derived/card-blank.png` — procedurally rendered flat 7×5 card (accurate depiction of a flat card); replace with real photography when available |
| Gift wrap | brand SVG motif only (an add-on service, nothing printed) |
