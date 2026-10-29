# Test sweep 2026-10-29 — 04 · Family, invites and notifications

Tester 04 · branch `claude/sweep-4-family-89dd5a` (cut from `feat/christmas-season` @ d6f890b) · own database `snickerdoodle_t4` · e2e server on :3204 (`next start`, `MAIL_PROVIDER=console`, local MinIO KMS key, moderation = stub) · Stripe key checked `sk_test_` · Prodigi = sandbox · no live site, no AWS box, no real child images (drawn test shapes only).

**Totals (items 1–72): 57 PASS · 6 FAIL (each tied to a bug below) · 0 BLOCKED · 4 NOT TESTED · 1 by design · 4 notifications that don't exist yet.**
Bugs: **1 × P0, 1 × P1, 1 × P2, 8 × P3.**

## How it was tested

Six people, each in their own browser context: the **controlling parent**, a **second parent** (Family circle · view, buy & add), a **grandparent** (Extended · view only), an **aunt** (Extended · view & buy), a **stranger** from another family, and a **signed-out guest**. Emails were read from the real console mailer output (the server's log), and the people joining used the **actual one-tap link from their sign-in email**.

| Evidence | What | Result |
|---|---|---|
| `e2e/family-invites.spec.ts` (new) | the full multi-person journey, banner/profile images, leaving, + 2 `test.fixme` bugs | **3 passed, 2 fixme (skipped)** — 47.5s with gift-loop |
| `e2e/gift-loop.spec.ts` (existing) | gift link → guest buy; invite → verify → join → 5% | **2 passed** |
| `src/server/__tests__/familyInvitesSweep.int.test.ts` (new) | invite edge cases, circle × access matrix, audit, copy-controller | **13 passed, 2 expected-fail (bugs 04-B1, 04-B4)** |
| `src/server/__tests__/notificationsSweep.int.test.ts` (new) | who every email goes to (mailer captured) | **7 passed** |
| existing suites (authz matrix, invites, members, calendar, profile, children, hand-over, gift links, mail, reminders planner, pricing, rights, support, assets, keepsake report) | 26 files | **357 passed** |
| axe (temporary probe, WCAG 2.2 AA) | /join, /family, invite sheet at 390 and 1280 | 1 finding (04-B6) |

The two `test.fixme` e2e cases and the two `it.fails` tests were each run un-skipped once and fail **exactly** at the asserted line (logs in the session; quoted under each bug).

Screenshots: `shots/04/`.

---

## (a) Coverage checklist

### Invites — `src/app/actions/invite.ts`, `src/server/invites.ts`, `/join/[token]`

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Only the family's owner can invite (second parent, removed member, other family's owner refused) | PASS | int: "a second parent … and a removed member cannot invite"; existing invites.int "only the owner can invite" |
| 2 | Invite through the UI (`/family` → invite → email + "they can …" + calendar tick) | PASS | e2e step "the invite rows hold exactly what the parent chose"; `shots/04/family-owner-desktop-pending-invites.png` |
| 3 | Circle comes from the relationship server-side; access exactly as chosen (6 combinations) | PASS | int "each circle × access the parent can choose is joined EXACTLY" |
| 4 | Invite email: one per invitee, only to them, subject + "lasts 14 days", link = `/join/<token>`, no child name | PASS | e2e step "invite emails …" (read from server log) |
| 5 | Invite is valid 14 days; token is 24 random bytes | PASS | int "an invite is logged … expiry is a fortnight out", "tampered … tokens" |
| 6 | Join page, signed out: "Join The Sweepers", one-tap email to the invited address only | PASS | e2e `join()`; `shots/04/join-invited-mobile.png` |
| 7 | Verify identity: the real magic-link email → accepted → `/home?joined=1` | PASS | e2e (3 people joined via the link from their email) |
| 8 | Joined at exactly the circle/access/calendar choice the parent made | PASS | e2e step "three people join, each at exactly the circle + access chosen" |
| 9 | Accept while signed in as someone else → "This invite is for someone else", invite stays PENDING | PASS | e2e step "a stranger …"; `shots/04/join-wrong-account-desktop.png` |
| 10 | Accept with the invited address in different letter case | PASS | int "accepting with the invited address in a different case works" |
| 11 | Tampered / unknown token → "This invite link isn't valid", nobody joins | PASS | e2e + int "tampered and unknown tokens"; `shots/04/join-tampered-mobile.png` |
| 12 | Revoked (cancelled) invite can't be used | PASS (behaviour) / copy wrong → 04-B5 | e2e + int "a revoked invite cannot be accepted"; `shots/04/join-revoked-mobile.png` |
| 13 | Expired invite can't be used | PASS (behaviour) / copy wrong → 04-B5 | e2e; existing invites.int "an expired invite"; `shots/04/join-expired-mobile.png` |
| 14 | Already-used invite (single use) | PASS | e2e (co-parent reopens their link); int |
| 15 | Two accepts at once → one membership only | PASS | int "two accepts of one invite at once …" (loser got `used`) |
| 16 | Cancel a pending invite from `/family` (link dies at once, logged) | PASS | e2e step "cancel one invite …"; int |
| 17 | Resend: fresh link + fresh 14 days, OLD link dead, "a little reminder" email to the invitee only | PASS | e2e + int "resending an invite …" |
| 18 | Inviting someone already in the family | **FAIL → 04-B4** | int `it.fails` "04-B4 …" |
| 19 | Re-inviting after removal → fresh join at the NEW invite's circle/access | PASS | e2e step "re-inviting after removal"; int |
| 20 | Invite rate limit wired (20/hour/account) | NOT TESTED | code read only — `invite.ts:25` |

