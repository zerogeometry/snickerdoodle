# Children's Code assessment — Part C: Snickerdoodle Draw (the app) × the 15 standards, and the website's scope

> **DRAFT for the founder's sign-off as controller. Not legal advice.** Extends `CHILDRENS-CODE-assessment-draft.md`
> (LG2, Parts A–B for the website, signed off by the founder as controller on 29 Oct 2026). **§C.A supersedes LG2
> Part A.** Risks **R-nn** and actions **A-nn** are in `DPIA-addendum-draw-app.md`; what to sign and switch is in
> `DRAW-APP-signoff-checklist.md`.
>
> | | |
> |---|---|
> | Controller | Launch Mode Ltd t/a Snickerdoodle |
> | Version / date | v0.4 draft, 2026-11-10: the signing version |
> | Evidence baseline | App: `C:\Users\Simon\dev\snickerdoodle-draw-ios\draw-app`, branch `fix/save-copy-to-photos`, HEAD `cf02b42` (read only). Website: branch `feat/christmas-season`, HEAD `51883d1` + untracked app privacy page. App paths are relative to `draw-app/`. Sync choices: `project-office/briefs/DRAW-APP-sync-choices.md`, being built on `feat/draw-sync-choices` (website) and `feat/sync-choices` (app) and **not reviewed**: marked **[verified]**. **[inferred]** = not verified in code. |
> | Status | Draft — not signed off |
>
> **v0.2 (founder decisions, 10 Nov 2026):** both services fully in scope (§C.A); M4 replaced by the grown-up's sync
> choices at linking (none / proud pile / all; names & birthdays; drawing days — nothing pre-selected); website
> keepsakes never come back into the app; UK-only store listing; phone backups allowed.
>
> **v0.3 (founder decisions, 10 Nov 2026, later the same day):**
> - In "proud" mode **the child's star sends the drawing**.
> - **No notification emails** about synced drawings: the daily digest was scrapped.
> - **Widening a sync choice is website-only**; the app can only narrow or stop it.
> - The website's **family-calendar share stays pre-ticked**: the founder's decision, with the residual risk accepted.
> - **M5 resolved:** family birthdays become a fourth sync choice, `birthdays` (unticked). It is two-way with the
>   website's family calendar, first names + month/day only.
> - Bulk "remove everything Draw sent" (A-48) and `/me` without birthdays (A-55) are now built and verified (v0.4); they were built on
>   `feat/draw-sync-choices`.
>
> **v0.4:** re-checked against the built code (website PR #49 `feat/draw-sync-choices` @ `b2724c8`; app PR #38 `feat/sync-choices` @ `9042fe7`, plus a copy/layout tweak still landing). Sync statements are now **[verified]**. Differences and open points are listed in DPIA addendum §0b.

Status key: ✅ met · ◐ partly met / gap · ❌ not met · n/a.

---

## C.A Scope — decided: the app AND the website are fully in scope

**Founder decision, 10 Nov 2026.** Snickerdoodle Draw and snickerdoodle.co.uk are both treated as information
society services likely to be accessed by children, and both conform to all 15 standards. **The website's "arguably
out of scope" argument (LG2 Part A, A.4(1)) is withdrawn.** It rested on children being subjects, not users. An
official child-facing app that feeds the keepsake box ends that, as do the website's playful scrapbook design and the
open guest upload.

The app is in scope plainly: it is made for 3–12s (store target groups 5 and under, 6–8, 9–12 —
`docs/store/families-policy.md`) and used by them directly. **[OQ-1b]** (whether data that never leaves the phone is
processing by us) no longer changes anything: we conform either way.

**UK only at launch (founder, 10 Nov 2026)** on both app stores, so COPPA and other non-UK children's regimes are not
engaged yet. Listing elsewhere re-opens this assessment.

### What full scope adds for the website — the open gaps against the 15 standards

LG2 Part B was written on 12 Oct as "voluntary conformance". Many of its gaps have since been closed in code: gift-link
revoke (`src/app/home/HomeView.tsx`), report/takedown on gift links (`src/app/g/[token]/ReportGiftLink.tsx`,
`src/server/contentReports.ts`), a complaint form that submits (`ComplaintForm.tsx` → `submitComplaintAction`), child
deletion (`src/server/children.ts` `deleteChild`), member removal (`src/server/members.ts`), account closure, export,
the post-purchase keep choice, and the review queue with MFA. **Under full scope these remaining items become
conformance gaps, not nice-to-haves** (checked 2026-11-10 unless marked):

| Std | Website gap (now required) | Evidence | Action |
|---|---|---|---|
| 3 Age-appropriate application | `relationship = 'CHILD'` invites still accepted by the server (only the UI hides it), so a child could become an account holder | Fixed on `feat/draw-sync-choices`: `src/server/invites.ts` `NotInvitableError`, `src/app/actions/invite.ts`, `invites.int.test.ts` | **A-38 done** (verified) |
| 3 | No age self-declaration at sign-up or guest upload. The website applies child-level protections to everyone, which the Code allows instead of age assurance | LG2 std 3; OQ-18 | Record the "apply to all users" choice; self-declaration not proposed |
| 4 Transparency | Privacy notice still has placeholders ([date], ICO number) and no child-facing explanation (the app's notice has an "if you're a child reading this" section; the website's doesn't). Notice silent on the app | `src/app/(marketing)/trust/privacy/page.tsx:18,146` | **A-57**, **A-27** — **blocking** (LG4) |
| 5 Detrimental use | Reminder email subjects carry occasion titles, e.g. a child's name ("coming up: Mia's birthday") | `src/server/reminders/index.ts:85` | **A-58** (= DPIA A-20) |
| 7 Default settings / 13 Nudges | **Family-calendar share is pre-ticked** in the invite form (D13): the effective default shares children's birthdays with every invited relative | `src/ui/modals/AddFamilyMemberModal.tsx:45` (`useState(true)`) | **A-56 declined: the founder keeps it pre-ticked (10 Nov 2026).** Residual tension with std 7 and std 13 accepted. Mitigations: the parent can untick it per invite, switch it off per member later (`ManageMemberModal`), changes are audited, and relatives' own reminders need their own consent. With the `birthdays` sync, relatives' dates from Draw are visible to the same people. The founder's reason is to be written in the sign-off. **Not blocking** |
| 8 Minimisation | Full date of birth (year included) shared with relatives who see the calendar **[to re-check]** | DPIA A-09 | **A-59** |
| 9 Data sharing | Gift links: bearer links; whether they still serve the original rather than a preview rendition **[to re-check]** | DPIA A-06, OQ-17 | **A-59** |
| 13 Nudges | "Join family & save 5%": a financial nudge for relatives to join the circle. Adult-directed; record why it's acceptable | LG2 std 13 | Note in the sign-off |
| 4/6 | Human review of flagged pictures: disclosed in the privacy notice? **[to re-check]** | DPIA PA-26 | **A-59** |
| 1 Best interests | Best-interests notes for D13, D14, D16 and the keep choice were never written | LG2 std 1 | Short note in the sign-off |

**A-59:** re-walk LG2 Part B against today's code before signing this section; the table above is what was found or
suspected on 2026-11-10.

---

## C.B The 15 standards — the app

### 1. Best interests of the child — ◐

**How the app conforms.** The product split puts the child first. The child's room has no prices, shop, sign-in, links
out, web views, ads or analytics, works offline, and **never shows sync** [verified]. Everything that spends, shares,
links, syncs or deletes sits behind the grown-up gate or on the website (`COMPANION-APP-partition.md` §2;
`src/ui/Gate.tsx`). **Website keepsakes never come back into the app**, so the family's box isn't reachable from a
child's device. Progress can never be lost to a bug (merge-only, a safety journal, copy-before-migrate —
`docs/RELIABILITY.md`), and phone backups are allowed, so a lost phone doesn't lose a child's drawings. The
"frame the wonky bits" spirit shows in praise of effort, no grading, no effort stars (founder, 2026-11-05).

**Gaps.**
- The gate doesn't hold on a device the child can unlock (R-23). Widening sync is website-only, so a child in the app can
  only narrow or stop it.
- The widget puts drawings and names on a home screen (R-21).
- The daily reminder can reach a child (R-29).
- **In "proud" mode the child's star sends the drawing (R-41).** This is the founder's decision. The best-interests case
  is that the child chooses what they're proud of, the parent chose "proud" at linking, the drawing goes only to the
  family's private box, and the parent can narrow, stop or remove everything. There are no notification emails, so the
  parent sees what went only in the box or in "what's been sent".

**Actions.** A-31, A-32, A-33, A-34, A-46, A-48, A-51, A-63. Record the best-interests reasoning for product previews in the child's
room (M3) and for offering "all drawings" (R-39) in the sign-off.

### 2. Data protection impact assessment — ◐

**How.** `DPIA-addendum-draw-app.md` v0.2, grounded in the code, with R-21–R-45.

**Gap.** Unsigned; the sync parts describe the brief, not built code. **Action.** A-45 re-check against the sync
branches, then sign before `apiUrl` is set.

### 3. Age-appropriate application — ✅ (app) / ◐ (website)

**How.** The app treats **every user as a child** and applies the protections to everyone; nothing depends on knowing
the user's age. Grown-up features are separated by the gate and the website's sign-in, not by age assurance. Age bands
(little / young / big) shape lessons and narration, not data collection (`src/domain/artist.ts`). The child's room is
designed for non-readers (recorded narration, pictures, a hold-to-open gate).

**Website gap.** `CHILD` invites (A-38) — see §C.A.

### 4. Transparency — ◐

**How.** The child gets an age-appropriate line from the narrator, said once per artist: grown-ups can see your
drawings and your proud pile in the grown-ups' corner (`app/(tabs)/keepsakes.tsx`, `narration/script.ts`, per the app
report). The draft notice has an "If you're a child reading this" section. The corner has "your stuff, your rules":
what's on this phone, what's been sent, delete (`privacy.*` strings in `src/i18n/en.json`). Each choice has short copy
(keep it, unlink, delete, remove artist). The connect page lists what the app can and can't do, and **will carry the
sync slate**, with each choice explained, nothing pre-selected, and "change or stop any time" [verified].

