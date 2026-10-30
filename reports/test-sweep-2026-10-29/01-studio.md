# Test sweep 29 Oct 2026 — 01 · the Studio, every instance

Tester 01 · branch `claude/sweep-1-studio-e9e389` (cut from feat/christmas-season at d6f890b) · own database `snickerdoodle_t1`. The test server was a production build (`.next-e2e`) on :3201, using the console mailer, local MinIO with its KMS key, Stripe **test** key (checked: `sk_test_`), and the Prodigi **sandbox** URL (checked). No payment was made. Test pictures are shapes drawn by the tests; no real child's art was used.

## Summary

| | count |
|---|---|
| PASS (checklist rows) | 49 |
| FAIL (checklist rows; 9 distinct bugs 01-B1…B9) | 8 |
| NOT TESTED / not in the app | 2 |
| NOT TESTABLE LOCALLY (section c) | 4 |

**P1 — 01-B1.** Edit a keepsake you picked with "make this keepsake real" in the Studio and save. The edit is written onto the **original keepsake**, not the copy made for it.

**Founder's bug ("old cut-out comes back"): fixed.** The cut-out never came back in any of the 6 routes I tried:
- create page, guest, phone and desktop;
- create page, signed in, then the card-pack picker;
- bundle picker, guest;
- bundle per-piece edit, signed in.

There are no P0 findings.

**Evidence: the final run of every Studio spec** (my sweep specs plus the existing `studio-*` specs), `E2E_PORT=3201 npx playwright test e2e/sweep-01-studio-*.spec.ts e2e/studio-*.spec.ts`:
- **34 passed, 4 skipped.** The 4 skipped are `test.fixme`s that pin bugs 01-B1, B5, B6 and B7.
- Vitest: 17 Studio-related files gave 151/153 under load. The 2 timeouts were in `studio-festive-render`, which is known to be load-flaky; it passed 13/13 run alone.
- New Vitest file `studio-print-sweep01.int.test.ts`: 1/1 passed.

Screenshots are in `shots/01/`.

---

## (a) Coverage checklist

**Legend.** PASS = I watched it pass in a test I ran (named). FAIL = bug filed below. Sizes: P = phone 390×844, D = desktop 1280×800.

### Ways into the Studio, and the way back

