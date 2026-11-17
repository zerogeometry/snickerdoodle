# C14 · Leaflets for Christmas 2026 and spring 2027

> **What this is:** five print-ready leaflets for snickerdoodle.co.uk, made on 17 Nov 2026 and redesigned the same day
> (version 2: the drawing next to the thing it became; the reasoning is in [`CREATIVE-BRIEF.md`](CREATIVE-BRIEF.md)). Nothing has been printed,
> ordered or paid for. The plan, prices, printers and the rules are in
> [`reports/Leaflet strategy Christmas 2026.md`](../../../reports/Leaflet%20strategy%20Christmas%202026.md).
> This replaces the October C12 draft (DRAWIT 10% off and the "draw it here" box), which predates the free first card
> (D30) and asked children to draw on the leaflet.

## The five leaflets

| Leaflet | Size | Code on it | QR goes to | Use it for |
|---|---|---|---|---|
| `A6-christmas-FAIR` | A6, 105 × 148 mm | **MAGICFAIR** | `snickerdoodle.co.uk/start-creating?from=fair` | fairs, markets, your stall, venue counters |
| `A6-christmas-GATE` | A6 | **MAGICGATE** | `…?from=gate` | school gates (the public pavement), cafés, soft play, hand to hand |
| `A5-christmas-DOOR` | A5, 148 × 210 mm | **MAGICDOOR** | `…?from=door` | through letterboxes, by you or a distributor, before about 6 Dec |
| `A5-christmas-BAGS` | A5 | **MAGICBAGS** | `…?from=bags` | book bags, only at a school whose head has said yes before Christmas |
| `A5-spring-BAGS` | A5 | **MAGICBAGS** | `…?from=bags` | book bags / Primary Times, Jan–Feb 2027, for Mother's Day (Sun 7 March) |

Each leaflet has its own code and its own link so you can see which one earns money (the report explains how).
**The codes don't exist yet.** Make them on `/admin/codes` before the leaflets go out (step 2 below).

## Files

