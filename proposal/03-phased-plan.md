# 03 — Phased Implementation Plan & Acceptance Criteria

> **Status: PROPOSED — pending founder sign-off.** Deployable increments, sequenced against the roadmap (`children-and-families-gifting-roadmap.md` §5), the Studio MVP cut, and the launch gates in `docs/05`.

**Keys.** NN1–NN9 = non-negotiables (`START-HERE.md`). LG1–LG6 = launch gates (`docs/05`): DPIA · Children's-Code assessment · transfers reviewed · trust pages live · ICO reg + Article 28 DPAs · AI no-retention/no-training confirmed. SM = success metrics (`docs/01`). DoLR = the `docs/01` definition of launch-ready.

| Plan phase | Roadmap | Theme | Deployable | Live children's data? |
|---|---|---|---|---|
| **P0** | 0 | Trust/data spine + Creation pipeline proof | internal/staging + waitlist landing | **No** (gating prerequisite) |
| **P1** | 1 | Wedge: drawing → cards & gifts (full DoLR loop) | **PUBLIC GO-LIVE** | Yes — gated behind P0 |
| **P2** | 2 | Content & community flywheel | Yes | Yes |
| **P3** | 3 | Flagship: personalised storybook (first routine generative use) | Yes | Yes |
| **P4** | 4 | Retention / occasion engine at scale | Yes | Yes |
| **P5** | 5 | Ecosystem & scale | Ongoing | Yes |

**Critical sequencing rule (NN1, NN4):** no live children's personal data is processed in any environment until **every P0 exit gate is green**. The central authz module + its tests, the private encrypted storage, and the retention/deletion purge jobs are **P0**, not P1. **No live child image is sent to any third party until P3**, which is itself gated on LG6 + LG3. Studio print-readiness/DPI + one-tap upscale is **Core in P1** (dominant refund lever; `docs/04` forbids silent under-resolution).

---

## Phase 0 — Foundation & Trust/Data Spine

**Objective.** Stand up the trust/data spine and the permission core **before any live children's data**, prove the Creation pipeline produces a Prodigi-accepted print file, and publish the public trust surface + waitlist.

