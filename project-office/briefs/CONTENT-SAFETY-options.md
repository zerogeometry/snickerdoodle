# Content Safety — Options & Trade-offs Brief

> **Cowork brief, 2026-06-26.** How Snickerdoodle filters and blocks uploads, text, and (later) AI prompts/outputs that are **illegal**, **infringing**, or **harmful**. This is an options-and-trade-offs document for Simon to decide from; it does not decide. Chosen calls get propagated into `docs/03` (UX/functional), `docs/05` (trust/compliance) and `CLAUDE.md`.
>
> **Not legal advice.** Two items here need qualified professionals before launch: an **IP/brand lawyer** (the copyright posture) and the **DP professional** already on the launch gates (the Online Safety Act scope question, and any human review of children's images). Flagged inline as 🧑‍⚖️.
>
> **Posture chosen by Simon:** automated-first, human only on exceptions/appeals. Everything below is built around that.

---

## 1. The reframe — start from what the architecture already removes

Most of the online-safety burden that crushes a solo operator comes from a **public, user-to-user surface**: a feed strangers can post to and others can stumble onto. Snickerdoodle deliberately has none of that — nothing is ever public, no marketplace, no profiles, no stranger-to-stranger contact (NN1/NN2; `docs/05`). That removes the largest and hardest category (grooming surfaces, public illegal-content discovery, recommender-driven harm) before we write a line of moderation code.

So this is **not** "build Instagram's trust-and-safety stack." It's a much smaller, sharper problem: a handful of **private** surfaces where a *known* adult uploads or types something, and where the real exposure is (a) the absolute legal lines, (b) us **selling a physical print** of someone else's IP, and (c) keeping a child-appealing service clean.

**One correction to `docs/05` worth surfacing (🧑‍⚖️).** `docs/05` says the Online Safety Act is "largely out of scope" because there's no marketplace/public profiles. That's *mostly* right, but not a clean exemption. The OSA's "user-to-user service" test is whether content one user uploads **can be encountered by another user** — and Snickerdoodle does have two such surfaces: the **family circle** (a parent's upload is seen by invited relatives) and **gift links** (a creation seen by a recipient). The Schedule 1 exemptions (comments/reviews only; email/SMS only; one-to-one live aural only) **don't fit** image-sharing into a family circle. So a regulator could view us as a small, low-risk U2U service rather than fully out of scope. The practical consequence is light (see §4 — small/low-risk services have a risk-assessment + takedown + reporting duty, not the heavyweight proactive-tech duties), but **the "out of scope" line should be downgraded to "in scope but low-risk, confirmed by our DP professional"** rather than assumed away. This is a wording/assessment fix, not an alarm.

---

## 2. The surfaces that need moderation

| # | Surface | What flows through it | Lives in phase |
|---|---|---|---|
| S1 | **Upload** (Start Creating, camera, Studio import) | A photo/scan of a drawing — or, in error or abuse, a photo of something else | P1 |
| S2 | **User text** (Studio caption/text layer, gift-link message, family member names) | Free text a user types onto a product or sends with a gift | P1 |
| S3 | **Print hand-off to Prodigi** | The final print-ready image leaving our VPC to a third-party manufacturer | P1 |
| S4 | **Generative AI** ("make it watercolour/storybook") — prompt **and** output | A single image + a short instruction to a contracted no-retention API | **P3 only** |

Note S4 doesn't exist at launch (no third-party image egress before P3, per the stack proposal). It's included so the launch design doesn't have to be retrofitted later.

---

## 3. Three risk lenses (what we're actually filtering for)

- **A — Illegal / online-safety.** The non-negotiable lines: child sexual abuse material (CSAM) above all, plus extreme pornography, terrorist content, and other "priority illegal content." These apply **regardless** of whether a surface is public or private.
- **B — Copyright & IP.** The everyday case, and the one that's specific to *our* business model: children draw licensed characters (Elsa, Spider-Man, Bluey…), and our core act is **selling a printed product** of that drawing.
- **C — Harmful / inappropriate (not necessarily illegal).** Adult nudity, graphic violence, hate symbols, or abusive text — content that's lawful-ish but wrong for a warm, child-appealing keepsake brand and unacceptable to a print partner.

