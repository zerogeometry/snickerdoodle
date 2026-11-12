# DPIA addendum — Snickerdoodle Draw (the children's drawing app) and its link to the website

> **DRAFT for the founder's sign-off as controller. Not legal advice.** Extends `DPIA-draft.md` (LG1, signed off by
> the founder as controller on 29 Oct 2026). Uses the same numbering: new processing **PA-28 onwards**, new risks
> **R-21 onwards**, new actions **A-26 onwards**, new open questions **OQ-1b, OQ-21 onwards**. Companion: `CHILDRENS-CODE-assessment-draw-app.md`
> (Part C) and `DRAW-APP-signoff-checklist.md`.
>
> | | |
> |---|---|
> | Controller | Launch Mode Ltd, trading as Snickerdoodle (website and app) |
> | Version / date | v0.4 draft, 2026-11-10: the signing version (v0.1–v0.3 earlier the same day) |
> | Prepared by | Claude Code (drafting agent) for Simon (founder / controller) |
> | Status | **Draft. Not signed off.** Real children's drawings must not flow from the app to the website on the basis of this document until §11 is signed and the blockers in the checklist are closed. |
>
> **Evidence baseline (checked 2026-11-10).** Website: `C:\Users\Simon\dev\Snickerdoodle`, branch `feat/christmas-season`,
> HEAD `51883d1`, plus the untracked app privacy page `src/app/(marketing)/trust/privacy/draw/page.tsx`. App: worktree
> `C:\Users\Simon\dev\snickerdoodle-draw-ios`, branch `fix/save-copy-to-photos`, HEAD `cf02b42`, folder `draw-app/`
> (read only). **The main app clone (`C:\Users\Simon\dev\snickerdoodle-draw`, branch `feat/video-moments`) was not
> reviewed.** Re-check this addendum against whichever branch the store build is made from. App paths below are
> relative to `draw-app/`; website paths are relative to the website repo. Anything marked **[inferred]** was not verified in code
> or with the supplier.
>
> **Sync choices: re-checked against the built code (G12/A-45, v0.4).** Website PR #49, worktree
> `C:\Users\Simon\dev\Snickerdoodle-drawsync`, branch `feat/draw-sync-choices` at `b2724c8`, migration `0053_draw_sync_choices`.
> App PR #38, worktree `C:\Users\Simon\dev\snickerdoodle-draw-sync`, branch `feat/sync-choices` at `9042fe7`, plus an uncommitted
> layout/copy tweak still landing (the data flows don't change). Statements marked **[verified]** were checked in
> that code on 2026-11-10. §0b lists every check, where the build differs from the brief, and what's still open.
> Tests were read, not run here; PR #49 reports typecheck, lint and 2244 tests passing.
>
> **What changed in v0.2 (founder decisions, 10 Nov 2026):** (1) **M1:** the app **and the website** are treated as
> fully in scope of the Children's Code. The website's "arguably out of scope" argument is withdrawn (Part C §C.A lists
> what that adds for the website). (2) **M4 is replaced by sync choices** made by a grown-up at linking: keepsakes
> *none / proud pile / all*, plus first names & birthdays and drawing days, with nothing pre-selected (§2.2, PA-41–PA-44;
> risks R-39–R-45). **Website keepsakes never come back into the app.** (3) **Store listing: UK only** at launch.
> (4) **Phone backups allowed:** the family's own Google/iCloud backups (R-22, R-33). (5) M5 left open (resolved in v0.3).
>
> **What changed in v0.3 (founder decisions, 10 Nov 2026, later the same day; brief section "Founder decisions … these
> amend the above", plus a later change the same day):**
> 1. **"Proud pile only" = the child's star sends it.** The founder chose this over the drafting recommendation of a
>    grown-up action. **No notification emails at all** for drawings synced from Draw: the daily digest in the brief was
>    scrapped by the founder. The mitigation is the parent's choice of "proud" at linking, the FAMILY-only default,
>    website-only widening, and narrowing/stopping or removing everything Draw sent. R-41 has been reassessed.
> 2. **Widening sync is website-only.** The app can only narrow or stop (403 `widen-on-website`), which mitigates the
>    sync part of R-23.
> 3. **The website family-calendar share stays pre-ticked.** Recorded as the founder's decision; residual risk noted;
>    A-56 declined (not blocking).
> 4. **M5 resolved: family birthdays become a fourth sync choice, `birthdays`** (unticked). They sync two-way between
>    Draw and the website's family calendar via `/api/app/v1/occasions`, first names + month/day only (PA-44,
>    R-46–R-48).
> 5. **A-48** (bulk "remove everything Draw sent") and **A-55** (`/me` without birthdays when name sync is off) are
>    **being built** on `feat/draw-sync-choices`.
>
> All sync statements stay **[verified]** until the branches are re-checked.

---

## 0. Covering note

You are being asked to approve this: **once a grown-up links the app and chooses what syncs, the family's drawings go
into its private keepsake box on the website.** Depending on their choice, that is none of them (a grown-up can still
keep one at a time), the proud-pile ones (**a child's star is enough** — founder's decision), or every drawing.
Children's first names and birthdays, drawing days, and **family birthdays** (relatives' first names + month/day, two-way
with the website's family calendar) sync only if ticked. Nothing is pre-selected. A choice can be **widened only on the
website**, and the app can only narrow or stop it. There are **no notification emails** about synced drawings. No
keepsake pictures come back from the website into the app. Uploads go through the
same checks as a website upload (verified, §2.3). The full list of what to approve, what to decide, the gaps to fix
first and the exact switches is in **`DRAW-APP-signoff-checklist.md`**.

Headline: the existing engineering is sound. "All drawings" is the biggest change in this version. It means a steady
stream of children's images (and safety-check load) that stays in the box until deleted, and stopping a sync doesn't
delete anything. So the blockers now include **a way to remove everything the app sent in one go**, the slate's
wording and defaults, and tests for every sync gate. The earlier blockers still stand: both privacy notices, the store
forms, the connect screen, a content-safety test, and supplier records for Expo (and Sentry before it is switched on).

**v0.4 update:** most of that is now **built and verified** (§0b): bulk removal, the slate, the sync-gate and
content-safety tests, the connect list, the occasions API, `CHILD` invites refused, and the drawing-days lifecycle.
Still open before switch-on:
- the privacy-notice placeholders and the website notice;
- the store forms;
- Expo's DPA record;
- saying who sees relatives' dates on the family calendar;
- an audit trail for occasion changes made from the app.

---

## 0b. Re-check against the built code (G12 / A-45), 10 Nov 2026

✅ = verified as the papers describe · ≠ = built differently from the brief (noted) · ✗ = gap still open.

| # | Claim in this addendum | Result | Evidence (website = PR #49 worktree; app = PR #38 worktree, `draw-app/`) |
|---|---|---|---|
| 1 | Choices stored per link; nothing pre-selected; "connect" disabled until a keepsakes option is picked; **no key without choices** | ✅ | `src/lib/drawSync.ts` (`EMPTY_CONNECT_SYNC`, `canConnectWith`, `parseConnectSync`); `src/server/app/link.ts` (`createAuthCode` throws without choices; `exchangeAuthCode` refuses a code without them); `src/ui/components/DrawSyncSlate.tsx`; tests `drawAppLink.int.test.ts` "a code for a family needs the grown-up's choices", `drawSync.int.test.ts` |
| 2 | Every set/change audited as a consent change | ✅ | `src/server/app/sync.ts` `syncAuditRow` (`CONSENT_CHANGED`, `target_type app_sync`, `{by, from, to}`); a no-op isn't audited |
| 3 | **Widening website-only**; the account page changes either way, only its own live phones | ✅ | `widens()` + `updateAppSync` → 403 `widen-on-website`; `updateSyncFromWebsite` re-checks owner; tests "may only narrow or stop", "the account page: only this account's own, live phones". App: `src/services/sync.ts` `changeSync` → "you can turn this on from your account" (`sync.widen`) |
| 4 | Phones linked before sync existed sync nothing until a grown-up picks | ✅ | Migration 0053 defaults (`none`/false, `sync_chosen_at` NULL); test "a phone linked before the choices existed". Picking means the website account page (the app can't widen). **Confirmed (founder, 10 Nov)** |
| 5 | `trigger: manual` (default for old apps) always allowed; `auto` only under proud/all (403 `sync-off`); same ingest | ✅ | `keepAppDrawing` `parseTrigger` / `autoKeepsakesOn`; `not-yet` (switch off) checked first; test line 474 |
| 6 | No duplicates on retry (`clientRef`) | ✅ ≠ | `assets.app_client_ref` unique per family; race keeps one. **≠ After a drawing is deleted on the website, the same `clientRef` would create it again.** The app never resends a kept or taken-back drawing (`mayQueue`, `kept` / `takenBack`), so only a crash between upload and marking can cause it. **Confirmed (founder, 10 Nov): "the app never resends drawings it already sent"** |
| 7 | Queue: "all" = every saved drawing; **"proud" = the child's star** (founder); earlier drawings offered, not forced; backoff; held for unmatched artists; paused on none; cleared on unlink; never twice | ✅ | App `src/domain/syncQueue.ts` (`queuesOn`, `tidy`, `mayQueue`, backoff 30 s → 6 h), `src/services/syncQueue.ts`, `src/store/app.ts` `setProud` → `queueSync(…,'proud')` (called from `keepsake/Proud.tsx` and `app/hand-over/[id].tsx`, i.e. the child's room); `sendEarlier` only on a grown-up's yes; tests `sync-queue.test.ts`, `sync-rules.test.ts` |
| 8 | Both upload paths obey `REAL_DRAWING_UPLOADS_SIGNED_OFF` and the test-site sample-art rule | ✅ | App `src/services/keepsakes.ts` `uploadsBlocked()` used by `sendDrawing` for manual and auto |
| 9 | Names/birthdays: `/me` birthdays only with `children` on (A-55); `PATCH /children` 403 unless on; `POST /children` allowed, **birthday dropped when off** | ✅ | `toChild(…, sync)`, `addAppChild`, `updateAppChild`; app `sync.ts` sends a birthday only with `children` on; tests "names and birthdays: off…", "adding a little one still works with names off…". **Confirmed (founder, 10 Nov)**, plus an app message "we'll store keepsakes in snickerdoodle under <first name>" (being built in PR #38) |
| 10 | Drawing-days backup: 403 unless ticked; five fields only; scoped; export; delete; cascade; **1-year retention** | ✅ | `getAppProgress` / `putAppProgress`, `parseProgress`, `purgeStaleProgressBackups` (retention job), `deleteProgressBackups`, `exportData.ts`; tests 553–615. **1-year rule confirmed (founder, 10 Nov)** |
| 11 | Family birthdays: 403 unless ticked; month/day only, **never a year**; FAMILY circle; last change wins; off deletes nothing | ✅ | `src/server/app/occasions.ts`; app `src/domain/occasionSync.ts`; tests 632–717 |
| 12 | Names are single first names; which family dates reach the phone | ✅ | `cleanName` → `screenChildFirstName` (one word; surname refused). `visibleToApp` in `src/server/app/occasions.ts`: **adult members' dates** (first name, relation, day/month) and **dates for children on this phone** go; **lunar dates** and **dates for children not on this phone** stay off (test "a date for a child this phone isn't for stays off the phone"). **Confirmed by the founder on this description, 10 Nov (B4)** |
| 13 | Edits/deletes of family dates from the app are confirmed and audited | 🔧 being fixed | App: date changes apply only on the corner's **Save** (`src/grownups/SaveBar.tsx`), which acts as a confirm. Website: no audit of occasion changes at `b2724c8`. **The audit is being added to PR #49** (coordinator, 10 Nov); verify at N6. A website undo stays optional |
| 14 | Bulk "remove everything Draw sent" (A-48) | ✅ (website) | `removeEverythingDrawSent` through `deleteAsset` (cascading, audited, skips drawings on in-flight orders), confirm step on the account page (`src/app/account/DrawAppCard.tsx`); test 729. **App: per-drawing remove only** (`grownups/Account.tsx`); the notice points to the account page. Acceptable |
| 15 | Content-safety tests for app uploads (A-37) | ✅ | Tests 775–804: pending / checks-failed / flagged → no ready-to-buy link, no order, in the review queue, never auto-rejected |
| 16 | `CHILD` invites refused server-side (A-38 / G10) | ✅ | `src/server/invites.ts` `NotInvitableError`; `src/app/actions/invite.ts`; `invites.int.test.ts` |
| 17 | Connect "can / can't" list (A-29 / G5) | ✅ 🔧 | `src/app/app/connect/ConnectCard.tsx` `CAN` / `CANT`. The "can't … see your family" wording (B10) is **being fixed in PR #49**; verify at N6 |
| 18 | Slate copy says what each choice sends; "proud" says a child's star sends; stopping doesn't delete | ✅ ✗ | `DrawSyncSlate.tsx` hints ("whoever stars it, your little one included"; "scribbles and all — it adds up fast"); `ConnectCard.tsx:158` and `DrawAppCard.tsx:90` ("never deletes"). **✗ The family-birthdays hint doesn't say who sees relatives' dates** (everyone the family calendar is shared with, pre-ticked for new invitees). **A-61 open** |
| 19 | No notification emails about synced drawings | ✅ | No mail calls in `src/server/app/*` |
| 20 | No keepsake pictures back to the app | ✅ | No image or signed-URL route under `src/app/api/app/v1`; `CANT` "bring pictures from here back into the app" |
| 21 | App privacy notice rewritten for linking (G1) | ✅ ✗ | Website `src/app/(marketing)/trust/privacy/draw/page.tsx`: 404 on live unless `DRAW_PRIVACY_NOTICE=live`. **Placeholders open:** "Last updated: [date]", crash reports "[number] days", "ICO registration [number]", "Legal basis: [to confirm …]". **Doesn't say who sees relatives' dates** (A-61). The app links to it from the corner, so it must be live before the store update |
| 22 | Website privacy notice covers Draw (G2) | ✗ | Not changed on the branch. A proposed text is in the checklist §6 for approval |
| 23 | The child's room shows nothing about sync | ✅ | No sync UI in the child's room. While unlinked, a "link snickerdoodle (for grown-ups)" **t-shirt** button sits beside the lock (`src/ui/ArtistHeader.tsx` `LinkButton`): gate first, no badge, wiggle or narration. **The founder's decision (B8).** Residual: a t-shirt can read as merchandise to a child; Low, given unlinked-only, gated and quiet |
| 24 | Grown-ups' corner wording | ✅ | The section is named "snickerdoodle shop". **The founder's decision (B9).** Brand framing for grown-ups only, not seen by children; no data effect |
| 25 | 90-day idle disconnect | ✅ | Existing `APP_TOKEN_IDLE_MS`; the app returns to unlinked with a notice (`notice.unlinked`). **Confirmed (founder, 10 Nov)** |

---

## 1. Why an addendum is needed

The website's DPIA and Code assessment were written for **grown-ups using a service on behalf of their family**:
children are the subjects of the data, never the users. Snickerdoodle Draw is used **by children aged 3–12
themselves**. The founder has decided (10 Nov 2026) that the app and the website are fully in scope of the Children's
Code, and a DPIA is required for the app (Code standard 2). Linking adds a **new source of children's images**. With
"all drawings", that source is continuous. It also adds new behavioural data (drawing days) and puts **a parent's key on
a device a child uses**. The signed DPIA covers none of this (`project-office/briefs/COMPANION-APP-api-plan.md` §2 M1,
§4 Phase 0; `DRAW-APP-sync-choices.md`).

---

## 2. Description of the processing

### 2.1 What the app keeps on the phone (we never receive it unless a sync choice sends it)

Verified in code. All of it lives in the app's own storage on the device.

| Data | Where on the device | Code |
|---|---|---|
| Artists (children): first name, age group, avatar, optional birthday (day optional), the website child id once matched | AsyncStorage (`snickerdoodle-draw` store) | `src/store/app.ts`, `src/domain/artist.ts` |
| Drawings: full picture (PNG), thumbnail, the strokes (screen drawings), the cropped paper photo (paper drawings), title, day made, lesson, "kept" marker | Files in the app's documents folder (`keepsakes/`) + the store | `src/services/media.ts`, `src/services/keepsakes.ts` |
| Progress: drawing days, rest days/weeks, best run, lessons done, stickers, ranks; a per-artist "safety journal" of days | AsyncStorage | `src/domain/days.ts`, `src/store/journal.ts` |
| The proud pile (starred drawings + the product the child imagined) | AsyncStorage | `src/keepsake/Proud.tsx`, `src/grownups/ProudPile.tsx` |
| **Family birthdays and special days** (a first name, optional relation, kind birthday/other, month, day) for people who are not artists, e.g. a grandparent. **M5 resolved (10 Nov):** they stay on the phone **unless** the grown-up ticks the `birthdays` sync choice, which makes them one list with the website's family calendar (PA-44) [verified]. Today's build never sends them | AsyncStorage | `src/domain/family.ts`, `src/grownups/Sections.tsx`, `src/services/reminders.ts` |
| Settings (reminders, crash-report opt-in, weekly runs on/off, read aloud, haptics); **[verified]** the sync choices as read from the website | AsyncStorage | `src/store/app.ts` |
| When linked: the family's display name, linked children (id, first name, birthday), number of orders, "what's been sent"; **[verified]** the sync queue | AsyncStorage | `src/services/sync.ts`, `src/services/linking.ts` |
| The grown-up PIN (salted SHA-256), the website key ("token"), a link in progress | Keychain / Keystore via `expo-secure-store` (token: `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`; PIN: `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so neither travels in a backup). Cleared on the first launch after an iOS reinstall. | `src/services/snickerdoodle/token.ts`, `src/services/grownup.ts`, `src/services/install.ts` |
| Local error log: last 50 problems, **scrubbed** of names, titles, dates, tokens, emails and ids before writing | AsyncStorage | `src/services/errors/log.ts`, `scrub.ts` |
| **Android home-screen widget snapshot**: each artist's first name, recent drawing days, and up to 8 latest drawing thumbnails | AsyncStorage (`snickerdoodle-widget-v2`), drawn by the launcher | `src/widget/snapshot.ts`, `sync.android.tsx`, `DrawingDaysWidget.tsx` |

**Nothing comes back from the website.** The app receives no keepsake pictures from the website (founder, 10 Nov 2026:
"website keepsakes do NOT come back into the app"). Verified for today's build: no `/api/app/v1` route returns an image
or a signed URL, and the app's `removeBackground` client call has no website route.

Permissions (`app.json`): camera and photo picking (paper drawings), add-only Photos access (save a copy, asked at the
moment of saving), notifications (local reminders), Face ID. **Blocked:** microphone (`RECORD_AUDIO`, and
`microphonePermission: false`), advertising ID (`AD_ID`), media reading, media location. No location, no contacts, no
push token (no `getExpoPushTokenAsync` anywhere — verified).

**Phone backups: allowed (founder, 10 Nov 2026).** The app sets no backup exclusion: `app.json` has no `allowBackup`, and
no iOS exclusion flag was found. So the family's own Google or iCloud backup, if on, includes the app's data: drawings,
names, birthdays, progress **[platform default — inferred, not tested on a device]**. That backup sits in the
**parent's own Google/Apple account**, under their sign-in and the platform's encryption. It is the family's
arrangement with Google/Apple, not ours: no data reaches us, and Google/Apple are not our processors for it. Neither the
website key nor the PIN is included: both are device-only secure-store items, so a restored phone has to be linked again.
The draft app notice already says so (§2).

### 2.2 What leaves the phone, and when

| # | Processing activity | When | What goes, to whom | Code |
|---|---|---|---|---|
| **PA-28** | **Update checks (EAS Update)** | **Always**, a few seconds after launch and on return after 6 h | To **Expo** (650 Industries, Inc., USA) at `u.expo.dev`: IP address, platform, runtime version, channel, ids of updates already held, and **`EAS-Client-ID`** (a random per-install id Expo uses to count monthly devices). No names, drawings or account data. Downloads new app code. | `app.json` `updates`; `src/services/updates.ts`; `docs/store/data-safety.md` |
| **PA-29** | **Crash reports (Sentry)** | Only if a grown-up switches them on, **and** only once a Sentry key is added. `extra.sentryDsn` is **empty today**, so nothing is sent | Error, stack (code locations), screen names, OS name/version, app version, language, **age band** (little/young/big), on iOS "iPhone"/"iPad". User, IP, request, device name/model, locale, time zone, extras and breadcrumbs other than ours are stripped on the phone (`beforeSend`). Native crashes bypass `beforeSend` (server-side scrubbing needed). | `src/services/errors/crash.ts`, `privacy.ts`; `docs/RELIABILITY.md` |
| **PA-30** | **"Report a problem"** | Only when a grown-up taps send | The scrubbed local log, once (Sentry when set up; otherwise the phone's share sheet, to wherever the grown-up chooses) | `src/services/errors/crash.ts` `sendProblemReport`; `src/grownups/Problems.tsx` |
| **PA-31** | **Linking (PKCE)**, from the app or from the website | A grown-up starts it in the gated corner, or from the website's account page (both pass through `/app/connect`) | System sign-in browser to `snickerdoodle.co.uk/app/connect` (S256 challenge + state). The grown-up signs in by magic link, confirms which children, and **makes the sync choices (PA-41)**. A 2-minute single-use code comes back, and the app swaps it for a 256-bit key. **The family's owner only.** | App: `src/services/linking.ts`, `pkce.ts`, `token.ts`. Website: `src/server/app/link.ts`, `src/app/app/connect/*`, `src/app/app/callback/page.tsx`, `src/app/api/app/v1/token/*` |
| **PA-41** *(new, verified)* | **Sync choices** | Set freely on the connect page at first linking. Changed later **either way on the website's account page**; in the app's corner (behind the gate, `PATCH /me/sync`) **only narrowed or stopped**. Widening from the app gets 403 `widen-on-website`, and the app links to the account page (founder, 10 Nov) | Stored **per app link**: `{ keepsakes: none \| proud \| all, children: bool, progress: bool, birthdays: bool, chosenAt }`. Audit event (consent-change) on set and on every change. **Nothing pre-selected**; "connect" stays disabled until a keepsakes option is picked. Returned to the app as `sync` on `GET /me`. | Website: `feat/draw-sync-choices` (in progress). App: `feat/sync-choices` (in progress) |
| **PA-32** | **Children: matching, and names/birthdays sync** | Matching: always while linked. Name/birthday sync: **only if "first names and birthdays" is ticked** [verified] | **Always:** children's ids and first names, so a Draw artist can be matched to a website child (keepsakes need a child to file under). Today's `GET /me` also sends the **full birthday**. **A-55 (being built on `feat/draw-sync-choices`)** drops birthdays from `/me` when `children` is off. **When ticked:** renames and birthday edits from the app (`PATCH /children/{id}`, otherwise 403 `sync-off`), and the website's offered to the app. Adding a child (`POST /children`, screened, surname refused) stays possible for matching **[verified]**. Order count (`GET /orders`: ref, day, status only). | App: `src/services/sync.ts`. Website: `src/server/app/api.ts` `getAppMe`, `addAppChild`, `updateAppChild`, `listAppOrders` |
| **PA-33** | **Keeping one drawing ("keep it", `trigger: manual`)** | A grown-up taps keep it (or make it real / share a ready-to-buy link, which keep first) on one drawing in the gated corner. Allowed **whatever the keepsakes choice** | One PNG (print size, 3000 px wide; for paper drawings, the cleaned-up crop), the website child id, title (**not stored** by the website), the day made (`madeOn`), `source` (`app-screen`/`app-paper`), `trigger: manual` (the default, for older app versions). **Off until both upload switches are on.** | App: `src/services/keepsakes.ts` `keepDrawing`. Website: `src/app/api/app/v1/assets/route.ts`, `src/server/app/api.ts` `keepAppDrawing` |
| **PA-42** *(new, verified)* | **Automatic keepsake sync (`trigger: auto`)** | **keepsakes = all:** every newly saved drawing is queued. **keepsakes = proud:** a drawing is queued as soon as it is starred into the proud pile, **including by the child** ("i'm proud of this one" on the keeper screen). The founder decided this on 10 Nov; see R-41. **No notification email** is sent for automatic uploads (founder, 10 Nov). The queue uploads when linked, the artist is matched, the network is up and uploads are allowed. Choosing proud/all later **offers** (doesn't force) to send earlier drawings | The same payload as PA-33 with `trigger: auto`. The website accepts `auto` **only** when the link's keepsakes choice is proud or all (otherwise 403 `sync-off`). Retries with backoff; never uploads a drawing twice (`kept` marker); holds drawings for unmatched artists; pauses when unlinked or switched to none. Same ingest pipeline, still OFF unless `DRAW_APP_UPLOADS=on` | Website: `feat/draw-sync-choices`. App: `feat/sync-choices` |
| **PA-34** | **Screening of app uploads** | Every upload, manual or auto | Exactly the website pipeline (PA-03 / D25 / D26). See §2.3 | `src/server/ingest.ts` → `src/server/moderation/index.ts` |
| **PA-35** | **Make it real** | Grown-up taps make it real | A single-use 15-minute pass for *that keepsake × that product*, opened in the phone's browser. It works only for the **same account, signed in** on the website. Price, basket and payment happen only on the website (Stripe). | App: `makeItReal`. Website: `mintAppCheckoutGrant`, `consumeAppCheckoutGrant`, `src/app/app/checkout/[pass]/*` |
| **PA-36** | **Share a ready-to-buy link** | Grown-up taps share | The website's own gift link for one kept, **cleared** app drawing × one product (14 days, revocable, owner-only), shared through the phone's share sheet with the message "{name} drew this. it could be made real:" | App: `shareWish`. Website: `mintAppWish` → `createGiftLink` |
| **PA-37** | **Deleting from the keepsake box** | Grown-up taps remove in "what's been sent" | `DELETE /assets/{id}` → the website's real cascading delete (bytes, rows, passes). Only for drawings **the app sent**, in the key's family; refused while an order needs it. **One at a time today.** A bulk "remove everything Draw sent" (A-48) is **being built** on `feat/draw-sync-choices` [verified] | App: `deleteKept`. Website: `deleteAppAsset` → `deleteAsset` |
| **PA-40** *(changed)* | **Drawing-days backup** | **Only if "drawing days" is ticked** (otherwise `PUT/GET` 403 `sync-off`) [verified]. Today the website refuses all backups (403 "not-yet") | Per matched child: drawing days (dates), rest weeks (ISO weeks), best run, lesson ids + first-done date, weekly-runs on/off. **No pictures, no times finer than a day.** Merge-only: neither copy shrinks | Website today: `src/app/api/app/v1/artists/[childId]/progress/route.ts` (403); `feat/draw-sync-choices`. App: `src/services/sync.ts` `backupFor`, `backupProgress`; `feat/sync-choices` |
| **PA-44** *(new, verified)* | **Family birthdays sync (`birthdays`)** | **Only if "family birthdays and special days" is ticked** (unticked by default). Otherwise all occasions calls get 403 `sync-off` | **Two-way.** `GET /api/app/v1/occasions` returns the family calendar's dates `[{ id, name, relation?, kind: birthday \| other, month, day, updatedAt }]`: first names only, **month/day only** (no years for relatives, even if the website stores one). `POST` / `PATCH /occasions/:id` / `DELETE /occasions/:id` push the app's own adds, edits and deletes. Names must be **a single first name**, screened by the website's first-name rule (`screenChildFirstName`). The relation is at most 30 characters and screened. **Lunar dates are not sent.** Dates tied to a child go **only for children the phone covers**. Dates tied to a family member (e.g. a grandparent who is a member) do go, so members' first names reach the phone. The app keeps a local↔website id map, and the **last change wins** by `updatedAt`. The website stores them in its **family calendar** (`occasions`, see `DPIA-addendum-family-calendar.md`), where members who see the calendar can see them, and consenting members' reminder emails include them. Turning `birthdays` off stops syncing and deletes nothing | Website: `src/server/app/occasions.ts`, `src/app/api/app/v1/occasions/*`, `src/server/occasions/index.ts`. App: `src/domain/occasionSync.ts`, `src/services/sync.ts` `syncOccasions`, `src/grownups/Sections.tsx` |
| **PA-38** | **Unlinking / key revocation** | Grown-up unlinks/disconnects (app or website account page), or automatically on member removal, account closure, family handover, losing owner status, or 90 days unused | Key revoked at once and audited (`APP_UNLINKED` + reason). **All syncing stops immediately.** The phone forgets its key and keeps everything local. Keepsake-box copies and any drawing-days backup **stay** on the website. **Stopping a sync, or choosing none, deletes nothing** (brief). | Website: `revokeAppTokens` (called from `members.ts`, `accountClosure.ts`, `appAuth.ts`); app: `unlink()`, `guard()` 401 handling |
| **PA-39** | **Link leftovers purge** | Daily retention job | Used/expired link codes and checkout passes after 1 day; keys revoked (or idle past 90 days) after a further 30 days. The audit trail keeps the history. **[verified — see §0b]** what happens to the stored sync choices and the drawing-days backup when the link row is purged (A-52). | `purgeAppLinkLeftovers` in `src/server/jobs/retentionRun.ts` |

**Also leaves the phone, but not to us:** "save the drawing" adds a copy to the phone's Photos (then the family's photo
cloud, if on); the family's own phone backup (§2.1); the "hand-off" opens `snickerdoodle.co.uk/start-creating?for=<product>&from=draw`
(no ids); the privacy link opens our page in the browser; the device's own text-to-speech engine reads fixed app lines
when no recording exists (`src/services/feedback.ts`; no names are spoken — call sites checked).

**Not done (verified for today's build):** no analytics or advertising SDK (dependency list checked; the `kids-category`
test is described in the app's own report but was not run here); no in-app purchases; no prices anywhere
(`listAppProducts` returns `{key,label,blurb}` only); no push notifications from a server; no microphone; fonts and
narration are bundled in the app (no font CDN); no web views in the child's room; no website pictures sent to the app.
The website receives nothing about stars, sessions, lessons or narration beyond what a tick sends.

### 2.3 How app uploads are screened and stored — same pipeline as the website (verified for manual; brief says unchanged for auto)

`keepAppDrawing` (`src/server/app/api.ts`) calls the same `ingestOriginalAsset` (`src/server/ingest.ts`) as the website's
member upload:

- **authz:** the key's account must still be the family's ACTIVE owner (`requireAppViewer`, checked on every call). The child must
  be one the key covers and in the key's family. Ingest then checks `canContributeCreations` and the family again.
  The controller is the child's controlling parent (`children.controllerAccountId`).
- **EXIF/GPS stripped** by re-encoding before the bytes are written (`stripExif`). PNG/JPEG only, ≤ 20 MB, rate-limited
  per account (`LIMITS.homeUploadPerAccount`). That limit was sized for one-off keeps; whether it suits "all drawings" is A-49.
- **Private S3 bucket**, originals under their own KMS key (as D18; `putObject`), write-once ORIGINAL record.
- **Visibility FAMILY** (never Extended, never public), `keptInHome: true`, `purgeAfter: null`.
- **Screening (D8/D25/D26):** `moderateAndRecord` with background screening. The hash step runs at upload (deferred under
  D25 until IWF). The Rekognition classifier **and** the words-in-the-picture check (DetectText + Textract, London) run
  after the response. In production, if screening isn't configured, every upload is held. Until cleared, the keepsake is
  **PENDING**: only the uploader/controller sees it, it can't be ordered, and a gift link refuses it (`createGiftLink`
  screens on the spot and takes CLEAR only). Flags go to the review queue and are never auto-rejected. The app's answer
  never says "flagged".
- **Signed URLs:** the app gets none, and none are planned (no website keepsakes in the app).

**Gaps:** (a) no app-specific test that a PENDING/FLAGGED app upload cannot become a wish or reach an order — **A-37**;
(b) `mintAppCheckoutGrant` refuses only BLOCKED, so a pass can be minted for a PENDING/FLAGGED drawing. The order path
still screens and refuses it (D26), so this is not a leak; note only; (c) the `trigger` field and the `sync-off` gates
aren't built or tested yet — **A-47**.

### 2.4 Data-flow picture

```
 THE PHONE (child's room + gated grown-ups' corner)                 OUR SIDE
 ─────────────────────────────────────────────────                  ─────────────────────────────────────────
 drawings · names · birthdays · family birthdays ·
 progress · proud pile · settings · error log · sync queue
 (app storage; Android widget shows names + thumbs;
  family's own Google/iCloud backup if on)
        │
        │  ALWAYS: update check (IP, EAS-Client-ID, versions) ───▶  Expo (USA)  ── new app code ──▶ phone
        │  OPT-IN: crash report / "report a problem" ────────────▶  Sentry (not set up yet; region tbc)
        │
        │  only after a grown-up links (from app or website, via /app/connect):
        ├── link (PKCE) + SYNC CHOICES (nothing pre-ticked) ─────▶  snickerdoodle.co.uk (AWS London)
        │◀─ key (256-bit, stored hashed) + sync {keepsakes,        app_tokens · sync choices · audit
        │    children, progress, birthdays}                          (APP_LINKED, consent-change)
        │◀─ GET /me: family name, children for matching
        │    (app can only NARROW/STOP a choice; widening ──────────▶  account page on the website only)
        │
        ├── keepsakes = none: only a grown-up's one-off keep it ─▶  ingest (trigger manual)
        ├── keepsakes = proud: each starred drawing — the child's ▶  ingest (trigger auto)
        │                      star is enough (queued)
        ├── keepsakes = all:   EVERY saved drawing (queued) ─────▶  ingest (trigger auto)
        │                         ingest: EXIF strip → private S3 (KMS) → FAMILY, kept → PENDING →
        │                         classifier + words check (London) → CLEAR (family sees) / FLAGGED (review)
        ├── children ticked: renames / birthdays ⇄ ──────────────▶  children (screened, no surname)
        ├── progress ticked: drawing days, lessons (dates only) ─▶  drawing-days backup
        ├── birthdays ticked: relatives' first names + month/day ⇄ ▶  family calendar (occasions; members who
        │                                                            see the calendar; reminder emails)
        ├── make it real: 15-min pass ──▶ phone's browser ───────▶  website maker → sign-in → Stripe checkout
        ├── share link: gift link URL ──▶ share sheet ───────────▶  whoever the grown-up sends it to (14 days)
        ├── DELETE /assets/{id}; "remove everything Draw sent" ──▶  cascading delete (bulk: being built)
        └── unlink / disconnect / choose none ───────────────────▶  syncing stops; NOTHING is deleted
                                                                     ✗ no keepsake pictures come back
                                                                     ✗ no emails about synced drawings
```

### 2.5 Scope, context, purposes

- **Data subjects:** children using the app (3–12); the grown-up who links (family owner); **relatives and other
  third-party adults** whose first names and birthdays a grown-up types into the app. These stay on the phone unless
  `birthdays` is ticked; if ticked, they join the website's family calendar, and the website calendar's dates (which may
  have been added by others) come to the phone.
- **Volume:** pre-launch. With **none**, a handful of picked drawings. With **proud**, the starred ones. With **all**, every
  saved drawing: an active child could send **hundreds a year** (the API plan estimated ~365 a year at one a day). Each one
  is screened, stored and kept until deleted.
- **Geography:** **UK only** at launch on both app stores (founder, 10 Nov 2026).
- **Context:** the device may be the child's own tablet, a shared family tablet, or a parent's phone handed over. The
  grown-up gate is press-and-hold, then the phone's own unlock (Face ID / fingerprint / passcode), or a 4-digit PIN on
  a phone with no lock. It re-locks after 2 minutes idle and when the app goes to the background (`src/ui/Gate.tsx`,
  `src/services/grownup.ts`). **On a device the child can unlock themselves, the gate does not stop the child** (R-23).
  Sync choices can be **widened only on the website** (owner sign-in); behind the gate the app can only narrow or stop.
- **Purposes:** (1) let a child draw and learn, offline, on the device; (2) keep the family's drawings in its private
  keepsake box, in the way the grown-up chose; (3) keep names/birthdays and drawing days in step if the grown-up chose to;
  (4) let a grown-up make one real or share a ready-to-buy link via the website; (5) keep the app working and fixed
  (updates, opt-in crash reports); (6) keep the service safe (screening).

---

## 3. Data inventory additions (Art 30 view)

| Data | Whose | Where | Retention — as built / *[verified]* | Lawful basis (proposed) |
|---|---|---|---|---|
| On-device app data (§2.1) | Child; grown-up; third-party adults (family birthdays) | The family's device (and the family's own phone backup) | Until the grown-up deletes it in the corner, deletes everything, or uninstalls; backups per the family's Google/Apple settings | **We do not receive it.** Drafting view: the family processes it on their own device with software we supply, so we are arguably not its controller. We design as though the Code applies anyway **[OQ-1b]** |
| Update-check data (IP, EAS-Client-ID, versions) | Device user (often a child) | Expo (USA) | Expo's own retention **[to confirm with Expo]** | **LI** (delivering security fixes and the app the family installed). PECR reg 6 (the install id stored on and read from the device): exemption to confirm **[OQ-21]** |
| Crash reports | Device user | Sentry (when set up) | Shortest the plan allows; the draft notice has "[number] days" to fill | **Consent** of a grown-up, given behind the gate **[OQ-22]** |
| App token (hash), device label ("an android phone or tablet"), linked/last-used/revoked dates, child scope | Grown-up (owner) | `app_tokens` (website DB) | Deleted 30 days after revocation / idle expiry (`purgeAppLinkLeftovers`). The audit keeps `APP_LINKED/UNLINKED` | **Contract** (the link the grown-up asked for); LI (security) |
| **Sync choices** + their change history *[verified]* | Grown-up (owner) | Per app link (website DB); audit (consent-change) | With the link; audit per the audit schedule (A-24) | **Contract**: a setting of the service the parent chose. Audited as evidence of the parent's choice |
| Link codes, checkout passes (hashes) | Grown-up | `app_auth_codes`, `app_checkout_grants` | Purged 1 day after expiry | Contract |
| Kept app drawings (originals, derivatives) + `source`, `madeOn`, `trigger` | Child (subject); grown-up | Private S3 + `assets` | **Kept until the grown-up deletes** (one at a time today), or account closure. Not purged after 30 days: keeping was the grown-up's choice, made once for all future drawings when keepsakes = all. **Stopping sync deletes nothing** | **Contract** with the parent, as D10; the child-is-not-a-party point stands **[OQ-8]**. Proportionality of "all" → §7 |
| **Drawing-days backup** *[verified]* | Child | Website DB (per child) | **[to define]**: stays after the choice is switched off (brief); must go with the child / account closure / export (A-52) | **Contract** (the backup the parent ticked). Behavioural data about a child: kept to dates and lesson ids |
| Children's first names / birthdays synced from the app | Child | `children` | As website children rows (see DPIA R-09/A-15) | Contract |
| **Family birthdays / special days synced** *[verified]* (first name, optional relation, kind, month, day) | **Relatives and other third-party adults** (non-users) | Website `occasions` (family calendar) ⇄ the phone | Until deleted on either side (last change wins) or the family is deleted (cascade, as the calendar addendum); turning `birthdays` off keeps both copies | **LI** of the parent (keeping the family's important dates in one list) and of us (providing it), as in `DPIA-addendum-family-calendar.md` for occasions about non-users. Balanced by: first name + month/day only, no contact details or pictures, family-only visibility, the parent's active tick. The parent's own typing on the phone is household processing; **once it reaches our server, we process it as controller** |
| Screening verdicts on app drawings | Child / uploader | `assets.moderation_*`, audit | As website (PA-03) | LI / LO (as PA-03) |

---

## 4. Lawful basis notes

- **Linking, keeping and syncing (PA-31–PA-37, PA-40–PA-42):** the same basis as a website upload: **Contract** with the
  parent (D10). The grown-up acts through the website's sign-in or the gated corner. The sync choice is a **standing
  instruction from the parent** about the service, not a consent in the Art 6(1)(a) sense. It must still meet the same
  fairness bar: freely chosen, nothing pre-ticked, clear about what it sends, and easy to change (A-46). The app never
  relies on a child's consent, no account is offered to a child, and only the family's owner can link.
- **"All drawings" and necessity:** Contract covers processing *necessary* for the service the parent asked for. If a
  parent asks for every drawing to be kept, keeping every drawing is the service, so the basis holds. **The proportionality
  burden moves to the design**: the choice must be informed, reversible, and backed by easy bulk deletion (§7, R-39).
- **"Proud" sent by the child's star (founder, 10 Nov 2026):** the authorisation is the **parent's standing choice of
  "proud" at linking**, not the child's tap. The child's star only says which drawing. So the slate must say plainly
  that in proud mode *your child's stars send drawings to the keepsake box* (A-46). No child's consent is relied on.
- **Family birthdays (PA-44):** relatives' data, held by the parent. On the phone it is household-adjacent (the
  family's own list). On our server it is ours to justify: **legitimate interests** (as the family-calendar
  addendum), with minimisation (first name, month/day), family-only visibility and the parent's tick. **Art 14**
  (informing relatives we hold their name and birthday): the drafting view is that telling each relative directly is
  disproportionate (Art 14(5)(b)), given the minimal data and that it is visible only inside the family. The privacy
  notice must say it **[OQ-26]**. Free-text names or "other" special days could reveal special-category information
  (e.g. a religious day or a memorial). Treat as R-CAL-1: purpose-limited, never used for marketing or segmentation.
- **Update checks (PA-28):** **legitimate interests.** Keeping an app used by children working and secure is in the
  child's interest too; the data is minimal and not linked to anyone. Balancing note: it happens on every launch, to a
  US processor, about a device a child uses. PECR reg 6 and the DUAA 2025 exceptions are still a question **[OQ-21]**.
- **Crash reports (PA-29/30):** **consent** of a grown-up, off by default, withdrawable in the corner **[OQ-22]**.
- **Screening of app uploads (PA-34):** LI (and LO where OSA duties apply), exactly as PA-03.
- **Children's Code scope:** **decided (founder, 10 Nov 2026)**: the app and the website are both fully in scope. See
  Part C §C.A.

---

## 5. Processors and transfers — additions

| Processor | Role / data | Location | Status | DPA / transfer | Notes |
|---|---|---|---|---|---|
| **Expo (650 Industries, Inc.)**: EAS Update, EAS Build | Update checks from every install (IP, EAS-Client-ID); hosts the app's code bundles | USA **[inferred: Expo's hosting region not verified]** | **Live in every build with updates on** (store builds included) | **Not in `PROCESSORS.md`.** DPA status unknown: **to confirm** Expo's DPA is accepted for the `zerogeometry` account. Transfer basis (DPF / IDTA / UK Addendum) **to confirm**; add to the LG3 record | Processing exists today, whatever the uploads switch says (A-35) |
| **Sentry (Functional Software, Inc.)** | Opt-in crash reports | US by default; an EU data region exists **[inferred — confirm when creating the project]** | **Not set up** (`sentryDsn` empty) | Not in `PROCESSORS.md`; DPA + region + transfer needed **before** a DSN is added | Turn on "prevent storing IP", data scrubbers, advanced scrubbing of device fields, shortest retention (A-36) |
| AWS (existing) | App uploads join existing storage + screening (Rekognition, Textract, London) | UK | As DPIA §5 | As DPIA §5 | **"All drawings" raises Rekognition/Textract call volume and cost** (A-49) |
| Apple / Google | App distribution; the platform's own TTS, **family backups**, Photos | — | — | Not our processors: the family's own platform accounts **[drafting view]** | Store forms must match the app (A-28) |

---

## 6. Consultation

- **Parents:** none recorded for the app. The app's own checklist recommends a 10-minute session with real children
  (3–5 and 8–10) and real-phone tests (`docs/LAUNCH_CHECKLIST.md` §3). **Add:** show 3–5 parents the sync slate and ask
  what they think "all drawings" sends and what "stop" does (A-46). Record findings here.
- **Children:** not consulted directly; their interests are weighed in Part C (std 1).
- **DP professional:** none. The founder signs as controller, as for LG1–LG3. Record any later professional review here.

---

## 7. Necessity and proportionality

| Principle | Assessment |
|---|---|
| Lawfulness, fairness, transparency | Bases in §4. **Gaps:** the app's privacy notice is an unpublished draft (untracked), says linking is "coming soon", and has placeholders ([date], "[number] days", ICO number), yet the app links to it from the corner (`src/grownups/Sections.tsx:332`). The website notice doesn't mention the app. The store privacy forms describe the no-linking release (`docs/store/data-safety.md`). The connect screen's "can" list omits several things the key can do. The sync slate's wording isn't written yet (A-26–A-29, A-46). |
| Purpose limitation | Drawings are sent only to be kept, made or shared in the family's own box. No training, no profiling. Product conversion is measured on the server from `assets.source`, never by tracking the child (partition §7). ✔ |
| Minimisation | Strong: the title is dropped; no email goes to the phone; no member list; no keepsake reads; **no pictures back to the app**; first name only; no prices; paper crop only; names/birthdays and drawing days only if ticked. **Weaker with "all":** every drawing goes, including scribbles, half-finished ones and paper photos that may catch a room or a face. That is more children's images than the purpose strictly needs, justified only because the parent chose it (R-39). `GET /me` sends the full birthday even when `children` is off: A-55, being built, removes that. Family birthdays go as first name + month/day only, never years (PA-44). |
| Accuracy | Website is the source of truth for names once linked and `children` is on; matching is never automatic (`app/grown-ups/match.tsx` per the app report). |
| Storage limitation | Kept drawings stay until deleted (the grown-up's choice). With "all", that is an open-ended archive that grows by itself. **Stopping deletes nothing** (brief), and today deletion is one drawing at a time. A bulk "remove everything Draw sent" (A-48, **being built**) and a quiet in-app/account-page count of what's been sent (A-51; **not** an email, since the founder ruled out notification emails) are needed for this to be proportionate. Make it real / share keep first (as OQ-9). Tokens/codes/passes purged (PA-39). |
| Integrity & confidentiality | PKCE S256 + exact redirect allow-list + single-use 2-minute codes; 256-bit keys stored as SHA-256; per-call owner re-check; revocation on removal/closure/handover; no CORS, `no-store`, `noindex`; secure store on the phone; token scrubbed from logs. **Gap:** EAS Updates are not code-signed (no `codeSigningCertificate` in `app.json`), so the Expo account is effectively a key to every child's device (R-31). |
| Data-subject rights | Website export includes linked devices (`exportData.ts`); account closure revokes keys and deletes box copies; per-drawing delete from the app. **To add:** export/erasure of sync choices and the drawing-days backup (A-52); bulk delete (A-48). The phone's own data is deleted on the phone (we can't reach it). |
| Could we do it with less? | Yes: none/proud cover most families; "all" could hold back blank or very small drawings (the app already skips blank screen drawings — `isBlank` in `keepsakes.ts`); send day+month(+year only if needed); let the grown-up hide pictures on the widget; prefer on-device voices. |

---

## 8. Risk register additions

Scoring as in the DPIA: **Likelihood** Remote / Possible / Probable × **Severity** Minimal / Significant / Severe.

| ID | Risk to individuals | L | S | Inherent | Mitigations (file refs; [verified] = being built) | Residual | To reach target |
|---|---|---|---|---|---|---|---|
| **R-21** | **Home-screen widget shows children's drawings and first names** to anyone who sees the device (visitors, school, screen-sharing, a lost phone's home screen) | Possible | Significant | Medium | Android only; the user adds it from the launcher (not automatic); shows first name + up to 8 latest thumbnails + the week, no birthdays or surnames; data comes from the phone itself, never the website; weekly runs hidden when the grown-up switches them off (`src/widget/*`) | **Low–Medium**: no grown-up setting to hide pictures or names; a child can add it; **[inferred]** some Android tablets can show widgets on the lock screen | A-33 → Low |
| **R-22** | **Device lost or stolen**: the family's drawings, names, birthdays and family birthdays; the website key | Possible | Significant | Medium | App sandbox + device encryption; key in Keychain/Keystore, this-device-only (not in backups); the key cannot read keepsake images, members or emails, and **no keepsakes come back to the app**, so the box isn't exposed through the phone; `/me` = family name + children for matching; the owner can revoke from the website's account page ("linked phones", `listLinkedDevices`); 90-day idle expiry. **Phone backups allowed (founder, 10 Nov)**: the family's drawings and progress survive a lost phone in the **parent's own Google/iCloud account**, and with keepsakes = proud/all the chosen drawings are already in the box | **Low** (lower than v0.1: loss of the drawings themselves is now unlikely). A finder who can unlock the phone can pass the gate and use the key until revoked: upload, change sync choices, share a link for app-sent drawings | A-32 (PIN option); tell owners how to revoke (A-26) |
| **R-23** | **A child (or another person) gets through the grown-up gate**, especially on the child's own or a shared tablet where the child knows the passcode or has a fingerprint enrolled, or by guessing a 4-digit PIN | **Probable** (on child-unlockable devices) | Significant | **High** | Press-and-hold + phone unlock or PIN; PIN 5 tries then 30 s pause; re-lock after 2 min idle and on background; no badges on the corner; **the real gate for money is the website**: the checkout pass works only for the same account signed in (`consumeAppCheckoutGrant`), card entry on Stripe | **Medium** (the sync part is now mitigated): **widening is website-only (founder, 10 Nov)**, so through the app's gate a child can only *narrow or stop* sync, never switch it to "all" (403 `widen-on-website`) [verified]. A child through the gate can still keep drawings, **share a ready-to-buy link through any messaging app**, unlink, delete, and change settings. The "turn this on from your account" link opens the website. If the parent is already signed in in that tablet's browser, a child could widen there **[inferred]**, and a saved wallet makes the checkout gate thinner too | A-31, A-32; A-50 decided (website-only widening); consider asking for a fresh sign-in before widening on the account page (A-63) → Low–Medium. **[OQ-24]** |
| **R-24** | **Link key or code intercepted or misused** (another app claims the custom scheme on iOS; a leaked token; standing family access on a child's device) | Remote | Significant | Low–Medium | PKCE S256 only, state, exact redirect allow-list, 2-minute single-use code burned before checks; Android verified App Link (when the fingerprint setting is filled); 256-bit key, prefixed, hashed at rest; narrow scope (one family, ticked children, app-sent assets only, no picture reads); owner re-checked on every call, revoked on loss of ownership; audit; `Bearer` and token patterns scrubbed from logs; tests (`src/server/__tests__/drawAppLink.int.test.ts`, `src/server/app/__tests__/link.test.ts`) | **Low**: idle expiry only (no absolute lifetime); `DRAW_ANDROID_CERT_SHA256` / `DRAW_APPLE_TEAM_ID` aren't in the env template, so App Links may not verify until set | A-39 → Low |
| **R-25** | **Real children's drawings uploaded to the website**: a new stream of children's images into storage, visible to the family circle, giftable, exposed in a breach | Possible | Significant | Medium | Same ingest as the website (§2.3, verified): EXIF strip, private S3 + KMS, **FAMILY default** (never Extended or public), child's parent as controller, held hidden until cleared (D26); title not stored; uploads only per the grown-up's choice | **Low–Medium** (inherits website R-01/R-03): neither the keep-it copy nor the slate yet says **the family circle on snickerdoodle sees them** once checked | A-26/A-29/A-46 wording → Low |
| **R-26** | **Moderation of app uploads**: a harmful picture (e.g. a photo of a child taken in paper mode, abusive words) reaches the family, a gift link or print; or an innocent drawing is silently binned; or a person views a child's picture | Possible | Severe | **High** | The website pipeline in full (PA-34, D8/D25/D26): classifier + words check (printed and handwriting) before anything else; PENDING hidden + unorderable + not giftable; checkout and gift-link creation screen on the spot; flags go to review, never auto-rejected; with the hash check deferred, sensitive/unknown flags are remove-only; the app never shows "flagged" to a child | **Medium**: inherits D25 (known-CSAM hash check deferred until IWF); no app-specific test of the upload → wish/order guarantee | A-37; IWF per D25 → Low–Medium |
| **R-27** | **Deletion and retention don't match what the grown-up expects** across phone and website: deleting on the phone ≠ deleting from the box; unlinking or stopping sync leaves box copies; closing the website account can't wipe the phone | **Probable** (now that stopping a sync deletes nothing) | Significant | **Medium–High** | Plain copy at each point, verified: delete on phone keeps the box copy (`keepsake.forGoodKept`), unlink (`account.unlinkText`), delete everything (`privacy.deleteText`), remove artist when linked (`artists.removeTextLinked`), remove from box (`privacy.removeText`); real cascading `DELETE`; "what's been sent" list; account closure deletes box copies and revokes keys; the brief requires saying "stopping doesn't delete" | **Medium**: after "all", removal is one drawing at a time; after unlinking, "what's been sent" can't delete at all (the website must be used) | A-48 (bulk remove), A-51, A-26 → Low |
| **R-28** | **Marketing to children**: product previews in the child's room ("what could it become?") pressure a child to ask for a purchase (CAP Code s.5; Code std 5) | Possible | Significant | Medium | M3: previews only, one tap after the frame, never automatic; **no prices anywhere**; no buy/basket/order/checkout/shop/price/unlock words in child copy (test per the app report); "make it real" in the child's room only hands over; milestones in-app only, no purchase condition (2026-11-02); **the child's room never shows sync** (brief) | **Low–Medium**: previews are still product images shown to a child | Keep the banned-words test as a release gate; **[OQ-23]** |
| **R-29** | **Engagement nudges** extend a child's use or cause worry: weekly runs and their stars, the widget's "draw this week", the daily "Drawing time" reminder, welcome-back greetings, birthday/milestone video moments | Possible | Significant | Medium | Weekly not daily; one missed week in four is a rest week; best run kept forever; totals only go up; no countdowns or loss warnings; grown-up off switch for runs (app + widget); reminders **off by default**, set by a grown-up, never mention streaks or products; no badges on the corner | **Low–Medium**: on a child's own tablet the daily reminder is in effect **a notification to a child** | A-34 → Low |
| **R-30** | **Narration / voice**: recording children, or sending what's spoken to a cloud voice | Remote | Minimal | Low | Microphone blocked; recorded narration bundled in the app; device TTS only for fixed app text (no names) | **Low**: the voice picker boosts voices labelled "online/neural" (`src/narration/voices.ts`), which on some devices are cloud voices **[inferred]** | A-42 (optional) |
| **R-31** | **Over-the-air updates (Expo)**: (a) every launch sends IP + a persistent install id about a child's device to a US supplier; (b) an update can change what the app collects or sends with no store review, including the upload switches and the sync queue's behaviour; a compromised Expo account could push code to every family | (a) Probable / (b) Remote | (a) Minimal / (b) Severe | Medium | No personal content in checks; id random, not linked to a person; disclosed in the draft notice; channels separated; the founder approves each production OTA; fingerprint runtime policy; **the website enforces the sync choices server-side** (`auto` refused unless proud/all), so a buggy or hostile app can't widen the choice on its own | **Medium**: no Expo DPA/transfer record; **updates not code-signed**; 2FA not recorded | A-35 → Low |
| **R-32** | **Crash and error logs carry personal data** | Possible | Significant | Medium | Local log scrubbed before writing; Sentry opt-in by a grown-up, off by default, impossible until a DSN exists; on-phone allow-list (`privacy.ts`) | **Low**: native crashes bypass `beforeSend`; Sentry region, IP setting, retention and DPA undecided; the notice over-discloses "device model" | A-36 → Low |
| **R-33** | **Phone backups** copy the child's drawings, names and birthdays to Google/iCloud | Probable | Minimal | Low | **Allowed by the founder (10 Nov 2026)** as the family's own backup in the **parent's Google/Apple account**; disclosed in the draft notice; token and PIN excluded (this-device-only); nothing reaches us | **Low** (accepted) | Keep the notice wording (A-26) |
| **R-34** | **Third-party adults' birthdays typed on a child's device** (M5, **resolved 10 Nov**: a `birthdays` sync choice) | Possible | Minimal | Low | On the phone only unless `birthdays` is ticked; today's build never sends them (no occasions endpoint; `GET /me` returns no `familyBirthdays`, verified); scrubbed from logs | **Low** on the phone. Leaving the phone is covered by R-46–R-48 | A-43 done (decision); see A-60–A-62 |
| **R-35** | **A real drawing reaches a site whose moderation is stubbed** (the test site), via an old or odd build. **Worse with "all"**, which uploads by itself | Remote | Significant | Low | The app sends only generated sample art to the test site (`sampleArtPng`; the brief keeps "sample art only on the test site" for the queue); test-mode banner; D19 | **Low**: the website can't tell sample art from a real drawing | A-44 |
| **R-36** | **Children's names cross as soon as linking is on**, before any drawing does (setting `apiUrl` turns on linking and matching) | Possible | Minimal | Low | Owner-only; ticked children only; screened names; names/birthday **sync** only if ticked [verified]; the phone already held them | **Low**: but it is new processing that starts with the `apiUrl` switch. With names off, only the first name crosses when a child is added from the app (no birthday; B3, confirmed), and the app tells the grown-up "we'll store keepsakes in snickerdoodle under <first name>" (being built in PR #38) | Sign this addendum before `apiUrl` is set; A-55 ✓ |
| **R-37** | **The app promises what isn't true**: today's "back up progress" toggle is shown when linked but the website refuses it (403); the app notice says "coming soon" | Probable | Minimal | Low–Medium | The brief turns the toggle into the real `progress` choice, backed by the website [verified] | **Medium** until the sync branches ship together; **if the app ships first**, the toggle still promises a backup the website refuses | A-30 (ship both sides together, or hide the toggle), A-26 |
| **R-38** | **Children's Code scope inconsistent across the two services** | Probable | Significant | **High** (regulatory) | **Decided (10 Nov 2026): both fully in scope**; the website's argument withdrawn; the website already conformed voluntarily | **Low–Medium**: the website still has Part B gaps to close (Part C §C.A list: `CHILD` invites, notice placeholders, child-facing transparency, reminder subjects). The **pre-ticked calendar share stays by the founder's decision** (accepted residual, A-56) | A-38, A-57–A-59 → Low; A-56 accepted |
| **R-39** *(new)* | **"All drawings" sends a large, open-ended volume of children's images** to our storage, far more than any parent will look at, order or delete; more exposure in a breach; scribbles and paper photos that catch rooms, siblings or faces | **Probable** (for families choosing all) | Significant | **High** | Only if a grown-up **actively chooses** it (nothing pre-selected; connect disabled until a keepsakes option is chosen) [verified]; the same ingest + screening; FAMILY default; private bucket, KMS, signed URLs only after authz; blank screen drawings never saved (`isBlank`); "offer, don't force" for earlier drawings | **Medium**: no volume control or cap; no bulk delete; no periodic reminder of what's kept; the rate limit wasn't sized for it | A-46 (slate wording: say plainly it's every drawing, and suggest proud as the gentle option without pre-selecting it), A-48, A-49, A-51 → Low–Medium |
| **R-40** *(new)* | **Moderation load from automatic uploads**: many more classifier/words checks, more false flags of children's drawings sitting in the review queue, and so more occasions where a person might look at a child's picture; Rekognition/Textract cost | Probable | Significant | Medium–High | Flags never auto-reject; review is rare, MFA, logged, picture hidden until chosen (PA-26); remove-only for sensitive flags while the hash check is deferred; PENDING items are simply hidden, so nothing reaches the family unchecked | **Medium**: no measure yet of the false-flag rate on children's drawings; auto-uploaded flags may pile up unreviewed (kept forever, as the website DPIA noted for R-06) | A-49 (watch flag rate + cost after launch; a cap per child per day if needed), A-54 (decide what happens to unreviewed auto-uploaded flags — e.g. the parent is told in the corner and can delete) |
| **R-41** *(reassessed v0.3)* | **A child's tap sends a drawing**: in "proud" mode **the child's star** ("i'm proud of this one") queues the drawing for the keepsake box. **Founder's decision, 10 Nov 2026**, chosen over the drafting recommendation of a grown-up action. A child who stars freely makes "proud" close to "all", and the parent isn't told as each one goes | **Probable** | Significant | Medium–High | **The parent's standing choice of "proud" at linking** (nothing pre-selected; the slate must say a child's stars send drawings — A-46); the drawing goes **only to the family's private box at FAMILY** (never Extended or public), screened, hidden until cleared (D26); **widening is website-only**, so a child can't turn proud on (or proud into all) from the app; a grown-up can **narrow or stop** in the app at any time and **remove everything Draw sent** (A-48, being built); the corner's "what's been sent" list. **No notification emails** about synced drawings (founder's decision: the digest was scrapped) | **Medium**, accepted by the founder: the parent learns what was sent only by looking (the box or "what's been sent"), and a child's prolific starring raises volume as in R-39 | A-46 (the slate says so plainly), A-48, A-51 (a quiet count in the corner and on the account page, not an email); review at 3 months |
| **R-42** *(new)* | **Stopping a sync doesn't delete**, and the grown-up thinks it did: "none", unlink or disconnect leaves every drawing (and the drawing-days backup) on the website | Probable | Significant | Medium | Brief: say on the slate and at each stop that stopping doesn't delete; deleting stays its own explicit action | **Medium** until the copy and a bulk delete exist | A-46, A-48, A-51 → Low |
| **R-43** *(new)* | **The slate nudges towards sharing more** (std 13): option order, wording or visual weight that favours "all", or a pre-selected default creeping in later | Possible | Significant | Medium | Brief: nothing ticked or chosen; connect disabled until a keepsakes choice; "no pressure"; say what each sends | **Low–Medium**: not built; no test yet that nothing is pre-selected | A-46, A-47 (a test that a new link has no choice and that connect is disabled) → Low |
| **R-44** *(new)* | **Drawing-days backup is behavioural data about a child** on our server (which days they drew, lessons done, run lengths) | Possible | Minimal | Low | Only if ticked; dates and lesson ids only, no pictures or times; merge-only; for "a new phone can pick them up" | **Low** [verified]: trimmed to five fields with size caps (`src/lib/drawSync.ts` `parseProgress`); in the export (`exportData.ts`); "delete the backup" on the account page, audited `APP_PROGRESS_DELETED`; deleted with the child or family (FK cascade, migration 0053); **deleted after a year with no refresh** (`purgeStaleProgressBackups`; builder's choice, to confirm) | A-52 done |
| **R-45** *(new)* | **Sync choices drift from what the parent set**: the app keeps uploading after "none" (offline queue, an old app version), or uploads for a child the parent didn't tick | Possible | Significant | Medium | **Enforced on the server** [verified]: `auto` refused unless proud/all; progress/children 403 `sync-off`; key scoped to ticked children; `trigger` defaults to manual for old apps (so an old app can only do grown-up one-offs); the queue pauses on none/unlink | **Low** once A-47's tests exist | A-47 |
| **R-46** *(new)* | **Relatives' names and birthdays leave the phone** (`birthdays` ticked): data about adults who never used either service goes to our server and into the family calendar, where **every member the calendar is shared with** sees it (and the website's share is **pre-ticked** for new invitees, by the founder's decision), and consenting members' **reminder emails** name them | Possible | Significant | Medium | Unticked by default; the parent's choice; first name + optional relation + month/day only, **never years**; no contact details or pictures; family-only visibility through `canSeeOccasion` (`src/authz/occasions.ts`, unit-tested); reminders only with each recipient's own consent; cascade on family deletion | **Low–Medium**: the pre-ticked calendar share widens who sees relatives' dates; relatives aren't told directly (Art 14 view in §4) | A-60, A-61 (the slate says who will see them), notice wording (A-26/A-27) → Low |
| **R-47** *(new)* | **The family calendar comes onto a child's device**: dates other family members added on the website (names, relations, special days) are copied to a phone a child uses, feed the app's suggestions and nudges, and can be **edited or deleted from the app** (last change wins), possibly by a child through the gate or by mistake | Possible | Minimal–Significant | Medium | Only if ticked; first name + month/day only; the app's family-date nudges are off by default and addressed to grown-ups; scrubbed from logs; edits/deletes only behind the gate; website audit of occasion changes **[to confirm the app path is audited]** | **Low–Medium**: a deletion in the app removes the website entry for everyone; no undo | A-62 (confirm before delete; audit app-sourced changes; a short "recently deleted" undo on the website) → Low |
| **R-48** *(new)* | **Screening of synced names and special days**: abusive words, a relative's full name/surname, or a free-text "special day" that reveals something sensitive (health, religion, a bereavement) reaching the family calendar and reminder emails | Possible | Significant | Medium | Names screened like other user text (website rules) [verified]; length caps on occasions (≤ 60 chars on the website); occasions purpose-limited (never marketing or segmentation — R-CAL-1); family-only | **Low–Medium**: there's no surname check for relatives (the child-surname rule doesn't apply to adults); "other" titles are free text | A-60 (screen + length cap at the API; first word only for names, or a gentle "first names only" hint) → Low |

**Highest residual risks today:**
- **R-23**: the gate on devices a child can unlock. The sync part is now mitigated by website-only widening.
- **R-39 and R-40**: "all drawings" volume and screening load.
- **R-41**: the child's star sends drawings in "proud" mode, with no email. Accepted by the founder.
- **R-27/R-42**: stopping and deleting.
- **R-46**: relatives' dates on a pre-ticked family calendar.
- **R-26**: inherits the deferred hash check.
- **R-31**: OTA supply chain.

None needs a redesign.

---

## 9. Actions

Owner key as in the DPIA. **Blocking** = fix before real drawings flow (both upload switches on). *Before `apiUrl`* = must be done
before linking is switched on at all.

**Status at v0.4 (after the §0b re-check). This supersedes the "Blocking?" column below where they differ.**

- **Done and verified in PR #49 / #38:**
  - A-29 (connect list)
  - A-37 (content-safety tests)
  - A-38 (`CHILD` invites)
  - A-41 (backups, decision)
  - A-43 (M5, decision)
  - A-46 (slate), except the family-birthdays line, see A-61
  - A-47 (sync-gate tests)
  - A-48 (bulk remove, website)
  - A-50 / A-53 (decisions)
  - A-52 (drawing-days lifecycle)
  - A-55 (`/me` birthdays)
  - A-60 (occasions API), except the audit, see A-62
  - A-30: the progress toggle is now the real choice. It still holds that the two PRs must ship together.
  - A-45: done for these heads. Repeat a quick diff on the final merge commits.
- **Still blocking:**
  - A-26: the app notice placeholders and the legal-basis line.
  - A-27: the website notice. Proposed text is in the checklist.
  - A-28: the store forms + UK-only availability.
  - A-35: Expo DPA record + 2FA.
  - A-40: set UK-only.
  - A-61: say who sees relatives' dates, on the slate and in both notices.
- **Recommended, not blocking:**
  - A-31, A-32, A-33, A-34, A-36 (only before a Sentry DSN), A-39, A-42, A-44, A-49, A-51, A-54
  - A-62: the audit of app-made occasion changes is being added to PR #49 (verify at N6); a website undo stays optional
  - A-63 (a fresh sign-in before widening on the account page)
- **Declined by the founder:** A-56 (the calendar stays pre-ticked).

| ID | Action | Risks | Owner | Blocking? |
|---|---|---|---|---|
| **A-26** | **Publish the app privacy notice** (`src/app/(marketing)/trust/privacy/draw/page.tsx` is untracked) with placeholders filled ([date], crash-report "[number] days", ICO number). Rewrite §6–§8 for linking and **the four sync choices** (keepsakes, names & birthdays, drawing days, family birthdays — who sees relatives' dates on the family calendar; the child's star sends in "proud"; widening only on the website; no emails about synced drawings): what each sends; the family circle sees kept drawings once checked; **stopping or unlinking deletes nothing**, and how to remove drawings (including in bulk); nothing comes back to the app; how to revoke a phone; phone backups are the family's own. Align the crash-report line with the code | R-25, R-27, R-33, R-37, R-42 | Founder (Code drafts) | **Yes — before `apiUrl`** |
| **A-27** | **Website privacy notice**: add Snickerdoodle Draw as a source of keepsakes and children's details, the sync choices, the drawing-days backup, the linked-phones list and the key (`src/app/(marketing)/trust/privacy/page.tsx`) | R-25 | Founder (Code drafts) | **Yes — before `apiUrl`** (LG4) |
| **A-28** | **Store privacy forms**: Play Data safety and App Store privacy label updated per `docs/store/data-safety.md` "When the website goes live" (name, other info, **photos**, **app activity: drawing days**, optional, linked to the account), **UK-only** availability, **before** the update that sets `apiUrl` | R-37 | Founder | **Yes — before `apiUrl`** |
| **A-29** | **Connect screen** "can" list (`src/app/app/connect/ConnectCard.tsx`, `CAN`): add "see your little ones' first names (to match them)", "send drawings as you choose below", "keep names/birthdays and drawing days in step if you tick them", "make a ready-to-buy link for a drawing it sent", "delete drawings it sent". Add to the "can't" list: "show your keepsake box on the phone". Keep-it copy in the app: one line saying the family on snickerdoodle can see it once it's checked | R-25 | Code (in `feat/draw-sync-choices`) | **Yes** |
| **A-30** | **Ship the two sync branches together.** The app's old progress toggle becomes the real `progress` choice only when the website accepts it. If the app ships first, hide the toggle (`src/grownups/Account.tsx:156`) | R-37 | Code | **Yes** |
| **A-31** | **Share a ready-to-buy link** from the app: a confirm step that says "anyone with this link can see this drawing for 14 days. you can switch it off on snickerdoodle", with the first name optional in the share message | R-23 | Code (app) | Recommended before |
| **A-32** | **Gate option** "always ask for the grown-up pin (my child can unlock this phone)", offered at link time and in settings (`src/ui/Gate.tsx`, `src/services/grownup.ts`) | R-22, R-23 | Code (app) + Founder | Recommended before |
| **A-33** | **Widget**: a grown-up setting to hide pictures (and optionally show an initial instead of the name); say in the notice what it shows | R-21 | Code (app) | No |
| **A-34** | **Reminders**: daily reminder copy addressed to the grown-up ("time to draw with …?") and a weekly option; keep off by default | R-29 | Code (app) + Founder | No |
| **A-35** | **Expo**: record in `PROCESSORS.md` (role, data, region, DPA accepted, transfer basis) and in the LG3 record; 2FA on every Expo owner account; look into **EAS Update code signing** (availability on the current plan **[to confirm]**); change-control rule: any OTA that changes what leaves the phone (including the sync queue) re-opens this addendum and needs the founder's say-so | R-31 | Founder | **Yes** (DPA/record + 2FA); code signing recommended |
| **A-36** | **Sentry, before a DSN is added**: EU data region if available, DPA accepted, "prevent storing IP", data + advanced scrubbing, shortest retention; record in `PROCESSORS.md`; fill the notice's retention days | R-32 | Founder | Yes, **for the DSN** (not for uploads) |
| **A-37** | **Tests (content safety)**: an app upload (manual **and** auto) that is PENDING or FLAGGED can't become a wish (409 not-ready) or reach an order; a flagged app upload lands in the review queue; `source`/`madeOn`/`trigger` stored (`src/server/__tests__/drawAppLink.int.test.ts`) | R-26 | Code | **Yes** |
| **A-38** | **Reject `relationship = 'CHILD'` invites server-side** (`src/server/invites.ts` `createInvite`) + test. Now required (both services in scope) | R-38 | Code | **Yes** (website, std 3) |
| **A-39** | Fill `DRAW_ANDROID_CERT_SHA256` and `DRAW_APPLE_TEAM_ID` in SSM (`/snickerdoodle/prod/…`) and add them (and `DRAW_APP_UPLOADS`) to `infra/aws-london/env/app.env.template`; check that `/.well-known/assetlinks.json` answers | R-24 | Founder + Code | Recommended before |
| **A-40** | ~~Store listing~~: **decided — UK only at launch** (founder, 10 Nov 2026). Set availability to the United Kingdom in Play Console and App Store Connect | R-38 | Founder | **Yes** (set before release) |
| **A-41** | ~~Phone backups~~: **decided — allowed** (founder, 10 Nov 2026). No code change; keep the notice wording | R-33 | — | Done (decision) |
| **A-42** | Prefer on-device voices in the TTS fallback (don't boost "online"; skip "network" voices) | R-30 | Code (app) | No |
| **A-43** | ~~M5~~: **decided (founder, 10 Nov 2026)**. Family birthdays become the fourth sync choice `birthdays` (unticked), two-way via `/api/app/v1/occasions`, first names + month/day only. (`familyBirthdays` on `GET /me` is not used; occasions have their own endpoint.) | R-34 | — | Done (decision); build tracked in A-60–A-62 |
| **A-44** | Keep `DRAW_APP_UPLOADS` **off** on any site whose moderation is stubbed (the test site), or accept the app's sample-art guarantee in writing, including for the automatic queue | R-35 | Founder | Decision |
| **A-45** | Re-check this addendum against the branches that actually ship: app `feat/sync-choices` (+ whatever the store build is cut from) and website `feat/draw-sync-choices`. Neither was reviewable on 2026-11-10 | All | Code | **Yes** |
| **A-46** *(new)* | **The sync slate** (`/app/connect`, the app's corner, the account page): nothing pre-selected; connect disabled until a keepsakes option is chosen; equal visual weight; each option says in one line what it sends ("every drawing they save", "the ones they star for the proud pile: **their star sends it**", "nothing unless you keep one"; "family birthdays: their first names and birthdays, no years, shown on your family calendar to the people you share it with"); in the app, a widening attempt explains "you can turn this on from your account on snickerdoodle.co.uk"; one line that it can be changed or stopped any time **and that stopping doesn't delete**; that the family circle sees kept drawings. Brand voice, no pressure. Show it to 3–5 parents (§6) | R-39, R-42, R-43 | Code + Founder | **Yes** |
| **A-47** *(new)* | **Tests (sync gates, same PR)**: a new link has no keepsakes choice and can't complete without one; `auto` refused (403 `sync-off`) unless proud/all; `manual` allowed under none; progress `PUT/GET`, `PATCH /children` and every `/occasions` call refused unless ticked; **widening via `PATCH /me/sync` refused (403 `widen-on-website`), narrowing allowed**; the account page can change every choice either way; changing a choice is audited (consent-change); unlinking stops `auto` at once; an old app (no `trigger`) is treated as manual; children outside the key's scope refused | R-43, R-45 | Code | **Yes** |
| **A-48** *(new)* | **Bulk removal**: "remove everything Draw sent" (optionally per child) on the website's account page and in the app's corner, the real cascading delete, confirmed, audited; works after unlinking (website side). **Being built on `feat/draw-sync-choices`** [verified]; verify + test before sign-off | R-27, R-39, R-41, R-42 | Code | **Yes** (before "proud"/"all" are offered) |
| **A-49** *(new)* | **Volume and load**: check `LIMITS.homeUploadPerAccount` suits "all"; a sensible per-child daily cap for `auto` (queued, not lost); a cost and flag-rate watch for Rekognition/Textract in the first month; an alert if the review queue grows | R-39, R-40 | Code + Founder | Recommended before; watch after |
| **A-50** *(new)* | ~~Widening vs narrowing~~: **decided (founder, 10 Nov 2026)**. Widening is website-only; the app can only narrow or stop (403 `widen-on-website`). Build + test in A-47 | R-23 | — | Done (decision) |
| **A-51** *(new)* | **Keep the parent aware, without email** (founder, 10 Nov: no notification emails about synced drawings): in the corner and on the account page, "X drawings sent from Draw" with the date range and a tidy-up link. No badge on the corner's entrance (the child must not see a lure) | R-27, R-39, R-41 | Code | Recommended |
| **A-52** *(new)* | **Drawing-days backup lifecycle**: included in export (`src/server/exportData.ts`), deleted with the child, on account closure (`src/server/accountClosure.ts`) and with bulk removal; a retention rule after the choice is switched off (keep until deleted, as the brief says, with a visible "delete backup"); and what happens to sync choices when a link row is purged | R-44 | Code | **Yes** |
| **A-53** *(new)* | ~~"Proud" trigger~~: **decided (founder, 10 Nov 2026)**. The child's star sends it, chosen over the drafting recommendation of a grown-up action. Residual risk accepted (R-41). Remaining work: the slate says so (A-46) | R-41 | — | Done (decision) |
| **A-54** *(new)* | **Unreviewed flags from auto uploads**: tell the parent in the corner/account page (no detail, no picture shown to a child) that a drawing is being checked, and let them delete it; decide whether long-unreviewed flagged auto uploads are deleted after a period | R-40 | Founder → Code | Recommended |
| **A-55** *(new)* | **`GET /me` when names/birthdays sync is off**: return first names (for matching) but not birthdays. Today it returns full birthdays. **Being built on `feat/draw-sync-choices`** [verified]; verify + test | R-36 | Code | Recommended before |
| **A-56** *(new, website)* | ~~Untick the family-calendar share~~: **declined (founder, 10 Nov 2026)**. The share stays **pre-ticked** in the invite forms (`src/ui/modals/AddFamilyMemberModal.tsx:45`, `useState(true)`; D13). **Residual risk accepted:** under std 7 (defaults) and std 13 (nudges), new invitees see children's birthdays and, with `birthdays` sync, relatives' dates, unless the parent unticks. The per-member switch-off (`ManageMemberModal`) and audit remain. Record the founder's reason in the sign-off | R-38, R-46 | Founder | **Not blocking** (accepted) |
| **A-57** *(new, website)* | **Website privacy notice placeholders** ([date], ICO number — `src/app/(marketing)/trust/privacy/page.tsx`) and a short **"if you're a child reading this"** section, like the app's | R-38 | Founder (Code drafts) | **Yes** (LG4, std 4) |
| **A-58** *(new, website)* | **Reminder email subjects carry occasion titles** such as a child's name ("coming up: Mia's birthday" — `src/server/reminders/index.ts:85`): move names out of subjects (DPIA A-20) | R-38 | Code | Recommended (std 5) |
| **A-59** *(new, website)* | **Re-check the rest of LG2 Part B against today's code** (written 12 Oct; several gaps since closed — gift-link revoke, report/takedown, complaint form, child deletion, member removal, account closure). Still to confirm: full date of birth shared with relatives (A-09), gift links serving originals (A-06), the join-saving nudge, the human-review disclosure | R-38 | Code | **Yes** (to sign Part C §C.A) |
| **A-60** *(new, verified)* | **Occasions API** (`/api/app/v1/occasions`): send and accept **first name + optional relation + kind + month + day only** (strip any year the website holds); single first names (`screenChildFirstName`); length caps; 403 `sync-off` when `birthdays` is off; scoped to the key's family; app-sourced occasions land at the calendar's default circle (FAMILY); included in export and family deletion; never read for marketing or segmentation. Tests in the same PR | R-46, R-48 | Code (`feat/draw-sync-choices`) | **Yes** (before `birthdays` is offered) |
| **A-61** *(new)* | **Say who sees relatives' dates**: on the slate and in both notices, family birthdays from Draw appear on the family calendar for the people the calendar is shared with (pre-ticked for new invitees) and in their reminder emails if they've opted in; a line in the notices for relatives (Art 14 approach, OQ-26) | R-46 | Founder (Code drafts) | **Yes** |
| **A-62** *(new)* | **Two-way edits and deletes**: confirm before deleting a family date in the app ("this removes it from your family calendar too"); audit app-sourced occasion changes; consider a short undo on the website | R-47 | Code | **Audit being added to PR #49**; undo optional |
| **A-63** *(new)* | **Widening on the account page**: consider asking for a fresh sign-in (or an email confirmation) before a sync choice is widened, so a child on a tablet whose browser is signed in can't widen it there | R-23 | Code + Founder | Recommended |

---

## 10. Residual risk and conclusion

- **v0.4 (re-checked against the built code):** the engineering controls these risks rely on are **built and tested**:
  server-side sync gates, website-only widening, no-default choices, bulk removal, the content-safety gates for app
  uploads, year-free family dates and the drawing-days lifecycle (§0b). What stands between signing and switching on is
  **paperwork**: notice placeholders and the website notice, the store forms, Expo's record, and one line about who sees
  relatives' dates. The residual-risk ratings below stand, with R-44 now Low.

- **As built + brief (2026-11-10, v0.3):** Highs are R-23 (gate on child-unlockable devices; its sync part is now
  mitigated by website-only widening) and R-39 ("all drawings" volume), plus Medium–High R-40 and R-27. R-41 (child's
  star) is **Medium, accepted by the founder** with no notification email.
  - Open blockers: transparency (A-26–A-29, A-46, A-61); bulk removal (A-48, being built); tests (A-37, A-47); the
    drawing-days lifecycle (A-52); the occasions API (A-60); the website's own Code gaps (A-38, A-57, A-59).
  - **A-56 is declined**: the pre-ticked calendar is an accepted residual risk.
  - With the upload switches off, no child's drawing flows, but **Expo update checks are already live**.
- **With the blocking actions done**, the drafting view is that every residual risk is **Low or Medium**:
  - R-23 stays Medium unless A-31/A-32/A-63 are done.
  - R-39, R-40 and R-41 stay Medium for families choosing "proud" or "all".
  - R-46 stays Low–Medium because the calendar stays pre-ticked.
  - R-26 stays Medium until IWF is connected (D25).
  On that basis **prior consultation with the ICO should not be needed**. That is the founder's call as controller.
- **Re-open this addendum** on: any change to the sync contract or its defaults; anything that sends website keepsakes
  to the app; any change to what the occasions sync carries (e.g. years, contact details); any notification email about
  synced drawings (ruled out by the founder on 10 Nov); any server push notification; a Sentry DSN being added; any
  analytics; any change to what `GET /me` or `POST /assets` carries; web views or links out in the child's room;
  listing outside the UK; generative edits on app drawings; any OTA that changes what leaves the phone; a material
  incident; three months after "all" goes live (check volume, flag rate and deletions).

---

## 11. Sign-off (mirrors LG1: signed by the founder as controller)

| Item | Name / date | Notes |
|---|---|---|
| Measures approved by | Simon Jewell, founder, for Launch Mode Ltd, 12 Nov 2026 10:37 (launch list v6) | The blocking actions in §9 are done, or have dates and owners (store forms and the Expo record, owner Simon, before switch-on) |
| Residual risks approved by | Simon Jewell, founder, for Launch Mode Ltd, 12 Nov 2026 10:37 (launch list v6) | R-23, R-26, R-39, R-40 and R-41 at Medium; R-46 at **Low** (since D27 relatives' dates from the app stay in the home); the ready-to-buy link from the app at Low. **The calendar share now starts unticked** (A-56 accepted, founder 10 and 12 Nov), so it is no longer a residual risk |
| Decisions recorded | **Founder, 10 Nov 2026:** M1 (both services in scope); sync choices replace M4; UK-only listing; phone backups allowed; the child's star sends in "proud" mode; no notification emails about synced drawings; widening website-only; calendar share stays pre-ticked; M5 resolved as the `birthdays` sync choice. Nothing left open from M1–M5 | Builder's choices **B1–B7 confirmed**, **B8 (child's-header t-shirt link button) and B9 ("snickerdoodle shop") are the founder's own decisions**, all 10 Nov 2026; B10 being fixed in PR #49 (checklist §3) |
| DP professional advice provided | n/a — founder's decision to sign as controller (as LG1, 29 Oct 2026) | Record any later professional review here |
| Signed off by (controller) | Simon Jewell, founder, for Launch Mode Ltd, 12 Nov 2026 10:37 (launch list v6) | **Simon, founder, for Launch Mode Ltd (trading as Snickerdoodle)**. Recorded as D29 |
| Date | 12 Nov 2026 | |
| Next review | | When uploads launch, three months after "all" goes live, on any §10 trigger, and at least yearly |

*Signed 12 Nov 2026 (D29). Signing did not by itself switch anything on: see `DRAW-APP-signoff-checklist.md` §5 and LAUNCH-GATES row A.*
