# Snickerdoodle — Trust & Data Spine (1 of 3): Compliance Backbone

*Internal master document · Prepared for Simon, Launch Mode Ltd · Phase 0 deliverable*

> **Not legal advice.** This is a thorough, business-specific working draft built on current UK law as at June 2026. Because Snickerdoodle processes **children's personal data**, this pack must be reviewed and signed off by a qualified data-protection professional (a DPO-level adviser or a solicitor specialising in UK data protection) **before launch**. The goal of this draft is to make that review a tidy-up, not a rebuild — and to let you run Phase 0 from it now.

---

## 0. How this pack fits together

| Document | Audience | Purpose |
|---|---|---|
| **1. Compliance Backbone** (this doc) | Internal | The full assessment, registers, DPIA, policies, and the Phase-0 action list |
| **2. Privacy Notice** | Public | The plain-English-but-complete notice users see |
| **3. "How we look after your family's data"** | Public | The short, warm trust page that turns compliance into a selling point |

Documents 2 and 3 are downstream of this one — if anything changes here, update them.

---

## 1. The regulatory map — what applies, and what doesn't

| Regime | Applies? | Why it matters to Snickerdoodle |
|---|---|---|
| **UK GDPR + Data Protection Act 2018** | **Yes** | The core. We process personal data of parents *and* children. |
| **Data (Use and Access) Act 2025 (DUAA)** | **Yes** | Amends UK GDPR/DPA/PECR. Key tranche in force 5 Feb 2026; the new right-to-complain duty applies from 19 June 2026. Brings new obligations (below). |
| **ICO Children's Code (Age Appropriate Design Code)** | **Treat as Yes (voluntary conformance)** | Strictly applies to services *likely to be accessed by children*. Our intended users are parents — but our content is highly child-appealing, which is exactly an ICO trigger factor. We assess, document, and conform voluntarily. See §5. |
| **PECR (2003)** | **Yes** | Governs the reminder engine, email/SMS marketing, and cookies. DUAA raised the maximum PECR fine to £17.5m / 4% of turnover — this channel is now high-stakes. |
| **Online Safety Act 2023** | **Largely out of scope** | OSA bites on user-to-user / search services. By cutting the open marketplace, we removed almost all OSA exposure. Re-assess if any public user-to-user feature (public gallery, comments, the "Collection") is ever added. See §13. |

**One-line summary:** we are a UK data controller processing children's data with AI, so we need ICO registration, a DPIA, Children's-Code-grade design, a tight retention regime, processor contracts with international-transfer cover, and the new DUAA complaint and rights procedures.

---

## 2. Controller status & ICO registration

- **Snickerdoodle (Launch Mode Ltd) is a data controller** — we decide the purposes and means of processing. Our POD suppliers, AI providers, hosting and email/SMS vendors are **processors** acting on our instructions (see §8).
- **ICO data protection fee:** as a micro-organisation (≤10 staff / ≤£632k turnover) you are **Tier 1 — £52/year (£47 by direct debit)**. Registration is a legal requirement once processing begins; non-payment risks a penalty up to £4,000+. Register at ico.org.uk/fee — ~15 minutes.
- **Action:** register **before** any live customer data is processed (i.e. before the smoke test if it captures real personal data). See §14.

---

## 3. Data inventory / Record of Processing Activities (Article 30)

| Data category | Examples | Whose | Why we hold it | Lawful basis (see §4) | Retention (see §7) |
|---|---|---|---|---|---|
| Account data | Name, email, password (hashed) | Parent | Run the account | Contract | Until account deletion + backup purge |
| Child identifiers | Child's first name, age/birthday | Child | Personalise products; reminder engine | Contract (product) / Consent (reminders) | Until removed by user or account deletion |
| Uploaded creations | Child's drawing, family photo | Child / family | Make the ordered product | Contract | Fulfilment + 30 days, then deleted — *unless* user keeps it in their Keepsake Home |
| Generated assets | AI-rendered product designs | Child / family | Deliver and let user re-order | Contract | User-controlled in Keepsake Home; else minimised |
| Order & payment | Items, address, payment token | Parent | Fulfil order, tax records | Contract / Legal obligation | 6 years (HMRC) for transaction records |
| Marketing prefs | Email/SMS opt-ins, consent log | Parent | Send marketing & reminders | Consent (PECR) | Until withdrawn + evidence window |
| Wishlist & shares | Wishlist items, share-link tokens | Parent (+ family who buy) | Enable gifting | Contract / Consent | Until expiry/revocation |
| Technical | IP, device, cookies | Parent | Security, basic analytics | LI / Consent (cookies) | Short, rolling |

