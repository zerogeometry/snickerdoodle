# Snickerdoodle — Children's Code (Age Appropriate Design Code) conformance assessment

> **DRAFT — prepared for review by a qualified data-protection professional. Not legal advice.**
>
> Launch gate **LG2** (`project-office/LAUNCH-GATES.md`). Assesses Snickerdoodle against the ICO's Age Appropriate Design Code (issued under DPA 2018 s.123), its 15 standards, and the Data (Use and Access) Act 2025 "children's higher protection matters" duty.
>
> | | |
> |---|---|
> | Controller | Launch Mode Ltd t/a Snickerdoodle |
> | Version / date | v0.1 draft, 2026-10-12 |
> | Evidence baseline | Source code on `build/phase-0-trust-spine` (HEAD `7d1c3bd` + working tree), 2026-10-12. File references given for each claim. |
> | Companion | `DPIA-draft.md` (risks R-nn, actions A-nn), `OPEN-QUESTIONS-for-DP-professional.md` (**[OQ-n]**) |
> | Status | Draft — not signed off |

---

## Part A — Does the Code apply? (scoping)

### A.1 The test

The Code applies to an **information society service (ISS)** that is **likely to be accessed by children** (under-18s) in the UK — whether or not children are the intended audience. ICO guidance treats "likely" as *more probable than not* that a *more than de minimis* number of children will access it, judged on evidence: the nature and content of the service, its appeal to children, the way it is accessed, and any age-assurance measures. Children who are merely the **subjects** of data processed by an adult-facing service are **not**, by that fact alone, "users" who bring the service into scope.

### A.2 Facts

| Factor | Evidence | Points towards |
|---|---|---|
| Intended users | Parents/guardians and adult relatives; terms state *"Snickerdoodle is for adults to use on behalf of their family. Only a parent or guardian may create an account"* (`src/app/(marketing)/trust/terms/page.tsx`). Children are never account holders (`accounts` table comment; `children` are subjects only). | Out of scope |
| Commercial model | Paid physical products bought by adults; Stripe checkout; no free content consumption, games or social feed. | Out of scope |
| Appeal to children | Content is **children's own drawings**; D12 visual direction is **scrapbook, bold crayon colour, stickers, playful motion**; the "start creating" upload flow requires no account. | **In scope** (an ICO trigger factor) |
| Access without barriers | Guest upload + preview with no account and no age gate (`src/app/actions/guestUpload.ts`). Magic-link sign-up accepts any email; no age assurance beyond the terms. | In scope (no evidence that children are kept out) |
| Plausible child users | A 13–17-year-old could upload a younger sibling's drawing or their own art, or sign up via the open magic-link flow. The UI routes "Child" in the add-member modal to *adding a keepsake subject*, not an invite (`src/ui/modals/AddFamilyMemberModal.tsx`), but the server-side invite action does **not** reject `relationship = 'CHILD'` (`src/app/actions/invite.ts`, `src/server/invites.ts`), so a child membership is technically creatable. | **In scope** |
| Evidence of actual child usage | None yet (pre-launch). | Unknown |

### A.3 Two positions in the project record

- `docs/05` and `companion-specs/…spine-1 §5`: **"Treat as yes — voluntary conformance."**
- Decision **D10 note (c)**: *"likely out-of-scope — adults-only, children don't access — but evidence it in the DPIA."*

These are compatible: the strict legal answer may be "out of scope", but the project's chosen posture is to **design as though in scope**. This document adopts that posture and records the scoping argument for the DP professional to confirm **[OQ-1]**.

### A.4 Draft conclusion for the reviewer

