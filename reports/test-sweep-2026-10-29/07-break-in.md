# 07 — Break-in tester (authorised security testing, LOCAL instance only)

**Tester:** session `sweep-7-breakin` · **Branch:** `claude/sweep-7-breakin-8daac1` (cut from `feat/christmas-season`, head `d6f890b`) · **Date:** 2026-10-29

**Setup.** I ran this on my own database `snickerdoodle_t7`, migrated, with the catalogue (32 products, 480 variants) and the mockups seeded through the jobs endpoints.
- **Production build** (`next build` into `.next-e2e`, then `next start`) on **:3207**. Mail went to the console, the local MinIO KMS key was in use, Stripe was `sk_test_…` and Prodigi was the sandbox URL. I checked both before starting.
- **A second `next start` of the same build** on **:3307** with `SITE_MODE=test` and a throwaway password, used only for the password-gate tests.
- **Actors:**
  - **Family A** (Hartleys): Sam, the owner and controlling parent of Olivia. Jo, a second parent (FAMILY circle, CONTRIBUTE). Rosie (EXTENDED circle, VIEW_BUY). Vic (FAMILY circle, VIEW). Mallory (REMOVED).
  - **Family B** (Blooms): Blake.
  - A **guest** (upload claim only) and an **anonymous** visitor.
- **e2e families** were made through the real sign-in link and the real upload → "+ keepsake" flow.
- **Nothing** touched the shared `snickerdoodle` database, the live site or the AWS box. No `src/` app code was changed.

**Tests added (all green by default; known bugs are skipped):**
| File | What | Result |
|---|---|---|
| `src/app/actions/__tests__/breakIn.int.test.ts` | Every id-taking Server Action called directly as family B with family A's ids, plus in-family escalation, forged visibility and anonymous calls. A refusal must look the same as a made-up id. | **12/12 pass** |
| `src/app/actions/__tests__/breakInFamily.int.test.ts` | Repros for 07-B1…B8, B11, B12 (skipped), plus pinned rules: claim forgery, removed member, forged qty/product, uncleared art, surname, non-owner adding a child | **6 pass, 10 skipped (bugs)** |
| `src/app/actions/__tests__/breakInUploads.int.test.ts` | Hostile files through the real `startGuestUpload`, then the bytes STORED in MinIO are inspected | **9/9 pass** |
| `src/lib/__tests__/breakInGate.test.ts` | Gate cookie forgery, the `next` redirect, exemptions, 07-B9 (skipped) | **3 pass, 1 skipped** |
| `e2e/break-in.spec.ts` | HTTP surface on the production build: mockup routes, signed URLs + bucket, gift previews, profile images, removed-member session, admin without MFA, /dev, jobs, Stripe webhook, XSS rendering, noindex + CSP. 07-B10 is `test.fixme`. | **9/9 pass, 1 fixme** |

- **Run the bugs:** `T7_SHOW_BUGS=1` turns every skipped bug test back on, so you see it fail. Saved output from that run: `shots/07/bugs-shown.txt`. All 10 Vitest bug tests fail exactly as described below.
- **Commands:**
  - Vitest: `node --env-file=.env ./node_modules/vitest/vitest.mjs run <file>`
  - e2e: `E2E_PORT=3207 npx playwright test e2e/break-in.spec.ts`
- **Regression run:** together with the existing authz, invites, profile, members, giftLinks, rateLimitWiring, storage and textSafety suites: **23 files, 220 passed, 11 skipped, 0 failed.**
  - Note: `src/storage/__tests__/quarantine.test.ts` fails twice if you export `S3_KMS_KEY_ALIAS` into the test process. It assumes that variable is unset. That's an environment quirk, not an app bug.

---

## (b) Bugs, ranked

