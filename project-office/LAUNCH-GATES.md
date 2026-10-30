# Launch Gates — Snickerdoodle

> Maintained by Cowork. The six hard blockers from `docs/05`. Gates 1–3 originally required a qualified data-protection professional's sign-off; **on 29 Oct 2026 the founder chose to sign them off himself as controller** (recorded per gate below). Cowork drafts; it does not approve.

> **Status note (2026-06-26, Cowork).** The build now has *supporting scaffolding* for several gates — trust-page UI (LG4), a cookie banner with non-essential off by default (PECR), and schema for audit/DSAR/no-training attestation. **None of the gates themselves are met:** they require DP-professional sign-off and signed contracts, and no live children's data is processed yet. Scaffolding ≠ gate closed.

| # | Gate | Status | Owner | Blocker / next step |
|---|---|---|---|---|
| 1 | **DPIA** completed & signed off | ☑ signed off 29 Oct 2026 — **by the founder as controller** (Launch Mode Ltd), not by an external DP professional (founder's decision) | Simon | `project-office/compliance/DPIA-draft.md` (+ family-calendar addendum). Record any later professional review here. |
| 2 | **Children's Code** conformance assessment documented | ☑ signed off 29 Oct 2026 — **by the founder as controller** | Simon | `project-office/compliance/CHILDRENS-CODE-assessment-draft.md` |
| 3 | **International transfers** reviewed ("not materially lower") | ☑ signed off 29 Oct 2026 — **by the founder as controller** | Simon | Resend (US: UK Addendum to SCCs + DPF UK Extension), Stripe (DPF + UK IDTA), AWS (eu-west-2, DPA via Service Terms). **Prodigi: written confirmation that UK orders stay in UK labs is still awaited** (C1 email, 29 Oct) — revisit if their answer differs. The `LG3_TRANSFER_ASSESSMENT_SIGNED_OFF` setting is created only when private live mode is switched on (runbook §4.9). |
| 4 | **Privacy notice + family data promise** pages live (placeholders filled) | ◐ in progress | Cowork drafts → Simon approves | UI pages exist in `src/app/(marketing)/trust`; **placeholders still need filling** from trust-spine `-2`/`-3` |
| 5 | **ICO registration** / fee paid + **Article-28 DPAs** with all processors | ◐ ICO fee paid (Launch Mode Ltd); DPAs: AWS ✅, Stripe ✅, Resend ✅ (executed copy on file), Prodigi ✅ by its terms (reply 30 Oct: ~45-day file retention, no deletion on request; sub-processors + breach timescale still unanswered), **IWF pending** (form submitted 29 Oct) | Simon | Evidence: `project-office/compliance/PROCESSORS.md` (files kept in `Documents/snickerdoodle/compliance/`). Prodigi must also be recorded in the in-app sub-processor register before private live mode. |
| 6 | **AI provider** confirms **no-retention, no-training** in contract | ☐ not started | Simon | Tied to D3; generative provider unchosen. (No third-party image egress until P3 — so not yet on the critical path) |

**Decision D8 (content safety) adds two professional sign-offs — not formal gates, but launch-blocking for their areas:**
- 🧑‍⚖️ **DP professional** — confirm OSA scope ("in scope but small/low-risk", feeds gates 1–3), the CSAM detect→preserve→report workflow (illegal-content runbook), and the Children's-Code assessment of any human review of children's images.
- 🧑‍⚖️ **IP/brand lawyer** — validate the copyright posture (S3-b) and the rights-warranty / T&C wording before go-live.

Status key: ☐ not started · ◐ in progress · ☑ done · ⚠ blocked

**Reminder:** this is a tracker, not legal advice. Gates 1–3 require professional sign-off.