---

## 4. The must-haves (these aren't options)

Two things are not on the menu — they're required the moment any real upload path exists (i.e. before P1 go-live, as part of the P0 spine):

**M1 — Block known CSAM at upload, by hash, automatically.** This is the one absolute. The cheap, low-ops, in-region answer now exists and is purpose-built for exactly our size:

- **IWF Image Intercept** — *free*, a simple code plug-in, matches uploads against the IWF's ~2.88M-hash database of known criminal imagery, built in 2025 specifically so small platforms/start-ups can prevent CSAM upload and support OSA compliance. Hash-matching means **no human at Snickerdoodle ever views the image to make the match**, and hashes can't be reversed into pictures — so this *strengthens* privacy rather than creating a new exposure. Requires IWF engagement/onboarding.
- This pairs with a **legal duty to act on a match**: preserve, **do not view/redistribute/"investigate"**, and report to the proper authority (IWF / NCA-CEOP). A US processor (e.g. any US-side tooling) would additionally trigger NCMEC reporting — another reason to keep this in-region. 🧑‍⚖️ The exact reporting workflow belongs in the **breach/illegal-content runbook** (already a P0 item) and needs DP-professional sign-off.

**M2 — A working report + takedown path.** A one-tap "report this / something's wrong" route and a documented, fast removal process (wired to the real cascading-deletion job from P0). For a small/low-risk U2U service this reactive duty is the core of OSA compliance, and it's cheap.

Everything in §5 below is genuinely a **choice**. M1 and M2 are not.

---

## 5. Per-surface options

### S1 — Upload screening (lens A illegal + lens C harmful)

| Option | How | Pros | Cons / cost |
|---|---|---|---|
| **S1-a — Hash-only (CSAM) + reactive for the rest** | IWF Image Intercept at upload; no other automated screening; rely on report/takedown for nudity/violence | Cheapest; lowest false-positive friction; minimal child-image exposure | Lawful-but-inappropriate content (adult nudity, gore) can reach the Studio / a print order before anyone notices |
| **S1-b ⭐ — Hash (CSAM) + automated classifier flag** | Add an automated nudity/violence/hate-symbol classifier on upload; **flag** (not auto-reject) borderline items for human-on-exception review before they can reach print | Catches lens-C content early; still automated-first; human only sees a small flagged subset | Per-image cost + a small review queue; classifier false-positives on, e.g., a child's drawing of a "scary monster" need a sensible threshold |
| **S1-c — Pre-moderate everything by human** | A person reviews every upload | Highest control | Doesn't scale for a solo operator; **worse for privacy** (a human views every child's drawing); rejected by your chosen posture |

**Recommendation: S1-b**, with the classifier tuned to *flag for review*, not auto-block, so a wonky kid's drawing is never silently rejected (NN8 spirit; brand voice). Tooling choices for the classifier:

- **Self-hosted classifier in the existing in-region image-worker** (open-source NSFW/violence model). *Best privacy* — no third party ever sees the image, consistent with NN4 and the "self-host Core ops in-region" decision. Slightly more engineering; quality needs testing.
- **AWS Rekognition Content Moderation** (`DetectModerationLabels`) — ~$0.001/image, pay-per-use, scale-to-zero, detects nudity/violence/weapons/hate symbols/etc. We're already on AWS `eu-west-2`, so it stays in-region within our own processor footprint (no new transfer; confirm eu-west-2 availability + rate). Fastest to ship; a managed processor touching a child image, so it needs the AWS Article-28 DPA to cover it. 🧑‍⚖️
- These aren't exclusive — ship Rekognition to launch fast, swap to self-hosted behind the same one-line adapter later if you want zero third-party exposure.

### S2 — User text screening (lens A + C)

