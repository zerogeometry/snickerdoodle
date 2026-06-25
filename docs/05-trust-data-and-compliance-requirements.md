# 05 — Trust, Data & Compliance Requirements

> Full compliance master: `snickerdoodle-trust-data-spine-1-compliance-backbone.md` (+ public privacy notice `-2`, family data promise `-3`). **None of this is legal advice; a qualified data-protection professional must sign off the DPIA, the Children's Code assessment, and international transfers before launch.**

## Non-negotiables (encode these in the product)

1. **Nothing is ever public.** No public surface for a child's art or data; every sharing tier is within an invited, verified family circle.
2. **Privacy by default.** New asset visibility defaults to **Family** — never Extended, never public.
3. **Parent is controller; child is subject.** Children are not account holders; only a parent initiates invites and sets access.
4. **Invite-only family.** No one self-joins. The "join family" path exists only because a parent invited that email. Verification confirms identity, not authorisation.
5. **AI is no-retention, no-training.** Image processors are contractually barred from retaining or training on uploads; send only the single image needed.
6. **Originals recoverable and deletable.** Non-destructive editing; real, cascading deletion on request.

## Visibility model (definitive)
As in `docs/04`: `ONLY_ME` (uploader), `FAMILY` (core household), `EXTENDED` (whole circle), nesting outward; default `FAMILY`. Two outer rings exist so parents can keep everyday art inside the household and deliberately widen highlights — defaulting to Family prevents silent over-sharing.

## Children's Code stance
Snickerdoodle is parent-facing but **highly appealing to children**, so we **voluntarily conform** to the ICO Children's Code and document the assessment. Implications: high-privacy defaults, data minimisation, no nudges toward weaker privacy, clear parent controls, no profiling of children, and treating a child's images/art/DOB as sensitive data.

## Lawful bases & channels
- **Contract** — to fulfil orders and run the service.
- **Consent** — for marketing and reminder nudges. **PECR governs the channel** (email/SMS) regardless of the Data (Use and Access) Act 2025; capture and honour consent with frequency caps.

## Retention & deletion
- Delete the **source upload** after fulfilment **unless** kept in the Keepsake Home.
- Kept assets persist until the controller deletes them.
- Deletion is real and cascading (DB + storage + provider-side).
- Provide clear parent-accessible paths: delete a keepsake, remove a member, leave/close a family.

## Audit & consent logging
Log invites sent/accepted, membership tier/access changes, member removals, asset visibility changes, and marketing-consent changes. This is both security and evidence of the control-based trust model.

## Processor obligations
Each processor (AI image, print-on-demand, email, storage, payments) needs an Article 28-style DPA. The **AI image provider** carries the explicit no-retention/no-training term. Print/storage may involve international transfers — flag for the "not materially lower" transfer assessment.

## Out of scope (and why it helps)
No marketplace and no public profiles → the Online Safety Act is largely out of scope and the child-safety surface is far smaller. Keep it that way.

## Launch gates (hard blockers — do not go live without)
1. **DPIA** completed and signed off.
2. **Children's Code** conformance assessment documented.
3. **International transfers** reviewed.
4. Public **privacy notice** + **family data promise** pages live (from trust-spine `-2`/`-3`, placeholders filled).
5. **ICO registration** / fee paid; Article 28 DPAs with all processors.
6. AI provider contract confirms **no-retention, no-training**.