Payment card data: **never stored by us** — handled by the payment processor (e.g. Stripe). We hold only a token.

---

## 4. Lawful basis assessment (per activity)

The architecture is deliberately simple and trust-aligned: **Contract for the service, Consent for anything optional, and never any reliance on bases that would surprise a parent.**

1. **Account creation & management** → **Contract** (Art 6(1)(b)). Necessary to provide the service the parent signed up for.
2. **Processing an uploaded drawing/photo to create the ordered product** → **Contract.** Processing the child's image is necessary to perform the service the parent requested. *Belt-and-braces:* we also take a clear, plain-English permission at the point of upload (good practice, and it powers the brand's "this stays yours" UX) — but Contract is the operative basis, so the service still works if a permission is later withdrawn for future use.
3. **AI rendering/styling of creations (incl. PFP/banner)** → **Contract** (it *is* the service the user asked for).
4. **Storing creations in the Keepsake Home beyond the order** → **Consent / user choice.** Default is minimisation; the user actively chooses to keep items, and can delete any time.
5. **Reminder engine (storing key dates + sending "it's nearly X's birthday" prompts)** → storage is **Contract/LI**, but the *electronic message* is direct marketing → **Consent (PECR)**. Reminders are opt-in.
6. **Email/SMS marketing** → **Consent (PECR).** Note: DUAA now lists direct marketing as a recognised *legitimate interest* for the UK GDPR Art 6 layer, but **PECR still governs the channel** — so you still need consent (email may use the limited "soft opt-in" for existing customers buying similar products; SMS should be consent). Don't let the DUAA change fool you into dropping consent.
7. **Wishlist creation & sharing** → **Contract/Consent**, user-initiated. Minimise any data captured about gift-buyers.
8. **Security & fraud prevention** → **Legitimate Interests** (with a brief LIA on file).
9. **Basic analytics cookies** → post-DUAA, certain low-risk cookies may not need consent if you provide transparency + opt-out; given our trust posture, **lean conservative** — clear cookie banner, non-essential off by default.

**Children's data note.** A child's *photograph* is personal data but **not automatically special-category** data — it only becomes special category if processed through biometric means for *unique identification* (we do not do facial recognition) or to infer special-category traits (we do not). We nonetheless treat all child data as **high-sensitivity** by policy. Where consent in respect of a child is needed, the **parent (holder of parental responsibility)** provides it; the service is offered to the parent, not directly to the child.

---

## 5. Children's Code applicability assessment (document this — it's an accountability requirement)

**The test.** The Children's Code applies to information society services *likely to be accessed by children* (under-18s as users), even if children are not the intended audience. The ICO's threshold is low: *more than a de minimis number* of child users. Trigger factors include content/design that **appeals to children** — cartoons, animation, playful features, presence of children's imagery.

**Our position.**
- **Intended users:** adults (parents/gift-buyers). Children are **data subjects whose data we process**, not the intended account-holders.
- **But:** our brand is built on child-appealing aesthetics, and older children (13–17) could plausibly create or use accounts. We cannot honestly claim children are *unlikely* to access it.
- **Decision:** rather than rely on a fragile "adults only" argument, we **voluntarily conform to the Children's Code's 15 standards** and design as though it applies. This is the lowest-risk legal posture **and** it is the literal expression of the brand promise ("the grown-up in the room"). We record this assessment, justify it, and review it regularly (an explicit ICO expectation).
- **DUAA reinforcement:** DUAA's "children's higher protection matters" (in force Feb 2026) statutorily require services likely to be accessed by children to account for children's specific protection in design — conforming voluntarily keeps us ahead of this regardless of how the borderline resolves.

**What voluntary conformance means in practice (the standards that bite for us):**
- **Best interests of the child** as a primary design consideration.
- **Data minimisation** — collect only what's needed for the product (see §7).
- **High privacy by default** — nothing about a child is public unless the parent actively chooses; default settings are the most protective.
- **No "nudge" techniques** that push parents to share more of a child's data than necessary.
- **No profiling of children** by default; **no behavioural advertising** to or about children.
- **Transparency** in plain, parent-friendly language.
- **Prominent, easy data-rights tools** — see and delete a child's data in one place, one tap.
- **A DPIA** specifically considering risks to children (see §6).

---

## 6. Data Protection Impact Assessment (DPIA)