**Gaps.** The app notice is **unpublished**, has placeholders and says linking is "coming soon". The website notice
doesn't mention the app. The store forms describe the no-linking release. The connect "can" list is incomplete. The
slate copy isn't written. Nothing yet tells the grown-up that **stopping doesn't delete** or that the family circle sees
kept drawings. **If the narrator line is kept, consider a gentle addition for families on "all"** (e.g. "your drawings
also go to your family's keepsake box") — the child should know their drawings leave the phone **[founder]**.

**Actions.** A-26, A-27, A-28, A-29, A-46 — **blocking, before `apiUrl`**.

### 5. Detrimental use of data — ◐

**How.** No data is used to keep a child engaged: no engagement metrics, funnels or per-child analytics (partition §7).
No server push. Reminders are local, off by default, set by a grown-up, and never mention streaks or products. Milestone
gifts that needed an order, and the "10% off", were removed (2026-11-02). No prices anywhere in the app. The CAP Code
point (no direct exhortation to ask a parent to buy) is handled by copy rules and a banned-words test. Drawing days synced
to the website [verified] are for restoring a backup only, never for marketing or nudges.

**Gaps.** Product previews are still product images shown to children (R-28), a deliberate founder decision (M3) whose
reasoning should be recorded. The daily reminder on a child's own tablet.

**Actions.** Record M3 reasoning **[OQ-23]**; A-34; state in the notice that drawing days are never used for marketing.

### 6. Policies and community standards — ◐

**How.** The app's promises match the code in almost every place checked. Nothing leaves the phone except the update
check, opt-in crash reports, and what the grown-up's link and sync choices send. No ads or analytics. The microphone is
blocked. The website applies the same content-safety rules to app uploads as to its own, and **enforces the sync choices
on the server** (`auto` refused unless proud/all; progress and name sync refused unless ticked) [verified].

**Gaps.** (1) Today's progress toggle promises a backup the website refuses. That is fixed only if both sync branches
ship together (A-30). (2) The notice says crash reports include "device model", but the code drops it on Android. (3) Expo
and Sentry contracts aren't yet evidenced. (4) The promise "stopping never deletes" needs its partner: an easy way to
delete everything the app sent (A-48).

**Actions.** A-30, A-26, A-35, A-48.

### 7. Default settings — ✅ (sync: by design, to verify)

**How.** High privacy by default, verified. Crash reports are **off**. Reminders and family-birthday nudges are **off**.
Nothing is linked and no drawing is sent. Kept drawings land at **FAMILY** on the website (never Extended or public —
`src/server/ingest.ts`). The phone's key covers only the children the grown-up ticks. **Sync [verified]:** nothing ticked
or chosen; connect disabled until a keepsakes option is picked; names/birthdays, drawing days and family birthdays unticked. This is the
high-privacy default the standard asks for, provided the build matches (A-47 test). Read-aloud is on (it's how
non-readers use the app; not a privacy setting). Phone backups: the platform default, allowed by the founder as the
family's own.

**To confirm.** Weekly runs are **on** by default with a grown-up off switch (founder, 2026-10-20). That is recorded under
std 13.

### 8. Data minimisation — ◐

**How.** Artists are a first name and an optional birthday; age band and avatar never leave the phone. The camera keeps
only the crop. The website receives a drawing, the child id, the day made, the source and the trigger; the **title is
dropped** (`keepAppDrawing`). `GET /me` sends no email, members or keepsakes. **No keepsake pictures go back to the
phone.** Drawing days, if ticked, are dates and lesson ids only. Crash reports carry an age band, not an age. The local
log is scrubbed.

**Gaps.** **"All drawings"** sends every saved drawing, far more than is ordered or looked at. It is justified only
because the parent chose it, and needs bulk delete and gentle reminders to stay proportionate (R-39, A-48, A-51).
`GET /me` sends the **full birthday** even if names/birthday sync is off; A-55, being built, removes that. The widget
shows names and thumbnails. **Family birthdays (M5 resolved):** they stay on the phone unless `birthdays` is ticked; if
ticked, only a first name + month/day (no years) goes, two-way (A-60).

**Actions.** A-46 (suggest "proud" as the gentle option without pre-selecting it, and say a child's star sends it),
A-48, A-51, A-55, A-33, A-60.

### 9. Data sharing — ✅ / ◐

**How.** Nothing about a child is shared with anyone the parent didn't choose. To the website: only what the grown-up's
choices or taps send, into the family's own private box, under the website's authz (owner-only link; the key can't read
keepsakes or the member list). Suppliers: Expo gets no child data (IP + random install id); Sentry, when set up, gets no
names, drawings, birthdays or IP. Phone backups go to the family's own Google/Apple account, not to us. No ads, no data
sale.

**Gaps.** (1) **Share a ready-to-buy link** from the phone creates a forwardable bearer link showing the child's drawing
and first name. If the child passes the gate, the child can do it (R-23). (2) Kept drawings become visible to the whole
family circle at FAMILY once cleared. With "proud" or "all", that means every starred or saved drawing. The slate must
say so (A-46). (3) **Family birthdays** (`birthdays` sync, [verified]): relatives' first names and month/day go to the
website's family calendar. There, the members the calendar is shared with see them, and that share is **pre-ticked**
for new invitees by the founder's decision. Consenting members' reminder emails also name them. Dates others added on
the website come back to a child's device. No child data is added by this, but it is a disclosure of third-party adults'
data that the parent controls (DPIA addendum R-46–R-48).

**Actions.** A-31; A-46; A-60; A-61; A-62; **[OQ-24]**.

### 10. Geolocation — ✅

**How.** No location permission or code. `ACCESS_MEDIA_LOCATION` is blocked and `isAccessMediaLocationEnabled: false`
(`app.json`). Paper photos are cropped and re-rendered on the phone (the app's PNG has no EXIF), and the website strips
EXIF/GPS again on ingest (`stripExif`). Automatic uploads go through the same path.

### 11. Parental controls — ✅

**How.** The grown-ups' corner and the sync choices are parental controls, and the child is told in an age-appropriate
way (the narrator line; the corner's entrance: "the proud pile, your keepsake box, settings and privacy live here").
**No covert monitoring.** The corner shows what the child made and their drawing days, nothing about time spent. With
drawing days ticked, the website holds only dates and lesson ids, and only to restore a backup. The corner's entrance
has no badges, dots or counts.

**Note.** The gate's strength depends on the device (R-23). That is a std 1/9 matter. With keepsakes = all, consider
telling the child their drawings also go to the family's keepsake box (std 4).

### 12. Profiling — ✅

**How.** No profiling: no analytics or advertising SDKs (dependency list checked; `AD_ID` blocked), no recommendation
engine, no server-side per-child metrics. "Today's drawing" is chosen on the phone (`src/domain/progression.ts`). The
drawing-days backup [verified] is stored for restore only and must not be read for marketing, ranking or
recommendations. Say so as a hard rule (A-52).

**Watch.** Expo counts monthly devices with the install id (aggregate, not a profile of a child): R-31, **[OQ-21]**.

### 13. Nudge techniques — ◐ (the honest one)

**Requirement.** Don't use nudge techniques to lead children (or the adults acting for them) to provide unnecessary
data, to weaken privacy, or to extend use in ways not in their interests.

**Decisions already taken that mitigate (verified unless marked):**
- **Weekly, not daily** runs (2026-10-20). One missed week in four is a rest week, the best run is kept forever, and
  totals only go up. No countdowns, loss warnings or child notifications. A grown-up off switch covers the app and the
  widget.
- **No prices to children**, no purchase-linked rewards, milestones in-app only (2026-11-02), **no effort stars**
  (2026-11-05).
- **Encouraging, not guilt:** "hello again! your pencils missed you." with no counter.
- **Sync slate with no pre-selection** [verified]. Nothing ticked, connect disabled until a keepsakes option is chosen,
  "no pressure", and each option says what it sends. This is the main privacy-nudge safeguard and needs its own test (A-47).

**Honest residual nudge risks:**

| Feature | Concern | Drafting view |
|---|---|---|
| **The sync slate** | Order, wording or visual weight could steer parents to "all" (more data); "connect" disabled until a choice could feel like pressure to choose something big | List options from least to most (none → proud → all) with equal weight; say plainly "all" means every drawing; no "recommended" badge on "all". A-46 |
| Weekly runs + "{{run}} drawing weeks in a row! your pencils are on a roll." | Still a streak mechanic | Acceptable with the kind rules + off switch; consider runs **off** by default for the "little" band **[founder]** |
| Widget: name, latest doodles, day marks and "draw this week" on the home screen | An engagement prompt outside the app | A-33; consider dropping the "draw this week" wording |
| Daily "Drawing time" reminder (off by default, set by a grown-up) | On a child's own tablet, a daily notification to a child | A-34 |
| Welcome video, birthday and milestone moments | Celebration, but also variable reward | Low; tap to skip; celebration only |
| "What could it become?" product previews | Desire for a product | M3 decision; one tap away; no shop words |
| Proud pile + "show a grown-up" | Could become "ask for things"; in "proud" mode it may also send the drawing (R-41) | Copy is about showing, not getting. **Founder's decision: the child's star sends it** in "proud" mode. The child's room must **never** say that starring sends anything, and must never reward starring (no counter of stars) so it doesn't become a lever |

**Also:** the **website's pre-ticked family-calendar share** stays by the founder's decision (§C.A). It is an accepted
std 13 residual.

**Also (v0.4):** while unlinked, the child's header has a **"link snickerdoodle (for grown-ups)" t-shirt button** beside the lock (`src/ui/ArtistHeader.tsx`). It is gated first, with no badge, wiggle or narration. **The founder's decision (10 Nov, B8).** Residual: a t-shirt can read as merchandise in a child's space. It is accepted as Low because the button shows only while unlinked, is gated and is quiet.

**Actions.** A-46, A-47 ✓, A-33, A-34; the founder to confirm the weekly-runs default (not blocking).

### 14. Connected toys and devices — ✅ / n/a

The app is not a connected toy. The **Android widget** is a device surface, covered under std 1/8/13 (R-21). No
Bluetooth, no smart-speaker integration. Notifications are local only (no push token — verified).

### 15. Online tools — ◐

**How.** In the corner: what's on this phone, what's been sent, **remove from your keepsake box** (the real, cascading
`DELETE`), delete an artist, delete everything on this phone, unlink, report a problem, the privacy notice, and
**[verified]** the sync choices (narrow or stop; widening is on the website). On the website: linked phones with revoke and **[verified]** the same
choices, changeable either way, plus disconnect; export (includes linked devices — `src/server/exportData.ts`); account closure (revokes
keys — `src/server/accountClosure.ts`); complaints.

**Verified (v0.4).**
- **"Remove everything Draw sent"** is on the account page: confirmed, the real cascading delete, works after unlinking (`removeEverythingDrawSent`, `src/app/account/DrawAppCard.tsx`).
- The drawing-days backup is in the export, can be deleted on the account page, goes with the child or family, and is deleted after a year with no refresh.
- The app itself still removes one drawing at a time and points to the account page for everything.

**Gap.** The app notice's rights section must be finished with the placeholders (A-26).

**Actions.** A-26 — blocking.

---

## C.C Summary

| # | Standard | App | Website (now in scope) | Key gap / action |
|---|---|---|---|---|
| 1 | Best interests | ◐ | ◐ | Gate (A-31/32/63); child's star sends in "proud" (founder, accepted); best-interests notes |
| 2 | DPIA | ◐ | ✅ (LG1) | Sign the addendum after A-45 |
| 3 | Age-appropriate application | ✅ | ◐ | **Reject `CHILD` invites (A-38)** |
| 4 | Transparency | ◐ | ◐ | **Notices, store forms, connect page + slate (A-26–A-29, A-46, A-57)** |
| 5 | Detrimental use | ◐ | ◐ | M3 reasoning; reminders (A-34, A-58) |
| 6 | Policies & standards | ✅ / ◐ | ✅ / ◐ | Ship both PRs together (A-30); bulk delete built ✓ |
| 7 | Default settings | ✅ (verified) | ◐ | Pre-ticked calendar kept (founder; A-56 declined, accepted residual); slate test (A-47) |
| 8 | Minimisation | ◐ | ◐ | "All drawings" (A-48/A-51); `/me` birthdays (A-55); DOB to relatives (A-59) |
| 9 | Data sharing | ✅ / ◐ | ◐ | Share links (A-31); family circle sees kept drawings (A-46); gift links (A-59) |
| 10 | Geolocation | ✅ | ✅ | — |
| 11 | Parental controls | ✅ | ✅ | — |
| 12 | Profiling | ✅ | ✅ | Drawing days never used beyond restore (A-52) |
| 13 | Nudge techniques | ◐ | ◐ | Slate design (A-46); runs/widget/reminder; calendar pre-tick, join-saving |
| 14 | Connected toys/devices | ✅ / n/a | n/a | — |
| 15 | Online tools | ✅ / ◐ | ✅ | Bulk delete + drawing-days lifecycle built ✓; notice rights wording (A-26) |

**Overall (draft):** the app is strongly aligned with the Code by design: on-device by default, no analytics or ads, no
prices, grown-up-gated sharing, high-privacy defaults, and a sync slate with nothing pre-selected. The new risks come
from several places:
- **"all drawings"**: volume, and deletion that must be as easy as stopping.
- **The child's star sending drawings in "proud" mode**, with no notification email. Accepted by the founder.
- **Relatives' birthdays** joining a pre-ticked family calendar.
- **The website's own remaining gaps**, now that it is formally in scope.

None needs a redesign.

## C.D Sign-off (mirrors LG2: signed by the founder as controller)

| Item | Name / date |
|---|---|
| Scope position (§C.A): app and website fully in scope; LG2 Part A withdrawn | **Decided by the founder, 10 Nov 2026**. Signature: Simon Jewell, founder, for Launch Mode Ltd, 12 Nov 2026 10:37 (launch list v6) |
| Founder decisions recorded (10 and 12 Nov 2026): child's star sends in "proud" mode; no notification emails about synced drawings; widening website-only (and only after a fresh sign-in, A-63); **family-calendar share starts unticked** (A-56 accepted, so no reason needed); no child pre-ticked on the connect page; no children's birthdays in the app; family birthdays as the `birthdays` sync choice | Simon Jewell, founder, for Launch Mode Ltd, 12 Nov 2026 10:37 (launch list v6) |
| Website gaps in §C.A accepted as actions, with dates | Simon Jewell, founder, for Launch Mode Ltd, 12 Nov 2026 10:37 (launch list v6): A-57 by 19 Nov 2026 (before uploads switch on); A-58 by 26 Nov 2026; A-38 and A-59 done |
| Assessment approved by (controller): **Simon, founder, for Launch Mode Ltd (trading as Snickerdoodle)** | Simon Jewell, founder, for Launch Mode Ltd, 12 Nov 2026 10:37 (launch list v6). Recorded as D29 |
| DP professional review | n/a: founder's decision to sign as controller (as LG2, 29 Oct 2026); record any later review here |
| Next review date | When uploads launch; three months after "all" goes live; on any new child-facing feature; before listing outside the UK |

*Signed 12 Nov 2026 (D29).*