| id | sev | one line |
|---|---|---|
| **07-B5** | **P0** | A guest can put any picture into a **stranger's family keepsake box** by typing the stranger's email on the normal sign-in page |
| **07-B9** | **P0** | The **site password** (test / private-live) is bypassed by adding `.png` to a page path; Server Actions then run without the password |
| **07-B3** | **P0** | **Copy** turns a family member into the controller of a copy of a FAMILY-only drawing. They can republish it to the Extended circle, and the parent can't delete it |
| **07-B2** | **P1** | Anyone who can merely **see** a keepsake (an Extended grandparent, a VIEW member) can **overwrite or delete its Studio edits**, which is the art its orders print from |
| **07-B11** | **P1** | Print files are keyed on drawing + product only. **A later preview overwrites a paid order's print file**, so the wrong placement prints |
| **07-B6** | **P1** | Referral codes ("first order only, never your own") are **not checked for signed-out guests**: £5 off again and again, including by the code's owner |
| **07-B12** | **P1** | The owner's gift-list view mints signed links to **ORIGINALS** with no re-check: works for items since made ONLY_ME by their controller, and for **BLOCKED** (illegal-content) items |
| **07-B13** | P2 | The Stripe webhook marks an order PAID on `checkout.session.completed` **without checking `payment_status`**. Code-confirmed; only matters if delayed payment methods are switched on |
| **07-B4** | P2 | A **VIEW**-access member can **buy** (VIEW should mean look only; buying needs VIEW_BUY) |
| **07-B10** | P2 | **Open redirect** in the Studio: `/studio/position?return=/\evil.site` sends a signed-in parent off-site |
| **07-B7** | P2 | A **revoked or expired** gift link can still be used to "report" its keepsakes, which puts them on hold (hidden + unprintable), repeatably |
| 07-B1 | P3 | `saveDesignAction` tells an outsider whether another family's keepsake id exists ('error' vs 'not-found') |
| 07-B8 | P3 | `reportKeepsakeAction` returns `ok:true` for another family's keepsake that is **on hold**, which reveals it exists and is held |
| 07-B14 | P3 | Rate limits trust `X-Forwarded-For` when `CLIENT_IP_HEADER` is unset. The 10-tries password lockout resets by changing that header. The AWS config sets it, but only a warning fires if it's missing |
| 07-B15 | P3 | Admin two-step: the code can be replayed within its 30s window, and the step-up cookie isn't cleared on sign-out (8h) |
| 07-B16 | P3 | After the right password the gate lands you on `/`, not the page you asked for (`next` lost; seen locally, cause not chased) |
| 07-B17 | P3 | An uploaded SVG is safely flattened to PNG but stored with content type `application/octet-stream` (no `svg` in `FORMAT_TO_MIME`) |

### 07-B5 (P0): a guest can put a picture into anyone's family keepsake box
- **Where:**
  - `src/server/keepsakes.ts:85-92` (`rememberKeepForEmail` accepts **any** email)
  - `:97-101` (`finishPendingKeeps` adopts the draft into whoever signs in with that email)
  - `src/app/login/page.tsx:36` (`?keep=<id>` → `rememberKeepAction(keepId, typedEmail)`)
  - `src/app/start-creating/page.tsx:76-80` (`?resume=keep` finishes it)
- **Steps:**
  1. As a guest, upload any picture (you get its claim cookie).
  2. Open `/login?keep=<draftId>&next=/start-creating?resume=keep`.
  3. Type the **victim's** email. The app sends the victim a genuine Snickerdoodle sign-in email.
  4. The victim taps it, lands on `?resume=keep`, and the picture is **kept in the victim's family home** at FAMILY visibility, seen by their relatives.
- **Proof:** `07-B5` test. `finishPendingKeepsAction()` as Blake returned the attacker's draft in `kept` (output in `bugs-shown.txt`).
- **Why it's P0:**
  - An outsider can place content inside a family's private space. The child-safety rule is that nothing reaches a family the parent didn't choose.
  - Screening doesn't save it: keep doesn't check moderation, and a FLAGGED upload with no report is shown to the family (`src/server/assetRef.ts:16-25` comment). Only CSAM-**BLOCKED** art is refused.
- **Expected:** a "+ keepsake" for an email only completes when the person who signs in is the same browser or session that holds the claim, or the parent confirms it. Never silently.