| Folder / file | What it is |
|---|---|
| `print/<name>-print.pdf` | **Send this one to the printer.** 2 pages (front, back). Trim size + 3 mm bleed on every edge (A6: 111 × 154 mm, A5: 154 × 216 mm), with the trim box set. No crop marks. Fonts embedded as normal TrueType (no "Type 3"). |
| `print/<name>-proof.pdf` | The same with the trim line (pink) and the 5 mm safe area (blue) drawn on. **Never send this to print.** |
| `preview/<name>-spread.jpg` | Front and back side by side, for a quick look on your phone. |
| `preview/<name>-front.jpg`, `-back.jpg` | Each side at trim size, for posts, emails to a venue, or the printer's chat. |
| `leaflet.html` | The source for all five. The words are near the top of its script (`COPY`, `SMALL`, `steps`). |
| `build.mjs` | Rebuilds everything (below). The list of leaflets and their codes is `VERSIONS` at the top. |
| `boxes.py`, `cmyk.py` | Helpers the build calls: exact page and trim boxes; an optional CMYK copy. |
| `fonts/` | Bricolage Grotesque as fixed weights for print (from the site's own font; OFL licence included). |
| `img/` | Print copies of every picture used: brand samples from your `brand-assets` folder (robin drawing and ornament, tree mug, kraft and oat doodle papers) and the site's `public/` and `mockups/`. The build makes them once; set `BRAND_ASSETS` if that folder moves. |
| `CREATIVE-BRIEF.md` | What each leaflet must say, in what order, and why (with the evidence). |
| `qr/` | The four QR codes as SVG (error correction M). |

## What you do (in order)

1. **Read both sides of each leaflet you'll use** (`preview/…-spread.jpg`). Change anything that doesn't sound like you,
   or tell me and I'll change it.
2. **Make the codes** on `/admin/codes`. For each of MAGICFAIR, MAGICGATE, MAGICDOOR and MAGICBAGS: type the code,
   choose **a free card**, leave the rest empty (no end date, no limit), and save. A free-card code only ever works on a
   signed-in first order, like the welcome card. Then, on your phone, sign in to a test account with no orders, put a card
   and a bauble in the basket, type the code, and check it says "one greetings card is on us". Each code's paid orders
   and takings then show on `/admin/codes`.
   *Known gap:* today a code only sticks to an order when the free card actually comes off. A guest, a returning
   customer, or a basket with no card gets "that code is for…", and the sale isn't counted. The report suggests a
   small website change to fix that.
3. **Scan each QR on two phones** from the printer's proof or a home print at 100% (not "fit to page"). Each must open the
   start page. The code reads in the build, but a real phone is the test.
4. **Upload `print/<name>-print.pdf`** at the printer you choose (the report compares them). For Christmas, I'd pick
   **350 gsm silk**, double-sided, no lamination, at Helloprint with next-day delivery. Approve their on-screen proof by
   **3:30pm Wed 18 Nov** to have them Thu 19 Nov. One order per leaflet (each has its own code).
5. **Cards by Thu 10 Dec, gifts by Sat 12 Dec** are printed on the Christmas leaflets. They match
   `src/lib/season.ts` today. If Prodigi moves a date, the leaflet will be wrong: tell me and I'll rebuild before you
   reprint.

## Printing notes (for you and the printer)

- **Paper:** uncoated 350–400 gsm feels like a good card and takes a pen. Silk is cheaper and makes the photos pop;
  either is fine. Don't laminate (it stops recycling).
- **Colour:** the PDFs are RGB, which every online printer listed in the report accepts and converts to CMYK with its own
  press profile (usually the best result). The brand colours used were checked against a CMYK press profile:
  tomato, honey, sky, berry, leaf and the creams all print close. Cobalt and the deep tomato aren't used for big areas
  because they shift. Uncoated paper prints a little softer and warmer than the screen. That's normal.
  If a printer insists on CMYK, run `node project-office/gtm/C14-leaflets/build.mjs --cmyk`. That writes
  `print/<name>-print-CMYK.pdf` (each side as a 450 dpi CMYK image, US SWOP profile). Use it only if they ask.

  | Colour | Screen | CMYK (approx., coated) |
  |---|---|---|
  | tomato (stickers, headings) | #C8402A | 9 / 93 / 91 / 4 |
  | honey (stickers, tape) | #F6C445 | 2 / 22 / 89 / 0 |
  | honey band (coupon) | #FBE9B7 | 2 / 7 / 37 / 0 |
  | oat (page) | #F8F5E9 | 4 / 4 / 11 / 0 |
  | kraft (bottom strip) | #D8BE96 | ~ 15 / 25 / 42 / 0 |
  | cocoa (text) | #2B2118 | rich dark; prints near-black |

- **Images:** every photo is a brand sample (no children, no faces, no real names). They print at well over 300 dpi
  at these sizes.
- **QR codes:** on both sides. Back: 39 mm (A6) and 46 mm (A5); front: 20 mm (A6) and 27 mm (A5). All on white with a
  clear border, so they scan from arm's length.

## Rebuild

From the repo root (needs the repo's `node_modules`, and Python with `pypdf`; `fonttools` only to remake the fonts):

```bash
node project-office/gtm/C14-leaflets/build.mjs
```

To add a leaflet for a new channel (a venue, a particular school), add a line to `VERSIONS` in `build.mjs` with its own
code, make a QR for it (`qr/<name>.svg`, pointing at `…/start-creating?from=<name>`), and rebuild.

## The rules these leaflets keep

- **Grown-ups only.** Every line speaks to the parent or grandparent. Nothing asks a child to do, draw, ask for or buy
  anything. The A5s say "for the grown-ups" at the top, because the advertising regulator treats a book-bag leaflet as
  reaching children (ASA ruling on Greene King, 2017).
- **No real children.** Brand sample photos only. No faces, names or schools.
- **The offer is the site's real offer** (the free first card, D30), with its conditions in the small print, and prices
  from the live site on 17 Nov 2026 (ceramic ornament £21, round bauble from £19, mug £18, card £5.50, heart cushion £22,
  jigsaw £26, wrapping paper £23, 2027 calendar £22, free UK delivery in every price).
- **Trust shown, not shouted:** private by default, never public, only who you invite, delete anything, no surnames.
  These are the product's own rules (CLAUDE.md).
- **No data collected on paper.** The QR opens the site; nothing is filled in or handed back.