### Members — `src/server/members.ts`, `ManageMemberModal`

| # | Item | Result | Evidence |
|---|---|---|---|
| 21 | Change circle Extended → Family: sees FAMILY keepsakes on the very next page; and back down | PASS | e2e step "the parent changes the granny's circle + access"; `shots/04/manage-member-desktop.png` |
| 22 | Change access view → view & buy → view | PASS | same e2e step + int |
| 23 | Each change audited separately with from → to | PASS | int + e2e audit step |
| 24 | Remove: membership REMOVED, all their sessions deleted, their open page gets `/login` on the next request (no grace) | PASS | e2e step "removing the aunt …" (sessions count = 0, redirect to /login) |
| 25 | Removed member can't fetch the banner / profile images | PASS | e2e "profile pictures + the family banner …" (404 after removal) |
| 26 | Member leaves (`leave this family` → yes) → gone at once, MEMBER_LEFT logged; owner has no leave control | PASS | e2e "a relative leaves a family …" |
| 27 | Owner can't remove/leave themselves; non-owner can't change anything | PASS | existing members.int |
| 28 | Family calendar on/off per member — owner-only + audited | PASS (server) | int "turning the family calendar off …"; UI toggle seen in screenshot, not clicked |
| 29 | Second parent's powers (invite / add child / set visibility) | BY DESIGN | owner-only ("owner only for now", `src/authz/actions.ts:26`); refusals tested in int |

### Family, children, visibility — `/family`, `/home`, pickers, previews