### 07-B9 (P0 on the private live site): the password gate is bypassed by `.png`
- **Where:** `src/lib/siteMode.ts:99`, where `!pathname.startsWith('/api/') && /\.(png|jpe?g|webp|svg|ico|woff2?)$/` exempts **any** page path ending in an image extension. Applied in `src/proxy.ts:24`.
- **Steps (local `SITE_MODE=test` on :3307, no gate cookie):**
  - `GET /customize/mug` → **307 → /test-gate** (locked, correct).
  - `GET /customize/mug.png` → **200** page. `/g/abc.png` → 200. `/join/x.webp` → 200.
  - The page's `/_next/static` chunks list every Server Action id. I harvested 13, including `startGuestUpload`, `beginGuestUpload`, `renderPreviewAction` and `copyKeepsakeAction`.
  - `POST /customize/mug.png` with `Next-Action: <keepsakePickerAction id>` → **200** `{"ok":true,"signedIn":false,"keepsakes":[]}`.
  - The same POST to `/customize/mug` → **307 to /test-gate**.
- **Impact:**
  - Anyone can upload pictures, run renders and use guest checkout on a site that is supposed to be closed. On the private-live site that is the real shop: live Stripe, real printing.
  - Session-gated family data stays safe: `/api/auth` is still locked, and authz still applies.
- **Screenshots:** `shots/07/gate-normal-path-locked-{phone,desktop}.png` vs `shots/07/B9-gate-bypassed-png-path-{phone,desktop}.png`.
- **Expected:** exempt only real static prefixes (`/brand/`, `/_next/static/`, real `public/` files).

### 07-B3 (P0): "copy" lets a member republish a FAMILY-only drawing
- **Where:**
  - `src/server/keepsakeCopy.ts:36-42`: the copy is ingested **as the caller**, so the controller is the caller unless a child is filed. Plain "keep" uploads (`keep.ts:37`) never file a child.
  - `:63`: visibility is copied across.
  - `src/authz/actions.ts:37-59`: visibility and delete are controller-only.
- **Steps:**
  1. Sam keeps a drawing (FAMILY, no child filed).
  2. Jo (FAMILY circle, CONTRIBUTE) calls `copyKeepsakeAction({assetId})`. The copy's controller is **Jo** (`07-B3` assertion: expected Sam, got Jo).
  3. Jo can call `setAssetVisibilityAction(copy,'EXTENDED')` and the whole Extended circle sees it.
  4. Sam can't narrow or delete the copy.
- **Expected:** a copy stays under the source's controller (the controlling parent). "Parent is controller" and "privacy by default" are non-negotiables.

### 07-B2 (P1): a viewer can rewrite the family's keepsake
- **Where:** these check only `getViewableAssetOrThrow` (can see):
  - `src/server/studio-doc.ts:152` (`saveStudio`)
  - `src/server/magic.ts` (`applyCutoutMask`, `removeBackgroundForAsset`, `putBackgroundBack`)
- **Steps:**
  1. Rosie (EXTENDED, VIEW_BUY) calls `saveStudioAction({assetId: <Sam's EXTENDED keepsake>, geometry:{rotate:180, background:'#000000'}})` → `ok:true`.
  2. The keepsake's `studioDoc` and `design` file are replaced in place, under the same storage-object id that orders and saved designs point at.
  3. `clearCutout:true` deletes the cutout and design instead.
  - The original is untouched.
- **Expected:** editing needs CONTRIBUTE plus controller, or works on a copy.

### 07-B11 (P1): a later preview overwrites a paid order's print file
- **Where:**
  - `src/server/print/render.ts:287`: `key = derivativeKey(assetId, 'printfile-'+variantId+tag)`. Transform and source aren't in the key; the file is overwritten in place.
  - `src/fulfillment/submit.ts:423-442`: the provider is sent a link to that key.
- **Proof:** `07-B11`. Render the mug at scale 1, then again at scale 2.5 / offset / 90°. It's the **same object id** with a **different sha256**.
- **Impact:** an order line that is READY but not yet fetched by Prodigi prints the last-previewed placement. Two orders of the same drawing on the same product collide the same way.

