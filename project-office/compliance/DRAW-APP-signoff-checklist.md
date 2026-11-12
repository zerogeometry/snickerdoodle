# Snickerdoodle Draw → website: the signing pack

> **v1.0 draft, 2026-11-10, for Simon (founder, controller for Launch Mode Ltd t/a Snickerdoodle).** This is the
> final pack. Nothing in it is signed, switched on or committed.
>
> **What it covers:** what to sign (§1), decisions already made (§2), the builder's choices for you to confirm (§3),
> what's left to do (§4), the exact switch-on steps (§5), and the texts for your approval (§6–§8).
>
> **Re-checked against the built code on 2026-11-10** (G12/A-45; details in `DPIA-addendum-draw-app.md` §0b):
> - **Website:** PR #49, `feat/draw-sync-choices` at `b2724c8` (worktree `C:\Users\Simon\dev\Snickerdoodle-drawsync`),
>   migration `0053_draw_sync_choices`.
> - **App:** PR #38, `feat/sync-choices` at `9042fe7` (worktree `C:\Users\Simon\dev\snickerdoodle-draw-sync`), plus a
>   copy/layout tweak still landing (the data flows don't change).
> - Tests were read, not run here. PR #49 reports typecheck, lint and 2244 tests passing.

---

## 1. What you sign

| # | Document | Where you sign | What signing means |
|---|---|---|---|
| 1 | `DPIA-addendum-draw-app.md` (v0.4) | §11 table | You approve the measures and accept the residual risks: R-23, R-26, R-39, R-40 and R-41 at Medium; R-46 at Low–Medium; the pre-ticked calendar. You do this as controller, not via a DP professional, as for LG1 |
| 2 | `CHILDRENS-CODE-assessment-draw-app.md` (v0.4) | §C.D table | You confirm that **the app and the website are both fully in scope** (LG2 Part A withdrawn), accept the website gaps as actions, and **write one line on why the family-calendar share stays pre-ticked** |
| 3 | This pack | §3 | Nothing left to choose (B1–B9 decided 10 Nov; B10 is a fix in PR #49). Approve the texts in §6–§8 |

Sign **before step 2 of §5** (the app address going in): linking itself moves children's first names. Signing doesn't
switch anything on.

## 2. Decisions already made (founder, recorded in the papers)

| Topic | Decision | Date |
|---|---|---|
| Children's Code scope (M1) | App **and** website fully in scope; LG2 Part A withdrawn | 10 Nov 2026 |
| Weekly runs, milestones (M2) | Weekly runs with kind rules; milestones in-app only, no order condition, no discounts; no effort stars | 20 Oct, 2 Nov, 5 Nov |
| Prices (M3) | Children may see previews; **no prices anywhere in the app** | 20 Oct |
| What leaves the phone (M4 → sync) | Sync choices at linking: keepsakes none / proud / all, plus three unticked boxes; nothing pre-selected | 10 Nov |
| "Proud" | **The child's star sends the drawing** | 10 Nov |
| Emails | **No notification emails** about synced drawings | 10 Nov |
| Widening | **Website only**; the app can narrow or stop | 10 Nov |
| Family calendar share | **Stays pre-ticked** (reason to write in Part C) | 10 Nov |
| Family birthdays (M5) | Fourth sync choice `birthdays`: first names + month/day, two-way with the family calendar | 10 Nov |
| Store listing | **UK only** at launch | 10 Nov |
| Phone backups | **Allowed** (the family's own Google/iCloud) | 10 Nov |

## 3. The builder's choices (all decided)

**All decided (founder, 10 Nov 2026):** B1–B7 confirmed, B8–B9 the founder's own decisions, B10 being fixed in PR #49.

| # | What was built | Recommendation | Why |
|---|---|---|---|
| **B1** | A drawing-days backup that no phone refreshes for **a year** is deleted (`purgeStaleProgressBackups`) | ✅ **Confirmed (founder, 10 Nov)** | Keeps behavioural data about a child from lingering. It can also be deleted any time on the account page. One year covers a phone broken over a long holiday |
| **B2** | Phones linked **before** sync existed sync **nothing** until a grown-up picks on the website account page | ✅ **Confirmed (founder, 10 Nov)** | Privacy by default. Old links never start sending on their own |
| **B3** | Adding a little one from the app works with "first names and birthdays" **off**, but the **birthday is dropped** (the first name is needed to file drawings under) | ✅ **Confirmed (founder, 10 Nov)**, **plus a transparency line** the app shows the grown-up: *"we'll store keepsakes in snickerdoodle under <first name>"* (being built in app PR #38; verify before N6) | Minimisation, and the grown-up is told what goes across |
| **B4** | With "family birthdays" ticked, the phone receives **adult family members' calendar dates** (first name, relation, day/month) and **dates for children on this phone**. **Lunar dates** and **dates for children not on this phone** stay off | ✅ **Confirmed (founder, 10 Nov), on this description** (re-confirmed after the correction) | Lunar dates move each year, so a fixed day would be wrong. The scoping follows the phone's key. Members' first names reaching the phone is covered by the "family birthdays" tick |
| **B5** | Names for family dates from the app must be **a single first name** (the website's first-name rule; surnames refused). A refused date stays on the phone, marked, and isn't sent | ✅ **Confirmed (founder, 10 Nov)** | Minimisation; relatives get the same rule as children. "Mary Kate" style names get refused, so suggest the grown-up uses one name, with "grandma" etc. going in *relation* |
| **B6** | A phone **unused for 90 days** is disconnected (the existing rule). The app then shows "isn't linked any more", keeps everything local, and syncing stops | ✅ **Confirmed (founder, 10 Nov)** | It limits a forgotten key on a child's device |
| **B7** | `clientRef` (no duplicate on retry): if you delete a drawing on the website and the phone later retries that same drawing, it would be **created again**. The app never resends a kept or taken-back drawing, so this needs a crash between upload and marking it kept | ✅ **Confirmed (founder, 10 Nov)**: "the app never resends drawings it already sent". Optional later: the website remembers deleted refs for 30 days | Very unlikely. Fix it if it's ever seen |
| **B8** | **In the child's room:** while unlinked, a **t-shirt "link snickerdoodle (for grown-ups)" button** next to the lock in the header (`src/ui/ArtistHeader.tsx`): gate first, no badge, wiggle or narration | ✅ **Founder's decision (10 Nov)** | My earlier suggestion was a neutral icon. Residual risk, noted once: a t-shirt can read as merchandise in a child's space (Code std 13 / CAP / Apple Kids); it's mitigated by being unlinked-only, gated and quiet. Low |
| **B9** | The grown-ups' corner section is named **"snickerdoodle shop"** ("your snickerdoodle shop account") | ✅ **Founder's decision (10 Nov)** | My earlier suggestion was "snickerdoodle" / "your keepsake box". Residual risk, noted once: a shop-first framing for grown-ups only, not seen by children. Brand, not data. Low |
| **B10** | The connect page's "can't" list says the app can't "see … your family", yet with family birthdays ticked it sees calendar names (members' too) | 🔧 **Being fixed in website PR #49** (with the family-date audit, A-62) | Accuracy at the consent moment. Verify at N6 |

Still yours, no rush: weekly runs **on** by default for the youngest band? (Part C std 13; not blocking).

*Also noted (founder, 10 Nov): the proud pile in the grown-ups' corner is now collapsible (expanded by default). No compliance impact.*

## 4. What's left

### Blocking: do before switching on

| | What | Where | Owner |
|---|---|---|---|
| **N1** | **Finish the app privacy notice:** "Last updated: [date]"; crash reports "[number] days" (set when Sentry exists; until then say "we don't collect crash reports yet"); "ICO registration [number]"; "Legal basis: [to confirm…]" (text in §6.1); add who sees relatives' dates (§6.3); fix the "device model" line (the code drops it on Android) | `src/app/(marketing)/trust/privacy/draw/page.tsx` on `feat/draw-sync-choices` | Founder approves, Code edits |
| **N2** | **Website privacy notice: add the Draw section.** Use the builder's text (§6.2), with two small additions marked there | `src/app/(marketing)/trust/privacy/page.tsx` | Founder approves, Code edits |
| **N3** | **Say who sees relatives' dates** (A-61): one line in the "family birthdays" hint on the slate (§6.3), plus the two notices | `src/ui/components/DrawSyncSlate.tsx`; app `sync.birthdaysHint` | Code |
| **N4** | **Store forms + UK only:** Play Data safety and App Store privacy label (name, other info = birthdays, photos, app activity = drawing days, all optional and linked to the account); availability **United Kingdom** only. Both store listings' privacy URL = `https://snickerdoodle.co.uk/trust/privacy/draw` (live only once step 1 of §5 is done) | Play Console; App Store Connect; `docs/store/data-safety.md` | Founder |
| **N5** | **Expo record:** add the Expo entry proposed in §6.5 to `PROCESSORS.md`, after checking the three "to confirm" items in the Expo dashboard; add a line to the LG3 note; 2FA on every Expo owner account | `project-office/compliance/PROCESSORS.md` | Founder |
| **N6** | **Ship both PRs together** (the app's sync needs the website's endpoints), after the app's copy tweak lands, then do a 5-minute diff of the final merge commits against DPIA §0b | PR #49, PR #38 | Code |
| **N7** | **Before signing Part C §C.A:** re-walk LG2 Part B against today's website code (A-59: DOB shared with relatives, gift links serving originals, human-review disclosure) | Part C §C.A | Code |

### Recommended, not blocking

- **Occasions audit** (A-62): **being added to website PR #49** (log add/edit/delete of family-calendar dates made from the app). App-side changes already need the corner's Save. A website undo stays optional.
  website. App-side changes already need the corner's Save.
- **A fresh sign-in before widening** on the account page (A-63). This closes the gap where a child on a tablet whose
  browser is signed in could widen sync there.
- **Share-link confirm step** (A-31); an **"always ask for the grown-up PIN"** option (A-32); widget "hide pictures"
  (A-33); reminder copy addressed to the grown-up (A-34).
- **Env template:** add `DRAW_APP_UPLOADS`, `DRAW_PRIVACY_NOTICE`, `DRAW_ANDROID_CERT_SHA256` and `DRAW_APPLE_TEAM_ID`
  to `infra/aws-london/env/app.env.template`, and fill the two link settings in SSM (A-39).
- **Watch "all"** in month one: volume, flag rate, review queue, Rekognition/Textract cost (A-49).
- **Sentry** only after its own setup: EU region, DPA, IP off, scrubbing, retention (A-36).
- `DRAW_APP_UPLOADS` stays **off** on the test site while its moderation is stubbed (A-44).
- The **family-calendar addendum** gains one field (`occasions.relation`, ≤ 30 chars, screened). Add a line to
  `DPIA-addendum-family-calendar.md` when you next touch it.

### Done and verified (no action)

All built and verified in PR #49 / #38:
- the slate (nothing pre-selected; connect disabled until a choice is made);
- the server-side sync gates (`sync-off`) and the narrowing-only app;
- consent-change audits;
- `/me` sends birthdays only when ticked;
- "remove everything Draw sent" (website), plus per-drawing remove in the app;
- drawing-days backup: five fields, export, delete, cascade, one-year expiry;
- family dates with no year and single first names;
- content-safety tests for app uploads (held → no link, no order, in review);
- `CHILD` invites refused;
- the connect page "can / can't" list;
- no notification emails;
- no pictures back to the app.

## 5. Switch-on, step by step

Nothing below has been done. Each step needs your go-ahead. (The brief puts the store forms after the app switches; this
pack moves them first, because the forms have to be true on the day the update reaches families.)

0. **Ready:**
   - The three documents are signed (§1).
   - The app's "we'll store keepsakes … under <first name>" line (B3) is in the merged app build, and B10 + the family-date audit (A-62) are in the merged website build.
   - N1–N7 are done.
   - PR #49 and PR #38 are merged, with their tests green.
1. **Website: deploy, then publish the notices.**
   - Deploy the merged website (the deploy runs migration `0053_draw_sync_choices`) **[to confirm: the migration step in the runbook]**.
   - Publish the app notice in SSM, then reload settings as the runbook does (`bin/fetch-env.sh` + restart):
     ```bash
     aws ssm put-parameter --name /snickerdoodle/prod/DRAW_PRIVACY_NOTICE --type String --value live --overwrite
     ```
   - Check that `https://snickerdoodle.co.uk/trust/privacy/draw` opens and the website notice shows the Draw section.
2. **Store forms (N4):** Data safety and the App Store privacy label updated; availability set to the UK only.
3. **Website: allow app uploads.**
   ```bash
   aws ssm put-parameter --name /snickerdoodle/prod/DRAW_APP_UPLOADS --type String --value on --overwrite
   ```
   - Reload settings (`bin/fetch-env.sh` + restart).
   - First check `MODERATION_PROVIDER=real` and `CSAM_HASH_CHECK=deferred` (D25) are on. Without them every app upload is held as unscreened.
   - **Checks from a linked test phone:**
     - `POST /api/app/v1/assets` no longer says `not-yet`;
     - `trigger: auto` on a link set to none → 403 `sync-off`;
     - widening from the app → 403 `widen-on-website`;
     - `/occasions` with family birthdays off → 403 `sync-off`.
4. **App: point at the website and allow real drawings** (on the merged `feat/sync-choices`):
   - `draw-app/app.json` → `expo.extra.snickerdoodle.apiUrl` = `"https://snickerdoodle.co.uk/api/app/v1"`;
   - `draw-app/src/services/snickerdoodle/config.ts` → `export const REAL_DRAWING_UPLOADS_SIGNED_OFF = true;`.
5. **Ship a store build** (not an OTA: the sync queue is new native-side behaviour, and an earlier iOS OTA failed to
   start) on the `production` profile, on your say-so (`docs/UPDATES.md`). Android goes to Play; iOS to TestFlight, then the
   App Store (Kids category).
6. **Your own end-to-end test, with your own child's drawings:**
   - **Link:** link from the app. The slate shows nothing chosen and connect is disabled until you pick.
   - **None:** keep one drawing. It's held (only you see it), then cleared, then the family sees it.
   - **Proud:** your child stars one. It arrives, with no email.
   - **Widen:** try widening to all in the app. It sends you to the website; do it there. Offered earlier drawings → "just new ones".
   - **Family birthdays:** tick it and add "Jo, grandma, 3 March" in Draw. It shows on the family calendar with no year.
     Edit it on the website and it changes in Draw.
   - **Stop:** switch to none. Nothing is deleted.
   - **Remove:** "remove everything Draw sent" leaves the box empty of app drawings. Delete the drawing-days backup.
   - **Record it** in LAUNCH-GATES.
7. **Record** D27 in DECISIONS.md and the app row in LAUNCH-GATES.md (§7–§8).
8. **Three months after "all" is live:** review volume, flag rate, removals, and whether B7 has ever happened.

Not part of this: `extra.sentryDsn` (only after A-36).

## 6. Texts for your approval

### 6.1 App privacy notice: the legal-basis line (fills "[to confirm …]")

> *Legal basis: our contract with you. Linking and the choices you make are how you ask us to keep your family's
> keepsakes and keep things in step. For the names and birthdays of relatives on your family calendar (if you tick family
> birthdays): our legitimate interest, and yours, in keeping your family's important days in one place. We use them only
> for your calendar and the reminders people have asked for, never for anything else.*

### 6.2 Website privacy notice: the Draw section (N2), the builder's text, recommended

Use the builder's draft. It's tighter than mine and matches the code. **I'd add the two bracketed bits**: the first
makes the child's-star rule visible; the second answers "who sees relatives' dates" (N3/A-61) and states the legal basis.

> **Snickerdoodle Draw (our drawing app).** If you link Snickerdoodle Draw to your account, it sends only what you
> choose when linking, which you can change on your account page: drawings for your keepsake box (only the ones a grown-up
> picks, the proud pile **[ — including drawings your little one stars — ]**, or every drawing), each with the child's first name it's filed
> under, the day it was made and whether it was drawn on screen or paper; and, only if you tick them, your little ones'
> first names and birthdays, their drawing days (so a new phone can pick them up), and your family calendar's birthdays
> and special days (a name, an optional relation, and the day and month, never a year **[ — seen by everyone you share
> your family calendar with ]**). App drawings get the same private storage and safety checks as uploads. Your account
> page lists linked phones and their choices, lets you disconnect them, delete backed-up drawing days, and remove
> everything the app sent. Your data download includes all of this. A phone unused for 90 days is disconnected; drawing
> days nobody backs up for a year are deleted. See the app's own notice for what stays on the phone.
> **[ *Legal basis: our contract with you; for relatives' names and birthdays, our legitimate interest in keeping your
> family's days in one place.* ]**

(The longer version I drafted earlier is superseded. One fact from it worth keeping somewhere in the notice: stopping a
sync never deletes what's already here. It's already on the connect page and account page, so it's optional in the notice.)

### 6.3 Who sees relatives' dates (N3): one line for the slate and both notices

> slate hint, added to "family birthdays and special days": **"…never a year. everyone you share your family calendar
> with can see them."**

### 6.4 The founder's reason for the pre-ticked calendar (for Part C §C.D; your words)

> *"__________________________________________________"* (for example: grandparents expect to see birthdays; the parent
> can untick per invite and switch off per member at any time; every change is logged).

### 6.5 Proposed `PROCESSORS.md` entry: Expo (N5; a proposal, not an edit to that file)

A new column for the register's table, or a short block under "Not in this table, but also processors":

| | **Expo** (650 Industries, Inc.): EAS Update + EAS Build, for Snickerdoodle Draw |
|---|---|
| **Role** | Processor: delivers the app's over-the-air updates and builds the app. (App distribution itself is Apple/Google) |
| **Data** | From **every install**, on each update check (`u.expo.dev`): **IP address**, a random per-install id (**`EAS-Client-ID`**, used by Expo to count monthly devices), platform, runtime version, update channel, ids of updates held. **No names, drawings, birthdays or account data.** Expo also holds our app code and build credentials (not personal data) |
| **How the DPA applies** | **To confirm:** whether Expo's DPA is part of its terms (accepted by using EAS) or needs accepting in the dashboard (expo.dev → account `zerogeometry` → settings / legal). Save a dated copy in `compliance/dpas/` |
| **Where it's processed** | USA (Expo is US-based) **[to confirm hosting region]** |
| **Transfer mechanism** | **To confirm:** UK–US data bridge (if Expo is DPF-certified with the UK Extension) or the UK Addendum / IDTA in Expo's DPA. Record in the LG3 note as a low-risk transfer (an IP + a random id, no child content) |
| **Retention** | **To confirm** from Expo's DPA / privacy policy (update-request logs; the install-id analytics) |
| **Breach notice** | Per Expo's DPA (to confirm the timescale) |
| **Security / account** | 2FA on every owner of the `zerogeometry` Expo account; production OTA only on the founder's say-so (`docs/UPDATES.md`); look into EAS Update code signing (DPIA A-35) |
| **Open actions** | (1) Accept/download the DPA. (2) Confirm DPF / transfer basis. (3) Confirm retention. (4) 2FA. (5) Keep the app notice's "Expo" line matching this |
| **Link** | https://expo.dev/privacy · https://expo.dev/terms (DPA link from the terms; to confirm) |

## 7. Proposed text: DECISIONS.md (a proposal; not added)

> | 2026-11-__ | **D27: Snickerdoodle Draw syncs with the keepsake box on a grown-up's choice (Children's Code sign-off).** The founder,
> as controller for Launch Mode Ltd, signed the DPIA addendum (`compliance/DPIA-addendum-draw-app.md` v0.4) and Children's Code
> Part C (`compliance/CHILDRENS-CODE-assessment-draw-app.md` v0.4), re-checked against website PR #49 and app PR #38.
>
> **Scope:** the app **and** the website are fully in scope of the Children's Code; LG2 Part A is withdrawn.
>
> **Sync (replaces M4):**
> - At linking a grown-up chooses keepsakes **none / proud pile / all drawings** (required, nothing pre-selected), and
>   optionally **first names & birthdays**, **drawing days** and **family birthdays** (all unticked).
> - Family birthdays are relatives' first names + month/day, two-way with the family calendar. This resolves M5.
> - The website enforces every choice. **Widening is website-only**; **stopping deletes nothing**; "remove everything Draw
>   sent" is on the account page.
> - **Website keepsakes never come back into the app.**
> - In "proud" mode **the child's star sends the drawing**. There are **no notification emails** about synced drawings.
>
> **Builder's choices confirmed (founder, 10 Nov 2026):**
> - B1: drawing-days backups deleted after a year with no refresh.
> - B2: earlier links sync nothing until chosen.
> - B3: a child added from the app with names off keeps no birthday; the app tells the grown-up "we'll store keepsakes in snickerdoodle under <first name>".
> - B4: with family birthdays ticked, adult members' calendar dates (first name, relation, day/month) and dates for children on this phone go to the phone; lunar dates and dates for children not on this phone stay off.
> - B5: single first names for family dates.
> - B6: 90-day idle disconnect.
> - B7: the app never resends drawings it already sent (re-create after a website delete accepted).
> - B8: the child's-header t-shirt link button (unlinked only, gate first, quiet), founder's decision.
> - B9: the grown-ups' corner section named "snickerdoodle shop", founder's decision.
>
> **Also recorded:**
> - The family-calendar share stays pre-ticked (reason: ________).
> - M2: weekly runs with kind rules; in-app milestones only; no effort stars.
> - M3: no prices anywhere in the app.
> - Store listing UK only; phone backups allowed.
>
> **Switches (on the founder's say-so):** notices live (`DRAW_PRIVACY_NOTICE=live`) → store forms → `DRAW_APP_UPLOADS=on`
> → app `apiUrl` + `REAL_DRAWING_UPLOADS_SIGNED_OFF=true` in a store build.
>
> **Residual risks accepted:** R-23, R-26, R-39, R-40 and R-41 at Medium; R-46 at Low–Medium.
>
> | compliance/DPIA-addendum-draw-app.md, CHILDRENS-CODE-assessment-draw-app.md, DRAW-APP-signoff-checklist.md, LAUNCH-GATES.md, both privacy notices, store forms, briefs/DRAW-APP-sync-choices.md | Founder decisions 10 Nov 2026 + sign-off as controller |

## 8. Proposed row: LAUNCH-GATES.md (a proposal; not added)

> | A | **Snickerdoodle Draw → website** (sync choices; real drawings from the app) | ☐ ready to sign (pack v1.0, 2026-11-10) |
> Simon | Sign the DPIA addendum §11 + Part C §C.D; B1–B10 decided 10 Nov. Blockers N1–N7: notices finished and live, store forms
> + UK only, Expo record, ship PR #49 + PR #38 together, LG2 Part B re-walk. Then: `DRAW_PRIVACY_NOTICE=live` → store forms
> → `DRAW_APP_UPLOADS=on` → app `apiUrl` + `REAL_DRAWING_UPLOADS_SIGNED_OFF=true` (store build). Also note under LG2: scope
> withdrawn to "fully in scope" (10 Nov 2026). |