A DPIA is **mandatory** here: we process children's data, on a potentially large scale, using new technology (generative AI). This is the centrepiece internal document. Below is the working DPIA; have it reviewed and formally signed off before launch.

### 6.1 Description of processing
Parents upload children's drawings and family photos; we (via AI processors) render them into product designs; we fulfil physical products via print-on-demand; we store creations in a user-controlled "Keepsake Home"; we run an opt-in reminder engine off children's key dates; we enable private wishlist sharing.

### 6.2 Necessity & proportionality
Each processing activity is tied to a clear purpose and the minimum data needed (see §3–§4). Source images are minimised and deleted post-fulfilment unless the user chooses to keep them. AI processing is limited to producing the requested design.

### 6.3 Consultation
Document any user research/testing. Where residual risk stays high after mitigation, the ICO may need to be consulted before processing — flag to your reviewer.

### 6.4 Risks to the rights and freedoms of children, and mitigations

| Risk | Likelihood/impact | Mitigation |
|---|---|---|
| A child's image/identity exposed via a shared link | Med / High | Unguessable, non-indexed, revocable share tokens; no child surname required; `noindex`; expiry |
| Data breach exposing children's images | Low / High | Encryption in transit & at rest; access controls; minimised retention; breach plan (§11) |
| AI processor retains/trains on a child's image | Med / High | Contractual ban on retention & training; zero-data-retention API settings; processor due diligence (§8) |
| Source images accumulate indefinitely ("retention creep") | Med / Med | Automatic deletion post-fulfilment; user-controlled Keepsake Home; scheduled purge jobs |
| Profiling/behavioural ads involving children | Low / High | No profiling of children; no behavioural advertising to/about children — by design |
| International transfer to a weaker regime | Med / High | Transfer mechanism + "not materially lower" assessment per sub-processor (§8) |
| A child (13–17) uses the service unsupervised | Med / Med | Children's-Code-grade defaults; high privacy by default; age-appropriate transparency |
| Re-identification from combined data | Low / Med | Data minimisation; separation of identifiers; no unnecessary linkage |

### 6.5 Residual risk & sign-off
Document residual risk after mitigations as Low for each line, or escalate. **Sign-off block:** prepared by ⟶ reviewed by (DP professional) ⟶ approved by (you, as controller) ⟶ review date (at least annually, or on any material change).

---

## 7. Data minimisation & retention schedule (the "it's gone afterwards" promise, made real)

This schedule **is** the brand promise. It must be technically enforced (scheduled deletion jobs), not just stated.

| Data | Retention rule |
|---|---|
| Uploaded source drawing/photo | Kept only to fulfil the order + a 30-day reprint/returns window, then **auto-deleted** — *unless* the user chooses to keep it in their Keepsake Home |
| Keepsake Home items | Kept while the user wants them; **deleted on request, one tap**; purged on account closure |
| Generated designs | As above — user-controlled |
| Order/transaction records | 6 years (HMRC/accounting), then deleted |
| Account data | Until account deletion + a defined backup-purge window |
| Marketing/consent records | Until consent withdrawn + a short evidence-retention window |
| Children's key dates (reminders) | Until the user removes them or closes the account |
| Share-link tokens | Until expiry or revocation |
| Logs/technical | Short rolling window (e.g. 30–90 days) |

**Posted-in originals:** if a parent posts a physical drawing, return it safely (a brand moment) and don't retain a scan beyond the retention rule.

---

## 8. Sub-processors & international transfers (Article 28 + transfers)

Every third party that touches personal data on our behalf is a **processor** and needs an **Article 28 data processing agreement** in place *before* go-live.

**Sub-processor register (to populate):** hosting/cloud; database; AI image-generation provider; print-on-demand supplier(s); payment processor; email/SMS provider; analytics.

**For each, require:**
- A signed DPA with Article 28 terms (process only on our instructions, confidentiality, security, sub-processor controls, deletion/return on termination, audit/assistance).
- **AI providers specifically:** contractual ban on **retaining or training on** our inputs; use **zero-data-retention** API modes where offered. This is non-negotiable — it's the spine of the "we don't train anything on your child" promise.
- **Children's-data due diligence:** confirm each processor's security and (for any child imagery) suitability.