| # | Entry | Size | Result | Evidence |
|---|---|---|---|---|
| 1 | Create page, "edit in studio" | P+D | PASS | `studio-journey`, `studio-mobile`, `sweep-01-studio-tools` (every test) |
| 2 | "design from scratch" → blank Studio | P | PASS | `studio-festive` (both tests open it) |
| 3 | `/studio/<creationId>` (retired) redirects to /start-creating | P+D | PASS | `sweep-01-studio-entries › retired /studio/<id>…` |
| 4 | `/studio` with nothing open shows "nothing in the studio yet" and a link to upload | P+D | PASS | same test |
| 5 | `/studio/position` from customise "edit placement", then "save & return" back to the product | P+D | PASS | `sweep-01-studio-entries › customise → edit placement…` |
| 6 | Keepsake home "place one on a product →" opens the placement editor | D | PASS | `sweep-01-studio-entries › keepsake home…` (it opened on "kids tee · 3-4 years") |
| 7 | Card-pack picker "edit in studio" → done → back on the card pack with that card's picker reopened and the drawing chosen; `?resume=1` tidied away | P+D | PASS | `sweep-01-studio-entries › card pack picker → edit in studio…` |
| 8 | Card-pack picker → Studio → **back gesture** with an edit → "save your changes?" → saved, back on the card pack with the picker open | P+D | PASS | `sweep-01-studio-entries › card pack picker → studio → BACK GESTURE…` |
| 9 | Calendar picker (February's own drawing) → Studio → done → back on the calendar, same page's picker open, drawing chosen, `?resume=1` gone | P+D | PASS | `sweep-01-studio-entries › calendar picker…` |
| 10 | Bundle builder picker → Studio → done → back on the bundle, "ornament 1 updated ✓" toast, `?resume=1` gone | D | PASS | `sweep-01-studio-cutout › bundle, signed in…` |
| 11 | Bundle per-piece edit, **signed in**: editing ornament 1 leaves the placemats (same drawing) alone. The drawing itself is untouched; the ornament holds a new copy. | D | PASS | same test (checks the bundle draft and the database) |
| 12 | Bundle per-piece edit, **guest** | D | FAIL (01-B2) | `sweep-01-studio-cutout › bundle, guest…`: the placemats change too |
| 13 | Keepsake picked on the create page ("make … real") → Studio makes a copy; leaving without saving tidies the copy away and puts the keepsake back | D | PASS | `sweep-01-studio-entries › a keepsake picked on the create page…` |
| 14 | …the same, then **saving** | D | FAIL (01-B1) | fixme `01-B1`; debug run output quoted under the bug |
| 15 | Dark tee, "lift it off the paper in the studio" → done | P+D | FAIL (01-B3) | `sweep-01-studio-entries › a dark tee…`: lands on /start-creating |
| 16 | Family-set modal link "lift the drawing off the paper in the studio" | — | NOT TESTED | Same code shape as #15 (`FamilySetModal.tsx:191`, a plain `/studio` link). I expect the same result but did not run it. |
| 17 | Back gesture from the Studio opened from the create page (with and without edits) | P | PASS | `studio-back-gesture` (2 tests) |
| 18 | After a Studio save, the range shows the edit, it goes in the basket, and checkout lists it | D | PASS | `studio-journey` |
| 19 | Guest builder opened by a direct load (typed URL or refresh) before the drawing was stored | D | FAIL (01-B4) | debug run, quoted under the bug |

### Tools (from `src/ui/studio/tools.ts`: 15 tools)

"Undo exact" means undo restores a pixel-identical picture (stage screenshot hash) and redo brings the edit back.

| Tool | Applies | Undo exact / redo | Saved → print file | Evidence |
|---|---|---|---|---|
| flip sideways | PASS | PASS | PASS (red square moves top-right in the stored `design`) | `sweep-01-studio-tools` tests 1 and 3; Vitest `studio-print-sweep01` |
| flip upside down | PASS | PASS | — | tools test 1 |
| rotate (`]` key ×10; quarter turn on the phone) | PASS | PASS | (`studio-save.int`) | tools test 1; input › taps |
| crop (corner drag, reset, done cropping) | PASS | PASS | (`studio-doc.test`) | tools test 1 |
| remove colour (tap the paper) | PASS | PASS | PASS (paper replaced by the fill in the design) | tools tests 1 and 3 |
| background fill (black) | PASS | PASS | PASS (design corner is black) | tools tests 1 and 3 |
| eraser | PASS | PASS | — | tools test 1 |
| bring back | PASS | PASS | — | tools test 1 |
| compare (hold Space) | PASS (original shows, release restores) | n/a | n/a | tools test 1 |
| start again (asks first: "your original upload is never changed") | PASS | PASS (undoable) | — | tools test 1 |
| remove background (Studio tool, runs on pick) | PASS | PASS (undo takes it away; a later save leaves no cut-out on the server) | (`magic.int`) | input › "the Studio's own remove background" |
| add text (tap, type in place, tap away) | PASS | PASS (2 steps: the box, then the words) | (`studio-objects`, `studio-save.int`) | tools test 2; `studio-mobile` |
| draw (mouse, finger, pen with pressure; "stylus only") | PASS | PASS | (`studio-objects`) | tools test 2; `studio-stylus`; input › taps |
| shapes (heart) | PASS | PASS | PASS (Vitest: an added square prints in the middle of the print file) | tools test 2; `studio-print-sweep01` |
| layers: move, duplicate, back ×2, delete by key | PASS | PASS | — | tools test 2 |
| christmas: 12 stickers, festive touches with undo, Christmas fonts; none of it out of season | PASS | PASS | PASS (`studio-festive-render`: server render = browser drawing) | `studio-festive` (2), Vitest 13/13 |
| filters / adjustments / touch-up tool | NOT IN THIS STUDIO | — | — | No such tool in `tools.ts`. `saveCutoutMaskAction` exists but nothing calls it. The brief listed it; the code doesn't have it. |
| text abuse screen | PASS | — | — | Vitest `studio-save.int` (in the 151 passed) |

### Originals are sacred

| Check | Result | Evidence |
|---|---|---|
| After flip + remove colour + fill + save, the ORIGINAL storage row has the same id and sha256, and its pixels still have red top-left | PASS | `sweep-01-studio-tools › a saved design reaches the print file…` |
| Same, server side, through `renderPrintFile` (the Prodigi file) | PASS | `studio-print-sweep01.int.test.ts` |
| "start again" returns the untouched drawing on screen | PASS | tools test 1 |
| A keepsake's Studio edit through the card-pack picker never touches the keepsake | PASS | `sweep-01-studio-cutout › create page, signed in…` (its studio_doc stays null, no design) |
| A keepsake's Studio edit from the create page never touches the keepsake | FAIL (01-B1) | — |

### The founder's bug: lift → put back → Studio → the old cut-out must never come back

The test sign: when the Studio opens, its "background" tool stays disabled because nothing is see-through. After a save, the stored design still has its paper, and no cut-out is left on the server.

| Route | Result | Evidence |
|---|---|---|
| Create page one-tap, guest, P | PASS | `sweep-01-studio-cutout › create page, guest (390px)…`; `shots/01/founder-2-studio-after-put-back-phone.png` |
| Create page one-tap, guest, D | PASS | same, (1280px) |
| Create page, signed in → keep → card-pack picker → Studio (a copy). No cut-out rode into the copy; the copy's save keeps the paper; the keepsake is untouched. | PASS | `sweep-01-studio-cutout › create page, signed in…` |
| Bundle picker "remove background" → "put it back" (guest): the server deletes the lifted copy, and the Studio shows the paper | PASS | `sweep-01-studio-cutout › bundle picker, guest…` |
| Reopening the Studio after the save still shows no cut-out | PASS | create-page guest tests (last step) |

Observation, not a bug: the create page's one-tap "put the background back" only stops *using* the cut-out. The server copy stays until the next Studio save drops it (test annotation `cutout-after-create-page-put-back: still stored`, `start-creating/page.tsx:181-185`). It cannot resurface today, because the Studio only loads the mask when the tab is using a cut-out, and every save sends `clearCutout` when nothing is see-through. Still, it is the same kind of leftover the 29 Oct fix deleted in the picker. It's worth making the create page call `putBackgroundBackAction` too.

### Input, accessibility, motion

| Check | Size | Result | Evidence |
|---|---|---|---|
| Finger taps on toolbar and options row (flip, quarter turn) | P | PASS | input › taps |
| Two-finger pinch zooms and is not an edit (undo stays off) | P | PASS | input › taps (real touch through the DevTools protocol) |
| A pinch starting mid-line drops the half-drawn line | P | PASS | same |
| Finger draws; pen draws with pressure; "stylus only" lets the finger pan | P | PASS | `studio-stylus` |
| Every toolbar, header and zoom control is at least 44px; the header doesn't wrap | P | PASS | input › phone 44px |
| Tool keys (f x r p h l e b c), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, + / 0 zoom, flip by keyboard only | D | PASS | input › keyboard |
| Visible focus ring on 6 Tab stops from the header into the toolbar | D | PASS | same |
| `prefers-reduced-motion`: no animation longer than 5ms | D | PASS | same |
| axe (WCAG 2.2 AA) on /studio | P | FAIL (01-B5) | run output: `region`, `skip-link` |
| Space activates a focused button | D | FAIL (01-B6) | debug run: Space on "flip" left it unpressed; Enter pressed it |
| K respects the disabled background tool | D | FAIL (01-B7) | debug run: `aria-pressed=true` with `aria-disabled=true`; a fill was then applied to an opaque picture |
| Phone layout (picture gets the screen; options row rises over it) | P | PASS | `studio-mobile` |

---

## (b) Bugs

### 01-B1 · P1 · Editing a keepsake picked on the create page saves onto the ORIGINAL keepsake

**Steps**
1. Sign in, upload, tap "+ keepsake".
2. Start fresh (a new tab, or clear the drawing in progress) and open /start-creating.
3. Tap "make this keepsake real", then "edit in studio".
4. Flip it sideways and tap done.

**Expected.** The founder's 27 Oct rule: the edit lands on the new copy, and the keepsake it came from is never touched.

**Actual.** Debug run output, verbatim ids:
```
K 713b4f27…  copy c74a3859…  copyOf 713b4f27…            ← the Studio made the copy correctly
after save tab: {"assetId":"c74a3859…", "cutout":{"url":".../assets/713b4f27…/derivatives/design…", "sourceObjectId":"3ede1e55…"}}
K    studio_doc = {flipH:true, …designPx…}   derivatives: design, …, original
copy studio_doc = null                         derivatives: original
```

What this means:
- The keepsake K got the flip and a `design` derivative.
- The copy is a bare keepsake.
- The tab now pairs the copy's asset id with **K's** design object.

Consequences:
- The keepsake is overwritten in place. The design row keeps its id, so a basket line or order that already points at K's design would now print the new edit.
- The orphaned copy sits in the keepsake box.
- Anything rendered next from the tab passes a `sourceObjectId` that doesn't belong to its `assetId`. `renderPrintFile` rejects that pairing (render.ts:74-80). I did not drive it as far as checkout.

**Suspected cause.** `src/app/studio/page.tsx:113`: `const [assetId] = useState(upload?.assetId ?? null)` is set once, at mount, to K. The copy is made after mount by `forkPickedKeepsake()` (:187), which updates the store but not this state. So `ensureAsset()` (:162-163) keeps returning K to:
- `save()` (:846, :851);
- by code reading, also the Studio's own remove background (`runRemoveBg`, :778/:786).

The card-pack / calendar / bundle pickers are not affected (verified, row #11 and the founder-bug table): they switch the store to the copy *before* opening the Studio.

**Test:** `e2e/sweep-01-studio-entries.spec.ts` → `test.fixme('01-B1: …')`.

### 01-B2 · P2 · Guest: a Studio edit of one bundle piece changes every piece showing that drawing

**Steps.** As a guest: upload → christmas family bundle → ornament 1 → "this drawing" → edit in studio → flip → done.

**Expected (brief).** Only ornament 1 changes.

**Actual.** The placemats and ornament 1 both now wear the same new design. Bundle draft:
```
{"placemat":{"assetId":"301a75a1…","sourceObjectId":"259a0178…"},"ornaments":[{"assetId":"301a75a1…","sourceObjectId":"259a0178…"}]}
```

**Cause.** By design today: `usePickerEdits.ts:81-84` says "a guest (nothing can be kept) still edits it in place". A guest can't hold a copy because copies are keepsakes.

**Founder decision needed.** Options:
- make guest per-piece copies as unkept drafts; or
- tell the guest before they edit ("this changes every piece with this drawing").

Signed in works (row #11).

### 01-B3 · P2 · Dark tee "lift it off the paper in the studio" → done lands on the create page, not back on the tee

**Steps.** Upload → customise kids tee → pick a dark colour → "lift it off the paper in the studio" → remove background → done.

**Expected.** Back on /customize/kidsTee with the colour still chosen.

**Actual.** /start-creating (test annotation `landed-on: /start-creating`). The parent has to find the tee again.

**Suspected cause.** `src/app/customize/[productKey]/page.tsx:1123` pushes `/studio` with no return address. The Studio's `backToRange` (page.tsx:872-881) only knows the picker detour. `FamilySetModal.tsx:191` has the same shape (not run).

### 01-B4 · P3 · Guest builder opened by a direct load doesn't offer the drawing in progress

**Steps.** As a guest:
1. Upload on /start-creating and wait for the range.
2. Open /customize/cardPack by URL (typed, bookmarked or refreshed) instead of the range's "customize card pack" button.
3. Pick a drawing for card 2.

**Actual.** The picker says "log in to pick from your keepsake box — or start with a drawing". "this drawing" is missing, because the tab's drawing has no asset id yet. Debug output: `assetId before: undefined` / `assetId after: undefined`. Through the range button: `assetId after: e1f39c0a…` and "this drawing | remove background | edit in studio" shown.

**Cause.** Only `FlowCatalogue.ensureAsset` (FlowCatalogue.tsx:100-126) stores a guest's drawing. The builders list it only `if (upload?.assetId)` (ChristmasBundleBuilder.tsx:158, and the same in the card pack and calendar).

The Christmas `?for=` shortcut ("make the …" button) was checked for bundle, card pack, calendar and framed print, and it works: the asset was stored by then.

### 01-B5 · P3 · axe: the Studio editor has no `<main>` landmark, so the skip link points nowhere

axe on /studio, phone:
- `region (moderate)` "Some page content is not contained by landmarks" (the canvas, the zoom buttons);
- `skip-link (moderate)` "No skip link target".

The editor's root is `<div className="fixed inset-0 …">` (page.tsx:1233). Only the empty state has `<main id="main">`.

Test: fixme `01-B5`.

### 01-B6 · P3 · Space on a focused Studio button starts "compare" instead of pressing the button

The window keydown handler calls `preventDefault` and starts compare for every Space press (page.tsx:1008-1011), even when focus is on a button. Keyboard users have to know to use Enter.

Debug output: `flip pressed after Space: false`, `after Enter: true`.

Test: fixme `01-B6`.

### 01-B7 · P3 · The K shortcut opens the background tool while it's disabled

The click path checks `off` (StudioToolbar.tsx:84), but the key map doesn't (page.tsx:1012-1013).

Observed: K gives `aria-pressed=true` and `aria-disabled=true` together. Picking a fill then made an undoable edit on a fully opaque picture (no visible change, but the Studio is dirty and a design gets saved).

Test: fixme `01-B7`.

### 01-B8 · P3 · The desktop tool list is a `navigation` landmark

The phone tool list is `role="toolbar"`, but the desktop one is `<nav aria-label="studio tools">` (StudioToolbar.tsx:196). Screen readers announce a set of editing tools as site navigation. It should be `toolbar` at both sizes.

### 01-B9 · P3 · Desktop layer buttons are labelled just "back" and "forward"

AddedOptions.tsx:102-103. These sit next to "back to your collection", so the screen-reader names are ambiguous. The phone tray says "send back" / "bring forward"; use those words at both sizes.

---

## Other observations (not filed as Studio bugs)

**Existing spec failing: `e2e/range-after-studio.spec.ts`, 2 of 3.** The "making your range" loader never appears at phone size: the range is ready instantly in this build, including with `/api/mockup/batch` delayed 4s. It's probably stale against d285ea1 or the instant previews, but it could be a loader regression. Not the Studio; please hand it to the range/catalogue tester.

**The Studio's remove background stores the cut-out on the server as soon as it runs,** before any save (annotation `cutout-stored-before-save: yes`). Undo then save drops it (PASS above). Undo then *leave without saving* leaves it stored; by code reading it can't show, for the same reason as the create-page leftover.

**Possible issue, NOT verified: the placement editor's own "remove background" (Positioner.tsx:409-430)** runs on the asset itself, with no copy and without `keepEnclosedPaper` (the one-tap and the picker pass `true`). It is hidden when the keepsake has a Studio design, but on a kept keepsake whose look is a cut-out it would rewrite that cut-out in place. Worth a look alongside 01-B1.

**The card-pack and calendar `?resume=1` round trips work today** (rows #7-9). They rely on their seed effects waiting for the catalogue to load before calling `forgetResumeVisit()`. The bundle was fixed for exactly that order on 29 Oct. Rows #7-9 now pin it.

---

## (c) What I couldn't test, and why

| Item | Why |
|---|---|
| Family-set modal → Studio round trip (#16) | Out of time. By code reading it matches 01-B3. |
| A real iPhone/Android back *swipe* and a real stylus or finger | Emulated. Back gesture = `page.goBack()` with the Studio's history guard. Pen and touch are real CDP pointer events (`pointerType: 'pen'` with pressure, two-finger touch), not hardware. |
| Mouse hover-only affordances | Covered only incidentally (desktop mouse runs). Nothing in the Studio is hover-only by code reading. |
| An order actually rendered and sent to Prodigi from a Studio design | No payment made (by the rules). The print file Prodigi would get was checked directly instead (`renderPrintFile`, Vitest). |
| Production screening (CSAM hash, Rekognition) on a Studio design | Not configured locally (every upload is held as FLAGGED for review); covered by existing `studio-save.int` moderation tests. |

## Files added
- `e2e/sweep-01-helpers.ts`: lopsided test drawing, Studio opener, test-only reads of my DB and MinIO.
- `e2e/sweep-01-studio-tools.spec.ts`: every tool, undo/redo, save → print file, original intact.
- `e2e/sweep-01-studio-cutout.spec.ts`: the founder's bug on every route; bundle per-piece (signed in, guest).
- `e2e/sweep-01-studio-entries.spec.ts`: every entry and round trip; fixme 01-B1.
- `e2e/sweep-01-studio-input.spec.ts`: finger, pinch, keyboard, focus, reduced motion, 44px, the Studio's remove background; fixmes 01-B5/6/7.
- `src/server/__tests__/studio-print-sweep01.int.test.ts`: a Studio design (flip + square) arrives in the framed print's print file; original byte-identical.
- `reports/test-sweep-2026-10-29/shots/01/*.png`: Studio at phone and desktop; the founder sequence (lifted, then the Studio after put back).

To run: `E2E_PORT=<port> npx playwright test e2e/sweep-01-studio-*.spec.ts` against a server built as in playwright.config.ts. Vitest: `node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/__tests__/studio-print-sweep01.int.test.ts`.
