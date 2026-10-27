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

## Online Safety Act stance (revised 2026-06-26, decision D8)
No marketplace and no public profiles keeps the child-safety surface far smaller — keep it that way. **But the OSA is not cleanly "out of scope":** the **family circle** (a parent's upload encountered by invited relatives) and **gift links** (a creation encountered by a recipient) are user-to-user content encounters that do **not** fit the Schedule 1 exemptions (comments/reviews only; email/SMS only; one-to-one live aural only). Working stance: **in scope but small / low-risk** — i.e. the duties that bite are the **illegal-content risk assessment, takedown, and reporting**, not the heavyweight proactive-tech duties aimed at the largest services. 🧑‍⚖️ **The DP professional must confirm this scope classification** (launch-gate dependency).

## Content moderation (revised 2026-06-26, decision D8 — full options in `project-office/briefs/CONTENT-SAFETY-options.md`)
Posture: **automated-first, human only on flagged exceptions** — because a staff member viewing a child's image is itself a privacy event under the Children's Code, so automated screening is preferred and human review must be rare, minimal, access-controlled, logged, and disclosed in the privacy notice.

Must-haves (P0, before any real upload path):
- **Known-CSAM blocking at upload, by hash** via **IWF Image Intercept** (free; hash-match means no human views the image to match; hashes are not reversible). On a match: preserve, **do not view/redistribute/investigate**, and report to IWF / NCA-CEOP per the illegal-content runbook. A US processor would also trigger NCMEC — another reason to keep moderation in-region. 🧑‍⚖️ (reporting workflow needs DP sign-off).
- **Report + takedown path** wired to the real cascading-deletion job.

Screening (P1):
- **Upload classifier** — **AWS Rekognition Content Moderation** in `eu-west-2` (in-region, within our existing AWS processor footprint — covered by the AWS Article 28 DPA), used to **flag** nudity/violence/hate-symbols for human-on-exception review **before an item can reach a print order**. **Never auto-reject a child's drawing** — flag into a review queue. Self-hosted in-region classifier kept as a swap option behind the same adapter.
- **User text** (Studio text layer, gift messages, member names) — wordlist + lightweight classifier; enforce **child first-name only, never surname**.
- **Print hand-off** — copyright posture **S3-b**: rights-warranty + brand framing around the child's own original art + disclaimer of others' IP + fast takedown; we (the merchant to Prodigi) carry real infringement exposure, so this is not disposed of by T&Cs alone. 🧑‍⚖️ **IP/brand lawyer to validate.**

Generative (P3 only): **preset magic edits only — no free-text prompt box**; the single-image invariant (already specified) plus an **output pass** through the upload classifier before any result is shown or printed.

Processor note: the moderation classifier (Rekognition, or a future self-hosted model) joins the processor/transfer register; in-region keeps it off the international-transfer path.

Build status (2026-10-27): the real providers are wired behind `MODERATION_PROVIDER=real` — IWF hash list held locally and matched in-process, Rekognition in `eu-west-2` only; any provider failure holds the upload for review. Config, threshold, costs, the questions for IWF onboarding and the AWS AI-services opt-out (no-training) are in `project-office/briefs/MODERATION-providers.md`.

## Launch gates (hard blockers — do not go live without)
1. **DPIA** completed and signed off.
2. **Children's Code** conformance assessment documented.
3. **International transfers** reviewed.
4. Public **privacy notice** + **family data promise** pages live (from trust-spine `-2`/`-3`, placeholders filled).
5. **ICO registration** / fee paid; Article 28 DPAs with all processors.
6. AI provider contract confirms **no-retention, no-training**.