### 07-B6 (P1): referral rules skipped for guests
- **Where:** `src/server/promos.ts:36-37`. The own-code and first-order checks run only when `buyer` is set. `src/app/actions/order.ts:114` and `quote.ts` pass `null` for a guest.
- **Proof:** `07-B6`. `resolvePromo(code, null)` → `ok:true` for a code whose owner, signed in, is refused.
- **Impact:** £5 off (over £30) on every guest order. The owner's **credit** is still protected at payment time (`src/server/referrals.ts:98-99`); only the discount leaks.
- **Related, not reproduced:** `maxRedemptions` counts only PAID orders, so parallel checkouts can exceed it.

### 07-B12 (P1): owner gift-list view links to originals without the gate
- **Where:** `src/server/giftLinks.ts:419-445`. Only `canManageFamily` is checked, then `presignDownload` runs on every item's ORIGINAL. There's no `canViewAsset`, held-for-review or BLOCKED check.
- **Proof:** `07-B12`. Jo's keepsake is on Sam's gift link. Jo makes it ONLY_ME, and Sam's home still gets a 300s link to the original. The same happens for an item later marked **BLOCKED** (both soft assertions fail).
- **Why P1:** BLOCKED content must never be viewable by anyone (D8). ONLY_ME belongs to its controller alone.

### 07-B13 (P2): webhook doesn't check `payment_status`
- **Where:** `src/payments/webhook.ts:28-59`. `checkout.session.completed` leads straight to `markOrderPaid`. `src/payments/stripe.ts:88` sets no `payment_method_types`.
- **When it matters:** if a delayed method (Bacs, SEPA) is ever enabled in the dashboard, the order goes PAID and prints before the money settles. `async_payment_failed` isn't handled.
- **Status:** not testable locally without dashboard changes. Code-confirmed only.

### 07-B4 (P2): VIEW members can buy
- **Where:** `src/server/orders.ts:172-173` checks `assertCanViewAsset` only. `canBuyFromGiftList` (`src/authz/actions.ts`) is never used outside tests.
- **Proof:** Vic (FAMILY, **VIEW**) `placeOrderAction` with the family keepsake → `ok:true, ref:'SNK-…'`.
- **Expected:** CLAUDE.md says "Access (VIEW|VIEW_BUY|CONTRIBUTE) = what you can do".

### 07-B10 (P2): Studio open redirect
- **Where:** `src/app/studio/position/page.tsx:14`. The check is `startsWith('/') && !startsWith('//')`, so `/\host` passes, and browsers read it as `//host`. Used as the Back link (`Positioner.tsx:64,1006`) and after save (`:465`).
- **Proof:** e2e `07-B10` with `T7_SHOW_BUGS=1`. Signed-in Sam, `return=/\evil.invalid/phish`, tapped Back, and the browser requested `http://evil.invalid/phish`. I blocked the request, so nothing left the machine.
- **Fix:** reuse `sameSitePath` from `src/lib/siteMode.ts`.

### 07-B7 (P2): revoked gift links still "report"
- **Where:** `src/server/contentReports.ts:35`. The link is looked up by token with no status or expiry check.
- **Proof:** a REVOKED link's report flipped its keepsake to FLAGGED (held).
- **Impact:** a past recipient can hide and block printing of the family's keepsakes, again after every clear. Only the per-IP limit applies.

### 07-B1 / 07-B8 (P3): existence oracles
- **07-B1:** `saveDesignAction` returns `reason:'error'` for a real foreign id and `'not-found'` for a made-up one (`src/server/savedDesigns.ts:41-43`).
- **07-B8:** `reportKeepsakeAction` returns `{ok:true}` for any held keepsake before the view check (`src/server/contentReports.ts:125`).
- **Why only P3:** ids are random UUIDs, so this only confirms an id the attacker already has.

