# Test sweep 29 Oct 2026 — 09: shop front, navigation and accessibility

Tester 09. Worktree branch `claude/sweep-9-storefront-a11y-adf88b`, cut from `feat/christmas-season` at `d6f890b`.

**Setup.** Own database `snickerdoodle_t9` (migrated, then `seed-catalogue` = 32 products / 480 variants, then `seed-mockups`). Production build in `.next-e2e`, served with `next start -p 3209`, `MAIL_PROVIDER=console` and the local MinIO KMS key. I also ran a second server from the same build on :3309 with `SITE_MODE=test`, for the test-site checks, then stopped it. Browser: the system Edge (Playwright 1.61.1). Before any test, I checked Stripe is a `sk_test_` key and Prodigi is the sandbox URL. No payment was made: the keyboard journey stops at the checkout form.

**Evidence** is in `reports/test-sweep-2026-10-29/evidence-09/`:
- `sweep-09-run.log`: the final run of my four specs. 19 passed, 9 skipped (the skipped ones are the `test.fixme` bug pins), 0 failed.
- `existing-suites-run.log`: the repo's own a11y and storefront specs. 22 passed, 1 failed (09-B9).
- The JSON the specs saved: crawl results, prices, axe results, tap targets, keyboard focus stops, tab-bar geometry and the manifest.

Screenshots are in `shots/09/`, at 390 px (`phone-*`) and 1280 px (`laptop-*`). `shots/09/visual/` holds the `tests/visual` screens re-shot on this machine.

**New specs (committed):**
- `e2e/sweep-09-storefront.spec.ts`: every public page, prices, axe, tap targets, catalogue states and filters, cookie banner, robots, sitemap, noindex, manifest, reduced motion.
- `e2e/sweep-09-keyboard.spec.ts`: keyboard only, from upload to checkout.
- `e2e/sweep-09-signed-in.spec.ts`: the app screens (home, family, orders, account) with the header and tab bar.
- `e2e/sweep-09-shop-a11y.spec.ts`: Studio, builders, more customize pages and the pop-ups.

Every bug below has a `test.fixme('09-Bn …')` pin. Before committing, I switched each pin to a normal test and ran it: all 9 failed, which confirms the bugs are real. Then I switched them back.

---

## (a) Coverage checklist