**International transfers.** If any processor stores/processes data outside the UK (many US-based AI and cloud providers do), you need a valid transfer route:
- **UK–US Data Bridge** (UK extension to the EU–US Data Privacy Framework) for a US recipient that is *certified* under it; **or**
- **IDTA / UK Addendum to SCCs** plus a transfer risk assessment.
- DUAA introduced a **"not materially lower" data protection test** for transfers — apply it, and given this is **children's data**, assess carefully and prefer UK/EU-hosted processors where you can. ICO updated its international-transfer guidance in early 2026 — have your reviewer check the current position per provider.

---

## 9. Data subject rights procedure

Honour the full set: access, rectification, erasure, restriction, objection, portability, and rights around automated decisions. Build the self-service tools the Children's Code expects (see/download/delete in the Keepsake Home).

**DUAA updates to fold in:**
- Searches in response to a request need only be **"reasonable and proportionate."**
- **"Stop the clock":** the response deadline pauses while you reasonably need clarification or identity verification from the requester.
- When you **decline** to act on a request, you must now tell the person of their right to complain **both** to you (see §10) **and** to the ICO.

---

## 10. The new right-to-complain procedure (DUAA s.164A) — build this now

DUAA created a statutory right for individuals to complain **directly to the controller**. From 19 June 2026 you must have this in place. Requirements:
- Provide **at least one accessible channel** to submit a data-protection complaint (e.g. an online form that can be completed electronically).
- **Acknowledge receipt within 30 days.**
- Take **appropriate steps to investigate without undue delay**, and keep the complainant informed of progress and outcome.
- **Signpost this right in your Privacy Notice** and in responses to rights requests (done in Document 2).

---

## 11. Data breach response plan

- **Detect & contain**, then assess severity and scope.
- **Notify the ICO within 72 hours** of becoming aware, where the breach is likely to risk individuals' rights and freedoms. **Breaches involving children's images will almost always meet this bar** — assume notifiable.
- **Notify affected individuals without undue delay** where the risk is high.
- **Log every breach** (even non-notifiable ones) — a legal requirement.
- Keep a one-page incident runbook (who does what, contacts, ICO portal link) so a solo operator can act fast under pressure.

---

## 12. Security — technical & organisational measures

- Encryption in transit (TLS) and at rest for personal data, especially children's images.
- Strong authentication; least-privilege access; hashed passwords; MFA on admin.
- Private-by-default storage; signed, expiring URLs for any image access; no public buckets.
- Scheduled deletion jobs enforcing §7; tested backups with a defined purge cycle.
- Vendor security due diligence (§8); patching; logging/monitoring.
- A written, dated record of these measures (accountability).

---

## 13. Cookies, PECR & the Online Safety Act

- **Cookies:** post-DUAA, low-risk cookies (e.g. security, basic analytics) may be set without consent **if** you give transparency and an opt-out. Given the brand, lean conservative: a clear banner, non-essential cookies **off by default**.
- **PECR marketing:** consent for email/SMS marketing and the reminder engine (email soft opt-in possible for existing customers re similar products; SMS = consent). Remember the fine ceiling is now £17.5m/4% — treat this channel as high-stakes and keep clean consent logs.
- **Online Safety Act:** cutting the open marketplace took you largely out of OSA scope. **Re-assess immediately** if you ever add public user-to-user features (a public gallery, comments, the curated "Collection" if it allows public submission/interaction). Keep the wishlist strictly private/link-based.

---

## 14. Phase-0 action checklist (do these before launch)

1. **Register with the ICO** (Tier 1, £52/£47 DD) before processing real personal data.
2. **Get this pack reviewed and signed off** by a qualified DP professional — prioritise the DPIA, the Children's Code assessment, and the international-transfer routes.
3. **Stand up Article 28 DPAs** with every processor; confirm AI providers' **no-retention/no-training** terms and zero-data-retention modes; settle transfer mechanisms.
4. **Build the technical retention/deletion jobs** that enforce §7 — the promise is only real if the code deletes.
5. **Build the self-service rights tools** (see/download/delete) into the Keepsake Home.
6. **Stand up the s.164A complaints channel** (online form, 30-day acknowledgement workflow).
7. **Implement private-by-default** sharing (unguessable, non-indexed, revocable tokens; `noindex`).
8. **Publish Documents 2 and 3** (Privacy Notice + the warm trust page).
9. **Write the one-page breach runbook** (§11).
10. **Record the Children's Code assessment and DPIA sign-off**, with review dates.

---

*Living document. Children's-data law is mid-change (the Children's Code is under review following DUAA, and further ICO guidance lands through 2026) — schedule a review with your DP adviser at launch and at least annually after.*
