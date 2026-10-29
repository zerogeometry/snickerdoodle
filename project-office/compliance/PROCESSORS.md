# Processor register (LG5 + DPIA §5)

> Started 2026-10-27. **Owner:** Simon (controller: Snickerdoodle, trading via Launch Mode Ltd; ICO fee paid).
> This is the paper version of the `sub_processors` table (`src/db/schema.ts:412`). The two must
> agree. Feeds launch gate **LG5** (`project-office/LAUNCH-GATES.md:13`), DPIA §5
> (`project-office/compliance/DPIA-draft.md:193-197`) and the transfers review (LG3).
>
> ⚠ **Don't add Prodigi to the `sub_processors` table yet.** The live egress gate
> (`src/fulfillment/gate.ts`) treats a POD row with a DPA date and a transfer mechanism as one of its
> conditions for sending a child's drawing on LIVE. Add the row only once section F of the Prodigi email
> is answered and LG3 is green.
>
> Public copies of the DPAs, saved 2026-10-27, are in `compliance/dpas/` (list at the bottom). They were
> downloaded from the web and are **for reading only**.

## Register

| | **Prodigi** | **AWS** (Lightsail, S3, KMS, ECR, SSM; **Rekognition** when switched on) | **Stripe** | **Resend** | **IWF** (Image Intercept) |
|---|---|---|---|---|---|
| **Role** | Processor: print-on-demand + delivery | Processor: hosting, storage, database box, backups; content moderation classifier (D8) | Processor for payments. **Independent controller** for its own purposes: fraud, regulatory, KYC (Stripe DPA §2) | Processor: sends the site's emails | **To confirm:** processor, independent controller, or neither if only hashes leave (`ops/IWF-ONBOARDING.md` §1) |
| **Data** | Print file (a **child's drawing**, sometimes with a first name), recipient name + address, order ref, card message text | Everything we hold: children's drawings (originals under their own KMS key), accounts, families, orders, audit log. Rekognition: **one image per call** | Buyer name, email, card, billing/shipping address, IP; product labels + amounts. **No child data** (line names are product labels) | Recipient email; message content incl. **child first name + age** (reminders), family name, magic-link and gift-link URLs | A hash of every upload. **To confirm** whether any image bytes leave us |
| **How the DPA applies** | Prodigi DPA **v1.0 (1 May 2026)** is part of their terms, so it applies automatically when we use the service. **No signed copy yet** | AWS GDPR DPA is part of the **AWS Service Terms**, so it applies automatically to the account. AI-services terms: an **opt-out policy** is required so content isn't kept or used to improve AWS services | Stripe DPA is part of the **Stripe Services Agreement** (current version: 28 Sep 2026) | Resend DPA **becomes binding when you accept their ToS** (DPA, "This Addendum shall become legally binding upon Customer entering into the Agreement") | **None yet.** Needs the Image Intercept terms / onboarding agreement |
| **Where it's processed** | UK company. GB orders quoted from GB labs (uk9, uk3, gb2, gb3, uk2, uk5, uk15…); **cards from uk7, Guernsey**. The DPA also lists **US/Australia** as possible locations, and partner labs aren't named | **eu-west-2 (London)** for all customer data. AWS DPA §12.1: data stays in the chosen Region. Rekognition pinned to eu-west-2 in code | Stripe Payments UK / Europe; group processing at **Stripe, LLC (US)** (DPA §6) | Sending region **EU (Ireland)**, but the DPA says Resend's **"primary processing operations take place in the United States"**. Its sub-processor list includes AWS (USA) | UK (IWF is a UK charity). Hosted vs in-our-server: **to confirm** |
| **Transfer mechanism** | Guernsey: UK adequacy regulations. US/AU: **none set out for us**, so we need written confirmation that GB orders stay in the UK (email F2) | None needed for data at rest in London. US-parent remote access: SCCs in the DPA (§12.2) + UK–US data bridge (AWS is DPF-certified). Note for LG3 | **UK IDTA via Stripe's Data Transfers Addendum** (DPA §6.1), with the DPF where it applies | **UK Addendum to the EU SCCs** (DPA §6) **+ DPF UK Extension** (DPA §11) | None expected (UK to UK) |
| **Retention** | **No fixed artwork retention** in the DPA (reported ~30 days, not confirmed). We've asked for deletion ≤30 days after dispatch + deletion on request (email F1). No deletion handshake in code yet (DPIA A-18) | Ours, enforced in code: source upload deleted after fulfilment + 30 days unless kept; DB dumps 14 days. Rekognition: no retention **once the opt-out applies** (A-08) | Stripe's own retention as an independent controller (legal/regulatory); we hold only a session id | DPA §2.4: return or delete at the end of the service. Message logs on Resend: **to check** in the dashboard | **To confirm:** what IWF logs or keeps from each check, and for how long |
| **Breach notice** | "Without undue delay" (asking for 48 h, email F4) | "Without undue delay" (DPA §9.1) | **≤ 48 hours** for UK GDPR data (DPA §3.1(f)) | "Without undue delay" (DPA §8.6) | To confirm |
| **Open actions** | Send **`gtm/C1-prodigi-email.md`** (section F: retention, UK-only labs + owned vs partner, sub-processors, breach timescale, signed copy / written confirmation). Then record the answers here and in DPIA §5 | (1) ✅ **Checked AWS Artifact on 29 Oct 2026 (founder):** no GDPR / data-processing addendum is listed to accept under Organization or Account agreements; AWS applies its GDPR DPA (incl. UK transfer terms) automatically through the Service Terms, so the saved public copy (`dpas/aws-gdpr-dpa-public-2026-10-27.pdf`) is the agreement. The Australian/NZ breach addenda and the HCLS BAA listed there do not apply and were not accepted. (2) A-08 opt-out: **evidence recorded** (DPIA:286, policy `p-90enw48kh1` on the org root). Optional read-only re-check below. (3) Rekognition stays off until LG3 + LG6 | Nothing to sign. Record that the account accepted the SSA, and the account id. Privacy notice must name Stripe as an **independent controller** (OQ-14, A-14) | (1) **Download the executed / account copy** from the dashboard (click path below). (2) LG3: assess the **US processing** (UK Addendum + DPF) in the transfer risk assessment. (3) Confirm **open/click tracking is off** | **Express interest** in Image Intercept (form on iwf.org.uk). Get the answers in `ops/IWF-ONBOARDING.md`. Until then the hash gate stays **closed** |
| **Link** | https://www.prodigi.com/dpa/ | https://d1.awsstatic.com/legal/aws-dpa/aws-dpa.pdf · https://aws.amazon.com/service-terms/ | https://stripe.com/legal/dpa | https://resend.com/legal/dpa · https://resend.com/legal/subprocessors | https://www.iwf.org.uk/our-technology/image-intercept/ |

**Not in this table, but also processors (DPIA v0.3):** **Google Workspace** (`support@` / `hello@`
mailboxes: help-form and data-complaint messages). It needs its own row and Google's Cloud Data
Processing Addendum (Admin console → Account → Legal and compliance). **Netlify** now only hosts DNS
and an idle test copy, with no children's data.

## Getting the account copies (needs your login)

**AWS Artifact (the DPA as it applies to our account)**
1. Sign in to the **management account** (337820987621). Its agreements cover the whole organisation.
2. Search the console for **Artifact**, then open **AWS Artifact → Agreements**.
3. Look at **Organization agreements** and **Account agreements** for the GDPR / data processing
   addendum. AWS now applies the GDPR DPA automatically through the Service Terms, so it may not be
   listed as something to "accept". If so, the public PDF saved here *is* the agreement. Note the
   date you checked.
4. Also under **Artifact → Reports**: download the **ISO 27001** certificate and the **SOC 2 Type II**
   report (the evidence for "appropriate security" in the DPIA). Accepting the report download terms
   is your call.

**Resend (executed copy)**
1. Sign in at resend.com, then open **Settings** (team settings) and look for a **Documents / Legal / DPA**
   section to download the account copy.
2. If there isn't one, email Resend support and ask for a **countersigned DPA** for the team. The DPA
   itself says it binds on accepting the ToS, so the public copy plus your sign-up date is the fallback
   evidence.
3. While you're there: **Settings → Domains → snickerdoodle.co.uk**. Check the region says **Ireland
   (eu-west-1)**, and that **open and click tracking are off**.

**AWS AI-services opt-out: optional read-only re-check** (from the management account; changes nothing)
```bash
aws organizations list-policies --filter AISERVICES_OPT_OUT_POLICY
```
```bash
aws organizations list-targets-for-policy --policy-id p-90enw48kh1
```
You're looking for `opt-out-all` in the first, and a target of type `ROOT` in the second.

## Saved public copies (`compliance/dpas/`, all 2026-10-27)

| File | What | sha256 (first 16) |
|---|---|---|
| `stripe-dpa-2026-09-28-version-downloaded-2026-10-27.pdf` | Stripe DPA PDF, "Last updated 28 September 2026" | `640e1ab01d2e7371` |
| `stripe-dpa-public-2026-10-27.html` | stripe.com/gb/legal/dpa page | `bb6929d22cfc4796` |
| `resend-dpa-public-2026-10-27.html` | resend.com/legal/dpa page | `e73402e79f731a60` |
| `resend-subprocessors-public-2026-10-27.html` | resend.com/legal/subprocessors page | `cf26c923cff628e0` |
| `aws-gdpr-dpa-public-2026-10-27.pdf` | AWS Data Processing Addendum (public PDF) | `15f95fd3f83f4880` |

Not saved: **Prodigi's DPA** (you didn't ask for it). Worth saving a copy the same way so we have the
v1.0 text we're relying on.

## Evidence on file (29 Oct 2026, founder) — kept OUTSIDE the repo
AWS's reports are **AWS Confidential** (shareable only with a regulator, or a customer under NDA), so the
files live in the founder's private folder **`Documents/snickerdoodle/compliance/`**, never in git:

| Document | What it shows |
|---|---|
| AWS SOC 2 **Type 2** (Security, Availability, Confidentiality, Privacy), 1 Apr 2025 – 31 Mar 2026 | Region list includes **Europe (London) eu-west-2**; in-scope services include **S3, KMS, Rekognition, ECR, Systems Manager**. ⚠ **Lightsail is not listed** — the box running the app + on-box Postgres (parent names/emails/orders; never image bytes). Say so in the DPIA; consider the managed database later. |
| AWS ISO/IEC 27001:2022 certificate | AWS's certificate (scope pages not machine-readable here; check for Lightsail / eu-west-2 by eye). |
| Resend DPA, executed | Countersigned by Resend (DocuSign, 14 Jan 2026); binding on our acceptance of the ToS (§12). UK SCCs via the UK Addendum + DPF UK Extension. |
| Resend SOC 2 report, 1 Feb 2025 – 1 Feb 2026 | Security evidence for the email processor. |