### Shop front: public pages
| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `/`, `/how-it-works`, `/our-story`, `/gifts`, `/faq`, `/help`, `/christmas/delivery-dates`, plus the 5 `/trust/*` pages (privacy, cookies, terms, family-promise, data-complaint): each answers 200, has one `<main>`, exactly one h1, a title and a meta description. | PASS | `sweep-09-storefront` › "every public page and product page…"; `evidence-09/public-pages.json` |
| 2 | `/products/[slug]` for all 21 products on show (from the sitemap): 200, one h1, title, description, photo or drawn art | PASS | same test; screenshots `*-products-mug`, `*-products-placemats` |
| 3 | Every page title is unique (33 pages) | PASS | same test |
| 4 | Every `<img>` on every public page has an `alt` attribute and loads (96 images on `/`; lazy ones off-screen in the drifting wall fetched directly) | PASS | same test |
| 5 | Broken internal links: all 36 distinct internal hrefs found on the 33 pages (including `/start-creating?for=<key>` × 22, `/login`) return 200; `#fragment` links (`/faq#returns`, `/help#contact`) land on an element with that id | PASS | `public-pages.json` → `checked` |
| 6 | No `/christmas` hub (`/christmas` and `/christmas/` → 404); not in the sitemap | PASS | "there is no /christmas hub"; crawlers test |
| 7 | Prices: each product page's headline price equals its `/catalogue` tile ("from £X") | PASS for 20/22 products; **FAIL** for placemats and coasters → **09-B1** | `evidence-09/product-prices.json` (20/20 equal); fixme 09-B1 |
| 8 | `/catalogue` filters: all / festive / cards & prints / home / wear / gifts. Each chip filters and shows `aria-pressed`, the groups together cover the whole range, and the Christmas family bundle is first in "all" and in "festive" | PASS | "/catalogue filters…" |
| 9 | `/catalogue` states: skeleton (`role=status` "loading the range") while loading; on a failed load, a friendly `role=alert` with "try again"; retrying shows the range | PASS | "/catalogue: a skeleton…" (route delayed, then aborted) |
| 10 | `/start-creating` (empty) renders, passes axe, upload works by keyboard | PASS | axe test; keyboard spec |
| 11 | Cookie banner: shows on first visit, links to `/trust/cookies`; "essential only" is stored and remembered across 3 pages and a reload; no non-essential cookie set | PASS | "cookie banner…" |
| 12 | Cookie banner: equal choice, and a way to change your mind | **FAIL** → **09-B10** | `shots/09/phone-cookie-banner.jpg` |
| 13 | Marketing header: logo + menu on phones (matches `mockups/…mobile…html` line 52 `tnav`); desktop has how it works / gifts / our story / log in / start creating | PASS | `phone-landing.jpg`, `laptop-landing.jpg` |
| 14 | Mobile menu: drawer on top, backdrop closes it, Escape closes it and focus returns to the button; signed-in parents get "your keepsakes", never "log in" | PASS | existing `mobile-menu.spec.ts` (3/3); `sweep-09-signed-in` |
| 15 | Mobile menu passes axe when open | **FAIL** → **09-B7** | fixme 09-B7 |
| 16 | App header on phones (logo · basket · account), compact and sticky, on /home /family /orders /account | PASS | `sweep-09-signed-in` (phone); `phone-signed-in-*.jpg` |
| 17 | Floating tab bar on phones: fixed, flush to the bottom (gap 0), top at 768/844 px (the thumb zone), 4 tabs Home/Create/Family/Orders, each 64 px tall, current tab `aria-current=page`; the end of the page scrolls clear of it (main bottom 748 < bar top 768); hidden on desktop | PASS | `evidence-09/signed-in-phone.json` → `bars` |
| 18 | Safe-area insets (`pb-safe` / `pt-safe` = `env(safe-area-inset-*)`, `viewport-fit=cover`) | PASS (meta tag) / NOT TESTABLE LOCALLY (the real inset needs a notched device) | manifest test asserts `viewport-fit=cover`; code `globals.css:263` |
| 19 | Installable PWA: `/manifest.webmanifest` (standalone, start `/home`, icon 200), linked from every page; the browser's own check (`Page.getInstallabilityErrors`) returns **no errors** in a normal Edge profile | PASS (desktop Edge). Note: only a 192 px icon; no 512 px icon for Android splash screens (already flagged in `manifest.ts`) | crawlers › installable manifest; CDP check |
| 20 | Titles/meta: `%s · snickerdoodle` template, descriptions on all public pages, canonical on product pages | PASS | `public-pages.json` |
| 21 | Open site: robots.txt disallows the family paths and gives the sitemap; sitemap has public pages only (no /start-creating, /checkout, /home, /catalogue, /login, /studio); those pages send `X-Robots-Tag: noindex`; `/`, `/faq`, `/products/mug` don't | PASS | crawlers › robots, sitemap… |
| 22 | `SITE_MODE=test`: robots.txt `Disallow: /` for all; every response `noindex, nofollow`; pages redirect to `/test-gate`; behind the password the sitemap is empty and the test banner shows | PASS | curl on :3309 (session log): `/`→307 `/test-gate?next=%2F`; with gate cookie `/sitemap.xml` = empty `<urlset>`; "test drawings only…" banner present |
| 23 | Unknown address → a useful not-found page | **FAIL** → **09-B5** | `shots/09/phone-404.jpg` |
| 24 | Merchant feed `/feeds/google-merchant.xml` serves (32 items) | PASS (served); content is tester-scope elsewhere. See 09-B1 for the latent feed problem | curl |

