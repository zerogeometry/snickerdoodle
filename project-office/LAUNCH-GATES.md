# Launch Gates — Snickerdoodle

> Maintained by Cowork. The six hard blockers from `docs/05`. **None may be ticked without a qualified data-protection professional's sign-off where noted.** Cowork drafts; it does not approve.

> **Status note (2026-06-26, Cowork).** The build now has *supporting scaffolding* for several gates — trust-page UI (LG4), a cookie banner with non-essential off by default (PECR), and schema for audit/DSAR/no-training attestation. **None of the gates themselves are met:** they require DP-professional sign-off and signed contracts, and no live children's data is processed yet. Scaffolding ≠ gate closed.

| # | Gate | Status | Owner | Blocker / next step |
|---|---|---|---|---|
| 1 | **DPIA** completed & signed off | ◐ in progress (draft ready for DP review) | Simon + DP professional | Draft: `project-office/compliance/DPIA-draft.md` (+ `OPEN-QUESTIONS-for-DP-professional.md`; + `DPIA-addendum-family-calendar.md` for the family calendar / "days we celebrate" — Art 9, and its privacy-notice wording `PRIVACY-NOTICE-family-calendar-draft.md` to publish) — needs DP review + sign-off |
| 2 | **Children's Code** conformance assessment documented | ◐ in progress (draft ready for DP review) | Simon + DP professional | Draft: `project-office/compliance/CHILDRENS-CODE-assessment-draft.md` (+ `OPEN-QUESTIONS-for-DP-professional.md`) — needs DP review + sign-off |
| 3 | **International transfers** reviewed ("not materially lower") | ☐ not started | Simon + DP professional | Depends on provider choices (D2–D4); still directional |
| 4 | **Privacy notice + family data promise** pages live (placeholders filled) | ◐ in progress | Cowork drafts → Simon approves | UI pages exist in `src/app/(marketing)/trust`; **placeholders still need filling** from trust-spine `-2`/`-3` |
| 5 | **ICO registration** / fee paid + **Article-28 DPAs** with all processors | ☐ not started | Simon | Per processor once chosen; none contracted yet. **D8 adds:** the AWS DPA must cover **Rekognition Content Moderation**; **IWF Image Intercept** onboarding/agreement |
| 6 | **AI provider** confirms **no-retention, no-training** in contract | ☐ not started | Simon | Tied to D3; generative provider unchosen. (No third-party image egress until P3 — so not yet on the critical path) |

**Decision D8 (content safety) adds two professional sign-offs — not formal gates, but launch-blocking for their areas:**
- 🧑‍⚖️ **DP professional** — confirm OSA scope ("in scope but small/low-risk", feeds gates 1–3), the CSAM detect→preserve→report workflow (illegal-content runbook), and the Children's-Code assessment of any human review of children's images.
- 🧑‍⚖️ **IP/brand lawyer** — validate the copyright posture (S3-b) and the rights-warranty / T&C wording before go-live.

Status key: ☐ not started · ◐ in progress · ☑ done · ⚠ blocked

**Reminder:** this is a tracker, not legal advice. Gates 1–3 require professional sign-off.
