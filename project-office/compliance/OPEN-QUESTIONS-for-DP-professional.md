# Open questions for the data-protection professional

> **DRAFT — prepared for review by a qualified data-protection professional. Not legal advice.**
>
> Every judgement call flagged in `DPIA-draft.md` (risks R-nn, actions A-nn) and `CHILDRENS-CODE-assessment-draft.md`, as of 2026-10-12. Each question states the current position **in code**, the drafting recommendation, and what we need from you. Numbers are stable — the other two documents cite them as **[OQ-n]**.
>
> **Priority:** ★ = blocks LG1/LG2 sign-off or a launch-blocking build decision.

---

### Scope

**OQ-1 ★ Children's Code scope.** Adult-facing paid service; children are data subjects, not intended users. But: child-appealing scrapbook design (D12), guest upload with no account or age check, and no age assurance. `docs/05` says "voluntarily conform"; D10(c) says "likely out of scope". *Recommendation:* conclude "arguably out of scope; conform voluntarily; review with real usage data at 3 months". **Need:** your scope conclusion and whether a self-declared 18+ step at sign-up/upload is proportionate. (LG2 Part A.)

**OQ-2 ★ Online Safety Act scope.** D8 working stance: "in scope but small/low-risk" — the family circle (relatives encountering a parent's upload) and gift links (recipients encountering a creation) are user-to-user content encounters outside the Schedule 1 exemptions. No public surfaces. **Need:** confirm U2U classification (or not), which duties apply (illegal-content risk assessment, takedown, reporting, record-keeping, children's risk assessment if "likely to be accessed by children" under the OSA test, which differs from the Code's), and whether the CSAM reporting duty applies to us as a UK provider.

### Content safety

**OQ-3 ★ CSAM detect → preserve → report runbook.** Code: hash match ⇒ `BLOCKED`, never viewable/printable, excluded from purge, audited (`src/server/moderation/`, `src/server/retention.ts`). Providers are **stubs**. Gaps: the hash is of the *re-encoded* bytes (cannot match a known-image list); BLOCKED bytes sit in the general bucket; no runbook. **Need:** (a) the reporting route (IWF vs NCA-CEOP; any mandatory reporting under the OSA); (b) how long to preserve matched material, where, and who may access it (we propose a segregated, separately-keyed location no application path can read); (c) whether to suspend the account and what (if anything) to tell the uploader (tipping-off / prejudicing an investigation); (d) whether IWF Image Intercept makes IWF a processor, an independent controller, or neither (hash-only).

**OQ-4 ★ Pre-ticked family-calendar share (D13).** Relatives invited with the box ticked see each child's **full date of birth** (year included) and "coming up", and can opt into their own reminder emails naming the child. DB default off; per-member toggle; audited. Applies to EXTENDED-circle invitees (friends) too. *Recommendation:* unticked by default and share day + month only. **Need:** is a pre-ticked share of children's DOBs with parent-invited adults compatible with Children's Code standards 7 (defaults), 8 (minimisation) and 13 (nudges)? If the founder keeps it, what "compelling reason" record would suffice? Also: is using a child's name/age in consented reminder emails to relatives acceptable (std 5)?

**OQ-5 ★ Human review of flagged children's images.** D8: classifier flags into a human-on-exception queue. Nothing is built: no admin role, no MFA, no view logging. *Recommendation:* reviewer sees a blurred image by default, reveals deliberately, every reveal logged, MFA, one or two named reviewers, disclosed in the privacy notice; unreviewed FLAGGED items follow normal retention. **Need:** confirm the lawful basis (LI?) and safeguards; whether parents should be told when their upload was reviewed; whether a no-human alternative (FLAGGED = cannot be printed, parent can appeal) is preferable.

**OQ-6 ★ Article 9 / Article 10 classification.** (a) Confirm children's photos processed by a content-moderation classifier (no face APIs) are not special-category data. (b) A CSAM match is criminal-offence data — which DPA 2018 Sch 1 condition (para 10 preventing/detecting unlawful acts; para 18 safeguarding of children; or an OSA legal obligation) and do we need an appropriate policy document?

### Sharing and egress

**OQ-7 ★ G11 POD egress posture.** The egress gate treats an image as a child's only if it is filed under a named child **or** typed PHOTO — and every upload path hard-codes `kind: 'DRAWING'` (`src/app/actions/guestUpload.ts`, `keep.ts`). So in LIVE mode most children's art would reach Prodigi before LG3/LG6. Founder decision pending. *Recommendation:* every user upload is a child image; only seed-script fixtures are marked brand-safe. **Need:** confirm that treating all user uploads as children's data is the correct (and only defensible) position.

**OQ-17 Gift-link model.** Bearer token (192-bit), `noindex`, 30-day expiry, shows the **full-resolution original** to anyone holding the link; the parent cannot yet revoke it in the UI; narrowing a keepsake's visibility does not pull it from an active link; the gift-request feature emails the link to up to 20 typed addresses. **Need:** is a forwardable bearer link an acceptable sharing mechanism for children's art under Children's Code std 9, given revocation + expiry + preview renditions (A-06)? Should the default expiry be shorter or parent-set?

**OQ-16 International transfers — Prodigi and Stripe.** Prodigi is UK-based but routes orders to labs in several countries; it reportedly retains downloaded print files ~30 days. Stripe processes buyer data within its group (incl. US). **Need:** transfer assessment approach (LG3), and whether to contractually restrict Prodigi routing for GB orders to UK/EU labs. Also: is AWS (US parent, UK region) treated as no restricted transfer for our purposes?

### Lawful basis boundaries

**OQ-8 ★ Consent vs contract boundaries.** D10: upload → make → deliver on Contract (Art 6(1)(b)), action-based acceptance recorded at ingest, no tickbox. Questions: (a) the child is not a party to the parent's contract — is processing the **child's** image better framed as LI (with a child-weighted balancing test) than Contract? (b) a **guest** upload before any account exists — pre-contractual steps under 6(1)(b), or LI? (c) confirm action-based acceptance is sufficient for the rights warranty (D10(a)) — IP lawyer also needed; (d) confirm content screening of every upload rests on LI (and/or OSA legal obligation); (e) confirm reminders = Consent (PECR) per recipient, separate from the upload (D10(d) — implemented).

**OQ-12 PECR status of invites and gift requests.** A parent types a relative's email; we send the invite / gift request. ICO's position on "refer-a-friend"/"tell-a-friend" emails is that the organisation that instigates them needs the recipient's consent. Invites are arguably service messages (access to a private space the parent controls); gift requests contain a shop link and are closer to marketing. **Need:** classify each (invite; gift request; gift-list "it's been bought" note to the parent; magic link) as service vs direct marketing, and what to change if gift requests are marketing (e.g. send from the parent's own mail client via a share sheet instead).

### Retention

**OQ-9 ★ Auto-keep at purchase.** Every personalised order adopts the artwork into the Keepsake Home permanently (`keepAndFileCreations` → `keptInHome=true`, `purgeAfter=null`). The family promise says the upload is deleted after the order "unless you've chosen to keep it". **Need:** is keeping by default (with a visible delete) acceptable, or must "keep" be an active choice at checkout with unkept items deleted at fulfilment + 30 days? (Drafting view: active choice.)

**OQ-10 ★ Retention periods.** Code enforces only: unkept uploads 30 days after **upload** (not after fulfilment). **Need:** your periods for — post-fulfilment window for unkept art; children rows after last activity; invites (pending/expired/accepted); gift links after expiry; sessions/verification tokens; consent evidence after withdrawal; order records (6 years — and whether recipient name/address may be dropped earlier); audit records (and whether invitee emails in them should be pseudonymised); ML ledger; preserved CSAM evidence (OQ-3); server logs; backups.

### Third parties and partners

**OQ-11 Partner commission data sharing.** Partners (influencers, PTAs, referring parents) currently receive only aggregate orders/commission per code via an operator script. PTA codes can carry a "class label" (e.g. "Year 2"); referral codes are derived from the parent's name; a referral reward reveals to the referrer that a known friend ordered; `orders.buyer_email` is being stored for self-referral checks. **Need:** confirm partners are not recipients of personal data (so no sharing agreement), a minimum cohort size for class-level reporting, and the basis for buyer-email fraud checks (LI).

**OQ-13 Email provider choice and transfer (D7).** Only a console adapter exists; production refuses to send without a provider. Emails carry child first name + age (reminders), family name, gift-link and magic-link URLs. *Recommendation:* AWS SES eu-west-2 (inside the existing AWS DPA footprint; no new processor) with open/click tracking off. **Need:** any objection; minimum contractual terms for an ESP; whether tracking pixels in any of our emails would need PECR reg 6 consent.

**OQ-14 Stripe's status.** Stripe acts as our processor for payments and as an independent controller for fraud prevention/regulatory purposes. **Need:** confirm how to describe this in the privacy notice and record of processing.

**OQ-15 Guest purchaser data.** A grandparent can buy through a gift link without an account. We hold: order lines, totals, gift "from" name (shown to the parent), buyer email (from Stripe), recipient name + address (sent to Prodigi). No guest account, no marketing. **Need:** (a) privacy information for guest buyers — where and how (Stripe Checkout page vs our gift page); (b) basis for showing the "from" name to the parent (contract with the buyer, told in advance — D14); (c) whether a signed-in buyer's name/email-prefix fallback when "from" is blank is acceptable (we propose removing it); (d) retention of guest order data beyond the tax requirement.

**OQ-18 Age assurance.** No age check at sign-up or guest upload. Is self-declaration proportionate given the risk profile, or is the "apply standards to all users" approach (LG2 std 3) sufficient on its own?

**OQ-19 Rekognition AI-services opt-out.** AWS may store and use content processed by some AI services to improve them unless an AWS Organizations AI-services opt-out policy is applied. **Need:** confirm that enabling the opt-out (plus the AWS DPA) is sufficient to treat Rekognition as a no-retention/no-training processor for children's images, and whether that evidence should be recorded against LG6 as well as LG5.

**OQ-20 Breach threshold.** Spine-1 §11 assumes any breach involving children's images is notifiable. **Need:** confirm, and whether a mis-sent gift link or a forwarded gift link counts as a personal-data breach (and when).

---

## Top five (if time is short)

1. **OQ-1 + OQ-2** — Children's Code and OSA scope (drives everything else).
2. **OQ-3 + OQ-6** — CSAM runbook and the Art 10 condition.
3. **OQ-7** — G11: treat every upload as a child's image at the POD egress gate.
4. **OQ-4** — pre-ticked family-calendar share of children's full dates of birth.
5. **OQ-9 + OQ-10** — auto-keep at purchase and the retention schedule.