### 07-B14…B17 (P3)
- **07-B14:** `src/server/rateLimit.ts:83-88`. Locally, 10 wrong passwords gave `busy`, and the **right** password was refused too (correct). The same right password with a new `X-Forwarded-For` went straight in. On AWS, `CLIENT_IP_HEADER=x-real-ip` is set and Caddy overwrites the header, so this is a config trap, not a live hole. Suggestion: refuse to start in production without it, instead of only warning (`infra/aws-london/bin/fetch-env.sh:67`).
- **07-B15:** `src/server/admin/totp.ts:61-70` has no last-used counter. `src/server/admin/stepUp.ts` binds the cookie to the account, not the session. Code only.
- **07-B16:** `POST /api/test-gate` with `next=/home` → `Location: /`.
- **07-B17:** `src/storage/exif.ts:11-18`.

### Suspected, code-only, not reproduced (lower risk)
- `discardCopyAction` deletes by **uploader** with no ACTIVE or controller check (`keepsakeCopy.ts:331-338`; 6h window).
- `keepUpload` doesn't check ACTIVE membership (`keepsakes.ts:63-67`).
- A direct-upload ticket cookie could be replayed within its 5-min signed PUT, which would skip the per-IP limit (only matters with `S3_DIRECT_UPLOADS=true`).
- `requestEmailChangeAction` says "taken", an account-enumeration oracle (rate limited).
- Gift-link **titles** aren't abuse-screened and occasion titles aren't surname-screened. Both render safely as text.
- Support and complaint `name` goes into plain-text acknowledgement emails.
- A signed URL already handed out stays valid after access is revoked, until it expires (≤600s). That's inherent to signed URLs.

---

## (a) Coverage checklist

**PASS** = I observed it, with the evidence named. **Bug** = see (b).