### Accessibility across the site
| # | Item | Result | Evidence |
|---|---|---|---|
| 25 | axe (WCAG 2.2 A/AA + best practice) on all 12 marketing/trust pages + 21 product pages + `/catalogue`, `/login`, `/start-creating`, `/checkout`, at 390 and 1280 | PASS, except `/trust/family-promise` → **09-B2** | "axe: every public page…" (phone + laptop) |
| 26 | axe on the shop with a drawing: range, customize mug / framed print / socks / card, placement editor, checkout with a line (existing `accessibility.spec.ts`) | PASS (4/4) | `existing-suites-run.log` |
| 27 | axe on the full-catalogue pop-up, customize calendar / card pack / Christmas bundle / phone case / kids tee / cushion / jigsaw / ceramic ornament, and the "who's this for?" pop-up, at 390 and 1280 | PASS | `sweep-09-shop-a11y` (phone + laptop) |
| 28 | axe on the Studio | **FAIL** → **09-B6** | fixme 09-B6 |
| 29 | axe signed in: /home, /family, /orders (empty) | PASS; /account **FAIL** → **09-B3** | `sweep-09-signed-in` |
| 30 | axe on /home with a keepsake | **FAIL** → **09-B8** | fixme 09-B8 |
| 31 | Keyboard only: skip link is the first stop and is visible → "start creating" → upload (Enter opens the file picker) → mug "+ customize" → add to basket → checkout now → "who's this for?" (type a name, keep it & checkout) → basket remove/edit → email field | PASS (364 focus stops) | `sweep-09-keyboard`; `evidence-09/keyboard-stops.json` |
| 32 | Visible focus at every stop of that journey | PASS (364/364 have an outline or ring) | same |
| 33 | Labelled controls: axe `label` / `button-name` / `link-name` clean on all pages above | PASS | axe tests. But see 09-B4 and 09-B8 (names that don't say which product or keepsake) and 09-B12 (wording) |
| 34 | Landmarks: `<main>` on every page above | PASS except Studio (09-B6), the 404 page (09-B5) and the open mobile menu (09-B7) | |
| 35 | Colour contrast on oat/cocoa: axe `color-contrast` clean on every page above | PASS except /account (09-B3) | |
| 36 | Tap targets ≥ 44 px | **FAIL (partial)** → **09-B11** | `evidence-09/tap-targets-phone.json`, `-laptop.json` |
| 37 | No hover-only controls | PASS | code search: the only `group-hover:opacity-100` (`ChristmasBundleBuilder.tsx:482`) also shows on focus-within and on `hover:none` devices; keyboard journey reached every control it needed |
| 38 | prefers-reduced-motion: the landing animates normally; with reduce, `/`, `/how-it-works`, `/gifts`, `/catalogue`, `/start-creating` have **no running animations** | PASS | motion test |
| 39 | iOS no-zoom: every text field ≥ 16 px on a touch phone (login, Studio words editor, help) and the 320 px basket fits | PASS for field sizes (help spec passes; the full no-zoom spec passes once the range has settled 1 s); the spec itself **fails** on the sideways check → **09-B9** | `existing-suites-run.log`; re-run with a 1 s settle: 2/2 passed |
| 40 | Empty / loading / error / success states: catalogue (skeleton, alert + retry, grid), the range's "making your range" status, the empty basket ("Your basket's empty"), the empty keepsake box ("Your keepsake box is waiting" with an action), empty family circle with "add" | PASS | tests 9 and 29; `phone-signed-in-home.jpg`; `checkout/page.tsx:326` |
| 41 | Error states on /home, /family, /orders (`error.tsx` + `loading.tsx` exist) | NOT TESTABLE LOCALLY without breaking the server: code reviewed only | `src/app/{home,family,orders}/error.tsx` |
| 42 | CSP: no refusals on the whole journey (existing `csp.spec.ts`) | PASS (3/3) | `existing-suites-run.log` |
| 43 | Storefront smoke: 11 live products render, add and price to the server total (existing) | PASS | `existing-suites-run.log` |
| 44 | Range is one column on phones, two on desktop (existing `catalogue-mobile.spec.ts`) | PASS (3/3) | |
| 45 | FAQ, help, data-complaint journeys (existing) | PASS (8/8) | |

### Visual (390 px and desktop vs `/mockups` and the baselines)
| # | Item | Result | Evidence |
|---|---|---|---|
| 46 | `npm run test:visual` as configured | BLOCKED: it needs Playwright's bundled Chromium (not installed; the rules forbid downloading it), and the committed baselines are Linux-only (`__screenshots__/linux`). I ran the same spec on the system Edge (a scratch config, not committed): **10/10 passed**, and the 30 screens it took are in `shots/09/visual/` | |
| 47 | Compared by eye and by size against the 20 Linux baselines (24 Oct). 16 unchanged in size and layout. Changed: `phone-checkout` (+206 px: the new "goes nicely with it" add-ons row and a quantity picker), `phone-customize-mug` / `laptop-customize-mug` (quantity picker + "background colour"), `phone-range` (+2,000 px: more products). All match commits since 24 Oct (founder's checkout layout, range growth), not regressions | PASS (no regression spotted) | `shots/09/visual/*` vs `tests/visual/__screenshots__/linux/*` |
| 48 | Five screens in the visual spec have **no committed baseline at all**: customize calendar / card pack / Christmas bundle, product ornament, Christmas delivery dates. A real `test:visual` run fails on them | **FAIL** → **09-B13** | `ls tests/visual/__screenshots__/linux` |
| 49 | Scrapbook look (kraft, tape, polaroids, ink outlines, Bricolage + one Gaegu line) on every screen I shot | PASS by eye | `shots/09/*.jpg` |

**Totals (49 checklist rows): 37 PASS · 10 FAIL · 2 BLOCKED / NOT TESTABLE LOCALLY.**
- FAIL rows: 7, 12, 15, 23, 28, 29, 30, 36, 39, 48. Rows 7, 29 and 39 are partial: mostly pass, with one failing part.
- Rows 25, 34 and 35 are counted as PASS but each has one exception, which points at a bug already listed.
- BLOCKED / not testable: rows 41 and 46. Row 18 is PASS for what can be checked here; the real inset needs a device.

---

## (b) Bugs

### 09-B1 — P1 (money / price): placemats and coasters public pages advertise "bundle-only" packs at prices you can't buy, and lead with them
- **Steps:**
  1. Open `/products/placemats`. The headline says "Personalised placemats … **(set of 4)**", then "**from £16**". The price table lists **pack of 1 £16, pack of 2 £32, pack of 4 £60, pack of 6 £96**.
  2. Open `/products/coasters`. It says "from **£5.50**", with "pack of 1 £5.50".
  3. Open `/catalogue`. It says placemats "from £60 for 4" and coasters "from £18 for 2". Those are the only packs the shop sells on their own: `BUNDLE_ONLY_SKUS` = placemat packs of 1/2/6 and the single coaster, "never priced or shown on their own".
  4. The page's Product JSON-LD (what Google reads) lists all four placemat packs as `"availability":"InStock"`, `"price":"16.00"` and so on. Each has a `?v=placemat-packof1` link, which shows £16 as the chosen price.
- **Expected:** placemats "£60" (4-pack only); coasters "from £18" (2/4/6). The bundle-only packs appear nowhere public.
- **Actual:** a lower "from" price than anyone can pay, and the title contradicts the price ("set of 4 … from £16"). This is a misleading price indication to shoppers and to Google rich results.
- **Latent:** the Merchant feed leaves these two out today only because they have no photo yet (`merchantFeed.ts:39`). The day a photo is added, it will submit the £16 and £5.50 offers to Google Shopping.
- **Suspected:** `src/server/shop/listing.ts:61`. `shopListings()` filters `definedPriceList()` on `visibleInShop && !paused` but not `BUNDLE_ONLY_SKUS` (`src/lib/christmas-bundle.ts:84`), unlike `getCatalogue` (`src/server/catalogue.ts:765`) and the `catalogue.ts:838` path.
- **Pin:** `sweep-09-storefront` › `09-B1` (fixme).

### 09-B2 — P3 (a11y): Family promise page skips from h1 to h3
- **Steps:** run axe on `/trust/family-promise` (both widths).
- **Expected:** h2 section headings.
- **Actual:** seven `<h3>` under the h1 (axe `heading-order`).
- **Suspected:** `src/app/(marketing)/trust/family-promise/page.tsx:27-66`.
- **Pin:** 09-B2.

### 09-B3 — P3 (a11y, axe "serious"): /account danger-zone words fail contrast
- **Steps:** sign in, open `/account`, run axe.
- **Actual:** "Delete all your keepsakes" and "Close your account" are berry `#E8786E` on white, 13 px bold, at **2.85:1** (needs 4.5:1).
- **Note:** CLAUDE.md says berry is for fills. `cinnamon`/`cta-deep` would pass.
- **Suspected:** `src/app/account/AccountActions.tsx:78` and `:97` (`text-berry`).
- **Pin:** `sweep-09-signed-in` › 09-B3.

### 09-B4 — P3 (a11y): every "+ customize" / "customize" button is named only "customize"
- **Where:** the range on `/start-creating` (22 tiles) and `/catalogue`.
- **Steps:** Tab through the range with a screen reader. You hear "+ customize" 22 times, with no product.
- **Why:** the picture's own "customize mug" button is `tabIndex=-1` (mouse and touch only), so keyboard and screen-reader users only get the unnamed one. Tests also can't find "the mug's customize button" by name.
- **Suspected:** `src/ui/components/ProductGrid.tsx:178-180` (no `aria-label` naming `p.label`).
- **Pin:** 09-B4.

### 09-B5 — P3 (cosmetic / navigation): unknown addresses show the bare framework 404
- **Steps:** open `/christmas` (or any typo).
- **Actual:** a centred "404 | This page could not be found." on oat, with:
  - the generic title "snickerdoodle — keep the magic";
  - no logo, no `<main>` (so the "Skip to content" link goes nowhere);
  - no link back to the shop.
- **Expected:** a branded not-found card ("start creating" / home).
- **Suspected:** there is no `src/app/not-found.tsx`.
- **Pin:** 09-B5. Screenshot: `shots/09/phone-404.jpg`.

### 09-B6 — P3 (a11y): Studio has no `<main>` landmark
- **Steps:** upload, then "edit in studio", then run axe (390 and 1280).
- **Actual:** `region` (the toolbar, the canvas and the zoom group sit outside any landmark) and `skip-link` (the `#main` target doesn't exist).
- **Suspected:** `src/app/studio/page.tsx` / the Studio shell (no `<main id="main">`).
- **Pin:** 09-B6.

### 09-B7 — P3 (a11y): open mobile menu has two unnamed `<nav>` landmarks
- **Steps:** on a 390 px screen, tap "Open menu", run axe.
- **Actual:** `landmark-unique`. The header `<nav>` and the drawer's `<nav>` have no distinguishing label.
- **Suspected:** `src/app/(marketing)/layout.tsx:17` (header nav, unlabelled) and `MarketingMobileMenu.tsx` drawer nav.
- **Pin:** 09-B7.

### 09-B8 — P3 (a11y, axe "serious"): keepsake tiles on /home: the spoken name doesn't match the words on screen
- **Steps:** sign in, keep a drawing (+ keepsake), open `/home`, run axe.
- **Actual:** the tile shows "Keepsake · Oct 2026 · FAMILY", but its button is named "choose who can see this keepsake" (axe `label-content-name-mismatch`, WCAG 2.5.3). Every tile has the same name, so voice-control and screen-reader users can't tell keepsakes apart.
- **Suspected:** `src/app/home/HomeView.tsx:174`.
- **Pin:** `sweep-09-shop-a11y` › 09-B8.

### 09-B9 — P3 (layout): on a 375 px phone the range is briefly wider than the screen
- **Repro:** the existing `e2e/ios-no-zoom.spec.ts:30` fails 3 runs out of 3 against this build.
- **Steps:** 375×812 touch phone, upload a drawing; the moment "making your range" goes, measure `scrollWidth`.
- **Actual:** 380–383 px against a 375 px viewport for about 300 ms, then 375. It happens **with reduced motion too**, so it's layout, not an animation. No element's box sticks out, which suggests a pseudo-element or a late image/layout change.
- **Effect:** a phone user can nudge the page sideways just as the range appears.
- **Note:** with a 1 s settle the rest of that spec passes (all fields ≥ 16 px).
- **Suspected:** the range reveal on `/start-creating` (`FlowCatalogue` / `RangeHero`); not pinned further.
- **Pin:** the existing spec, which is red. I did not mark it fixme, because it isn't mine.

### 09-B10 — P3 (compliance flag / copy): cookie banner nudges to "accept all", and the choice can't be changed later
- **Steps:** first visit on any page.
- **Actual:**
  - "accept all" is the filled tomato primary button, shown first; "essential only" is the outlined secondary one (`CookieBanner.tsx:47-52`). The ICO's cookie guidance and Children's Code standard 13 (nudge techniques) expect equal prominence, and no nudge toward the less private option.
  - Nothing reads the stored choice (no analytics exist), so "accept all" changes nothing today. That is harmless, but it is a choice that does nothing.
  - Once you choose, the banner never returns, yet `/trust/cookies` says "You can change your cookie choices whenever you like from the cookie banner".
- **Suggest:** give both buttons equal styling (or put essential first), and add a "cookie choices" link that reopens the banner.
- **Founder call:** the button styling is a question of copy/compliance posture, not a code defect.

### 09-B11 — P3 (a11y, CLAUDE.md "≥ 44 px tap targets"): some controls are smaller than 44 px
At 390 px (`evidence-09/tap-targets-phone.json`):
- the `/catalogue` filter chips are **36 px tall** (`Chip` `min-h-9`, `src/ui/primitives/Chip.tsx:16`; the chip is used elsewhere too);
- the footer email link `hello@snickerdoodle.co.uk` is 13 px tall;
- the checkout header's "snickerdoodle" link is 28 px tall;
- the footer links "FAQs" / "privacy" are 29–42 px wide (but 44 px tall).

At 1280 px, the desktop header links are 20 px tall (mouse-first, lower priority).

Not bugs: the "Enlarge … preview" badges (their `::before` extends the hit area to about 45 px) and the help-form radios (inside their label row).

### 09-B12 — P3 (copy, screen readers): "add a …" labels read wrongly
- `ProductGrid.tsx:175` builds `add a ${label}`, which gives "add a adult tee", "add a placemats", "add a coasters", "add a socks", "add a playing cards", "add a wrapping paper".
- `CheckoutAddOns.tsx:71` gives "add a coasters with your drawing" and "add a placemats with your drawing".
- Studio shapes use the same pattern (`Tray.tsx:395`, `AddedOptions.tsx:223`).

### 09-B13 — P3 (test infrastructure): five visual checks have no baseline
- `tests/visual/screens.spec.ts` shoots `customize-calendar`, `customize-cardpack`, `customize-christmas-bundle`, `product-ornament` and `christmas-delivery-dates` (phone + laptop).
- `__screenshots__/linux/` holds only the 20 older screens, so `npm run test:visual` fails on the missing ten until someone runs `--update-snapshots` on Linux and commits.
- The visual suite also can't run on this Windows machine as configured (no bundled Chromium, no win32 baselines).

### Observations (not bugs, for the founder)
- **Product pages are orphaned:** nothing on the site links to `/products/*` (and nothing links to `/catalogue`). They're reachable only from the sitemap and the Merchant feed. A link from `/gifts` or the footer would help both shoppers and search.
- **The mockup's range screen tab bar differs from the build:** the mockup (line 118) shows Range/Create/Family/Basket; the build follows docs/03 (Home · Create · Family · Orders) and has no tab bar on the shop flow. This looks like a settled decision, so I'm flagging it, not counting it as a bug.
- **Welcome greeting shows the email name:** "welcome back, e2e-t9-phone-…" uses the email's local part when no display name is set (`phone-signed-in-home.jpg`). For a real parent that could show an email handle on screen.
- **Install icon:** desktop Edge reports the PWA installable, but the manifest has only a 192 px icon. Android splash screens want 512 px (already flagged in `manifest.ts`; needs the founder's large logo).

---

## (c) What I couldn't test, and why
- **The real `npm run test:visual`:** needs Playwright's bundled Chromium (downloading it is outside the rules) and has Linux-only baselines. I re-shot the screens on Edge and compared them by eye and by size instead (row 47).
- **Real safe-area insets and iOS Safari behaviour:** these need a notched device or iOS. I checked `viewport-fit=cover`, the `pb-safe`/`pt-safe` CSS and the computed 16 px fields (the no-zoom check, on emulated touch).
- **Android install prompt:** I only ran desktop Edge's installability check.
- **Error boundaries on /home, /family, /orders:** they need the server to fail mid-request. Code reviewed only.
- **Screen-reader listening test (NVDA / VoiceOver):** not available here. Axe plus the accessible-name checks stand in for it.
- **Checkout past the details form:** payment hands over to Stripe. Other testers cover checkout.

**Branch:** `claude/sweep-9-storefront-a11y-adf88b`