Small surface, cheap to handle: a **profanity/abuse wordlist + lightweight classifier** on the Studio text layer, gift messages, and member-name fields, plus length caps. Block or flag slurs/abuse; don't over-police (a gift message is private to a family). Member **child first-name only, never surname** is already a non-negotiable — enforce it here too. Low cost, do it.

### S3 — Print hand-off gate (lens B copyright — **the headline decision**)

This is the one that's specific to the business model and deserves the most thought. **Why it's sharp:** a child's drawing of a licensed character is an *unlicensed derivative work*; **selling a print of it is commercial use**, which is where copyright **and** trademark exposure bites hardest. And Prodigi's terms **push liability to us, the merchant** — plus, as a platform enabling others' uploads, "it was the user's design" is not a complete shield (a POD platform, SunFrog, lost ~$19M to Harley-Davidson for failing to police infringing designs). So we carry real exposure on **both** sides of the transaction, and user T&Cs alone don't dispose of it. 🧑‍⚖️ **An IP/brand lawyer should set the actual posture.** The realistic options:

| Option | Stance | Pros | Cons |
|---|---|---|---|
| **S3-a — Warranty + reactive takedown** | User agrees they hold the rights; we act on rights-holder complaints | Cheapest; lightest UX; what most POD shops do | Highest residual exposure; the most common upload (character art) is exactly the infringing case; "everyone does it" ≠ safe at our scale |
| **S3-b ⭐ — Warranty + honest framing + reactive takedown + repeat-offender controls** | As above, **plus** brand-voice copy that frames the product around *your child's own original drawing* (not "print any picture"), a clear notice that we can't make products of others' characters/logos, and account-level controls for repeat flags | Sets expectations where the brand already points; reduces volume of infringing intent without a hard tech gate; still low-ops | Still relies on warranty + takedown for anything that slips through; needs good copy + a takedown workflow |
| **S3-c — Add automated brand/IP detection** | A logo/character detector flags likely-infringing art for human review before print | Strongest protection; catches the obvious Disney/Marvel cases | Real cost + false-positive friction; detectors are unreliable on a *child's rough rendering* of a character (the very thing we sell); risks blocking legitimate original art; heavier ops |

**Recommendation: S3-b for launch**, with S3-c held as a P2+ escalation if complaint volume justifies it. Rationale: the brand is *already* about the child's own wonky original ("frame the wonky bits in gold"), so honest framing is on-message, not a compromise — and an automated character-detector is both expensive and unusually error-prone on children's drawings, which is the worst place to introduce false rejections. **This is a Simon + IP-lawyer decision, not mine to make** — I'm flagging that S3 is the single most business-shaping safety call here, not a fringe one.

### S4 — Generative AI prompt/output (P3 only, lens A + B + C)

Designed now, built in P3. When generative styling lands: a **prompt allow-pattern** (the feature only offers preset "magic edits" — watercolour/storybook — never a free-text "describe anything" box, which keeps prompts inherently safe and matches "AI is invisible," NN4), the **single-image invariant** already specified (unit-tested), an **output pass** through the same S1 classifier before the result is ever shown/printed, plus the contracted provider's own safety layer under the no-retention DPA (LG6). Net: prompts can't ask for harmful generations because the UI doesn't expose free prompting, and outputs are re-screened. No new decision needed now beyond "preset edits only, no free-text prompt box" — recommend locking that in.

---

## 6. Recommended launch posture (one-paragraph sketch)

Automated-first, human-on-exceptions, privacy-preserving: **every upload** is hash-checked against IWF Image Intercept (CSAM → preserve + report, never viewed) **and** run through an in-region nudity/violence/hate classifier that **flags** (not blocks) a small subset into a **logged, access-controlled human-review queue** before that item can reach a print order; **text** gets a wordlist/classifier pass; the **catalogue/Studio framing and T&Cs** steer users toward their child's own original art and disclaim others' IP, backed by a fast **report + takedown** path wired to real deletion; and **generative editing (P3)** is preset-only with output re-screening. Human review is rare, logged, minimal, and disclosed in the privacy notice — because a staff member viewing a child's image is itself a privacy event under the Children's Code. 🧑‍⚖️