**Scope.**
- **A. Central authz module** — visibility lattice with the family-scope precondition, circle, access, controller model, and `Membership.status` gating; new-asset default FAMILY server-enforced; server-side re-check on every mutation and every signed-URL mint.
- **B. Private encrypted storage + signed URLs** — UK/EU private buckets (no public access), KMS at rest (separate originals key), TLS in transit; originals write-once (governance mode) separate from derivatives; two signed-URL policies (interactive / provider-ingestion); **EXIF/GPS stripped on ingest**.
- **C. Retention/deletion purge jobs (legally load-bearing)** — DB-driven daily purge (source upload after fulfilment+30d unless kept); **real cascading deletion** DB → storage (versions) → provider (confirmed + retry) → backups (crypto-shred / exclude originals; financial records separate, 6-yr); every purge audited; idempotent.
- **D. Audit & consent logging** — append-only `audit_record` (full event set incl. gift-link + deletion + provider-deletion); `consent_record` (PECR, channel, basis).
- **E. Compliance enablement** — DPIA (LG1) + Children's-Code assessment (LG2) instantiated from spine-1 §5/§6 and routed for DP-professional sign-off; transfer review per processor (LG3); ICO registration (LG5); Article 28 DPAs incl. the AI no-retention/no-training term + ZDR mode + transfer route (LG5/LG6); `sub_processor` register populated.
- **F. Public trust pages (LG4)** — privacy notice (spine-2) + family-data-promise (spine-3), placeholders filled, built to brand tokens/voice.
- **G. s.164A complaint channel** — online form + 30-day acknowledgement workflow backed by `rights_request`; signposted in the privacy notice.
- **H. DSAR backend** — `rights_request` entity supporting access/rectification/erasure/restriction/objection/portability, **stop-the-clock**, a portability export format, and the "decline → signpost to us *and* ICO" duty.
- **I. Cookie consent** — non-essential off by default; granular opt-in; preference centre.
- **J. Breach runbook** — one-pager: detect/contain, ICO 72-hour path (child-image breaches assumed notifiable), affected-individual criteria, breach log.
- **K. Creation pipeline proof (self-hosted, in-region)** — real drawing → bg removal, **upscale-to-print**, brighten/tidy, deskew/auto-crop → a print file that passes Prodigi specs, with **no third party seeing the image**. The generative API is contracted/DPA'd but **not wired to any live image** in P0.
- **L. App shell + design system + waitlist** — Next.js PWA shell; the brand component set + tokens + self-hosted fonts + the Tabler icon sprite + `Icon` primitive; "founding families" waitlist (email under explicit PECR consent only; no children's data pre-gate).

**Acceptance criteria (testable).**
1. Authz unit-test matrix passes and is the single gate for reads: the full tier × circle × access × actor table incl. **cross-family deny**, the EXTENDED-circle-denied-on-FAMILY negative, controller-vs-other-parent, and removed-member-denied-with-no-session-grace. *(NN1/2/3)*
2. New asset is FAMILY by any insert path; no path defaults wider. *(NN2; LG2)*
3. No public buckets; an unsigned object request is denied; signed URLs expire; a URL is minted only after authz allows. *(NN1)*
4. Encryption verified in transit + at rest; **EXIF/GPS absent** from stored derivatives. *(LG1 mitigation)*
5. Purge deletes for real + cascading: an unkept post-fulfilment source is gone from DB + storage + provider after the window; a kept asset survives; delete-on-request removes original + derivatives + provider copies + leaves no backup copy past the defined window; each purge is audited. *(NN8; spine-1 §7)*
6. Audit log captures the full event set, append-only. *(docs/05)*
7. DPIA + Children's-Code assessment signed off; residual risk Low or escalated. *(LG1/LG2)*
8. Transfer review on file per processor; child-image processing in-region; any US processor has a documented Data Bridge or IDTA + TRA. *(LG3)*
9. ICO registration confirmed; Article 28 DPAs signed; the AI DPA has the no-retention/no-training term + ZDR + transfer route. *(LG5/LG6)*
10. Privacy + family-promise pages live, placeholders filled, brand-compliant. *(LG4)*
11. s.164A form live, acknowledges within 30 days; DSAR backend supports stop-the-clock + portability export. *(spine-1 §9/§10)*
12. Cookie banner: non-essential off by default; nothing fires pre-consent. *(LG2; PECR)*
13. Breach runbook exists with the 72-hour ICO path + breach log. *(spine-1 §11)*
14. Pipeline produces a Prodigi-accepted print file from a real low-res phone photo using only self-hosted in-region ops; no live image reaches the generative API. *(NN4; roadmap P0 gate)*
15. Waitlist captures email under explicit consent only; no child data pre-gate. *(PECR)*

**Exit gates.** All six LGs **enabled and evidenced**; roadmap-P0 gate (trust spine live + print-accepted file); **no live children's data may be processed until criteria 1–14 are green** (demand-proof/pre-orders are your commercial gate on the waitlist).

---

## Phase 1 — Wedge Launch: Drawing → Cards & Gifts  *(PUBLIC GO-LIVE)*

**Objective.** Deliver the full magic loop on the P0 spine and satisfy the entire DoLR end-to-end.

**Scope.** Marketing surface (Landing with hero draw-in/product-morph/range strip/3-step/trust line; how-it-works; gifts; our-story; trust pages — every "start creating" routes in one tap, built to mockups). · **Start Creating** (upload file+camera, auto-crop/deskew, "this stays yours", "made real" grid, no wall before the wow). · **Studio MVP** (Studio-spec cut: product-tied canvas + bleed/safe guides; import; layers; paint+eraser with size/opacity/**smoothness**/colour; brand swatches+picker; adjustments; preset filters+intensity; transform/crop with handles; text as opacity layer; brand stickers + "framed in gold"; **per-asset visibility, default Family**; product apply + live preview + switch + placement; **DPI indicator + one-tap upscale (Core)**; undo/redo + autosave + recoverable original; save/add-to-basket/duplicate; persistent "this stays yours" + delete creation+source; full **finger+stylus** §19a; mobile full-bleed canvas + floating brush HUD + bottom-sheet tool options + scrolling tool bar). · **Core magic edits** (remove bg, tidy lines, brighten, **upscale-to-print**) via the **self-hosted in-region** pipeline — no third party sees the image; generative styling NOT enabled here. · **Catalogue** (narrow hero SKU set — card wedge + 2–3 hero gifts; filters; live "40+" framing). · **Checkout** (cart; gift fork wrap+hide-prices+message OR add-to-gift-list; small tasteful add-ons; **server-side totals**; **prominent guest checkout**; Stripe — token only). · **Fulfilment** via the Prodigi adapter (order → DPI-passed print asset → dispatch → tracking; under-resolution can't reach fulfilment). · **Family Keepsake Home** (branded header + kept-together counter; family circle + invite affordance; member selector; keepsake box + create-new; gift-list card; "coming up" card; trust footer; **self-service see/download/delete** wired to P0 jobs). · **Family graph + gift loop** (add-member modal — relationship required→circle, **Child hides the invite block**, optional birthday, optional invite+access; invite→verify→membership at set circle/access, removal revokes immediately, all logged; create-gift-link modal — pre-checked items, **unguessable/noindex/revocable/expirable** link, invite-to-family toggle→access level; recipient view phone-optimised — pre-filled **frozen-snapshot** cart, add-ons, **"join family & checkout"** only if invite enabled → email→verify→join at link's circle/access with **5% saving applied server-side** AND prominent **guest checkout**). · **Occasion seed** (capture key dates; "coming up" deep-links into Create; gentle, consented, frequency-capped reminders). · **Cross-cutting** (all four states; a11y; restrained motion; thumb-zone ≥44px; **per-screen visual diff vs the mockup at ~390px + desktop**).

**Acceptance criteria.**
1. One tap from any CTA to Start Creating; landing communicates "drawings→keepsakes" + "private" with no account. *(docs/03 §1)*
2. Wow before wall: drawing on multiple real products in seconds, no forced sign-up; auto-crop/deskew applied. *(§2; SM-Activation)*
3. Studio MVP works on a phone by finger **and** stylus: upload → edit (incl. ≥1 magic edit) → set visibility → save; original recoverable; palm rejection + stylus-only mode + **smoothness** functional. *(Studio cut; NN6/7/8)*
4. **DPI gate + one-tap upscale (Core):** low-res on a large product shows ✗; one tap resolves to ✓; an under-resolution item cannot proceed to fulfilment. *(§15; SM-Trust)*
5. Non-destructive: original always recoverable; "delete creation+source" removes original+derivatives+provider copies via the purge job. *(NN8)*
6. Per-asset visibility defaults FAMILY; parent sets Only me/Family/Extended with a clear "who's included"; nothing public anywhere. *(NN2)*
7. Buy at print quality: guest (email only) and member each complete a Stripe purchase; **totals server-side**; gift wraps+hides prices+message; add-ons attach; guest path never buried. *(§5; docs/04 pricing; SM-Conversion/AOV)*
8. Fulfilment via Prodigi adapter produces a Prodigi-accepted file + tracking; provider swappable behind the adapter. *(SM-Trust)*
9. Keep privately: multi-child family with relatives views per-member keepsakes, sees the circle, self-serves see/download/delete — visibly private. *(§6; NN1/3)*
10. Invite-only graph: add a Child with **no invite block**; invite an adult (email→verify→join at set circle/access); removal revokes immediately; no self-join; all logged. *(docs/04; NN3; SM-FamilyGraph)*
11. Share a pre-filled gift link whose token is unguessable/noindex/revocable/expirable; the snapshot is frozen by-value; a deleted source returns 410, never a stale image. *(docs/03/04; NN1)*
12. Grandparent on a phone: pre-filled cart; either **joins** (email→verify→lands at link's circle/access, **5% applied server-side from the join provenance**) or **guest checks out**; "join & checkout" only if invite-to-family was enabled. *(§7; SM-Conversion/FamilyGraph/AOV)*
13. Gentle nudges: occasions captured; "coming up" deep-links into Create; reminders only on consented channels, frequency-capped (cap unit-tested). *(docs/04; PECR)*
14. AI invisible & non-retaining: Core magic edits run self-hosted in-region (no third party sees the image); no raw "AI" anywhere; original always kept. *(NN4)*
15. Brand & fidelity: every screen matches its mockup at mobile **and** desktop widths (tokens/fonts/Tabler icons/copy/named animations + reduced-motion); a visual diff is part of the exit checklist. *(NN5/9; docs/00)*
16. All four states present; accessibility checks pass. *(§NN7)*

**Exit gates.** **DoLR fully satisfied** (criteria 1–16); all six LGs carried green from P0. Commercial gate (your go/no-go for P2): first 100 orders; CAC < gift contribution; an early repeat signal; an organic breakout — instrumentation for gift-attach, CAC-vs-contribution and ops-exception rate ships in P1.

---

## Phase 2 — Content & Community Flywheel
**Objective.** Make acquisition compound **without** weakening privacy. **Scope:** consented UGC gallery / share-and-save (per-asset consent logged; watermark/privacy controls; child surname never exposed; links stay noindex+revocable; a creation appears publicly **only** via explicit logged consent); referral + consented list growth (PECR + caps); creator/influencer seeding tooling; seasonal campaign playbook. **Any user-to-user/public surface triggers a documented OSA re-assessment (spine-1 §13) before it ships.** **Acceptance:** (1) nothing public without explicit logged consent; revoking removes + cascades deletion of shared copies; (2) OSA re-assessment recorded before any public/u2u feature; (3) watermark/privacy controls + noindex on every share; (4) referral/list honour PECR with clean logs + one-tap unsubscribe; (5) campaigns don't alter default privacy. **Exit:** majority of new orders organic/referral/UGC; community size; first seasonal peak banked; consented list growing.

## Phase 3 — Flagship: Personalised Storybook  *(first routine generative use)*
**Objective.** Land the high-AOV keepsake on brand/ecosystem/trust, generative kept invisible/single-image/non-retaining. **Scope:** storybook story+illustration with a **hard QC gate**; **generative styling** ("make it watercolour/storybook") via the **contracted ZDR/no-retention API under the LG6 DPA + LG3 transfer route**, single image only, **budget cap**, original preserved, self-hosted ops still do everything they can; digital preview-before-print; premium bundling (server-side pricing); the child's own drawing woven into the story. **Acceptance:** (1) generative call is single-image + non-retaining, original preserved, verified vs the DPA; (2) surfaced only as a warm "magic edit", with a plain-English note on what it does; (3) QC gate blocks any sub-bar book from fulfilment; (4) server-side bundle pricing, no dark-pattern upsell; (5) DPI enforced for the book; (6) transfer route honoured (in-region preferred); **(7) a P3 gate re-runs the transfer assessment + DPIA + DPA sign-off for the generative sub-processor before any live image is sent.** **Exit:** book holding its review bar; target AOV; bundle attach proven; reveal content converting; LG6 re-confirmed under live load.

## Phase 4 — Retention / Occasion Engine
**Objective.** Own the family calendar; convert gifters to relationships — proactive, never intrusive. **Scope:** full reminder engine (proactive "it's nearly [child]'s birthday — a ready-made thing in two taps", deep-linking into Create); consented SMS/email with strict caps + one-tap control (SMS=consent; email soft-opt-in only where lawful); one-tap re-order / "this year's version"; optional Plus tier (server-side pricing); **no child profiling**. **Acceptance:** (1) un-consented channel sends nothing; caps enforced; opt-out honoured in one tap; consent changes logged; (2) no profiling / no behavioural ads to-or-about children — reminders derive only from stored occasion dates; (3) proactive ≠ intrusive (value obvious, control effortless, warm tone, no weaker-privacy nudges); (4) one-tap re-order pre-loads the prior creation (original recoverable); (5) membership/join savings server-side only. **Exit:** measurable reminder-driven revenue share; repeat rate + occasions-per-account rising; LTV:CAC clearing target.

## Phase 5 — Ecosystem & Scale
**Objective.** Full-range brand, "one input → 40+ products", whole-family gifting, falling ops cost — on the same spine. **Scope:** full catalogue breadth (live SKU count drives the "40+" framing); whole-family gifting; nursery/school + seasonal channels; additional POD providers behind the same adapter (DPA + transfer review first); **annual DPIA / Children's-Code review** + DPA re-confirmation. **Acceptance:** (1) every new SKU/surface still routes reads through authz, defaults FAMILY, keeps nothing public; (2) DPI enforced across the full range; (3) new providers integrate behind the adapter with DPAs + transfer review pre-launch; (4) DPIA + Children's-Code assessment reviewed (annually/on material change); DPAs current; (5) whole-family occasions honour the same consent/cap/no-profiling rules. **Exit:** range breadth achieved; ops cost/order falling; brand metrics (repeat, sentiment, organic share) rising.

---

## DoLR coverage (all green before P1 go-live)
| DoLR clause | Delivered by | Criterion |
|---|---|---|
| Upload a drawing / see it made real | P1 Start Creating | P1-2 |
| Buy at print quality | P1 Studio DPI + Checkout + Fulfilment | P1-4, P1-7, P1-8 |
| Keep privately | P1 Home + P0 authz/storage | P1-6, P1-9, P0-1/2 |
| Share pre-filled gift link | P1 gift loop | P1-11 |
| Grandparent joins & buys on a phone | P1 recipient view | P1-12 |
| Gentle occasion nudges | P1 occasion seed | P1-13 |
| Parent-controlled, nothing public | P0 authz + P1 Home/graph | P0-1, P1-6/10 |
| AI invisible & non-retaining | P0 pipeline + P1 magic edits | P1-14, P0-14 |
| All compliance gates closed | P0 E–J | P0-7..13 |