1. **Formally:** arguably **not** in scope — adult-facing, paid, no content for children to consume; children are data subjects, not users. **But** the child-appealing design, open guest upload, no age assurance, and the `CHILD` relationship option weaken the argument enough that the drafting view is that a **"likely to be accessed" finding cannot be confidently excluded**, particularly for 13–17-year-olds.
2. **Practically:** conform voluntarily to all 15 standards (the brand promise depends on it; DUAA's higher-protection duty pushes the same way; it is cheaper than retrofitting).
3. **Decisions that follow from the scope call** (for the reviewer): (a) confirm that `CHILD` should be rejected server-side for invites (the UI already never offers it as an invite); (b) whether a light age-assurance step (self-declaration at sign-up) is proportionate; (c) whether child-facing transparency material is needed.
4. **Review:** at launch, after 3 months of real usage data (look for signals of under-18 users), and on any new feature that children could use directly.

---

## Part B — The 15 standards

Status key: ✅ met in code · ◐ partly met / gap · ❌ not met · n/a not applicable.

### 1. Best interests of the child — ◐

**Requirement.** The best interests of the child should be a primary consideration when designing and developing the service.

**How the product meets it.**
- Nine "non-negotiables" in `CLAUDE.md` put child safety and privacy ahead of features (e.g. "when unsure, choose the MORE PRIVATE option"); a stop-and-ask rule covers any change that weakens a privacy default.
- Nothing is public; the authz module (`src/authz/policy.ts`) is the single gate for every view; default visibility FAMILY at the DB level (`assets.visibility default 'FAMILY'`).
- Children are never account holders; first name only (`src/server/textSafety.ts` `screenChildFirstName`).
- Content-safety model (D8): CSAM blocked by hash, classifier flags but never auto-rejects a child's drawing.

**Gaps.** Several founder decisions taken for commercial/UX reasons have not yet been weighed against best interests on the record: pre-ticked calendar sharing (D13), auto-keep at purchase, gift links serving originals to bearer-token holders (D14/D16). The CSAM controls are stubbed (DPIA R-07).

**Actions.** Record a short best-interests note against D13, D14, D16 and auto-keep (DP professional to confirm); complete DPIA A-01/A-02/A-11.

### 2. Data protection impact assessments — ◐

**Requirement.** Undertake a DPIA to assess and mitigate risks to children's rights and freedoms.

**How met.** `DPIA-draft.md` (this pack), grounded in code, with a 20-line risk register focused on children.

**Gaps.** Not yet reviewed or signed; several High residual risks.

**Actions.** Complete DPIA sign-off (LG1); re-open on the triggers listed in DPIA §10.

### 3. Age-appropriate application — ◐

**Requirement.** Take a risk-based approach to recognising the age of individual users and apply the standards effectively to child users (or apply them to all users).

**How met.** The service **applies the child-protective standards to all users** — the Code's permitted alternative to age assurance. Every account gets the same high-privacy defaults.

**Gaps.** No age assurance at all, not even self-declaration; guest upload requires no sign-up. The server accepts `relationship = 'CHILD'` on an invite (only the UI prevents it), which would make a child an account holder, contrary to the "children are never account holders" rule.

**Actions.** Decide: (a) add an "I'm a parent, guardian or grown-up family member (18+)" self-declaration at sign-up/upload; (b) reject `CHILD` in `createInvite` server-side (small code change + test) **[OQ-1]**, **[OQ-18]**.

### 4. Transparency — ◐

**Requirement.** Privacy information and other published terms must be concise, prominent and in clear language suited to the age of the child; "bite-sized" explanations at the point of use.

**How met.** Warm plain-English trust pages: privacy notice, family data promise, terms, cookie page, complaint page (`src/app/(marketing)/trust/`). Point-of-use notice at upload (*"By uploading, you confirm it's your little one's own artwork…"* — `src/app/start-creating/page.tsx`). Buyers are told the parent will see who the gift is from (D14).

**Gaps.** Placeholders unfilled (company number, address, ICO number, privacy email). The notice does not cover automated content screening, possible human review, CSAM reporting, calendar sharing, gift-link exposure and purchaser names, gift-request emails to third parties, partner/referral codes, or Stripe's independent-controller role; it refers to "our AI providers" although Phase 1 uses none. No child-facing explanation (only needed if in scope for child users).

**Actions.** DPIA A-14 (update notice + promise); add just-in-time text on: the calendar tick-box, the gift-link creation modal ("anyone with this link can see these pictures for 30 days"), and the gift-request recipient list.

### 5. Detrimental use of data — ◐

**Requirement.** Do not use children's personal data in ways shown to be detrimental to their wellbeing, or that go against industry codes, regulatory provisions or government advice.

**How met.** No engagement-maximising features (no feeds, streaks, notifications to children); no sale of data; no training; reminder emails go to adults only, with consent, capped at one per 7 days and once per occasion (`src/server/reminders/planner.ts`).

**Gaps.** Children's birthdays and names are used in **marketing** emails to relatives ("{name} turns {n} soon … make something") — consented and adult-directed, so probably not detrimental, but it is commercial use of a child's data and should be judged explicitly. Reminder subject lines expose the child's name and age in recipients' inboxes.

**Actions.** DP professional to confirm the reminder use is acceptable **[OQ-4]**; move child name/age out of subject lines (DPIA A-20).

### 6. Policies and community standards — ◐

**Requirement.** Uphold your own published terms, policies and community standards.

**How met.** Server-side enforcement of the published rules: first-name-only, abuse screening of names/messages (`textSafety.ts`), FLAGGED/BLOCKED content cannot be printed or gift-linked (`orders.ts`, `giftLinks.ts`), visibility rules enforced in one module.

**Gaps.** The family data promise says *"Once we've made your order, we delete the drawing or photo you uploaded — unless you've chosen to keep it"*; in code, **every personalised order auto-keeps** the artwork indefinitely (`src/server/keepsakes.ts`), so the promise is not upheld. The promise says *"you can switch it [a shared link] off whenever you like"* — there is no revoke control in the UI. The promise says *"see everything we hold, download it, or delete it … in one tap"* — export is partial and there is no account/child deletion. No report/takedown path exists for others' images (D8 P0).

**Actions.** Either change the code (DPIA A-06, A-13, A-19, A-23, A-11) or change the words before LG4 — code preferred.

### 7. Default settings — ◐

**Requirement.** Settings must be "high privacy" by default unless there is a compelling reason otherwise, taking account of the best interests of the child.

**How met.**
- Keepsake visibility defaults to **FAMILY** (never EXTENDED, never public) at DB and service level (`schema.ts`, `ingest.ts`).
- Reminder emails **off** by default (no consent record ⇒ no send — `hasReminderConsent`).
- Calendar sharing defaults **off at the database level** (`memberships.sees_occasions default false`; `invites.share_occasions default false`).
- Cookie banner: non-essential cookies off by default.

**Gaps.**
- **D13: the family-calendar share is pre-ticked in both invite forms** — the effective default for every invited relative (including EXTENDED-circle friends) is to see children's full dates of birth. This is the clearest tension with standard 7 **[OQ-4]**.
- **Auto-keep at purchase:** the retention default for ordered artwork is "keep forever", not "delete after fulfilment" **[OQ-9]**.
- Gift-link default expiry 30 days with full-resolution originals.

**Actions.** DPIA A-09 (unticked; day+month only), A-13 (explicit keep choice), A-06 (preview renditions; shorter or parent-set expiry). If the founder keeps D13 pre-ticked, record the "compelling reason" and the best-interests balance for the reviewer.

### 8. Data minimisation — ◐

**Requirement.** Collect and retain only the minimum personal data needed for the elements of the service a child is actively and knowingly engaged in.

**How met.** First name only, surname refused with a friendly message (`screenChildFirstName`); birthday optional; EXIF/GPS stripped before storage (`src/storage/exif.ts`); reminder log stores ids + year only (`reminder_sends`); gift-request recipient emails not stored; partner reports aggregate; no analytics SDKs.

**Gaps.** Full DOB (year included) stored and shared where day+month would serve; Stripe recipient name may be a child's full name and is stored + sent to Prodigi; free-text card messages; buyer email being added to orders for referral checks; invitee emails copied into append-only audit metadata.

**Actions.** DPIA A-09, A-24, A-25; consider storing only birth month/day + optional year-for-age.

### 9. Data sharing — ◐

**Requirement.** Do not disclose children's data unless you can demonstrate a compelling reason, taking account of the best interests of the child.

**How met.**
- Sharing is always **parent-initiated** and scoped: family circle by invite only, identity-verified acceptance (`src/server/invites.ts` `acceptInvite`); tier × circle rules (`authz/policy.ts`); gift links owner-only, kept + content-cleared items only, unguessable token, `noindex`, expiry (`src/server/giftLinks.ts`).
- Processor sharing limited to what is needed: Prodigi gets the print file + delivery details; Stripe gets no child data (line items are product labels).
- POD egress gate blocks live child-image egress until LG3 + DPA are green (`src/fulfillment/gate.ts`).

**Gaps.** Gift links are bearer capabilities that can be forwarded beyond the people the parent intended; the original image is served; no revoke UI; visibility narrowing does not withdraw an asset from an active link. **G11:** unfiled drawings are treated as non-child images by the egress gate, and all uploads are typed DRAWING, so in LIVE mode most children's art would pass the gate without LG3/LG6 (DPIA R-08). Children's first names are visible to EXTENDED-circle members regardless of the calendar setting.

**Actions.** DPIA A-06, A-12 (**[OQ-7]**), A-16; decide whether gift links should require recipients to be named/invited for higher-sensitivity items **[OQ-17]**.

### 10. Geolocation — ✅

**Requirement.** Geolocation options off by default; obvious sign when location tracking is active; options that make a child's location visible to others must default back to off at the end of each session.

**How met.** No geolocation features. Location metadata in uploaded images (EXIF GPS) is **removed before storage** by re-encoding (`stripExif`), and stored originals are flagged `exif_stripped = true`; there is a test helper `hasExif` used to prove stripping. Shipping addresses are collected by Stripe for delivery only, UK-only, and never shown to other family members.

**Gaps.** None in product. (A shipping address on a gift order may be the child's home — handled under minimisation/retention, not geolocation.)

**Actions.** None beyond keeping the EXIF-strip test in the launch-gate suite.

### 11. Parental controls — ✅ / n/a (with a note)

**Requirement.** If you provide parental controls, give the child age-appropriate information about them; if a parent can monitor a child's online activity, provide an obvious sign to the child.

**Assessment.** Snickerdoodle does not monitor children's online activity; the parent is the user and controller of their child's data. The standard's concern (covert monitoring of a child user) does not arise.

**Note.** The relevant "controls" here are the **parent's** controls over others' access — and these have gaps: no remove-member, no change of circle/access, no leave-family, no invite revocation, no gift-link revocation in the UI (DPIA R-20, A-19). These matter for standards 7, 9 and 15 rather than 11.

### 12. Profiling — ✅

**Requirement.** Profiling off by default unless there is a compelling reason; only if appropriate measures protect the child from harmful effects.

**How met.** No profiling of children: no recommendation engine, no behavioural analytics, no advertising, no inferred attributes. Occasions are derived **only** from the parent-entered birthday by a pure, unit-tested function (`src/server/reminders/planner.ts`), with no storage of inferences. The moderation classifier assigns content labels to an *image* for safety, not to a child; it does not use face analysis (must be configured that way — DPIA §4.2).

**Gaps.** Email-provider open/click tracking could create behavioural data about recipients if left on.

**Actions.** DPIA A-20 (disable tracking); confirm Rekognition is used only for content-moderation labels.

### 13. Nudge techniques — ◐

**Requirement.** Do not use nudge techniques to lead or encourage children (or, by extension, the adults acting for them) to provide unnecessary personal data or weaken or turn off privacy protections.

**How met.** No dark patterns found in the core flows: visibility defaults private and changing it is a deliberate act; reminders are a one-tap opt-in/opt-out; guest checkout available without an account; add-ons kept small (brand rule); delete is two-tap to confirm.

**Gaps.**
- **Pre-ticked calendar share (D13)** is a default that leads parents to share more of the child's data (DOB) than they might otherwise choose.
- **"Join family & save 5%"** — a financial incentive for relatives to join the family circle (and thereby see children's art/names); it nudges *adults* into a data-sharing relationship the parent initiated. Probably acceptable (the parent sent the invite), but should be noted.
- **Auto-keep at purchase** — the privacy-weaker retention outcome is the silent default.
- Partner/referral rewards for sharing codes (adult-directed; low concern).

**Actions.** DPIA A-09, A-13; reviewer to confirm the join-saving is not a nudge in the Code's sense **[OQ-4]**, **[OQ-9]**.

### 14. Connected toys and devices — n/a

No connected toys or devices. The PWA is a web app; no device sensors are used. Re-assess if any physical product ever carries a QR code or NFC tag linking to an online keepsake.

### 15. Online tools — ◐

**Requirement.** Provide prominent, accessible tools to help children (and parents) exercise their data-protection rights and report concerns.

**How met.** Account page with "download your data" (JSON export incl. keepsake links) and "delete all my keepsakes" (real, confirmed byte deletion, audited) (`src/app/actions/data.ts`, `src/app/account/`); per-keepsake delete and visibility controls for the controlling parent; one-tap reminder opt-out; complaint page.

**Gaps.** Complaint form **does not submit anywhere** (`ComplaintForm.tsx`) — DUAA s.164A requires an accessible channel and acknowledgement within 30 days. No rights-request intake/tracking (`rights_requests` unused). Export omits consent history, invites, gift links, saved designs, shipping addresses. No account erasure, no child-record deletion/edit, no member removal. No **report/takedown** path on keepsake or gift-link views (D8 P0).

**Actions.** DPIA A-11, A-19, A-23.

---

## Part C — Summary

| # | Standard | Status | Key gap / action |
|---|---|---|---|
| 1 | Best interests | ◐ | Record best-interests reasoning for D13/D14/D16/auto-keep; finish CSAM controls |
| 2 | DPIA | ◐ | Sign off LG1 |
| 3 | Age-appropriate application | ◐ | Self-declaration; reject `CHILD` invites server-side |
| 4 | Transparency | ◐ | Update notice + just-in-time text |
| 5 | Detrimental use | ◐ | Confirm reminder use; child name out of subject lines |
| 6 | Policies & community standards | ◐ | Promise vs code mismatches (auto-keep, revoke, delete, takedown) |
| 7 | Default settings | ◐ | Pre-ticked calendar; auto-keep; gift-link defaults |
| 8 | Data minimisation | ◐ | Full DOB; recipient name; audit emails |
| 9 | Data sharing | ◐ | Gift-link bearer model; **G11 egress** |
| 10 | Geolocation | ✅ | — |
| 11 | Parental controls | ✅ / n/a | (parent's access controls incomplete — see 7/9/15) |
| 12 | Profiling | ✅ | Disable email tracking |
| 13 | Nudge techniques | ◐ | Pre-ticked calendar; auto-keep; join-saving |
| 14 | Connected toys | n/a | — |
| 15 | Online tools | ◐ | Complaints, full erasure, takedown, member removal |

**Overall (draft):** the architecture is strongly aligned with the Code (private-by-default, central authorisation, minimisation, no profiling, no geolocation). Conformance is currently **partial** because several controls the public pages promise are not yet built, and three founder decisions (pre-ticked calendar, auto-keep at purchase, bearer gift links serving originals) sit in tension with standards 7, 9 and 13. None requires a redesign; all are bounded code changes or a founder re-decision.

## Part D — Sign-off

| Item | Name / date |
|---|---|
| Scope conclusion confirmed by (DP professional) | |
| Assessment reviewed by (DP professional) | |
| Approved by (controller) | |
| Next review date | |
