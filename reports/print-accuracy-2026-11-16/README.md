# Print accuracy audit: which products need a sample?

16 Nov 2026 · for Simon · no orders placed, nothing deployed, no money spent

## The short answer

**Your belief is mostly right.** For flat, rectangular products (frames, calendar, cards, jigsaw, placemats, coasters, blankets, tea towel, wrapping paper, the multi frame), we already send Prodigi a file that is exactly their size. Where the drawing sits matches our preview to within a few millimetres. Those don't need samples.

**It breaks in five places:**

1. **Prodigi's "print area" isn't always the bit that gets printed.** The number in their system is a rectangle. On the Christmas sack, the plastic bauble and the two-tone mug, the part that really prints is smaller or a different shape.
2. **Some rules exist only on Prodigi's downloadable templates.** Their system doesn't give the seam allowance on cushions, the circle on the ornament or the trim on playing cards. Our previews don't show them yet.
3. **Some products are lined up by hand.** T-shirts are placed by a person, and Prodigi says the ornament "alignment can vary".
4. **Prodigi changes their specs.** The tube socks' print size changed after our last check on 29 Oct, so we now send the wrong shape.
5. **Our previews sometimes show the bleed** (the few mm that get cut off) as if it prints.

**Your hunch was half right.** The plastic bauble is risky, and the mug and t-shirts are worth a look. The ceramic ornament, watch strap and blankets turned out fine. The riskiest product isn't 3D at all: it's the **Christmas sack**.

## What to do, cheapest first

**Step 1: ask Prodigi (free).** Most of the risk is a question Prodigi can answer by email, so send them the questions in the box at the end before buying anything.

