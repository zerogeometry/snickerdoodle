# /mockups ↔ app — side-by-side review (2026-10-27)

Side-by-sides are in `tests/visual/mockup-pairs/`: **mockup on the left, app on the right**, at
**390px** (`*-390.png`, the mobile mockups' phones) and **1280px** (`*-1280.png`, the desktop
mockups' browser frames). Re-render them with `npm run test:visual:pairs` (needs the e2e DB + S3).
The parent is a fresh "Sam" with one kept drawing and a gift link; the drawing is a drawn test
shape, never real art.

How to read it (CLAUDE.md "Design fidelity"): the **look** follows the Scrapbook direction (D12),
so the mockups' Fraunces/Mulish type, flat cream cards and orange CTA are *expected* to differ.
What should still match is **layout, flow and copy**. Everything below is a layout/flow/copy or
consistency deviation I could see. I haven't changed any app UI: these are for the owners of each screen.

Caveats: the mockups' icon font (cdnjs) can't be reached from CI or the sandbox, so the pairs use
the same Tabler set drawn from `node_modules/@tabler/icons` (v3.44, not the pinned 3.31). The
mockups show a fuller, seeded family (Olivia, Max, Jo, Rosie) where the app shows a brand-new one.

## Cross-cutting

1. **Two headers on purchase screens.** `/checkout` and `/g/[token]` (both widths) still use the
   plain-text "snickerdoodle" wordmark header and flat `bg-white border-line` cards. Every other
   screen has the Scrapbook logo header with ink-outlined, taped cards, so the screens where people
   pay look like a different product. The mockups have one header style everywhere. → Use the
   brand FlowHeader / sticker cards.
2. **Child name in headings.** The mockups personalise: "Olivia's masterpiece, made real.",
   "Olivia's basket", "Olivia's keepsakes", "Olivia's gift list", "A gift list for Olivia's 6th
   birthday". The app is generic everywhere: "Your masterpiece…", "Your basket", "Your
   keepsakes", "A gift list from Sam's family". Before an account exists, generic is the more
   private choice, so this may be deliberate. Inside the Home, where children are known, the
   per-child framing is missing (see Home).
3. **Unlabelled controls** (a11y, found while writing selectors): the drawing tiles in "Create a
   gift request" (`PickTile`) are buttons with only `alt=""` images, so they have no accessible
   name (the e2e has to find them by `aria-pressed`). The first tap on a tile right after the
   sheet opens sometimes doesn't register (the e2e retries until `aria-pressed=true`).
4. **Prices** in the mockups are placeholders (£22 frame, £14 mug). The app uses the live server
   catalogue (from £65 / £18). That's expected and not a deviation.

## Landing (`landing-390`, `landing-1280`)
- **390:** in the mockup, the hero copy + a single framed drawing ("by Olivia, age 5", "on 40+
  products") sits above a thumb-zone "start creating". In the app the product collage pushes the
  body copy below the fold, so the sticky dock covers it at 844px tall. The dock also adds a
  second action, "or design from scratch", which isn't in the mockup.
- **Copy:** the mockup's subline ends "…cards, prints, mugs, tees, and a storybook they're the hero
  of." The app's ends "…framed prints, mugs, cushions, jigsaws, blankets and cards." (the live
  range has no storybook or tees on the landing).
- **"A few pictures. A whole family range."** tiles: the mockup has card / print / cushion / mug /
  storybook. The app has framed print / cushion / mug / heart cushion / card.
- **Not in the mockup:** the "Made from little drawings, kept for years" example wall and the
  waitlist section.
- **1280 nav:** the mockup has "log in" + "start creating". The app signed in has "your keepsakes"
  + account avatar, which is fine.

## Start creating / the range (`start-creating-390`, `-1280`)
- **390:** the mockup has a compact "you uploaded · Olivia, age 5" chip, a privacy note, then the
  heading and range right away, with a thumb-zone "see the full range →". The app's first screen
  is almost all one big polaroid of the upload plus "change image" / "edit in studio". The
  "made real" heading only starts at the bottom edge and the range is below the fold.
- The mockup's subline "The same drawing, on everything you love." is missing from the app.
- The progress crumb reads "upload · your range · **save**" in the mockup and "upload · your
  range · **checkout**" in the app.
- **1280:** the mockup's CTAs under the range are "see the full range →" + "open in studio". The
  app has a basket sidebar and a dock ("+ keepsake", "create another", "share a wish",
  "checkout now") with no "see the full range" path.

## Catalogue (`catalogue-390`, `-1280`)
- The mockup heading is "On **40+ products**" with "One drawing. A whole family range." The app's
  is "Any drawing, on a **whole family range**." with "Upload a drawing and watch it land on
  everything." The app shows that pre-upload copy because the drawing is lost (next point).
- **/catalogue loses the drawing.** The upload lives in an in-memory store, so a full navigation
  to /catalogue shows empty oat tiles, and nothing on the range links there. Is the page orphaned
  now that the range is inline?
- **Chips:** the mockup has "all · cards · home · wear · book". The app has "all · cards & prints
  · home · wear · gi…" (clipped).
- **Tiles:** the mockup has a ♡ (save) on each tile. The app has a "− 0 +" stepper plus "customize".
- **390 tab bar:** the mockup shows the floating tab bar (Range / Create / Family / Basket). The
  app's /catalogue has none (it uses the flow header).

## Studio (`studio-390`, `studio-1280`), being rebuilt by another engineer
- **Top bar:** the mockup has "← · **A4 print ▾** (product/size picker) · save" (desktop: "save ·
  basket"). The app has "← your range · undo · redo · done". The product/size picker is missing
  from the Studio.
- **DPI pill:** the mockup shows "300 dpi · print-ready" on the canvas. The app shows "crisp up to
  A4" in the header (desktop) or on the canvas (phone).
- **Panel:** the mockup opens on the Brush (size, smoothness, colours), with Layers (named:
  "Happy Birthday", "Olivia's drawing", "Background 🔒") and **Magic edits** (Remove bg · Tidy
  lines · Brighten · Watercolour · Upscale to print quality) in the right rail. The app opens on
  "where to start / MOST LOVED" (remove background, add text, crop, draw). There's no Layers list
  and no "Magic edits" group in the first view.
- **Canvas:** the mockup shows the print area with bleed/safe area ("bleed & safe area shown") and
  a "100%" zoom readout. The app has no visible bleed/safe guide in the Studio (it lives in the
  Positioner) and no zoom %.

## Checkout (`checkout-390`, `checkout-1280`)
- **"Add a little something"** (card £4 · gift wrap £3 · mini print £8) is in the mockup at both
  widths and missing from the app. (CLAUDE.md: add-ons stay small and tasteful, so they're
  expected.)
- **Gift toggle copy:** the mockup has "Sending as a gift? — Wrapped with a handwritten-style note,
  prices hidden." / "We'll wrap it with a handwritten-style note and hide the prices." The app has
  "Sending this as a gift?" with no explanation line.
- **Guest line:** the mockup has "No account needed — guest checkout, perfect for grandparents".
  The app has "a quick sign-up keeps your keepsake safe — no password" because the basket holds a
  personalised line, which is correct for this basket. The extra "email for your receipt" field
  (desktop) isn't in the mockup.
- **Header:** see cross-cutting 1.

## Family Keepsake Home (`home-390`, `home-1280`)
- **Title:** the mockup has "The Hartley Family **Keepsake Home**". The app has "Sam's family" with
  a pencil and an "add a family banner" pill (not in the mockup).
- **Family circle:** the mockup lists the **children first** (Olivia age 5, Max age 8), then
  adults with roles, plus "invite family" / "invite". The app shows adults only ("Sam (you) ·
  owner", "add"), and children appear only as a separate "your little ones" list once added. The
  mockup's subline "Invite the whole family — even the extended bunch…" is missing.
- **Per-child tabs** (Olivia · Max · Family) and "Olivia's keepsakes · 23 kept since 2024" are in
  the mockup. The app has one "Your keepsakes" grid with per-child corners further down.
- **Tile copy:** the mockup's tile shows the keepsake's name + month ("Our house · Mar"). The app's
  shows "Keepsake" plus a visibility badge ("FAMILY"), so every tile has the same generic name.
- **Gift list card:** the mockup has "Olivia's gift list — 4 things, ready to send —
  **share a ready-to-buy link**" (the lexicon phrase). The app has "Gift requests · create a gift
  request".
- **390:** the floating tab bar covers the gift section mid-scroll, which is expected for a fixed
  bar and needs no change.

## Gift link, what family receive (`gift-link-390`, `gift-link-1280`)
- **Header block:** the mockup has a house icon, "A gift list for Olivia's 6th birthday", "Sam's
  set up a cart for you — just check out." and a handwritten note ("Anything here would make her
  year! — Sam x"). The app has a gift icon, "A gift list from Sam's family" and "A ready-to-buy
  cart — check out and it's on its way." The parent's **note isn't shown on the link**, even
  though the create modal asks for one ("a little note"); in the app that note only goes into the
  emailed request.
- **Join card copy** (on a link with an invite): the mockup has "Sam invited you to join the
  Hartley family · **save 5% · £2.40**" with **"your email" + "join family & checkout"** (the
  lexicon phrase) in one step. The app has "Invited to join the family" with a "join the family ·
  5% off" button that goes to a separate /join page, then a magic link, then back. The flow is
  longer than the mockup and the CTA wording differs.
- **"Add a little something?"** add-ons are in the mockup (1280) and missing from the app.
- **Header:** see cross-cutting 1. The mockup's header line is "secure · a gift link from the
  Hartleys". The app's is "secure gift link".

## Create gift link modal (`create-gift-link-1280`)
- **Title:** the mockup has "Create a **gift link** · for Olivia's 6th birthday". The app has
  "Create a **gift request** · pick what you'd love them to give".
- **Picker:** the mockup's is a checklist of named items with prices ("Olivia's storybook £24",
  "Framed 'Our house' print £22"). The app's is unlabelled drawing thumbnails, then a product chip
  row ("framed print · mug · cushion · jigsaw · blanket"). There are no names or prices until
  checkout.
- **Invite block:** the mockup explains "They'll get 5% off, see Olivia's keepsakes, and never miss
  a birthday…" with "They can: view & buy". The app's is similar but adds relationship chips and a
  calendar opt-in.
- **Share:** the mockup puts the link + WhatsApp/Email/Text/More and **"create & share link"** on
  one screen. The app makes the link first, then shows the share step.

## Per-asset visibility (`visibility-390`, `-1280`)
- Close to the mockup: Only me / Family / Extended with the who-stacks, "nothing is ever public"
  and done.
- **Header:** the mockup has the keepsake's name + provenance ("Rocket · by Olivia · kept Apr
  2026"). The app has "Keepsake · choose who can see it".
- The app adds "delete this keepsake" (NN8, good). The mockup has no delete here.

## Add a family member (`add-family-member-390`, `-1280`)
- Close to the mockup: photo, first name, relationship chips setting the circle, the "Joins your
  Extended family…" explainer, birthday, and the invite toggle with "They can: view & buy".
- **CTA:** the mockup has "send invite **& add to family**". The app has "send invite".
- The mockup's reassurance line "You're always in control — change a relationship, access, or
  remove anyone, any time." isn't visible in the app's first view (it may sit below the fold of
  the sheet).
- **Birthday field:** the mockup has a "DD / MM / YYYY · we'll remind the family" text field. The
  app has a native date input, which Chromium shows as `mm/dd/yyyy` here even with the en-GB
  locale, and no "we'll remind the family" hint.