---

## 7. Where this would land in the docs (proposed — not yet applied)

On Simon's decisions I'd propagate:

- **`docs/05`** — downgrade "OSA largely out of scope" → "small/low-risk U2U service, confirmed by DP professional"; add the CSAM upload-prevention control (IWF), the illegal-content reporting duty, and the human-review-of-children's-images privacy note; add an **content-moderation processor** (Rekognition or self-hosted) to the processor/transfer register.
- **`docs/03`** — add the upload-screening states (flagged/blocked/under-review), the report/takedown UX, and the copyright framing copy + T&Cs touchpoints, all in brand voice with the four states.
- **`CLAUDE.md`** — add a short "content safety" rule: CSAM hash-check + classifier-flag before any print; preset-only generative prompts; human review is logged + access-controlled; never auto-reject a child's drawing without a review path.
- **Launch gates / runbook** — fold CSAM detection + reporting into the existing P0 breach/illegal-content runbook; add the IWF onboarding and the moderation-processor DPA to the gate-5 DPA list.

---

## 8. Decisions needed from Simon

1. **Copyright posture (S3)** — confirm S3-b (warranty + honest framing + takedown) for launch, S3-c held in reserve? **And brief an IP/brand lawyer** to validate it. 🧑‍⚖️ *(Highest-impact decision here.)*
2. **Upload classifier tooling (S1-b)** — self-hosted in-region (best privacy, more build) vs AWS Rekognition (fastest, in-region managed, needs DPA), or Rekognition-now/self-host-later?
3. **Confirm the must-haves** — IWF Image Intercept onboarding + the report/takedown path as P0 items (I'll add them to the build log and gates).
4. **Generative guardrail** — lock "preset magic edits only, no free-text prompt box" for P3 now?
5. **OSA scope wording** — OK to route the "in-scope-but-low-risk" question to the DP professional and update `docs/05` accordingly?

## 9. Needs a qualified professional (🧑‍⚖️ — do not close without)
- **IP/brand lawyer:** the copyright/trademark posture and T&C warranty wording (S3).
- **DP professional (already on the gates):** OSA scope confirmation; the CSAM reporting workflow; and the Children's-Code assessment of any human review of children's images.

---

## Sources
- [Online Safety Act 2023 — Schedule 1 (exempt services)](https://www.legislation.gov.uk/ukpga/2023/50/schedule/1) · [OSA explainer (GOV.UK)](https://www.gov.uk/government/publications/online-safety-act-explainer/online-safety-act-explainer)
- [Ofcom — illegal content duties in force 17 Mar 2025 (CMS)](https://cms-lawnow.com/en/ealerts/2025/03/online-safety-act-illegal-content-duties-are-now-in-force) · [Protection of Children Codes in force 25 Jul 2025 (White & Case)](https://www.whitecase.com/insight-alert/uk-online-safety-act-protection-children-codes-come-force)
- [IWF Image Intercept (free CSAM upload-prevention for small platforms)](https://www.iwf.org.uk/our-technology/image-intercept/) · [IWF Image Hash List](https://www.iwf.org.uk/our-technology/our-services/image-hash-list/) · [IWF launch of the free tool](https://www.iwf.org.uk/news-media/news/teens-face-crisis-of-online-sexual-exploitation-as-charity-says-major-new-government-backed-scheme-will-put-rocket-boosters-on-online-safety-act/)
- [Prodigi Terms & Conditions (merchant bears IP responsibility)](https://www.prodigi.com/terms-and-conditions/) · [POD copyright risk / SunFrog v Harley-Davidson context](https://visua.com/70-of-print-on-demand-companies-are-ignoring-copyright-laws) · [Selling fan art — UK copyright/trademark (Printsome)](https://blog.printsome.com/printing-fan-art/)
- [AWS Rekognition Content Moderation](https://aws.amazon.com/rekognition/content-moderation/) · [AWS Rekognition pricing](https://aws.amazon.com/rekognition/pricing/)