**Step 2: if their answers are vague, order these four samples** (about **£54** in total, including VAT and UK post, priced from Prodigi's own quotes today):

| # | Sample | Cost to us | Why |
|---|---|---|---|
| 1 | ~~Christmas sack~~ | ~~£23.16~~ | Taken off sale instead (16 Nov). |
| 2 | Plastic bauble | £9.84 | It's a flat card disc inside the ball, not a print on the ball. We don't know the disc's size. |
| 3 | ~~11oz two-tone mug~~ | ~~£8.70~~ | Settled by your photos of Prodigi's mugs: it prints practically rim to base (16 Nov). |
| 4 | Tube socks | £12.18 | Prodigi's size changed, and we can't tell which way up the pattern runs on the sock. Fix the code first, then check. |

Optional: **kids t-shirt** (£12.30), only if you want to see the hand placement for yourself.

You don't need samples for anything else. The other risks are documented by Prodigi and can be fixed in our code (fixes list below).

**If you'd rather not spend anything:** pause the sack and the plastic bauble until Prodigi answers. They're the two products where a customer could get something clearly different from the picture.

## How I checked

- **A measuring grid:** a test picture with a 1 cm grid and coloured bands round the edge, 2 mm per band. I made it at each product's exact print-file size and ran it through the shop's real preview code for all 53 product shapes on sale. The bands show exactly how much of the file each preview shows.
- **Prodigi's own templates and product pages**, for all 26 products on sale (downloaded templates, plus their product pages).
- **Prodigi's test system**, which gave today's print sizes and the price of one sample of each. These were quotes only, so nothing was ordered.
- **Earlier proof:** the 29 Oct test sweep (`reports/test-sweep-2026-10-29/03-print-output.md`) already showed every print file is exactly Prodigi's size. I didn't redo that.

The pictures beside this file are the evidence.

## Every product on sale, ranked

### High: check before Christmas orders build up

**Christmas sack** (sample £23.16) · `sack.jpg`
- Our print file is 320×500 mm, and the preview shows the whole 32×50 cm on the sack.
- Prodigi's template marks a black "print area" box of about **28×32 cm** inside that file. It sits 19 mm in from each side and 40 mm from the top, so the **bottom 14 cm of the file is outside it**.
- The real sack is 49.5×75 cm, which doesn't match the template's own "product size" label, so Prodigi's spec contradicts itself.
- If the box is right:
  - A landscape drawing (the usual kind) loses about 2 cm each side and 1 cm at the bottom.
  - A portrait drawing loses about **10 cm off the bottom**: roughly a quarter of the drawing.
  - Either way the print comes out about 44% smaller in area than the preview shows.
- Prodigi also prints no white, so white paper shows as natural fabric. Our preview already handles that.

**Plastic bauble** (sample £9.84) · `bauble.jpg`
- Prodigi's page says the drawing is printed on a **flat satin card disc inside a clear ball**, seen from both sides.
- The template for it is a 72 mm circle. Our file is an 85×90 mm rectangle, and the preview lays that rectangle on the front of the ball.
- If the disc is the 72 mm circle cut from the middle of our file, the edges lose about 6–9 mm and the corners are lost to the circle.
- Our FAQ says the ball is "printed all the way round", which is wrong. The product description says "printed on both sides", which is right.

**Tube socks** (code fix, then sample £12.18)
- Prodigi's print size today is 6141×3543 px (52×30 cm). We send 6141×5433, which was right on 29 Oct.
- Prodigi will now squeeze or crop our file. Because it's a repeat pattern, that mostly shows as a crop.
- **The bigger worry is direction.** Prodigi's downloadable template is drawn upright (30×52 cm) but their system says sideways (52×30). If the file is turned, the little drawings in the pattern could run sideways down the sock.

### Medium: fix in our code; a sample is optional

**Mug, 11oz two-tone** (sample £8.70) · `mug.jpg`
- Our file is 210×95 mm, which is what Prodigi's system asks for.
- Prodigi's system says this mug is "NOT top-to-bottom printing", and the only public template (209.5×98 mm) is for a different mug.
- Our preview prints right up to the rim and down to the base. On the real mug there's probably a plain band at the top and bottom, and Prodigi doesn't say how big.
- Prodigi doesn't publish which part of the drawing faces you either. Our preview puts the right-hand end of the drawing at the handle, which is the usual way round, but the sample settles it.
- Mugs are cheap and popular, so this is worth one sample.

**Cushions, all shapes** (no sample: Prodigi documents it) · `cushion-square.jpg`, `cushion-heart.jpg`
- Every Prodigi cushion template has a **"safe area" 31 mm in from the edge** (28–47 mm on the heart). The file is also about 6 mm per side bigger than the cover.
- Our preview shows the drawing right to the edge of the cushion. On the real cushion the outer 2–3 cm goes into the seam and round the puffy side.
- On the 12″ cushion, that's up to 19% of the width that the preview shows on the front but the real cushion doesn't.
- Fix: show a "keep faces inside" line and pull the preview in by the seam. See fixes 2 and 3.

**Kids and adult t-shirts** (optional sample £12.30 kids, £19.56 adult) · `adult-tee.jpg`
- Prodigi confirms the print is **the same size on every garment size**: kids 26×26 cm, adults 39.6×49.8 cm.
- Our preview already scales this properly per size. On an adult XS the print covers about 80% of the chest; on a 3–4 year tee, about 79%.
- The risk is the hand placement (Prodigi publishes no "x cm below the collar" rule). Expect it to sit 1–2 cm higher or lower than shown.

**Playing cards** (no sample) · `playing-cards.jpg`
- Our file is 69×95 mm. The real card is 63.5×89 mm, so about 3 mm is trimmed off every edge.
- Our preview shows the whole file, so it shows about 3 mm per edge that won't be there: about 9% of the card's width in total.
- Corners may be rounded; Prodigi doesn't say.
- Fix: show the card at its trimmed size.

**Ceramic ornament** (no sample needed for size) · `ornament.jpg`
- It's a 72 mm circle from our 75 mm file. Our preview shows a disc about 70 mm across, slightly *less* than will print, which is the safe way round.
- Prodigi says it's printed by hand and "alignment can vary", and there's a string hole at the top. Keep faces away from the edge (fix 2).
- Order one only if you want to see the quality, not the position.

**Height chart** (wording fix)
- Prodigi says the wooden hangers **"cover up to 1.5cm of the print at the top and bottom"**. Our ruler keeps its marks 2.5 cm clear of the ends, which is good.
- But "hang it with the bottom edge 40 cm off the floor" could be read as the bottom of the *visible* canvas. Measured that way, every reading is 1.5 cm out.
- Fix: say "the bottom of the lower wooden bar".

**Watch strap** (no sample)
- It's already built from Prodigi's own template, and the positioner shades the bits that don't print.
- UV print on faux leather. At £29.22 it's the most expensive sample. Not needed for position.

### Low: fine as it is

| Product | What I found |
|---|---|
| Framed prints | Prodigi's frame hides 5 mm on each edge, and our preview hides about the same. |
| Multi photo frame | 60 mm squares 20 mm apart, exactly Prodigi's layout. No mount. |
| Calendar | Prodigi says keep things 10 mm from the edges, and our layout keeps a 10 mm white margin. |
| Greetings cards and packs | The preview shows 1–2.5 mm of bleed per edge. Too small to notice. |
| Jigsaw | Printed edge to edge. Matches. |
| Blanket | About 10 mm per side goes into the stitched edge, and the preview's soft rounded edge hides about that. |
| Tea towel, wrapping paper | Repeat patterns, so nothing is cut off that matters. Tea towel file = Prodigi's trimmed size. |
| Phone cases | File = Prodigi's template, and the camera hole is drawn from it. The tough case wraps round the sides. The snap case is the back, with the edges running just over the sides. Our wording "wraps round the sides" is a bit generous for the snap case. |
| Placemats, coasters, family bundle | Flat. Matches. Our listed sizes include the bleed: we say coaster 10.6 cm, Prodigi says 10 cm; we say placemat 29×20.5 cm, Prodigi says 28.5×20. |

**Not on sale today, but fix before showing them:** pet bandanas (Prodigi has changed their sizes: small and medium are now both 9450×2850 px), hoodies, jumpers, apron, baby bodysuit, storybook.

## Update, same day: what's now fixed (branch `fix/print-accuracy`)

- **Tube socks** now send Prodigi's new size, 6141×3543 px. We design them upright (30 cm round the leg, 52 cm long), like the ankle socks, and turn the file to Prodigi's shape. Which end Prodigi treats as the top of the sock is still question 4 below.
- **Christmas sack:** the file stays Prodigi's full size, but the drawing now goes **only inside their 28×32 cm print box**, centred and 4 cm from the top. The rest stays plain sack. The shop pictures, the positioner ("only the outlined box prints — the sack round it stays plain"), the print file and the print-quality check all use that box.
- **Previews at the finished size:** playing cards (3 mm trimmed), cushions (6 mm into the seam) and blankets (10 mm into the hem) no longer show the edge that gets cut or sewn in. The file Prodigi gets is unchanged. Greetings cards stay as they were: their extra edge is only 1–2.5 mm, and trimming it evenly would make the card the wrong shape, because the fold side isn't cut. The cosy edge marks where they're cut instead.
- **The cosy edge:** on the positioner, a soft striped band marks the edge that still prints but tucks into a seam, curls round, sits at the rim or gets cut. It comes with one friendly line, for example "the shaded edge still prints, but it tucks round into the seam and the puffy sides — keep faces & words inside it". It applies to cushions, blankets, the ceramic ornament, playing cards, greetings cards and card packs (the mug's strips were dropped later the same day — see below). Product photos don't show it; they show the finished look.
- **Wording:**
  - Bauble: "a disc inside a shatterproof clear bauble — it shows from both sides".
  - Height chart: "the bottom of the lower wooden bar 40 cm off the floor".
  - Phone case: "tough wraps right round the sides; snap runs just over the edges".
  - Coaster: 10 cm. Placemat: 28.5 × 20 cm.
- **Weekly Prodigi check:** it already ran every Monday, but only wrote to the server log. It now **emails the support inbox** when a product's print size no longer matches Prodigi's, or a product disappears.

## Second update, same day: your answers

- **Christmas sack: taken off sale** ("not a great product as is"). It is paused the way the Christmas Eve bundle was: out of the shop, the add-ons, the Christmas list, the Google feed, the FAQ and the delivery-dates page. Its print code stays only so an order already placed still prints the way it was previewed.
- **Mug:** your photos of Prodigi's 11oz mugs show the print running practically rim to base, so the plain top and bottom strips are gone from the positioner, and the mug question is off the list for Prodigi.
- **Socks: now built on Prodigi's own templates.** Both sock templates are *one sock's two sides*: the left half of the file is one side, the right half the other (mirrored), the middle line runs down the front of the foot and the two outer edges meet at the back. We had this wrong in two ways:
  - **The preview** showed the whole file on each sock. Now the **ankle** preview is built straight on Prodigi's template: its two sock outlines are the print area, its heel patches are the heels (black knit), the photo's knit and shading are fitted into them, and the print file covers the template's board one to one. You see the two sides of one sock, exactly as Prodigi lays them out. The **tube** pair shows the left half on the left sock and the right half on the right, matched to the template's outline.
  - **The print file itself** put each drawing on the file's middle line. On a real sock that is the front fold, so every drawing was split round the front of the foot. Now each drawing sits in the middle of a side (a quarter and three quarters across). This changes what Prodigi prints for every sock order from now on.
- Evidence: `socks-ankle.jpg` and `socks-tube.jpg` (below).

## Third update: how the drawings sit on the socks

Your brief: symmetrical, nicely centred up the length of the sock, never over the edges; one line of drawings up each side, two once zoomed out. Built on the two Prodigi templates:

- **Each side has a safe lane:** the clear part of the sock, kept 8 mm inside the outline, the black heel and the toe patch. Every drawing sits wholly inside it, so nothing runs over an edge, a seam, the heel or the front fold. The tests check every corner of every drawing.
- **The drawings run along the sock,** toe to cuff (parallel to the floor when walking), each centred on the sock's middle. On the ankle sock they lean a little with the foot. The other side is the mirror image in position; the drawing itself is never flipped, so writing still reads the right way round.
- **At first, one line up each side:**
  - the **tube** sock takes four good-sized drawings a side;
  - the **ankle** sock takes two. Prodigi's heel patch reaches nearly halfway across the sock, so the clear stretch is the foot, about 12 cm.
- **Zoom out:** smaller drawings, more of them, then two lines side by side (three on the ankle sock when very small). Zooming out never shows fewer. Zooming in stops at the biggest size that still fits.
- The print file, the shop photos and the positioning screen all use the same layout.
- Evidence: `socks-ankle-drawings.jpg` and `socks-tube-drawings.jpg`, at the default size, zoomed out and zoomed out further. In each pair, the print file comes first with Prodigi's outline drawn on it in red, then our preview.

## Code fixes that cut the risk without a sample (as first proposed)

Each would go on its own branch with a pull request into `feat/christmas-season`, only after you say yes.

1. **Tube socks: send Prodigi's new size** (6141×3543) and update the saved copy of Prodigi's sizes in our tests. Pattern direction needs Prodigi's answer, or the sample.
2. **A "keep faces inside" line in the positioner** for cushions (31 mm), ornament and bauble (circle), playing cards (3 mm), mug (top and bottom band) and blanket (10 mm). There's already an unused setting for this in the database (`safe_inset_mm`). You chose "one guide only" in July, so this one is your call: a faint dashed line, or none.
3. **Previews that match the finished size:** playing cards and cards shown trimmed, and cushions with the seam taken off the edge.
4. **Wording:**
   - Bauble FAQ: "a card disc inside the ball, seen from both sides".
   - Height chart: "the bottom of the lower wooden bar".
   - Snap phone case: "the edges run over the sides".
   - Coaster and placemat sizes.
5. **Sack:** once Prodigi confirms the 28×32 cm box, make the drawing area that box and show it at its true place on the sack.
6. **A spec watch:** a weekly comparison of our sizes against Prodigi's live system, so a change like the socks' gets flagged instead of found by a customer.

## Questions to email Prodigi support (free)

Updated 16 Nov after your answers: the sack is off sale and your mug photos settle the mug, so those two are gone.

> Hello — a few print-spec questions before Christmas, please:
> 1. **Plastic bauble (XMAS-PLAS-BAUB):** the API print area is 1003×1062 px, but the template is a 72 mm circle. What shape and size is the printed card insert, which part of a 1003×1062 file ends up on it, and is the same image on both faces?
> 2. **Ankle socks (GLOBAL-ANKLE-SOCKS):** we lay our 3543×3543 px file out exactly like your template: the left half is one side of the sock (heel on the left), the right half the other side, the middle line down the front of the foot. Is that right? Are the darker grey heel and toe patches on the template printed, or are they the black knit heel and an unprinted toe?
> 3. **Tube socks (GLOBAL-TUBE-SOCKS):** your template is upright (30 × 52 cm, cuff at the top), but the API print area is landscape, 6141×3543 px (it was 6141×5433 in October). Which edge of the landscape file is the cuff? Should we turn the upright design clockwise or anticlockwise? And is the live size the same as the sandbox's?
> 4. **T-shirts (TEE-SS-STTK909, TEE-SS-STTM559):** the print area is the same at every size. How far below the collar is the top of the front print placed, and is the full area printed on the smallest sizes?

## Evidence files in this folder

| File | What it shows (left to right) |
|---|---|
| `sack.jpg` | Prodigi template · our print file · our preview |
| `bauble.jpg` | Prodigi template · our print file · our preview |
| `mug.jpg` | Prodigi template · our print file · our preview |
| `cushion-square.jpg` | Prodigi template · our print file · our preview |
| `cushion-heart.jpg` | Prodigi template · our print file · our preview |
| `ornament.jpg` | Prodigi template · our print file · our preview |
| `playing-cards.jpg` | our print file · our preview |
| `adult-tee.jpg` | our print file · our preview |
| `positioner-phone.jpg` | the new positioning screen on a phone: cushion, playing cards, mug, sack |
| `socks-ankle.jpg` | Prodigi's ankle template · the template laid on our new preview (left side blue, right side orange: each fills its sock exactly) · a drawing on the new preview |
| `socks-ankle-drawings.jpg` | the ankle sock repeat at three zooms: the print file with Prodigi's outline (red) · our preview |
| `socks-tube-drawings.jpg` | the same for the tube sock |
| `socks-tube.jpg` | the tube template laid on our preview (each sock shows its own side) · a drawing on the new preview |
| `positioner-on-the-product.jpg` | the cosy edge following the cushion's heart, the ornament's disc and the blanket; the sack's print box on the sack |

The grid's coloured bands are 2 mm each from the file's edge: red, then orange, yellow, green, blue. If you can see red in a preview, the preview is showing the outermost 2 mm of the file.