### Cross-family (family B with family A's ids). Refused, and the answer is identical to a made-up id unless noted
| Item | Result | Evidence |
|---|---|---|
| removeBackground / putBackgroundBack / cutoutAlpha / saveCutoutMask / studioState / saveStudio | PASS (and A's cutout survived) | breakIn.int "magic edits" |
| designUrlAction: A's pair; **B's own asset + A's object id** (mixed pair) | PASS (B's own still works) | breakIn.int "signed URL…" |
| keepsakeForStudio / copy (± bg) / discardCopy / renderPreview / keepUpload / setVisibility / deleteKeepsake | PASS (A's row unchanged) | breakIn.int "studio open…" |
| saveDesign | refused, **but leaks** → 07-B1 | breakIn.int + 07-B1 |
| deleteSavedDesign / adoptPendingPlacement / placeOrder with A's art / reportKeepsake | PASS (not refiled into B, not held) | breakIn.int "saved designs…" |
| createGiftLink(A's assets) / sendGiftRequest(A's link) / revokeGiftLink(A's link) | PASS (link stays ACTIVE) | breakIn.int "gift links" |
| removeMember / setMemberAccess / setMemberCalendar / revokeInvite / resendInvite / updateChild / deleteChild / updateOccasion / deleteOccasion / leaveFamily / setKeepChoice | PASS (A unchanged) | breakIn.int "family admin" |
| `/api/mockup`, `/api/mockup/batch`: A's asset as B → `{ok:false,fallback:true}`, same as a made-up id; A → ok | PASS | e2e 1 |
| `/api/mockup` anonymous with A's asset | PASS | e2e 1 |
| `/api/gift/<token>/preview/<id>`: wrong token, item not on link, ONLY_ME, revoked → 404 (control 200) | PASS | e2e 3 |
| `/api/profile-image/<id>`: made-up / malformed id → 404 | PASS (cross-family with a real image: existing `profile.int` + `authz/profileImages` suites pass) | e2e 4, regression run |
| `/api/admin/review/keepsake/<id>` as a normal user | PASS (404) | e2e 6 |
| `/api/mockup/bundle`, `/api/mockup/contexts`, `/api/mockup/still` | NOT RE-TESTED live (bundle: code-checked gate per drawing, 403 for missing and forbidden alike; contexts/still are brand-safe template data only) | audit |
| `/studio/[creationId]` | n/a, a redirect only | code |
| Orders pages / `checkout/confirmation?ref=` for another family's order | PASS by code (scoped to `orders.accountId = me`); `setKeepChoiceAction` with A's ref refused | breakIn.int |

### Within a family
| Item | Result | Evidence |
|---|---|---|
| EXTENDED member → FAMILY keepsake (open, state, signed URL, mixed pair) refused; EXTENDED keepsake allowed | PASS | breakIn.int |
| Second parent who **uploaded** the child's drawing, once the controlling parent made it ONLY_ME: can't see, change, delete or copy; the controlling parent can | PASS | breakIn.int |
| VIEW member: can look, can't copy, change visibility, delete or manage | PASS | breakIn.int |
| VIEW member **buying** | **FAIL → 07-B4** | 07-B4 |
| EXTENDED/VIEW member **editing** Studio | **FAIL → 07-B2** | 07-B2 |
| Contributor **copy → widen visibility** | **FAIL → 07-B3** | 07-B3 |
| REMOVED member: sees nothing, can't order, copy or save a design | PASS | breakIn.int, breakInFamily |
| REMOVED member's **live session**: refused at once, even before its session row is deleted (no grace); `removeMember` also deletes sessions (`members.ts:51`) | PASS | e2e 5 |
| Non-owner can't add a child to the family | PASS | breakInFamily |
| Owner's gift-list view re-checks the gate | **FAIL → 07-B12** | 07-B12 |

### Signed URLs and the bucket
| Item | Result | Evidence |
|---|---|---|
| One object only: re-pointing a valid signature at the ORIGINAL → 403 | PASS | e2e 2 |
| Short-lived: `X-Amz-Expires` ≤ 600 | PASS | e2e 2 |
| No signature → 403; bucket listing (`/bucket/`, `?list-type=2`) → 403 | PASS | e2e 2 |
| Reuse after access revoked | Valid until expiry (≤10 min), by design | noted |

### Forgery
| Item | Result | Evidence |
|---|---|---|
| Forged visibility (`PUBLIC`, `''`, SQL-ish) never stored | PASS | breakIn.int |
| Forged qty (−5, 1e9) and an unknown product: total never < 0, qty capped | PASS | breakInFamily |
| Un-cleared art (PENDING, FLAGGED) can't be ordered even by its controller | PASS | breakInFamily |
| Upload-claim forgery (another claim) → `rememberKeep` refused | PASS | breakInFamily |
| Promo for guests | **FAIL → 07-B6** | 07-B6 |
| Join saving / price / controller ids from the client | PASS by code: all resolved server-side (`order.ts`, `joinProvenance.ts`, `ingest.ts:66-73`); existing pricing and gift-loop suites | audit |
| Stripe webhook: empty, garbage and all-zero signatures, no header → 400, no event row written | PASS | e2e 7 + curl |
| `/api/jobs/*` (all 8): none / `Bearer ` / wrong / lowercase / Basic → 401; GET → 405 | PASS | e2e 7 + curl |
| `/admin/review`, `/admin/support` as anon and a normal user → 404; admin **without MFA** → review image 404, no images on the page | PASS | e2e 6 |
| `/dev/spin`, `/api/dev/prodigi`, `/api/dev/capture` in a production build → 404 | PASS | e2e 7 + curl |

### Uploads (real `startGuestUpload` → stored bytes)
| Item | Result |
|---|---|
| JPEG with GPS + camera EXIF: stored original has no EXIF, XMP or IPTC, and no "T7Cam" or address bytes; `exif_stripped=true` | PASS |
| Text file named `.png` / `image/png` → refused, no asset row | PASS |
| SVG with `<script>` and `foreignObject`: flattened to PNG, no `<script` or `<svg` in the stored bytes (stored type label → 07-B17) | PASS |
| SVG pointing at a local file (`file:///…`): the file isn't rendered (pixels equal a blank SVG) | PASS |
| Polyglot (PNG + HTML/script + zip tail): re-encoded, payload gone, `image/png` | PASS |
| Wrong declared type (JPEG sent as `image/png`) → stored as `image/jpeg` | PASS |
| Decompression bomb (8×8 PNG claiming 30000×30000) → refused | PASS |
| >25MB → refused; zero bytes → refused; terms ≠ `"true"` → `needsTerms` | PASS |

### Injection and text rules
| Item | Result | Evidence |
|---|---|---|
| XSS in **family name, child name, gift-list title** on `/home`, `/family` and `/g/<token>` (signed-in and anonymous): never ran, shown as text | PASS | e2e 8 + `shots/07/xss-gift-title-shown-as-text-{phone,desktop}.png` |
| Raw-HTML sinks in `src`: only two JSON-LD `<script>` tags, `<`-escaped, no user text. No `innerHTML` or `srcdoc`. Mail is plain text only | PASS (code sweep) | audit |
| Studio text / shapes / strokes into print files: text via satori (escaped), colours hex-whitelisted, shapes from a fixed map (`src/lib/studio-objects.ts:116-156`) | PASS (code) | — |
| Child **surname** refused (space, no-break space, tab, newline, double space) on add and rename; markup, zero-width joiner and SQL-ish names refused | PASS | breakInFamily |
| Gift message / support / complaint / promo code XSS | PASS by code: all React text or plain-text mail. Not separately rendered in e2e | audit |

### Site password gate (`SITE_MODE=test`, local :3307)
| Item | Result |
|---|---|
| Locked pages → 307 to `/test-gate`; locked `/api/*` → 401 | PASS |
| Lockout: tries 1–10 → `wrong`, 11+ → `busy`, and the **right** password is refused while busy | PASS (bypassable by `X-Forwarded-For` → 07-B14, config) |
| Forged cookies (`1`, `true`, 64 zeros, empty, upper-cased real token) refused; a password change invalidates old cookies | PASS (curl + breakInGate) |
| `robots.txt` → `Disallow: /`; `X-Robots-Tag: noindex, nofollow`; CSP on the gate page | PASS |
| `.png` path bypass | **FAIL → 07-B9** |

### Headers
| Item | Result |
|---|---|
| `noindex` + CSP `frame-ancestors 'none'` on `/home`, `/family`, `/account`, `/checkout`, `/orders`, `/g/*`, `/join/*`, `/start-creating` | PASS (e2e 9) |
| `e2e/csp.spec.ts` (nonce on every script; shop journey with no CSP violations; the watcher catches a refusal) | PASS (3/3) |

**Counts:**
- 59 checklist rows: **PASS 49**.
  - 44 of those were observed live.
  - 5 were confirmed by reading the code (marked "PASS by code" or "PASS (code)").
- **FAIL 7:**
  - six rows marked FAIL: 07-B2, B3, B4, B6, B9, B12;
  - the saveDesign row, which refuses the attack but leaks whether the id exists (07-B1).
- **NOT RE-TESTED LIVE 1** (mockup bundle/contexts/still).
- **Not applicable / by design 2** (`/studio/[creationId]` is only a redirect; a signed URL already handed out stays valid until it expires).
- **BLOCKED 0.**
- Bugs found outside the checklist rows: B5, B7, B8, B10, B11, B13–B17.

---

## (c) What I couldn't test, and why
- **The live private site and AWS** (Caddy rules, real `CLIENT_IP_HEADER`, S3 block-public-access): out of bounds by the rules. 07-B9 almost certainly applies there too, because Caddy only special-cases `/api/dev` and `/api/jobs`, but I did not touch it.
- **The Stripe delayed-payment path (07-B13):** needs dashboard changes. Code-confirmed only.
- **Real admin MFA step-up:** I didn't enrol a TOTP. "Admin without MFA gets nothing" is tested; replay and cookie lifetime (07-B15) are code-only.
- **Prodigi fetching an overwritten print file (07-B11):** proven up to the storage object; I didn't submit a sandbox order.
- **Real content screening** (Rekognition, IWF): not configured locally. Every upload is held, which is why 07-B5's "flagged art is still shown" impact comes from the code, not observed.
- **Direct-upload mode (`S3_DIRECT_UPLOADS=true`)** ticket replay: not enabled locally.
