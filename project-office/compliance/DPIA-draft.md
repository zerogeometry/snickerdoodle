# Snickerdoodle — Data Protection Impact Assessment (DPIA)

> **DRAFT — prepared for review by a qualified data-protection professional. Not legal advice.**
>
> Launch gate **LG1** (`project-office/LAUNCH-GATES.md`). Structured on the ICO's DPIA guidance and sample template (UK GDPR Art 35; DPA 2018; PECR; Data (Use and Access) Act 2025; ICO Age Appropriate Design Code; Online Safety Act 2023).
>
> | | |
> |---|---|
> | Controller | Launch Mode Ltd, trading as Snickerdoodle (snickerdoodle.co.uk) — [company number], [registered office] |
> | ICO registration | [not yet registered — LG5] |
> | Version / date | v0.2 draft, 2026-10-16 (v0.1: 2026-10-12) |
> | Prepared by | Claude Code (drafting agent) for Simon (founder / controller) |
> | Reviewer | [qualified DP professional — to be appointed] |
> | Status | **Draft. Not signed off. No live personal data may be processed on the basis of this document.** |
>
> **Evidence baseline.** Every statement about "what the product does" was checked against the source code on branch `build/phase-0-trust-spine` (HEAD `7d1c3bd` plus uncommitted working-tree changes) on 2026-10-12. Where the code and the design documents disagree, this DPIA reports **the code** and flags the gap. File references are given so the reviewer (or a technical adviser) can verify. The application is under active development; any material change re-opens this DPIA (§11).
>
> Companion documents: `CHILDRENS-CODE-assessment-draft.md` (LG2) and `OPEN-QUESTIONS-for-DP-professional.md` (judgement calls flagged throughout as **[OQ-n]**).
>
> **What changed since v0.1 (2026-10-12 → 2026-10-16) — please re-check these against the code; parts of §8 describe gaps that have since been built.** The body below is v0.1 except where marked *(v0.2)*.
>
> - **Built since v0.1 (closes or narrows earlier gaps):** account closure with an honest preview and the option to hand the family to another adult (`src/server/accountClosure.ts`); rights-request intake (`src/server/rights.ts`, closes PA-21's gap); a full data export (`src/server/exportData.ts`); a post-purchase "keep it?" choice — artwork not kept is held only as long as the order needs (`src/server/keepChoice.ts`, narrows R-09); a 6-year audit retention purge (migration 0034); an erasure ledger re-applied after any backup restore (`src/server/erasureLedger.ts`, `project-office/ops/BACKUPS-AND-ERASURE.md`, narrows R-10c); profile pictures/banners with their own authz (`src/authz/profileImages.ts`) and verified email change.
> - **New processing *(v0.2)*:** PA-22 Studio designs and their screening · PA-23 a guest's "keep after sign-in" request · PA-24 the drawing held briefly in the parent's own browser · PA-25 product popularity ranking (no personal data) · PA-26 human review of flagged pictures — see §2.1. **Hosting decided (D18):** all-AWS, one Lightsail server in London — see §5.
> - **Prodigi labs confirmed by live quotes *(v0.2)*:** see the Prodigi row in §5 — all shop products from GB labs, **greetings cards from a lab on Guernsey**, and the one EU-made product (28×40″ frame, Netherlands) withdrawn.

---

## 1. Why a DPIA is needed (screening)

A DPIA is required, or at minimum strongly indicated, on several independent grounds:

| Screening criterion | Applies? | Why |
|---|---|---|
| ICO list of processing "likely to result in high risk" — **use of children's personal data for marketing/profiling, or offering online services to children** | Yes (marketing limb) | Children's first names and birthdays drive consent-based "it's nearly X's birthday" reminder emails to parents and invited relatives (`src/server/reminders/`). No profiling of children takes place, but the marketing limb is engaged. |
| Vulnerable data subjects (Art 35 / EDPB WP248 criterion) | Yes | Children's images, first names and dates of birth are the core data set. |
| **Innovative technology / automated processing of images** | Yes (planned) | Automated content-moderation classifier (AWS Rekognition) and CSAM hash-matching (IWF Image Intercept) on every upload — D8. Self-hosted image operations (background removal, upscaling). Generative edits are deferred to Phase 3 (not in scope of this version). |
| Processing that could involve criminal-offence data (Art 10) | Yes (edge case) | A CSAM hash match is information relating to a (suspected) criminal offence — see §4.3 and **[OQ-6]**. |
| Data shared beyond the controller (gifting, family circle) | Yes | Children's art is shown to parent-invited relatives and, via gift links, to anyone holding a link the parent shares. |
| Children's Code standard 2 | Yes if in scope | The Code requires a DPIA for in-scope services; we conform voluntarily in any case (see LG2 document and **[OQ-1]**). |

**Conclusion:** DPIA required. Because several residual risks are currently **High** (see §8), the reviewer should also consider whether **prior consultation with the ICO (Art 36)** would be needed if those risks cannot be reduced before launch (§10).

---

## 2. Description of the processing

### 2.1 Nature — what we do with the data

Snickerdoodle turns children's drawings (and, in principle, family photos) into printed keepsakes and gifts, and keeps them in a private, invite-only "Family Keepsake Home". The processing operations, each traced to code:

| # | Processing activity | What happens | Code |
|---|---|---|---|
| PA-01 | **Guest ("wow") upload** — no account | A visitor uploads an image without signing in. Metadata (EXIF/GPS) is stripped by re-encoding; the image is stored privately; a single-use claim id is held in an HMAC-signed, httpOnly cookie. Terms acceptance + version recorded on the asset. Scheduled for purge 30 days after upload unless kept. | `src/app/actions/guestUpload.ts`; `src/server/ingest.ts` `ingestEphemeralUpload`; `src/storage/exif.ts`; `src/server/uploadClaims.ts` |
| PA-02 | **Member upload** | A family member with CONTRIBUTE access uploads; same stripping/storage; controller resolved server-side (the child's controlling parent where a child is named). | `src/server/ingest.ts` `ingestOriginalAsset`; `src/app/actions/keep.ts` |
| PA-03 | **Content-safety screening** | Every upload passes a CSAM hash check then a moderation classifier; verdict stored as CLEAR / FLAGGED / BLOCKED; FLAGGED/BLOCKED audited. **Providers are currently stubs that return CLEAR for everything.** | `src/server/moderation/index.ts`, `providers.ts` |
| PA-04 | **Magic edits** (background removal, upscale) | Run in-process on our own infrastructure (`sharp`, deterministic algorithms); output stored as a derivative; budget-capped per creation/account. **No third party sees the image.** | `src/ml/client.ts`; `src/server/magic.ts` |
| PA-05 | **Keeping in the Keepsake Home** | A draft is "adopted" into the parent's family, kept indefinitely (`keptInHome=true`, `purgeAfter=null`), default visibility FAMILY. **Every personalised order auto-keeps its artwork** (see R-09). | `src/server/assets.ts` `adoptEphemeralDraft`; `src/server/keepsakes.ts` `keepAndFileCreations`; `src/app/actions/order.ts` |
| PA-06 | **Child subjects** | Parent records a child's first name (surname refused) and optional birthday (full date). | `src/server/children.ts`; `src/server/textSafety.ts` `screenChildFirstName` |
| PA-07 | **Family circle & invites** | Owner invites relatives by email; circle derived server-side from relationship; access level chosen; invite token (192-bit) valid 14 days; acceptance requires the signed-in email to equal the invited email. | `src/server/invites.ts`; `src/app/actions/invite.ts`; `src/authz/` |
| PA-08 | **Visibility & authorisation** | Central policy: family-scope check first, then tier × circle (ONLY_ME < FAMILY < EXTENDED). Signed URLs minted only after ALLOW (120 s default, 300 s for home thumbnails and gift links). | `src/authz/policy.ts`, `actions.ts`; `src/server/assets.ts`; `src/server/home.ts` |
| PA-09 | **Family calendar (D13)** | Per-invite "share the family calendar" choice, **pre-ticked in the UI**, stored per membership; relatives with it see children's birthdays (full date) and may opt into their own reminders. Parent can switch it off per member; audited. | `src/server/invites.ts` `setMemberSeesOccasions`; `src/server/home.ts`; schema `memberships.sees_occasions`, `invites.share_occasions` |
| PA-10 | **Reminders** | Daily job; recipients = owner + relatives with calendar access, **each only with their own GRANTED REMINDERS/EMAIL consent**; once per occasion, max one per recipient per 7 days, 10–21 days before the birthday. Email names the child's first name and age. | `src/server/reminders/index.ts`, `planner.ts`; `/api/jobs/reminders` |
| PA-11 | **Gift links / gift requests (D14, D16)** | Owner freezes a snapshot of kept, content-cleared keepsakes (or saved designs) into a link with an unguessable 192-bit token, 30-day expiry. Anyone holding the link sees the keepsake images (signed URLs to the **original**) and can buy; owner may email the link to members and/or up to 20 typed addresses with a short screened note. Bought items are ticked off; the parent (only) sees who it was "from". | `src/server/giftLinks.ts`; `src/server/giftListNotify.ts`; `src/app/g/[token]/` |
| PA-12 | **Saved designs ("+ Keepsake")** | A drawing-on-a-product saved for later; cascades on asset deletion. | `src/server/savedDesigns.ts` |
| PA-13 | **Orders & payment** | Server-priced orders; Stripe Checkout (hosted) collects card, email and UK shipping address; webhook (signature-verified, idempotent) stores the shipping address and buyer email on the order. Card data never reaches us. | `src/server/orders.ts`; `src/payments/stripe.ts`, `webhook.ts` |
| PA-14 | **Fulfilment (POD)** | In-VPC render of a 300 DPI print file; an **egress gate** decides whether the file may be sent to Prodigi; Prodigi receives the print file (via a 48-hour signed URL), recipient name + address and our order reference. | `src/fulfillment/gate.ts`, `submit.ts`, `worker.ts`; `src/storage/objects.ts` `presignProviderIngest` |
| PA-15 | **Discount, partner & referral codes (D15)** | Server-resolved codes; partner commission (influencer / PTA / referral) recorded per order; partner earnings reported in aggregate by an operator script. Referral programme (codes derived from the parent's name, £ credit ledger, `orders.buyer_email`) **was being added concurrently at the time of drafting**. | `src/server/promos.ts`; `src/pricing/`; `scripts/promo-codes.mjs`; `src/server/referrals.ts` (in progress) |
| PA-16 | **Authentication** | Passwordless magic link (Auth.js), database sessions in our Postgres; link valid 24 h. | `src/auth/` |
| PA-17 | **Data-rights self-service** | "Download your data" JSON export; "delete all my keepsakes" (really deletes bytes + rows). | `src/app/actions/data.ts`; `src/app/account/` |
| PA-18 | **Retention purge** | Daily job deletes un-kept assets past `purge_after` (bytes first, confirmed, then rows), skipping assets on in-flight orders and CSAM-BLOCKED items. | `src/server/retention.ts`; `/api/jobs/retention` |
| PA-19 | **Audit & consent logging** | Append-only `audit_records` (trigger-enforced) and `consent_records`. | `src/db/schema.ts`; migrations |
| PA-20 | **Email** | One Mailer port; only a **console** adapter exists (dev). Production refuses to start sending without a real provider (D7 open). | `src/server/mail/index.ts` |
| PA-21 | **Complaints / rights requests** | Public complaint form exists but **does not yet submit anywhere**; `rights_requests` table exists, no intake code. *(v0.2: intake now built — `src/server/rights.ts`.)* | `src/app/(marketing)/trust/data-complaint/ComplaintForm.tsx` |
| PA-22 *(v0.2)* | **Studio designs + their screening** | Non-destructive edits (crop, any-angle rotation, background removal, added words, pen lines, shapes) stored as a recipe on the asset; a full-resolution "design" derivative is rendered in-process. **Anything drawn or added is new content, so the design is screened** like an upload: the moderation classifier, plus OCR of words written into the image run through the same abuse screen as typed words (a failed read routes to review). Verdict = the worse of the upload's and the design's; FLAG for review, never auto-reject; audited. Typed words abuse-screened before saving. Providers are still stubs (as PA-03). | `src/server/studio-doc.ts`; `src/server/moderation/index.ts` `moderateDesignAndRecord`; `src/server/print/studioOverlay.ts` |
| PA-23 *(v0.2)* | **Guest "keep after sign-in"** | A guest taps "+ keepsake", then enters an email to sign in. Only after their upload claim is verified, we store **a SHA-256 hash of the email (never the address)** + the asset id, for **24 hours**; when that person signs in (any device) the drawing is adopted into their family and kept, and the row deleted. Expired rows are purged by the daily retention job; erasing the drawing cascades. | `src/server/keepsakes.ts` `rememberKeepForEmail` / `finishPendingKeeps` / `purgeExpiredPendingKeeps`; migration 0037 `pending_keeps` |
| PA-24 *(v0.2)* | **Drawing held in the parent's own browser** | To put the drawing back on screen after that sign-in, the page stores it (the image the parent just uploaded) in **the parent's own browser (IndexedDB)** for at most **1 hour**, and deletes it the moment the page reads it back. Never sent anywhere by this mechanism; best-effort (private browsing = no copy). | `src/lib/pending-keep.ts` |
| PA-25 *(v0.2)* | **Product popularity ranking** | Daily count of units sold per product in the last 90 days (paid orders only), blended with a fixed expected order, to sort the shop. Aggregate product counts only — **no personal data** is read out or stored by the ranking. | `src/server/popularity.ts`; `/api/jobs/popularity` |
| PA-26 *(v0.2)* | **Human review of flagged pictures** | Only when the automated checks FLAG a picture (never by default). A named admin, signed in **with two-step login** (TOTP; secret sealed at rest; 8-hour step-up), sees a queue of flagged items with the picture **hidden until they choose to look**. Every look is audited **before** the picture is served (`CONTENT_REVIEW_VIEWED`), as is every decision (`CONTENT_REVIEWED`): "it's fine" (cleared for printing) or "remove" (the full cascading erase). Pictures are streamed through the server (no signed URL, `no-store`), never downloaded. **CSAM-blocked content is never listed or viewable** — only a count, pointing to the runbook. No admin role can be granted from inside the app (`scripts/make-admin.ts`). Disclosure in the privacy notice: [to draft — OQ]. | `src/authz/review.ts` `canReview`; `src/server/admin/*`; `src/app/admin/review`; migration 0038 |

**Not done (by design):** no public profiles, feeds, comments or marketplace; no facial recognition or biometric processing; no behavioural advertising; no third-party analytics or advertising pixels found in the code (a cookie banner exists with non-essential off by default — `src/ui/components/CookieBanner`); no generative AI and no third-party image processor in Phase 1.

### 2.2 Scope — whose data, how much, how long

- **Data subjects:** (a) parents/guardians (account holders, family owners); (b) **children** (subjects of drawings/photos, named by first name, optional date of birth — never account holders); (c) invited relatives and family friends (account holders once joined); (d) **people the parent emails** (invitees who have not joined, gift-request recipients); (e) **guest buyers** via gift links (may never create an account); (f) gift **recipients** whose name/address is given at checkout; (g) partners (influencers, PTA contacts, referring parents).
- **Volume:** pre-launch; expected small at launch (sole trader scale). Children's images are the highest-sensitivity item by policy, though not special-category data (no biometric/unique-identification processing — §4.2).
- **Geography:** UK customers only at launch (Stripe shipping restricted to GB — `src/payments/stripe.ts`).
- **Retention:** see §3 and R-09; several periods are **not yet defined or enforced in code**.

### 2.3 Context

- Parents reasonably expect a children's-keepsake service to be private and to treat their children's art with care; the brand promise ("nothing is ever public", "we delete what we don't need") raises that expectation further and must be **true in code** before launch.
- Relatives are invited by the parent; children have no control and cannot be consulted directly. Older children (13–17) could plausibly use the site (see LG2).
- The service is a sole-operator start-up with no security team — operational controls must be simple and automated.
- Current concerns in this space: CSAM upload abuse of image services; exposure of children's images via shareable links; retention creep; AI training on children's images (explicitly excluded — no AI processor in Phase 1).
- Codes/standards: ICO Children's Code; ICO guidance on DPIAs, children, direct marketing (PECR reg 22), and international transfers; Online Safety Act illegal-content duties (scope to be confirmed — **[OQ-2]**).

### 2.4 Purposes

1. Make and deliver the keepsake the parent (or a gift buyer) ordered.
2. Keep a private family archive the parent controls.
3. Let the parent share selected keepsakes with people they choose (family circle, gift links).
4. Send consented birthday reminders.
5. Keep the service safe (content safety, CSAM prevention, fraud, security).
6. Meet legal obligations (tax records, illegal-content reporting, data-rights handling).
7. Run promotions and partner/referral schemes.

Benefits: parents keep and celebrate children's work; relatives can buy meaningful gifts; the privacy-first design is itself the product's differentiator.

---

## 3. Data inventory (Record of Processing, Art 30 view)

Lawful-basis abbreviations: **Contract** = Art 6(1)(b); **LO** = legal obligation Art 6(1)(c); **LI** = legitimate interests Art 6(1)(f); **Consent** = Art 6(1)(a) (+ PECR reg 22 for electronic marketing).

| Data category | Whose | Source | Where stored (code) | Retention — **as built** / *intended* | Lawful basis (proposed) & why |
|---|---|---|---|---|---|
| Uploaded original image (drawing / photo), EXIF stripped | Child (subject); parent/uploader | Parent / guest uploader | S3 private bucket, key `assets/{id}/original` (`src/storage/objects.ts`); row in `assets` + `storage_objects` | **Un-kept: purge 30 days after upload** (`ingest.ts`, `retention.ts`). **Kept: indefinite until parent deletes.** *Intended: fulfilment + 30 days unless kept* — `fulfilled_at` is never stamped (R-09). | **Contract** (D10) for upload → make → deliver; action-based acceptance recorded (`terms_accepted_at`, `terms_version`). Keeping in the Home: **Contract** (the archive is the service the parent chose) — but see auto-keep at purchase, R-09 / **[OQ-9]**. |
| Derivatives (cutouts, upscales, print files, mockups) | Child | Generated by us | S3 `assets/{id}/derivatives/*`; `storage_objects` | Cascade with the asset (`deleteAsset`, purge) | Contract |
| Moderation verdict + labels | Child / uploader | Automated | `assets.moderation_status`, `moderation_detail`; `audit_records` (FLAGGED/BLOCKED) | With the asset; audit row indefinite (no audit retention defined) | **LI** (keeping service and printers safe; protecting children) and, for CSAM, **LO** if OSA illegal-content duties apply — plus Art 10 condition **[OQ-6]** |
| CSAM-matched (BLOCKED) asset | Unknown subject (victim); uploader | Upload | Same bucket and table as everything else; **excluded from purge**; never viewable | **Indefinite — no period defined** | LO / substantial public interest — **[OQ-6]** |
| Child first name | Child | Parent | `children.first_name`; gift-link title ("Mia's wishlist") | **No deletion or edit path exists** (R-10) | Contract (personalisation; filing keepsakes) |
| Child date of birth (full date, optional) | Child | Parent | `children.birthday` | **No deletion or edit path exists** | Contract for storage/"coming up" display; **Consent (PECR)** for reminder emails. Sharing with relatives: see D13, **[OQ-4]** |
| Parent account (email, display name, verified-at) | Parent / relative | Self | `accounts` | **No account-deletion path** — "close account" deletes keepsakes only (R-10) | Contract |
| Session & magic-link tokens | Account holder | System | `sessions`, `verification_tokens` | Session expiry (Auth.js default); tokens 24 h; rows not purged | Contract / LI (security) |
| Family, memberships (relationship, circle, access, calendar flag, join-saving used) | Parent, relatives | Parent / system | `families`, `memberships` | No removal/leave path; no retention | Contract |
| Invitee email + relationship | Third party (not yet a user) | **Parent** | `invites` (+ email copied into `audit_records.metadata`, append-only) | Invite expires 14 days but row kept indefinitely; audit copy indefinite | **LI** (parent's request to invite a relative; ours to deliver it). PECR status of the invite email — **[OQ-12]** |
| Gift-request recipient emails | Third party | Parent | **Not stored** (only a count audited); passes through the email provider | Transient | LI — PECR status **[OQ-12]** |
| Gift link (token, title, frozen items) | Child (art), parent | Parent | `gift_links` | Expires 30 days; row kept; **no revoke UI** | Contract (parent's chosen sharing) |
| Gift "from" name | Gift buyer | Buyer (defaults to account name or email local-part if left blank) | `orders.gift_from_name` | Order retention | Contract with the buyer (told "we'll let the family know it's from you") |
| Order (items, totals, codes, gift flag, Stripe session id) | Buyer (parent, relative or guest) | Buyer / system | `orders`, `order_items` | *Intended 6 years (HMRC)*; **not enforced in code** | Contract; LO (tax records) |
| Buyer email | Buyer | Account or Stripe | `orders.buyer_email` (being added for referral checks) | As order | Contract / LI (fraud/self-referral prevention) |
| Shipping name + address | **Gift recipient** (may be the child — risk of full name/surname) | Buyer via Stripe Checkout | `orders.shipping_address`; sent to Prodigi | As order | Contract (delivery). Minimisation issue: R-19 |
| Card inside message (free text ≤600 chars) | Buyer; may name the child | Buyer | `order_item_artwork.message`; printed by Prodigi | As order | Contract; abuse-screened |
| Payment data | Buyer | Stripe | **Stripe only** — we hold a session id | Stripe's retention | Contract; Stripe — processor/controller status **[OQ-14]** |
| Consent records (reminders) | Account holder | Self | `consent_records` (append-only per change) | Indefinite (no evidence window defined) | LO/LI (accountability evidence) |
| Reminder sends (ids + year) | Recipient; child id | System | `reminder_sends` | Cascades on account/child deletion (which do not exist yet) | Consent (the send); LI (log) |
| Promo/partner codes, commission per order | Partner (name), buyer | Operator | `promo_codes`, `orders.partner_commission_pence`; referral `owner_account_id`, `account_credits` | Not defined | Contract with partner; LI (attribution) |
| ML-operations ledger | Account | System | `ml_operations` | Not defined | LI (cost/abuse cap) |
| Audit records | All | System | `audit_records` (append-only trigger) | **Not defined** — and append-only conflicts with erasure of personal data in `metadata` (R-18) | LI / LO (accountability, Art 5(2)) |
| Upload-claim cookie; session cookie | Visitor | System | Browser | 30 days (claim) / session | Strictly necessary (PECR reg 6 exemption) |
| Server logs | All | System | Hosting logs (infra not yet built) | *Intended 30–90 days* | LI (security) |

**Not collected:** child surname (screened out of name fields — but see R-19 for leakage routes), child account, location (EXIF/GPS stripped), biometrics, special-category data, payment card data.

---

## 4. Lawful basis — detailed notes

### 4.1 Article 6 by activity

- **Upload → make → deliver (PA-01, -02, -04, -13, -14): Contract**, per decision D10. No consent tickbox (bundled consent would be invalid). The upload notice is action-based acceptance with a prominent rights warranty (`src/app/start-creating/page.tsx`). For a **guest upload**, no contract yet exists; the processing is *pre-contractual* ("steps at the request of the data subject prior to entering into a contract", Art 6(1)(b)). The reviewer should confirm this framing for a pre-account upload of a child's image by an unverified person **[OQ-8]**.
- **The child's data under a contract with the parent:** the child is not a party. Art 6(1)(b) covers processing necessary for a contract *with the data subject*. Processing the child's image to perform the **parent's** contract is therefore more cleanly analysed as **legitimate interests** of the parent and of Snickerdoodle (with a child-weighted balancing test) or as Contract-by-extension. This is a known point of debate; the reviewer should decide and the privacy notice should match **[OQ-8]**.
- **Keepsake Home (PA-05):** Contract (archive is a feature the parent chose). The **auto-keep on personalised purchase** is not an active parental choice — it is a default. Recommend either an explicit "keep in your keepsake box" choice at checkout or treating the post-order period under the 30-day rule **[OQ-9]**.
- **Family circle, gift links, calendar (PA-07, -09, -11):** Contract with the parent (they asked us to share). Invitees' and recipients' emails: **LI**.
- **Reminders (PA-10):** storage of DOB = Contract; the email = direct marketing → **Consent under PECR reg 22**, recorded per recipient (`consent_records`, `setReminderConsent`). Off by default (latest-record-wins; no record ⇒ no send). Relatives give their own consent. ✔ consistent with D10(d).
- **Content safety (PA-03):** LI (protecting children and the public; keeping illegal material out of print) and LO where OSA duties apply **[OQ-2]**. Note the classifier processes **every** child's image to protect against a small number of bad actors — the balancing test should be written up; the in-region choice and no-human-by-default posture are the main safeguards.
- **Fraud/self-referral checks, security, audit:** LI.
- **Tax records:** LO (6 years).
- **Marketing email (non-reminder):** not built. When built: Consent (or soft opt-in for existing customers, email only) under PECR; never folded into the upload (D10(d)).

### 4.2 Special-category data (Art 9)

Children's photographs are **not** special-category data unless processed by specific technical means for unique identification. We do no facial recognition. The moderation classifier (Rekognition *Content Moderation*, not face APIs) labels content categories; it must be configured **not** to use face detection/recognition APIs. Hash-matching identifies *known images*, not people. ⇒ No Art 9 condition needed, subject to reviewer confirmation **[OQ-6]**.

### 4.3 Criminal-offence data (Art 10 / DPA 2018 s.10–11, Sch 1)

A positive CSAM hash match, its preservation and any report to IWF/NCA is processing of personal data relating to a suspected criminal offence (the uploader's). Art 10 requires a Schedule 1 condition (candidates: Part 2 para 10 *preventing or detecting unlawful acts*; para 18 *safeguarding of children*; or Part 1/3 conditions linked to a legal obligation under the OSA), plus an **appropriate policy document** where Sch 1 requires one. Not yet drafted **[OQ-6]**.

### 4.4 Children and consent

No processing relies on a child's consent; no information society service is offered *directly* to a child (Art 8 not engaged), subject to the Children's-Code scope analysis in the LG2 document **[OQ-1]**.

---

## 5. Processors, sub-processors and international transfers

> None of these is contracted yet (LG5). The `sub_processors` table exists in the schema and the POD egress gate reads it (`src/fulfillment/gate.ts`), but it is **empty**.

| Processor | Role / data | Location (expected) | Status in code | DPA (Art 28) | Transfer status | Notes / risks |
|---|---|---|---|---|---|---|
| **AWS — S3 + KMS** (eu-west-2 London) | Storage of all images; at-rest encryption | UK | Built against S3 API (MinIO locally). SSE-KMS **applied only if `S3_KMS_KEY_ALIAS` is set** (`objects.ts`). No infrastructure-as-code in repo (bucket policy, public-access block, versioning, lifecycle, backups not codified). | AWS GDPR DPA (incorporated in AWS Service Terms) — to be accepted/recorded | UK region; AWS is a US parent — **remote-access / US CLOUD Act exposure** to assess; AWS relies on UK IDTA/Addendum + UK–US data bridge where applicable | Make KMS mandatory in production; codify bucket hardening (A-03) |
| **AWS — hosting/compute, Postgres, logs** *(v0.2: D18)* | All personal data | UK (eu-west-2) | Not deployed. **Decided (D18, 2026-10-16): one AWS Lightsail instance in London** running the app, jobs and Postgres on the same box (replaces the ECS/App Runner + RDS intent in `proposal/00-tech-stack.md`). Images are never stored on the server — they stay in private S3. | As above (Lightsail is covered by the same AWS Service Terms / GDPR DPA) | As above | Backups: nightly encrypted DB dump to S3 + Lightsail snapshots, both inside the retention schedule; the DB holds no image bytes. See R-10 |
| **AWS — Rekognition Content Moderation** (eu-west-2) | Every uploaded image (single image per call) | UK | **Not wired — stub returns CLEAR** (`moderation/providers.ts`) | AWS DPA must cover Rekognition | UK region | **AWS may store and use AI-service content to improve services unless the account opts out via an AWS Organizations "AI services opt-out" policy** — must be enabled before any child image is sent (A-08). Verify current AWS terms. |
| **IWF — Image Intercept** | Hash (and possibly image-derived data) of every upload | UK | **Not wired — stub returns "no match"** | IWF membership/onboarding agreement; determine whether IWF acts as processor, independent controller, or neither (hash-only) | UK | Verify what leaves our system (hash only vs image) and which hash types are matched (see R-07: our current SHA-256 is of *re-encoded* bytes and will never match a known-image list) |
| **Prodigi** (print-on-demand) | Print file (child's art), recipient name + address, order reference, card message (printed) | UK company; print lab may vary by product/route | Built (sandbox). Live child-image egress blocked unless `POD_MODE=LIVE` **and** LG3 flag **and** a `sub_processors` POD row with DPA + transfer mechanism — **but see G11 (R-08)** | Required | *(v0.2)* **Lab routing for GB orders, from live sandbox quotes 2026-10-16:** frames, mugs, cushions, blankets, jigsaws, tees — GB labs (uk3, uk9, prodigi_gb3); **greetings cards — lab uk7 on Guernsey** (a Crown Dependency, not the UK; covered by UK adequacy regulations — confirm the transfer basis); the 28×40″ frame routed to an **EU (Netherlands) lab** and has been withdrawn from sale. Prodigi chooses the lab per order, so routing must be confirmed in the DPA. | Prodigi retains downloaded assets (reported ~30 days — to verify); **no provider-deletion handshake implemented** (R-10) |
| **Stripe** (Checkout, payments) | Buyer name, email, card, billing/shipping address, IP; product labels and amounts (no child data sent — verified: line names are product labels only) | Stripe Payments UK / Europe (Ireland); Stripe Inc. (US) group processing | Built (test mode) | Stripe DPA (part of Stripe Services Agreement) | Stripe relies on UK IDTA/Addendum and/or UK–US data bridge — confirm | Stripe acts as **independent controller** for some purposes (fraud, regulatory) — notice must say so **[OQ-14]** |
| **Email provider** — TBD (D7) | Recipient email; message content incl. **child first name + age** (reminders), family name, magic-link URLs, gift-link URLs | Must be UK/EU | **Console-only**; production throws until an adapter exists (`mail/index.ts`) | Required | Prefer AWS SES eu-west-2 (inside the existing AWS footprint) or a UK/EU ESP with no US sub-processing | **[OQ-13]**; disable open/click tracking for child-related emails (tracking pixels = PECR reg 6 + profiling concern) |
| Generative AI provider (Phase 3) | Single image | TBD | Not built; deferred | Required + no-retention/no-training (LG6) | TBD | Out of scope of this version; DPIA must be re-opened before P3 |

**Transfer summary:** with AWS eu-west-2, IWF (UK) and a UK/EU email provider, **no restricted transfer of children's images is planned** — the residual transfer questions are (i) Prodigi lab routing *(v0.2: GB labs, plus Guernsey for cards — see above)*, (ii) Stripe group processing of buyer data, (iii) US-parent remote access for AWS and any ESP. These feed LG3.

*(v0.2)* **Hosting decided (D18, 2026-10-16): all-AWS, no relaxed rules.** Vercel + Supabase was considered and **not** adopted. One AWS Lightsail server in London (app + Postgres), private S3 in `eu-west-2`, and **two customer-managed KMS keys (a separate one for originals)** — so the A-03 design stands unchanged. Single US-parented provider (AWS) for hosting, storage and moderation keeps the US-parent / remote-access assessment to one supplier. Residual: a single server has no automatic failover — an availability risk, not a confidentiality one; mitigated by encrypted backups and a tested restore (R-10).

*(v0.2)* **Test site (D19, 2026-10-16):** a password-locked, non-indexed test copy on Netlify + Supabase (London) + Resend (EU) holds **test drawings only** and testers' sign-in emails; nothing is charged or printed. It is not the production system and is out of scope for live processing; if any real child's picture were ever uploaded there, treat it as an incident and erase it. Netlify and Resend are US-parented — the test copy carries no children's data by design.

---

## 6. Consultation

| Stakeholder | Status |
|---|---|
| Parents / users | Not yet consulted. Recommend a short usability test of the trust controls (visibility, calendar toggle, delete) with 5–8 parents before launch and record findings here. |
| Children | Not directly consulted (age of subjects). The Children's-Code assessment considers their interests (best-interests standard). |
| Processors | AWS, IWF, Prodigi, Stripe, email provider — security/retention questions in §5 to be put in writing. |
| DP professional | This review. |
| Information security | No in-house function; recommend a light external review of the AWS configuration before launch (A-03). |
| ICO | Prior consultation only if high residual risk remains (§10). |

---

## 7. Necessity and proportionality

| Principle | Assessment (as built) |
|---|---|
| **Lawfulness / fairness / transparency** | Bases mapped (§4). Privacy notice (`src/app/(marketing)/trust/privacy/page.tsx`) still has placeholders and **does not yet mention**: automated content screening, possible human review, CSAM reporting, the family calendar share, gift-link purchaser names, gift-request emails to third parties, partner/referral codes, Stripe as independent controller. It also implies an AI processor exists ("our AI providers") — none does in Phase 1. Update before LG4 (A-14). |
| **Purpose limitation** | Images used only to make, show and share keepsakes; no secondary use, no training. Birthday used only for "coming up" and consented reminders (`planner.ts`). ✔ |
| **Data minimisation** | Strong: first name only (`screenChildFirstName`), EXIF/GPS stripped before storage (`stripExif`), no child accounts, reminder log holds ids only, partner reports aggregated. Weaker: **full date of birth** where day+month (+ optional age) would serve reminders; full DOB shared with relatives under D13; original (full-resolution) image served on gift links rather than a preview rendition; shipping/recipient name can carry a child's full name. |
| **Accuracy** | Parent can rename the family; **cannot edit or delete a child's name or birthday** (no code path). |
| **Storage limitation** | Purge job exists and is tested. But: personalised orders auto-keep forever; post-fulfilment window not implemented; no retention rules for children rows, invites, gift links, sessions, audit, consent, orders (6-year rule not enforced), BLOCKED evidence (R-09). |
| **Integrity & confidentiality** | Central authz module with tests; private bucket; short-lived signed URLs; database sessions (revocable); EXIF strip; webhook signatures; text screening. Gaps: KMS optional; no IaC; `AUTH_SECRET` falls back to a hard-coded dev secret in `uploadClaims.ts` if unset; 48-hour bearer URL to POD; moderation stub could reach production unnoticed (`isModerationConfigured()` is defined but **never called**). |
| **Accountability** | Append-only audit for invites, membership changes, visibility, deletions, gift links, consent, purge. Gaps: no member-removal/rights-request events actually emitted (paths not built); this DPIA and the LG2 record. |
| **Data-subject rights** | Export (partial: omits consent history, invites sent, gift links, saved designs, shipping addresses); delete keepsakes ✔; **no account erasure, no child deletion, no member removal, no gift-link revocation in the UI, no invite revocation**; s.164A complaint form does not submit (R-17). |
| **Processors / transfers** | §5 — none contracted; egress gate prevents live child-image egress to POD *only for images it recognises as children's* (R-08). |
| **Could we achieve the purpose with less?** | Yes, in the specific places listed in the Actions (§9): day/month birthdays; unticked calendar by default; preview renditions on gift links; opt-in keep at purchase; shorter gift-link expiry; treat every upload as a child image at the egress gate. |

---

## 8. Risk register

Scoring (ICO model): **Likelihood** Remote / Possible / Probable × **Severity** Minimal / Significant / Severe → **Overall** Low / Medium / High. "Residual" assumes the listed *existing* measures only; the "to reach target" column lists the open actions (§9) that would reduce it.

| ID | Risk to individuals | L | S | Overall (inherent) | Mitigation already in code (file refs) | Residual (as built) | To reach target |
|---|---|---|---|---|---|---|---|
| **R-01** | **Unauthorised access to children's images** (storage misconfiguration, leaked signed URL, compromised credentials) | Possible | Severe | **High** | Private bucket, no public policy set by code (`storage/objects.ts` `ensureBucket`); signed URLs minted only after authz (`server/assets.ts` `getAssetDownloadGrant`, `getStorageObjectGrant`) with 120–300 s TTL; separate provider-ingest URL policy (`presignProviderIngest`); EXIF/GPS stripped (`storage/exif.ts`); DB sessions; webhook signatures. | **Medium** — KMS optional (`S3_KMS_KEY_ALIAS`); no IaC for public-access block / bucket policy / versioning / access logging; signing uses one app credential (ingest URLs not yet on dedicated credentials); `AUTH_SECRET` dev fallback. *(v0.2: admin two-step login built — `/admin/review`, TOTP, audited; see PA-26.)* | A-03, A-04, A-05 → **Low** |
| **R-02** | **Cross-family exposure** (a member of family A sees family B's child) | Remote | Severe | Medium | Family-scope check is STEP 1 of `canViewAsset` (`authz/policy.ts`); membership re-checked ACTIVE + same family + same account; denials indistinguishable from not-found; exhaustive authz test matrix (`src/authz/__tests__`); gift-link capability requires asset in the link's family (`authz/actions.ts` `canPurchaseViaGiftLink`). | **Low** | Keep matrix as launch gate. Minor: every ACTIVE member (incl. EXTENDED circle) sees all members' names/email local-parts and all children's first names (`server/home.ts`) — confirm acceptable (A-16). |
| **R-03** | **Gift-link leakage** — a link forwarded/posted publicly exposes a child's art and family name to strangers | Probable | Significant | **High** | 192-bit random token; `noindex` on `/g/[token]`; 30-day expiry; only **kept + CLEAR** keepsakes can be snapshotted; deleted or un-cleared source ⇒ "gone"; owner-only creation; audited; purchase capability scoped to the snapshot (`server/giftLinks.ts`, `authz/actions.ts`). Buyers see "already bought", never who. | **Medium-High** — link is a **bearer token**; serves the **full-resolution original** (300 s signed URL, downloadable); **no revoke control in the UI** (`revokeGiftLink` exists server-side but nothing calls it); a later visibility change to ONLY_ME/FAMILY does **not** withdraw the asset from an active link; gift requests can email up to 20 arbitrary addresses; family display name shown. | A-06, A-07 → **Medium/Low** |
| **R-04** | **Relatives seeing children's birthdays** (D13, pre-ticked) — DOB disclosed to more people than necessary; DOB + first name + family name + photos aids identity misuse | Possible | Significant | Medium | Calendar share stored per membership, **DB default off** (`memberships.sees_occasions`); parent can switch off per member any time; change audited (`setMemberSeesOccasions`); birthdays hidden from members without it (`server/home.ts`); relatives' reminders need their own consent. | **Medium** — pre-ticked UI default nudges towards sharing; **full DOB including year** is shared; applies to EXTENDED-circle invitees too; no per-child granularity. | A-09 (unticked, day+month only) → **Low**. **[OQ-4]** |
| **R-05** | **Purchaser names shown to the parent** (D14) — a buyer's identity disclosed to the family | Possible | Minimal | Low | Name is buyer-chosen, ≤40 chars, abuse-screened (`screenFromName`); buyer told in advance; shown only to the owner (`listGiftListsForOwner`, `notifyGiftListPurchase`); never to other link holders. | **Low** — but if a signed-in buyer leaves "from" blank, their **account name or email local-part** is used (`defaultFromName`) — less transparent. | A-17: fall back to "someone special" or say so on the form |
| **R-06** | **Human review of flagged children's images** — staff viewing a child's image is itself a privacy event | Possible | Significant | Medium | Classifier only **flags**, never auto-rejects; FLAGGED cannot be ordered or put on a gift link (`orders.ts`, `giftLinks.ts`); FLAGGED/BLOCKED audited. | **Not assessable** — no review queue, no admin role, no access control, no logging of views exists (`accounts.is_admin`, `mfa_secret` unused). Today nobody can review, so flagged items simply sit (kept ones forever). | A-10 (design review tooling: least privilege, MFA, view-logging, blurred-by-default, time-boxed, disclosed) **[OQ-5]** |
| **R-07** | **CSAM handling** — known CSAM uploaded, printed, viewed or redistributed; or mishandled evidence | Possible | Severe | **High** | Verdict model with BLOCKED precedence; BLOCKED never viewable/renderable (`getViewableAssetOrThrow`), excluded from home, gift links, orders and purge (`retention.ts`); audited `CONTENT_BLOCKED`; fail-safe: malformed verdict ⇒ FLAGGED. | **High** — providers are **stubs returning CLEAR**; `isModerationConfigured()` is never called, so nothing stops the stub running in production; the hash passed to the matcher is the **SHA-256 of the re-encoded (EXIF-stripped) bytes**, which can never match a known-image hash list (needs original-bytes hashes and/or perceptual hashing as IWF provides); BLOCKED bytes stay in the general bucket under normal credentials with no segregation, no retention period; no runbook; no NCA/IWF reporting procedure; no decision on whether/how the uploader is told. | A-01, A-02, A-11 → **Medium/Low**. **[OQ-3]**, **[OQ-6]** |
| **R-08** | **POD egress of a child's image before LG3/LG6** (G11) — an unlinked drawing is treated as "not a child image" | Probable (in LIVE) | Significant | **High** | Single egress chokepoint `assertPodEgressAllowed` (`fulfillment/gate.ts`) called in submit and release paths; SANDBOX can never carry a "child image"; LIVE child egress requires LG3 flag **and** a `sub_processors` POD row with DPA + transfer mechanism. | **High** — `isChildImage = childSubjectId !== null \|\| kind === 'PHOTO'`, and **every upload path hard-codes `kind: 'DRAWING'`** (`actions/guestUpload.ts`, `actions/keep.ts`), so the conservative PHOTO branch never fires; any keepsake not filed under a named child is treated as non-child and would egress in LIVE without LG3/LG6. In SANDBOX such art already reaches Prodigi's sandbox. | A-12 (treat every user upload as a child image; brand-safe fixtures flagged explicitly) → **Low**. Founder decision pending **[OQ-7]** |
| **R-09** | **Retention failure / retention creep** | Probable | Significant | **High** | Purge job: bytes deleted + confirmed before rows, kept items untouched, in-flight orders protected, audited (`retention.ts`); triggered by authenticated cron (`/api/jobs/retention`, `jobs/auth.ts`). Tested (`retention.int.test.ts`). | **Medium-High** — (a) **every personalised order auto-keeps** the artwork indefinitely (`keepAndFileCreations` from `actions/order.ts`), so the promised "deleted after your order unless you keep it" rarely applies; (b) `purge_after` = upload + 30 days, `fulfilled_at` never stamped — the post-fulfilment window is not implemented; (c) no retention rules for children, invites, gift links, sessions/verification tokens, consent, audit, orders (6 years), ML ledger, BLOCKED evidence; (d) purge runs only if a scheduler is configured. | A-13, A-15 → **Low**. **[OQ-9]**, **[OQ-10]** |
| **R-10** | **Deletion not cascading** — to Prodigi, to backups, to object versions, or across the account | Probable | Significant | **High** | `deleteAsset`: controller-only, bytes deleted with confirmation + retry, then rows (cascade to `storage_objects`, `saved_designs`; nulls order/ML links); gift links to it resolve "gone"; audited. | **High** — (a) **no Prodigi deletion request** (`PROVIDER_DELETION_*` audit events defined, never emitted); (b) "confirmed" = HEAD fails — if bucket **versioning** is ever enabled, a delete only adds a delete-marker and prior versions survive; (c) backups: crypto-shred/exclusion **not implemented** (no IaC; comment in `retention.ts`/`assets.ts` defers to infra); (d) "close account" (`deleteAllMyKeepsakesAction`) deletes keepsakes in the owned family only — **account, children, memberships, invites, consent, gift links, sessions remain**, yet writes `ACCOUNT_CLOSED`; (e) no child deletion/edit; (f) no member removal or "leave family" path (authz would deny a REMOVED member immediately, but nothing can set that status); (g) deleting an asset on an in-flight order is not guarded. | A-04, A-15, A-18, A-19 → **Low** |
| **R-11** | **Email misdirection** — invite, gift request or reminder (naming a child + age) sent to the wrong person | Possible | Significant | Medium | Invite acceptance requires the signed-in email to match the invited email (identity check, `acceptInvite`); pending invites visible to the owner; gift-request recipients screened for format, capped at 20, note abuse-screened; production refuses to send without a configured provider. | **Medium** — a **mistyped address that belongs to a real person can accept** the invite and join at the chosen circle; **no invite revocation** path (`INVITE_REVOKED` never emitted); reminder subject lines carry child's name + age; provider unchosen. | A-19 (revoke invite; show pending clearly; confirm address), A-20 (minimal email content) |
| **R-12** | **Profiling of children / behavioural advertising** | Remote | Severe | Medium | No analytics/ad SDKs or pixels found; cookie banner with non-essential off by default; reminders computed by a pure function from birthday only (`reminders/planner.ts`); no inference stored (`reminder_sends` holds ids + year only); no recommendation engine. | **Low** | Keep: forbid tracking pixels in emails (A-20); record "no profiling" as a design rule in CLAUDE.md (already there). |
| **R-13** | **Influencer / PTA / referral attribution data** — partners learning about individual families' purchases; school-cohort inference | Possible | Minimal | Low | Attribution only by a code the buyer types (no tracking cookies/links); partner report is aggregate count + commission (`scripts/promo-codes.mjs`); server-side pricing; margin guard. | **Low** — PTA "class label" codes (e.g. "Year 2") with very small counts could single out a family; referral codes embed part of the parent's name (`referrals.ts`, in progress); referrer reward reveals that a known friend ordered; `orders.buyer_email` kept for self-referral checks. | A-21 (minimum cohort size in partner reports; written partner terms; no personal data to partners) **[OQ-11]** |
| **R-14** | **Personal-data breach** (any cause) and slow response | Possible | Severe | **High** | Encryption in transit; authz; audit trail; minimisation. | **Medium** — no breach runbook, no monitoring/alerting, no incident log (spine-1 §11 not yet operationalised). | A-22 → **Low/Medium** |
| **R-15** | **Uploads by unverified persons** (guest flow) — a non-parent uploading someone else's child's photo; a child using the service | Possible | Significant | Medium | Terms say adults only, parent/guardian; rights-warranty acceptance recorded; guest draft visible only to the claim holder; purged after 30 days unless kept; personalised orders require an account. | **Medium** — no age assurance; no ability to report a misuse of one's image (no takedown path built). | A-11 (report/takedown), LG2 age-assurance view **[OQ-1]** |
| **R-16** | **Moderation processor retains/uses children's images** | Possible | Severe | **High** (when wired) | In-region choice (eu-west-2); single image per call by construction of the adapter. | **Medium** until the AWS AI-services opt-out policy is enabled and recorded; IWF data flow unverified. | A-08 → **Low** |
| **R-17** | **Rights requests and complaints mishandled** (DUAA s.164A acknowledgement within 30 days) | Probable | Significant | **High** | Self-service export and keepsake deletion; `rights_requests` schema with clock-pause fields. | **High** — complaint form shows "we've got it" but **sends nothing** (`ComplaintForm.tsx`); no intake or tracking; export incomplete. | A-23 → **Low** |
| **R-18** | **Audit log retains personal data indefinitely and cannot be erased** | Probable | Minimal | Low | Append-only is a deliberate integrity control. | **Low-Medium** — invitee emails stored in `audit_records.metadata`; no retention period; append-only trigger blocks erasure. | A-24 (pseudonymise emails in audit metadata; set retention) **[OQ-10]** |
| **R-19** | **Child's surname or extra identifiers enter via side channels** — shipping name, card message, family name, gift title | Probable | Minimal | Low | First-name screening on child fields; abuse screening on card text and family name. | **Low-Medium** — Stripe-collected recipient name (a gift posted to the child) is stored and sent to Prodigi; card message is free text. Unavoidable for delivery but should be minimised (no use beyond fulfilment; retention). | A-25 |
| **R-20** | **Parent unable to withdraw a relative's access** (falling-out, safeguarding concern) | Possible | Severe | **High** | Authz denies non-ACTIVE memberships immediately; DB sessions are revocable. | **High** — **no remove-member, change-circle or change-access path exists**; the only lever is setting individual keepsakes to ONLY_ME. | A-19 → **Low** |

**Highest residual risks today:** R-07 (CSAM), R-08 (G11 egress), R-10 (deletion cascade), R-20 (no member removal), R-17 (complaints), R-09 (retention), R-03 (gift links). All are fixable in code/process before launch.

---

## 9. Measures to reduce risk — open actions

Owner key: **Code** = build agent; **Founder** = Simon; **DP** = DP professional; **Infra** = AWS configuration (founder + adviser).

| ID | Action | Risks | Owner | Effect | Launch-blocking? |
|---|---|---|---|---|---|
| A-01 | Wire real IWF + Rekognition providers; **call `isModerationConfigured()` as a hard production guard** (refuse uploads/orders when not configured); add a test. | R-07, R-16 | Code + Founder (contracts) | Reduces | **Yes** |
| A-02 | Hash the **original uploaded bytes before re-encoding**, and use the hash types IWF Image Intercept actually matches (incl. perceptual); run the check *before* the bytes are stored where possible. | R-07 | Code | Reduces | **Yes** |
| A-03 | Codify AWS hardening: S3 Block Public Access, deny-non-TLS bucket policy, mandatory SSE-KMS with a **separate key for originals**, access logging, least-privilege IAM, separate ingestion credentials for POD URLs; make `S3_KMS_KEY_ALIAS` and `AUTH_SECRET` mandatory at boot in production. | R-01 | Infra + Code | Reduces | **Yes** |
| A-04 | Decide bucket **versioning** posture; if enabled, delete all versions on erasure; design backups so originals are excluded or crypto-shreddable (per-asset or per-family data keys), document RPO/backup retention. | R-10 | Infra + Code | Reduces | **Yes** |
| A-05 | Admin role + TOTP MFA before any admin/review surface exists. | R-01, R-06 | Code | Reduces | Yes (if review queue launches) |
| A-06 | Gift links: **revoke button** in the Home; withdraw an asset from active links when its visibility narrows or it is deleted; serve a **preview rendition** (watermarked/low-res) rather than the original; consider shorter default expiry (e.g. 14 days) and an expiry the parent can set. | R-03 | Code | Reduces | **Yes** (revoke) |
| A-07 | Gift requests: show the parent exactly who will receive it; rate-limit; keep recipients unstored; decide PECR status **[OQ-12]**. | R-03, R-11 | Code + DP | Reduces | Depends on OQ-12 |
| A-08 | Enable the **AWS Organizations AI-services opt-out policy** for Rekognition (and any AWS AI service) and record evidence in the sub-processor register; confirm IWF data flow in writing. | R-16 | Founder/Infra | Eliminates the training/retention risk | **Yes** |
| A-09 | Family calendar: default **unticked**; share **day + month** (and optionally "turns N") rather than full DOB; consider per-child choice. | R-04 | Founder decision → Code | Reduces | Recommended **[OQ-4]** |
| A-10 | Design human-review tooling (if Rekognition flags are to be reviewed): access-controlled, MFA, every view logged, image blurred until reviewer opts to reveal, time-limited, smallest number of reviewers, disclosed in privacy notice; define what happens to FLAGGED items that are never reviewed. | R-06 | Founder + DP → Code | Reduces | **Yes** before classifier goes live |
| A-11 | **Illegal-content runbook** (detect → preserve → do not view → report to IWF/NCA-CEOP → retain evidence for a defined period → restrict account) + **report/takedown** path on gift-link and keepsake views wired to `deleteAsset`; segregate BLOCKED bytes (separate prefix/bucket, separate key, no app read access). | R-07, R-15 | Founder + DP → Code | Reduces | **Yes** (D8 P0) |
| A-12 | G11: treat **every user upload** as a child image at the egress gate; mark brand-safe test fixtures explicitly (e.g. a `test_fixture` flag set only by seed scripts). | R-08 | Founder decision → Code | Eliminates | **Yes** **[OQ-7]** |
| A-13 | Retention: make "keep at purchase" an explicit parent choice (or apply the post-fulfilment 30-day rule); stamp `fulfilled_at` on delivery and set `purge_after = fulfilled_at + 30d` for unkept assets; ensure the purge cron is deployed and alerting on failure. | R-09 | Founder decision → Code | Reduces | **Yes** **[OQ-9]** |
| A-14 | Update privacy notice + family promise: content screening (automated; possible human review), CSAM reporting, calendar sharing, gift-link visibility and purchaser names, gift-request emails, partner/referral codes, Stripe as independent controller, retention table matching the code, remove "AI providers" wording for Phase 1. | All | Founder (Cowork drafts) | Transparency | **Yes** (LG4) |
| A-15 | Retention schedule in code for: children rows, invites (e.g. 90 days after expiry/acceptance), gift links (e.g. 12 months after expiry, keeping only what's needed for orders), sessions/verification tokens, consent evidence window, orders (6 years then delete/anonymise), ML ledger, BLOCKED evidence. | R-09, R-10 | DP (periods) → Code | Reduces | **Yes** **[OQ-10]** |
| A-16 | Confirm what EXTENDED-circle members see (member list, children's names). | R-02 | Founder | — | No |
| A-17 | Gift "from" fallback: don't derive from email; say on the form what the parent will see. | R-05 | Code | Reduces | No |
| A-18 | Provider deletion handshake with Prodigi (request deletion of print assets after dispatch; record `PROVIDER_DELETION_REQUESTED/CONFIRMED`); confirm Prodigi's retention in the DPA. | R-10 | Code + Founder | Reduces | **Yes** |
| A-19 | Build: remove member / change circle / change access (owner); leave family (member); revoke pending invite; delete/edit a child (cascading to reminders, filing); **real account erasure** (account, sessions, memberships, children, invites, consent → evidence-only, gift links; orders retained per tax rule but pseudonymised); guard deletion of assets on in-flight orders (or cancel the line); reject `relationship = 'CHILD'` on invites server-side (the UI never offers it, the server accepts it). Audit each. | R-10, R-11, R-20 | Code | Reduces | **Yes** |
| A-20 | Email content minimisation: no child name/age in subject lines; no tracking pixels/click tracking; UK/EU provider with DPA (D7). | R-11, R-12 | Founder + Code | Reduces | Yes (D7) |
| A-21 | Partner terms: partners receive aggregate figures only, minimum cohort (e.g. ≥5 orders) before reporting a class label; referral codes not derived from names. | R-13 | Founder + Code | Reduces | No (before partner launch) |
| A-22 | One-page breach runbook + incident log; basic alerting (failed purge, failed deletions, unusual signed-URL volume, auth anomalies). | R-14 | Founder | Reduces | **Yes** |
| A-23 | Wire the complaint form + rights-request intake to `rights_requests` (30-day acknowledgement clock, stop-the-clock, decline-with-signposting); complete the export (consent history, invites, gift links, saved designs, order addresses). | R-17 | Code | Reduces | **Yes** |
| A-24 | Pseudonymise personal data in audit metadata (hash emails); define audit retention (e.g. 6 years) with a documented exception to append-only for scheduled expiry. | R-18 | Code + DP | Reduces | No |
| A-25 | Limit use of shipping name/card message to fulfilment; exclude from exports to partners; apply order retention. | R-19 | Code | Reduces | No |

---

## 10. Residual risk and conclusion

- **As built (2026-10-12):** several residual risks are **High** (R-07, R-08, R-10, R-17, R-20) and others Medium-High (R-03, R-09). **The service must not process live children's data in this state.** This is consistent with the launch-gate position: no live orders until LG1–LG6 close.
- **With launch-blocking actions completed** (A-01–A-04, A-06, A-08, A-10–A-15, A-18–A-20, A-22, A-23): the drafting view is that all residual risks would fall to **Low or Medium**, so **prior consultation with the ICO should not be required** — subject to the reviewer's judgement, particularly on R-03 (bearer gift links) and R-04 (calendar sharing).
- **Re-open this DPIA** on: Phase 3 generative edits; any new processor or region; any public or semi-public feature (gallery, comments, "Collection"); SMS; marketing email; human-review go-live; referral programme launch; any change to visibility defaults; a material incident.

---

## 11. Sign-off

| Item | Name / date | Notes |
|---|---|---|
| Measures approved by | | Integrate actions back into the plan with dates and owners |
| Residual risks approved by | | If accepting any **High** residual risk, consult the ICO before going ahead |
| DP professional advice provided | | DPO-level adviser should advise on compliance, §9 measures and whether processing can proceed |
| Summary of DP professional advice | | |
| DP professional advice accepted or overruled by | | If overruled, give reasons |
| Comments | | |
| Consultation responses reviewed by | | If decision departs from individuals' views, give reasons |
| This DPIA will be kept under review by | | Review at launch, on any trigger in §10, and at least annually |
| Next review date | | |

---

### Appendix A — Code evidence index (verified 2026-10-12)

| Claim | Evidence |
|---|---|
| EXIF/GPS stripped before storage | `src/storage/exif.ts` `stripExif` (re-encode, no `withMetadata`); called in both ingest paths |
| Default visibility FAMILY at DB level | `src/db/schema.ts` `assets.visibility … default('FAMILY')`; `ingest.ts` sets FAMILY explicitly |
| Family-scope check first | `src/authz/policy.ts` `canViewAsset` STEP 1 |
| Only controller may change visibility / delete | `src/authz/actions.ts` `canSetAssetVisibility`, `canDeleteAsset` |
| Moderation providers stubbed | `src/server/moderation/providers.ts` `stubHash`, `stubClassifier`, `defaultProviders()` |
| Production guard unused | `isModerationConfigured` referenced only in its own module and re-export |
| Hash of re-encoded bytes | `src/server/ingest.ts` passes `sanitised.sha256` to `moderateAndRecord` |
| All uploads typed DRAWING | `src/app/actions/guestUpload.ts` and `src/app/actions/keep.ts` (`kind: 'DRAWING'`) |
| Egress predicate | `src/fulfillment/gate.ts` `isChildImage`, `assertPodEgressAllowed` |
| Auto-keep at purchase | `src/app/actions/order.ts` → `src/server/keepsakes.ts` `keepAndFileCreations` → `adoptEphemeralDraft` sets `keptInHome: true, purgeAfter: null` |
| `fulfilled_at` never set | no writer in `src/` (grep) |
| No Prodigi deletion | `PROVIDER_DELETION_*` enum values never inserted (grep) |
| Account closure scope | `src/app/actions/data.ts` `deleteAllMyKeepsakesAction` |
| No member removal / child deletion / invite revoke / gift-link revoke UI | no code path (grep for `MEMBER_REMOVED`, `INVITE_REVOKED`, `delete(children)`, `revokeGiftLink` callers) |
| Complaint form does not submit | `ComplaintForm.tsx` `submit` only sets local state |
| Reminders consent-gated and capped | `src/server/reminders/index.ts` `hasReminderConsent`; `planner.ts` `CAP_DAYS = 7`, 10–21 day window |
| Mail console-only; production throws | `src/server/mail/index.ts` `resolveMailer` |
| KMS optional | `src/storage/objects.ts` `putObject` (only when `S3_KMS_KEY_ALIAS` set) |
| AUTH_SECRET fallback | `src/server/uploadClaims.ts` `secret()` |