| # | Item | Result | Evidence |
|---|---|---|---|
| 30 | New keepsakes default to FAMILY | PASS | e2e (all 3 kept drawings = FAMILY) |
| 31 | Parent sets ONLY_ME / EXTENDED through the keepsake sheet; logged with from → to | PASS | e2e step "the parent sets visibility …"; int |
| 32 | Only the controlling parent can change visibility (co-parent refused) | PASS | int "visibility: only the controlling parent …"; e2e (no control shown to relatives) |
| 33 | Keepsake home — parent sees all 3; Family member sees FAMILY + EXTENDED; Extended members see EXTENDED only; stranger nothing; guest → /login | PASS | e2e step "who sees what in the keepsake home"; `shots/04/home-coparent-mobile.png`, `home-granny-desktop.png` |
| 34 | "or start from a keepsake" picker (start-creating) — same matrix | PASS | e2e step "the 'start from a keepsake' picker …" |
| 35 | Product previews `/api/mockup` — only-me/family/extended grid per person, stranger + guest refused | PASS | e2e step "product previews (/api/mockup) …" |
| 36 | Gift-link previews/purchase never include ONLY_ME, frozen per family | PASS (existing) | authz giftLinkPurchase.test + giftLinks.int (in the 357) |
| 37 | Family banner: members see it, stranger / signed-out / removed get a plain 404, `noindex` | PASS | e2e "profile pictures + the family banner …"; `shots/04/home-granny-banner-desktop.png` |
| 38 | Profile pictures (avatar/header) authz | PASS (existing) | profileImages.test + profile.int (in the 357); not uploaded through the UI by me |
| 39 | Child first name only — "Olivia Sweeper" refused with the warm message; "Olivia" added | PASS | e2e step "a little one: first name only" |
| 40 | Birthday shared only with members the calendar is shared with (granny yes, aunt no); first names to all | PASS | e2e step "birthdays …" |
| 41 | Rename family (owner) → shown on join page; logged | PASS | e2e (rename → "Join The Sweepers"; FAMILY_RENAMED = 1) |
| 42 | VIEW-only member can't buy | **FAIL → 04-B2** | e2e `test.fixme('04-B2 …')` |
| 43 | VIEW_BUY member can buy | PASS | gift-loop (granny at view & buy checks out with 5%) |
| 44 | CONTRIBUTE member can add to the family | **FAIL → 04-B3** | e2e `test.fixme('04-B3 …')`; `shots/04/coparent-after-upload-home.png` |
| 45 | Edited copy made by a relative stays under the parent's control | **FAIL → 04-B1** (filed drawing: PASS; unfiled: FAIL) | int "a relative's edited copy of a drawing FILED …" + `it.fails('04-B1 …')` |
| 46 | 5% join saving only with a valid server-side join (guest: 0; joined: exactly 5%) | PASS | gift-loop both tests; pricing.test "forged … → no saving" (in the 357) |
| 47 | Studio for family members (open/edit a relative's keepsake) | NOT TESTED in the UI — studio-scope.int + authz cover the gate; a VIEW member's first edit needs CONTRIBUTE (copy) — behaviour on screen unchecked |

### Notifications — every email the app can send (`src/server/mail`, all `sendMail` call sites)

| # | Email (kind) | Trigger | Goes to | Result | Evidence |
|---|---|---|---|---|---|
| 48 | sign-in link (`magic-link`) | sign in / join | the address typed (the invited one on /join) | PASS — works once, 1 hour; link returns to the invite | e2e `join()` uses the real link |
| 49 | invite (`family-invite`) | parent invites | invitee only | PASS (wording → 04-B11) | e2e |
| 50 | invite resend (`family-invite`) | "resend" | invitee only; old link dead | PASS | e2e + int |
| 51 | birthday reminders (`reminder`, `/api/jobs/reminders`) | daily job | owner + members the calendar is shared with **and** who consented; not a removed member, not one who withdrew; once per nudge | PASS (wording → 04-B10) | int "birthday reminders …"; job returns 401 without/with a wrong secret, 405 on GET (curl) |
| 52 | order confirmed (`order-confirmed`) | payment | buyer's account email, or a guest's address; reply-to support@ | PASS | int "order confirmed / shipped …" |
| 53 | order shipped (`order-shipped`) | dispatch | same; tracking link or "no tracking" line | PASS | same |
| 54 | "bought from your gift list" (`gift-list`) | gift-link order paid | the family's owner only | PASS | int |
| 55 | email change ×3 (`email-change`) | change request / confirm | confirm link to NEW address only (1 h, single use); heads-up without a link to the OLD; "changed" note to the old | PASS | int "email change …" |
| 56 | complaint ack + privacy inbox (`complaint-ack`, `rights-request`) | /data complaint | complainant; inbox gets ref only, never the details | PASS | int |
| 57 | support ack + team copy (`support-ack`, `support-request`) | /help contact | asker; team copy replies to asker | PASS | int |
| 58 | family hand-over (`family-handover`) | owner closes account, hands over | new owner only | PASS | int |
| 59 | gift request (`gift-list`, `sendGiftRequest`) | parent sends list | ACTIVE members of this family + typed addresses | NOT TESTED by me (code read: members resolved server-side, family-scoped; existing launchLoop.int calls it) |
| 60 | content report (`content-report`) | report a keepsake / gift link | support inbox | PASS (existing keepsakeReport.int, in the 357) — recipient not re-asserted by me |
| 61 | hand-packing alert (`order-ops`) | order with gift wrap | ORDER_ALERT_EMAILS / admins | NOT TESTED (checkout tester's area) |
| 62 | "someone joined your family" | — | — | **does not exist** (see "missing" below) |
| 63 | "you've been removed" / "your access changed" | — | — | **does not exist** |
| 64 | data export / deletion confirmation | — | — | **does not exist** (export is a direct download) |
| 65 | wish / share | — | — | no email; share is a link (`src/server/wish.ts`) |

### Audit log

| # | Item | Result | Evidence |
|---|---|---|---|
| 66 | INVITE_SENT (incl. resend), INVITE_REVOKED, INVITE_ACCEPTED, MEMBERSHIP_CREATED, MEMBERSHIP_CIRCLE_CHANGED, MEMBERSHIP_ACCESS_CHANGED, MEMBER_REMOVED, MEMBER_LEFT, ASSET_VISIBILITY_CHANGED, CHILD_ADDED, FAMILY_RENAMED — each written, exact counts | PASS | e2e step "the audit log holds every family event" (8/1/4/4/2/2/1/2/1/1) + leave test |
| 67 | Calendar sharing changes logged | PASS | int |
| 68 | Consent changes (reminders) logged | PASS | `setReminderConsent` writes CONSENT_CHANGED (used by the int reminders test; row not re-asserted) |

### In-app notices, accessibility, layout

| # | Item | Result | Evidence |
|---|---|---|---|
| 69 | Toasts: invite sent / cancelled / resent, visibility set, little one added, "saved — X sees the change straight away", "you've left …" | PASS | asserted in e2e |
| 70 | axe on /join (valid + invalid) at 390 and 1280 | PASS (clean) | temporary axe probe |
| 71 | axe on /family + invite sheet | **FAIL → 04-B6** | same probe |
| 72 | Primary action in the thumb zone — invite sheet "send invite" at y 784–832 of 844 ✓; join page "email …" at y 520–580 of 844 | **FAIL → 04-B7** | same probe |

(Items 62–65 aren't counted in PASS/FAIL — they're gaps for the founder to decide on.)

---

## (b) Bugs

### 04-B1 · P0 · A relative's edited copy of a family drawing can be hidden from the parent
- **Where:** `src/server/keepsakeCopy.ts:36-42` → `src/server/ingest.ts:66-73`.
- **Steps:** parent keeps a drawing **not filed under a little one** (the default after "+ keepsake"). A relative with CONTRIBUTE (e.g. the second parent) opens it from a picker and edits it → `copyKeepsakeAction` makes a copy in the parent's family. Because the drawing has no child, `ingestOriginalAsset` makes the **copier** the controller. The relative then sets the copy to "Only me".
- **Expected:** the controlling parent stays controller of every copy of their family's drawings (CLAUDE.md: "never key ONLY_ME on the uploader for a child's asset"); they can always see and delete it.
- **Actual (observed):** copy `{uploader: jo, controller: jo, visibility: FAMILY, child: null}`; after "only me": `{samCanView: false, samCanSetVis: false, samCanDelete: false, joCanView: true}`. A drawing filed under a child stays the parent's (that case passes).
- **Test:** `it.fails('04-B1 …')` in `familyInvitesSweep.int.test.ts` (fails at `canViewAsset(ref, sam)`); drop `.fails` when fixed.
- **Why P0:** the parent loses sight of, and the right to delete, a copy of their child's drawing inside their own family. Narrow (needs a CONTRIBUTE relative + an unfiled drawing), but it's the parent-is-controller rule.

### 04-B2 · P1 · "View only" relatives can still buy
- **Where:** `src/server/orders.ts:171-176` checks only `assertCanViewAsset`; `canBuyFromGiftList` (`src/authz/actions.ts:14`) is never called outside tests. The home also shows "place one on a product →" to every relative (`src/app/home/HomeView.tsx:369`).
- **Steps:** invite a grandparent at Extended · **view only**; parent marks a keepsake Extended. Grandparent → `/start-creating` → "or start from a keepsake" → the keepsake → customise socks → add to basket → `/checkout` → checkout.
- **Expected:** refused (the parent chose "view only").
- **Actual:** order `SNK-377806` created (PENDING, £19, the parent's asset) and the browser was sent to Stripe test checkout (aborted by the test). Re-run of the un-skipped fixme: `Expected length: 0, Received length: 1` at `family-invites.spec.ts:441`.
- **Test:** `test.fixme('04-B2 …')` in `e2e/family-invites.spec.ts`.

### 04-B3 · P2 · "View, buy & add" doesn't add to the family
- **Where:** `src/server/keepsakes.ts:33` (`keepAndFileCreations` → `ensureHomeFamily`) and `src/app/actions/keep.ts:30`; `/family` also uses `ensureHomeFamily` (`src/server/family.ts:101`).
- **Steps:** invite a second parent at Family · view, buy & add; they join, upload a drawing, tap "+ keepsake".
- **Expected:** the drawing lands in the family they joined; the controlling parent sees it.
- **Actual:** it goes into a **new family the co-parent owns**; their home flips to "Your family" with the shared family as a side pill (`shots/04/coparent-after-upload-home.png`); the parent never sees it. Re-run of the fixme fails at `family-invites.spec.ts:466` (`family_id` is the co-parent's own family). So CONTRIBUTE is only reachable through the picker copy path (which then trips 04-B1).
- **Test:** `test.fixme('04-B3 …')`.

### 04-B4 · P3 · Re-inviting an existing member at a new level silently does nothing
- **Where:** `src/server/invites.ts:132-158` (skips the insert when an ACTIVE membership exists, then marks the invite VERIFIED); `createInvite` doesn't check for an existing member.
- **Steps:** Rosie is Extended · view & buy. Parent invites her as Parent · view, buy & add; she accepts.
- **Expected:** her circle/access change, or the invite is refused up front ("already in your family — change their access instead").
- **Actual:** accept says ok, the invite is spent, membership is unchanged (still EXTENDED).
- **Test:** `it.fails('04-B4 …')` (fails at the `circle: 'FAMILY'` match).

### 04-B5 · P3 · Join page says the wrong thing for cancelled and expired invites
- **Where:** `src/app/join/[token]/page.tsx:62-70`.
- **Actual:** a **cancelled** invite: "This invite has already been used — It's already been accepted." An **expired** one: heading "This invite has already been used", then "It expired." (`shots/04/join-revoked-mobile.png`, `join-expired-mobile.png`).
- **Expected:** e.g. "This invite was cancelled" / "This invite has expired — ask {family} for a fresh one".
- The e2e asserts today's copy (comments mark it `04-B5`) — update those two lines when the copy is fixed.

### 04-B6 · P3 · Accessibility: the "resend" button's spoken name doesn't contain "resend"
- **Where:** `src/app/family/FamilyPinboard.tsx:93` — visible "resend", `aria-label="send the invite to … again"`.
- **Evidence:** axe `label-content-name-mismatch` (serious) on /family and with the invite sheet open, 390 + 1280. (The "cancel" button is fine.) Voice-control users saying "click resend" won't hit it. Fix: e.g. `resend the invite to …`.

### 04-B7 · P3 · Join page: the main button isn't in the thumb zone on a phone
- **Where:** `src/app/join/[token]/JoinLogin.tsx:42` (the card is centred vertically).
- **Evidence:** at 390×844 the "email …" button sits at y 520–580 (`shots/04/join-invited-mobile.png`). NN6 asks for the primary action in the thumb zone. Long addresses also wrap the button onto two lines.

### 04-B8 · P3 · "Add a family member" collects things it then throws away
- **Where:** `src/ui/modals/AddFamilyMemberModal.tsx:63-70, 112-140` (code read; not run).
- **Actual:** for an adult, the **photo** and **birthday** fields are filled in but never sent (`createInviteAction` takes neither). With "Invite to the family workspace" switched **off**, "send invite" just says "add their email to send the invite" — there's no way to add an adult without inviting them, so the switch does nothing useful. The invite email field has a placeholder but no label.

### 04-B9 · P3 · Relatives see each other's email prefix as their name
- **Where:** `src/server/home.ts:102`, `src/server/family.ts:111` (`displayName ?? email.split('@')[0]`).
- **Evidence:** `shots/04/home-granny-desktop.png` — an Extended grandparent sees every member's email local part (e.g. `jane.smith`), and "welcome back, <prefix>". A surname in an email prefix is shown to the whole family. Suggest a first-name prompt on join, or "Grandparent", "Aunt" etc. as the fallback.

### 04-B10 · P3 · Reminder email: the "one tap" off switch isn't one tap
- **Where:** `src/server/reminders/index.ts:91`.
- **Actual:** "Turn them off in one tap: …/family" — that needs signing in (a magic link) and finding the toggle. No `List-Unsubscribe` header. PECR wants unsubscribing to be simple; the copy over-promises.

### 04-B11 · P3 · Invite email doesn't say who it's from
- **Where:** `src/app/actions/invite.ts:38-46`, `src/app/actions/family.ts:208-215`.
- **Actual:** "You've been invited to join a family's private keepsake box" — no family name and no inviter, while the join page then says "Join The Sweepers". To a grandparent this reads like phishing. Using the family name (`familyNameForRelatives`) in the email would match the join page.

### Smaller observations (not filed as bugs)
- The 5% join saving applies to **any** order by that member for the invite's 14 days, not only to the family that invited them (`src/server/joinProvenance.ts`) — a product decision for the checkout tester / founder.
- On a phone, the home's member row scrolls sideways with no visible hint that more people are off to the right (`shots/04/home-coparent-mobile.png` shows 2 of 4).
- `/family` for a relative shows *their own* (auto-created, empty) family with invite tiles; the family they joined only appears under "my families" (`src/server/family.ts:101`). Read from the code; not screenshotted.
- Join page heading uses a straight apostrophe ("isn't") while the rest of the app uses ’.

### Missing notifications (for the founder to decide — no code exists)
- The parent gets nothing when someone **joins** (no email, no in-app notice). `/home?joined=1` shows no welcome to the joiner either.
- A member gets no email when **removed** or when their **circle/access changes** — they just lose access.
- No confirmation email for a **data export** or **deletion** (the export is a direct download).

---

## (c) Not tested, and why
- **Real email delivery (Resend):** console mailer only, by rule. Link domains come from `APP_URL`; checked as `localhost:3204`.
- **Stripe payment completion:** test sessions were created (key confirmed `sk_test_`); the browser was stopped before Stripe's page. Order emails were tested by calling the senders directly.
- **Studio editing by relatives on screen** (item 47) and **gift request sending** (59): server gates covered by existing tests; no UI run by me.
- **Hand-packing alert** (61): the checkout tester's area.
- **Avatar / profile header upload through `/account`:** only the family banner was uploaded via the UI; the avatar authz is covered by existing unit/int tests.
- **Calendar / occasions UI** (add/edit occasion, days we celebrate): existing familyCalendar.int passes; not clicked through by me.
- **Second parent as co-controller:** the app is owner-only by design; nothing to test beyond "refused".

## Files added
- `e2e/family-invites.spec.ts` — set `SWEEP_SERVER_LOG=<server stdout file>` to have it read the real emails (without it, the email checks are skipped and tokens come from the DB).
- `src/server/__tests__/familyInvitesSweep.int.test.ts`
- `src/server/__tests__/notificationsSweep.int.test.ts`
- `reports/test-sweep-2026-10-29/shots/04/*.png` (11 screenshots)

Run them: `npx playwright test e2e/family-invites.spec.ts` (with `E2E_PORT`), and `node --env-file=.env ./node_modules/vitest/vitest.mjs run src/server/__tests__/familyInvitesSweep.int.test.ts src/server/__tests__/notificationsSweep.int.test.ts` (the copy test also needs `S3_KMS_KEY_ALIAS(_ORIGINALS)=snickerdoodle-local`).
