# UK subscription rules (DMCC Act Part 4 Ch 2 + existing law) and a cheap Stripe build — for Snickerdoodle, as of 26 Nov 2026

## 1. DMCC Act 2024 subscription regime: obligations, commencement, scope (gifts, prepaid)

### Takeaway
The regime is **NOT in force today (26 Nov 2026)**. It applies to subscription contracts **entered into on or after 1 January 2027**. The PM brought it forward on 9 Aug 2026 from "spring 2027". The draft Consumer Subscription Contracts (Cancellation and Information) Regulations 2026 were laid on 19/20 Oct 2026 under the affirmative procedure. The last sources I could check still show them as draft (not yet approved or made). The regime only catches contracts that **auto-renew or auto-continue with a charge**. A prepaid, fixed-term gift that simply ends is outside it. The law says nothing specific about gifts.

### Cited Findings
**Commencement (the critical point)**
- The No 10 press release of 9 Aug 2026 (PM Andy Burnham) says the subscription rules "come into force in January 2027", timed for when people start yearly subscriptions. — [gov.uk news, 9 Aug 2026](https://www.gov.uk/government/news/pm-starts-roll-out-of-everyday-fixes-on-the-cost-of-living-ending-rip-off-discounts-and-subscription-traps)
- Timeline: first "not before spring 2026", then autumn 2026. The 2 Apr 2026 consultation response said spring 2027. The 9/10 Aug 2026 announcement moved it to January 2027 with "substance unchanged". — [TLT](https://www.tlt.com/insights-and-events/insight/dmcc-act-subscription-contracts-regime-brought-forward-by-the-pm-what-do-businesses-need-to-know); [Taylor Wessing (Apr 2026, spring 2027)](https://www.taylorwessing.com/en/insights-and-events/insights/2026/04/subscription-contracts); [Wiggin DMCCA tracker](https://www.wiggin.co.uk/insight/digital-markets-competition-and-consumer-act-tracker/)
- DBT draft guidance (published Oct 2026): "The subscription rules apply to subscription contracts entered into on or after 1 January 2027." The guidance also says Part 4 Ch 2 "has been passed by Parliament and received Royal Assent but is not yet in force". — [DBT Draft Guidance PDF](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- legislation.gov.uk shows the SI as a draft that "has not yet been made", laid "for approval by resolution of each House". It is due in force 1 Jan 2027 and applies only to contracts entered into after s.254 DMCCA commences (reg 2(2)). I found no transitional or grace period. — [legislation.gov.uk draft SI](https://www.legislation.gov.uk/ukdsi/2026/9780348287912)
- Laying date: TLT gives 19 Oct 2026 and Wiggin gives 20 Oct 2026 (minor conflict). — [TLT](https://www.tlt.com/insights-and-events/insight/dmcc-act-subscription-contracts-regime-brought-forward-by-the-pm-what-do-businesses-need-to-know); [Wiggin](https://www.wiggin.co.uk/insight/digital-markets-competition-and-consumer-act-tracker/)
- The rules are not retrospective. Existing contracts that roll over after 1 Jan 2027 are not caught, though DBT calls consistent treatment "best practice". — [DBT Draft Guidance, FAQ 1–2](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- The CMA will lead enforcement. In the early months it will focus on helping businesses comply and on egregious conduct. — [Lewis Silkin, 21 Oct 2026](https://www.lewissilkin.com/insights/2026/10/21/uk-government-publishes-draft-guidance-and-regulations-for-new-subscription-contr-102o624)

**Scope**
- A subscription contract is trader–consumer, for goods, services or digital content, for payment, and "will auto-renew (and the consumer automatically charged) unless the consumer takes action to stop it". It includes free or reduced-cost periods that auto-renew onto a higher price (s.254). — [DBT Draft Guidance §2](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- Exclusions (Sch 22, amended by SCR regs 39–40): charitable cultural and heritage memberships, utilities, financial, medical prescriptions, telecoms, accommodation, micro-grocery, package travel, timeshare, childcare, gambling. Nothing in the list covers gifts or printed goods. — [DBT Draft Guidance §3](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- No provision in the draft SI covers gift subscriptions, payment by a non-recipient, prepaid contracts, or traders who can't contact the consumer. — [legislation.gov.uk draft SI](https://www.legislation.gov.uk/ukdsi/2026/9780348287912). The full-text search of the DBT guidance found no "gift" mention except Gift Aid. — [DBT Draft Guidance](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- Where an app store or billing provider is involved, the duties stay on the trader the consumer contracted with (FAQ 11). — [DBT Draft Guidance](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)

**Pre-contract information**
- **Key pre-contract information** (Sch 23 Pt 1 / Annex A) must be shown *in the purchase journey without clicking a link* (FAQ 17), "first, prominently and separately" from the full information. It covers:
  - that the contract continues, with ongoing payment;
  - any minimum period;
  - for a trial or intro offer: that it auto-renews, plus the date and amount of the first full or higher charge;
  - payment frequency and the minimum amount each time;
  - the **monthly equivalent if not monthly** (e.g. £120/yr = £10/month);
  - the **minimum total payable**;
  - any variation terms;
  - how to end it, and any notice needed;
  - **the reminder-notice timeframe** (e.g. "X to Y days before");
  - a summary of cooling-off rights.

  — [DBT Draft Guidance §4.1, Annex A](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- **Full pre-contract information** (Annex B) can sit behind a "prominent and direct link". It must then be given on a **durable medium (email) as soon as reasonably practicable after sign-up and before supply starts** (s.257(9)). — [DBT Draft Guidance §4.2, FAQ 18](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- The last step must include an **express acknowledgement of the obligation to pay** (a clearly labelled subscribe button). Without it, "the consumer is not bound by the contract". Delivery restrictions and accepted payment methods must also be visible in the journey. — [DBT Draft Guidance §4.3](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)

**Reminder notices**
- Frequency:
  - Rolling weekly or monthly plans: roughly **once per 6 months**, ahead of the last renewal payment in each "relevant six-month period". Example: sign up 1 June, monthly payments, reminders before 1 Dec and 1 June.
  - Plans renewing every 9 or 12 months: a reminder before **every** renewal.
  - Renewals onto **12+ months**: an **additional, earlier reminder** as well (s.259(6)–(8)).
  - Trials or discounts: a reminder before the first payment at the higher price.

  — [DBT Draft Guidance §4.4.1–4.4.2](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- Timing: there is **no fixed day window** in the Act. The trader states the period in the key information, it must be "reasonable", and the notice must go within it. — [legislation.gov.uk s.259](https://www.legislation.gov.uk/ukpga/2024/13/section/259). Earlier Bill drafts had fixed windows (3–5 days and 10–14 days). — [search summary citing law-firm commentary; see BCLP](https://bclplaw.com/print/v2/content/1543851/dmcca-taking-a-closer-look-at-the-impact-on-subscription-contracts.pdf)
- Form: in writing on a **durable medium**. Email, SMS and WhatsApp qualify. A non-retrievable push or in-app pop-up does not. The purpose must be readily apparent (e.g. the subject line), and the prescribed information must be **more prominent than any marketing** (e.g. shown first). Promotional content is allowed in a reminder if it is less prominent. — [DBT Draft Guidance §4.4, FAQ 8, FAQ 25](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- Content (Sch 23 Pt 3 / Annex C):
  - that it will auto-renew unless the consumer acts;
  - the renewal amount and date;
  - the **previous payment, for comparison, and any increase**;
  - details of further payments;
  - the minimum total if not ended;
  - the next renewal date or the end date;
  - **how to end it (e.g. a hyperlink)**, contact details, and the deadline.

  — [DBT Draft Guidance Annex C](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)

**Exit ("easy exit")**
- The consumer can end the contract at any time, including immediately after entry (SCR reg 32). Exit must be "straightforward", without steps "not reasonably necessary". The policy intent is "as easy as signing up", ideally without contacting the trader more than once.
  - A compulsory feedback form is "unlikely to meet the requirements".
  - Retention offers must not prolong exit or discourage it.

  — [DBT Draft Guidance §4.5.2, §4.5.4](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- If sign-up is online, exit must be possible online, with instructions where people will look. A clearly labelled button or a simple web form works. **An email address alone does not meet the online-exit requirement.** A "clear statement" by any means (including email) still counts as notice. — [DBT Draft Guidance §4.5.3](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- **End-of-contract notice**: on a durable medium, stating the end date. It must go **within 24 hours if ended online**, or within 3 working days otherwise (s.261). — [DBT Draft Guidance §4.6](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- A consumer can't be made liable for a renewal payment before the period it covers starts (s.273(2)). — [DBT Draft Guidance §4.7](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)

**Cooling-off**
- Initial: 14 days. For goods it ends 14 days after the first supply is received in full.
  - **Bespoke goods** (made to the consumer's specification or clearly personalised) are restricted: the right must be used within 14 days beginning the day after the contract. This only applies if the trader gave the full information plus an explicit statement saying so (SCR reg 8).
  - Picking from preset options (colour etc.) is *not* bespoke.

  — [DBT Draft Guidance §6.1–6.2.1, §7.2](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- If the trader fails to give the cooling-off information, the period runs until 14 days after it is given, up to 12 months (SCR reg 5). — [DBT Draft Guidance §6.1](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- **Renewal cooling-off**: 14 days after the first payment following a trial or discount, and after a renewal onto 12+ months. A **cooling-off notice** is required on day 1, on a durable medium, **separate from any other information**. No marketing, and it can't be combined with a reminder (FAQ 26–27). Failure extends the period, up to 12 months (SCR reg 6). — [DBT Draft Guidance §6.3–6.4](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- Refunds for bespoke goods supplied in cooling-off: the consumer stays liable for the price of those goods plus standard delivery (SCR reg 15). Any refund is due without undue delay, **within 14 days**, to the original payment method. — [DBT Draft Guidance §7.2.2](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- Digital-content-only subscriptions can waive initial cooling-off with express consent plus a durable-medium confirmation (SCR reg 7). — [DBT Draft Guidance §6.2.3](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)

**Breach remedies and penalties**
- Four "relevant implied terms" give the consumer a right to cancel, plus a presumed refund from breach to cancellation:
  - give the key information;
  - send reminders;
  - set a reasonable reminder period;
  - provide easy exit.

  — [DBT Draft Guidance §5](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf); [TLT](https://www.tlt.com/insights-and-events/insight/dmcc-act-subscription-contracts-regime-brought-forward-by-the-pm-what-do-businesses-need-to-know)
- CMA direct enforcement can fine **up to £300,000 or 10% of global turnover, whichever is higher**. Courts and Trading Standards can also act. — [DBT Draft Guidance §10.2](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- The CMA has been using its DMCCA powers (in force 6 Apr 2025):
  - first fine: AA/BSM, £7m reduced to £4.2m, dated 5 May 2026 by Wiggin; another summary says the first fine was announced "April 2026", a minor conflict;
  - Oct 2026: £6m across three firms;
  - 18 Nov 2026: new drip-pricing probes (Bannatyne, Secret Escapes, Caledonian Travel).

  — [Wiggin tracker](https://www.wiggin.co.uk/insight/digital-markets-competition-and-consumer-act-tracker/)

### Inferences
- **Prepaid, fixed-term, non-renewing gift (e.g. "12 months of keepsakes, paid upfront, then it stops")**: outside DMCC Part 4 Ch 2, because nothing auto-renews or auto-charges. CCR 2013 and CRA 2015 still apply (section 2). This is the lowest-compliance shape for a gift.
- **Auto-renewing gift paid on the grandparent's card**: the grandparent is the "consumer" party. Pre-contract information, reminders, the exit route and the cooling-off notice all go to the **payer**, not the recipient family. The recipient family is not party to the payment contract. This is my reading of s.254 and s.280; it is not stated in any source.
- The safest gift design: default to non-renewing. If it is renewable, make renewal an explicit opt-in that creates a new, ordinary subscription for the payer.
- Printed keepsakes from a child's own drawing are very likely "bespoke goods". Stating the bespoke restriction in the full information (and in the key summary) narrows cooling-off to 14 days from the day after sign-up. A box already printed and shipped in that window is not refundable.
- A plan that bundles prints with Keepsake Home storage would probably be a "mixed contract" (guidance §7.5). The digital or service part gets a proportionate refund.
- Building to these rules before 1 Jan 2027 is sensible even for an earlier launch. Any subscription sold from 1 Jan 2027 is caught, and the CMA is clearly active on consumer pricing.

### Gaps
- I could not confirm whether both Houses have approved the draft SI, or whether a DMCCA s.254 commencement regulation has been made, as of 26 Nov 2026. The latest sources (Oct–Nov 2026) all say "draft, subject to approval". Check legislation.gov.uk and Hansard before go-live.
- No official source addresses gift subscriptions, "trader can't contact the consumer", or prepaid gifts specifically. The 2024 consultation text I fetched was truncated before those chapters.
- I did not read the full DBT April 2026 consultation response.

## 2. Rules already in force: CCR 2013, CRA 2015, choice architecture, drip pricing, ASA "free"

### Takeaway
Today, CCR 2013 gives 14-day distance cancellation. Personalised goods are exempt (reg 28(1)(b)), so prints of a child's drawing are generally non-cancellable once made. For regular-delivery contracts the period runs from the first delivery. From April 2025 the DMCCA unfair commercial practices regime requires mandatory delivery charges in the headline price (CMA209). ASA rules require the auto-renewal and cost to be clear next to any "free trial" claim.

### Cited Findings
- CCR reg 28(1)(b) excludes from the cancellation right "the supply of goods that are made to the consumer's specifications or are clearly personalised". It is in force and unamended for this purpose as of 26 Nov 2026. — [legislation.gov.uk CCR reg 28](https://www.legislation.gov.uk/uksi/2013/3134/regulation/28)
- CCR reg 30(6): for "regular delivery of goods during a defined period", the 14 days end 14 days after the **first** delivery. Reg 30(4): for multiple goods in one order delivered separately, they end 14 days after the last. — [legislation.gov.uk CCR reg 30](https://www.legislation.gov.uk/uksi/2013/3134/regulation/30)
- CCR reg 31: if cancellation information isn't given, the period extends up to 12 months. — [legislation.gov.uk CCR reg 31](https://www.legislation.gov.uk/uksi/2013/3134/regulation/31)
- Under the CRA, most DMCC pre-contract information becomes a contract term. The trader can't change it unilaterally, and CRA Part 1 remedies apply (DMCCA s.278). — [DBT Draft Guidance §4.2](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- **Drip pricing / price transparency**: the final CMA guidance CMA209 (Dec 2025) replaces the pricing parts of CMA207.
  - A delivery charge is mandatory if the product can't be bought without it. It must be in the invitation to purchase, and in the total price where it can reasonably be calculated.
  - With several delivery options, the **minimum** delivery price goes in the headline price.
  - A base price may be the headline only if the total including delivery is shown just below it.
  - Space limits generally don't excuse omitting the charge.

  — [CMA209 PDF](https://assets.publishing.service.gov.uk/media/691b10065a253e2c40d705d9/Price_transparency_-_CMA209_.pdf); [CMA209 summary, gov.uk](https://www.gov.uk/government/publications/price-transparency-cma209/providing-clear-and-accurate-information-about-prices-summary); [Osborne Clarke](https://www.osborneclarke.com/insights/uk-cma-finalises-guidance-price-transparency-under-dmcca-and-begins-enforcement-action)
- The UCP regime (including the drip-pricing rules) took effect 6 Apr 2025. The CMA opened eight investigations on 18 Nov 2025 into fees, time-limited offers and automatic opt-ins for optional charges. — [Wiggin tracker](https://www.wiggin.co.uk/insight/digital-markets-competition-and-consumer-act-tracker/)
- ASA/CAP:
  - Rule 8.17 requires significant conditions where omitting them would mislead. For trials that means whether payment starts automatically, the size of the commitment, and any other significant costs.
  - These must be prominent and appear before commitment, near the claim. "T&Cs apply" is not enough.
  - Rule 3.26: "free trial" must not describe money-back offers or offers needing a non-refundable purchase.
  - Example ruling: On That Ass (15 Feb 2023), which omitted the ongoing subscription.

  — [ASA: Promotional marketing – subscription traps](https://www.asa.org.uk/advice-online/promotional-marketing-subscription-traps.html); [ASA: Use of "free"](https://asa.org.uk/advice-online/use-of-free.html); [ASA ruling On That Ass](https://www.asa.org.uk/rulings/on-that-ass-international-bv-a22-1171478-on-that-ass-international-bv.html); [ASA news: free trial advertising](https://www.asa.org.uk/news/how-to-ensure-your-free-trial-advertising-sticks-to-the-rules.html)

### Inferences
- For a "monthly keepsake print" plan, the headline should be the all-in monthly price including standard UK delivery (e.g. "£X a month, delivery included"). Showing "£X + P&P" as the headline risks CMA209 non-compliance unless the total sits right below it.
- A trial of the *Keepsake Home* (digital) is easy. A "free first print" needing postage is not a "free trial" under CAP 3.26 if any non-refundable payment is needed. Call it "first print, just pay postage" and show the postage.
- Before 1 Jan 2027, cancellation for a print subscription is mostly governed by CCR: personalised prints are exempt, while non-personalised add-ons (frames, blank cards) carry the 14-day right. After 1 Jan 2027, the DMCC bespoke-goods rule adds a short 14-day window to cancel the *subscription*. Goods already made in that window can be charged for.

### Gaps
- I did not fetch the CMA's online choice architecture paper or any specific dark-patterns guidance. Its relevance is covered indirectly by DBT's exit and retention-offer guidance (§4.5.4). Cite separately if needed.

## 3. ICO Children's Code / UK GDPR angle (short)

### Takeaway
Sell subscriptions only to the adult account holder. Never nudge children, and keep profiling off by default. A parent-initiated "this month's drawings" pick is not profiling a child for marketing, provided Snickerdoodle doesn't build behavioural profiles of the child to target offers.

### Cited Findings
- Standard 13 (nudge techniques): don't use design features that lead or encourage children to give unnecessary data or weaken privacy settings. — [ICO: 13 Nudge techniques](https://ico.org.uk/for-organisations/guide-to-data-protection/ico-codes-of-practice/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques)
- Profiling options must be off by default. Profiling to target content is allowed only with sufficient measures to protect children. The Code covers under-18s. — [ICO Age Appropriate Design Code v2.1 PDF](https://ico.org.uk/media/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services-2-1.pdf); [gov.uk: Child online safety – data protection](https://gov.uk/guidance/child-online-safety-data-protection-and-privacy)
- Apple's Kids Category requires that purchasing opportunities and links out sit **behind a parental gate**. It bans third-party analytics and ads in Kids apps (with limited exceptions). — [Apple App Review Guidelines 1.3, 5.1.4](https://developer.apple.com/app-store/review/guidelines/)

### Inferences
- Subscription marketing goes to parent emails, opted in under PECR soft opt-in or consent. It is never shown in the child-facing Draw app or Studio, and there are no "your child would love…" nudges on a child's surface.
- A reminder or upsell triggered by a parent's own action (they saved 4 drawings and are offered a print) is fine. Automated selection based on analysing the child's behaviour or content to push offers would be profiling. Keep it off, or parent-opt-in with a DPIA note.
- Fits CLAUDE.md non-negotiables 1–5 ("no pushy upsell").

### Gaps
- I did not fetch ICO guidance specific to direct marketing to parents of children. PECR soft opt-in rules are assumed known.

## 4. App Store: Snickerdoodle Draw (Kids category) and subscriptions

### Takeaway
Physical prints bought in the app **must** use non-IAP payment (Stripe) under 3.1.3(e). In the Kids category, any purchase or link must sit behind a parental gate. *Digital* extras unlocked in the app (e.g. premium brushes, more archive storage used in-app) need IAP under 3.1.1. 3.1.3(b) lets a web subscription unlock them only if they are **also** offered as IAP. Reader-app (3.1.3(a)) and free-companion (3.1.3(f)) exemptions don't fit. Outside the US storefront, the app can't link or call to action for web purchase. The UK CMA steering remedy is still only a proposal (consulted 30 Jun 2026; no final decision found as of late Nov 2026). The Small Business Program commission is 15%.

### Cited Findings
- 1.3: Kids apps "must not include links out of the app, purchasing opportunities, or other distractions to kids unless reserved for a designated area behind a parental gate". — [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 3.1.1: unlocking features or content (subscriptions, full versions) requires IAP. — [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 3.1.1(a) / 3.1.3: outside the specific storefronts with the External Purchase Link Entitlement, and "except for the United States storefront", apps may not include buttons, links or calls to action for non-IAP purchasing. In the US, no entitlement is needed for such links. Developers can still email their user base outside the app. — [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 3.1.3(b) Multiplatform: apps may let users access content, subscriptions or features acquired elsewhere "provided those items are also available as in-app purchases within the app". — [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 3.1.3(a) reader apps cover magazines, newspapers, books, audio, music and video only. 3.1.3(f) covers free companions to paid web VoIP, cloud storage, email or web hosting, with "no purchasing inside the app, or calls to action". — [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 3.1.3(e): physical goods or services consumed outside the app "must use purchase methods other than in-app purchase". — [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- 3.1.2: auto-renewing subscriptions must give ongoing value, last at least 7 days, and describe clearly what the user gets before subscribing. — [Apple Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Small Business Program: 15% commission if proceeds are ≤ US$1m in the prior and current calendar year. Subscriptions drop to 10% after their first year (the page wording also mentions EU alternative terms). — [Apple Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- UK: the CMA consulted on 30 Jun 2026 on a steering conduct requirement for Apple. It would let developers link UK users to outside payment, with any link-out fee "fair and reasonable". It was still pending after August 2026, with no decision found. Apple's headline commission is 30%. The Feb 2026 Apple/Google commitments didn't address commission. — [CMA news](https://www.gov.uk/government/news/cma-consults-on-new-requirements-for-apple-and-googles-mobile-platforms); [CMA consultation document (Apple steering)](https://assets.publishing.service.gov.uk/media/6a42a56a3413112faed80e26/Consultation_document__Apple_steering_.pdf); [Mac Observer: no decision yet](https://www.macobserver.com/news/apple-uk-steering-conduct-requirement-cma-no-decision/); [CMA blog, 10 Feb 2026](https://competitionandmarkets.blog.gov.uk/2026/02/10/improving-the-way-apple-and-google-deliver-app-store-services-and-enhancing-ios-interoperability-in-the-uk)
- If a consumer subscribes through an app store, the DMCC duties stay with the contracting trader. — [DBT Draft Guidance FAQ 11](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)

### Inferences
- Simplest, lowest-risk route:
  - Keep the subscription **web-only**.
  - Don't mention it in the Draw app at all (no links, no "subscribe on our website" text in UK builds).
  - Keep the Draw app free with all features free.
  - Tell parents about the subscription only by email or on the web.
- If prints are orderable from the app, Stripe is required (3.1.3(e)) behind a parental gate. A "print subscription" for physical goods is arguably also 3.1.3(e). Bundling digital perks into it would pull those perks into IAP.
- A web-only subscription that silently unlocks *digital* features inside the iOS app is not permitted unless the same unlock exists as IAP (3.1.3(b)). Avoid app-side digital perks, or add an IAP.

### Gaps
- I did not see the guidelines' "last updated" date (the page was truncated). There may be UK-specific entitlement changes after a CMA decision. I found no evidence of a final UK steering decision as of 21–26 Nov 2026.

## 5. Stripe Billing build: fees, portal, emails, dunning, gifts, webhooks, tax — and what Stripe doesn't cover for DMCC

### Takeaway
Stripe Billing pay-as-you-go costs 0.7% of billing volume on top of 1.5% + 20p (UK cards), with no monthly fee. The hosted Customer Portal gives free one-click cancel, pause, payment update and invoice history. Stripe's built-in emails (renewal reminders, 7-day trial reminder, failed payment, expiring card) are **not tailored to DMCC content**: no previous-payment comparison, minimum total, separate cooling-off notice, or 24h end-of-contract notice. Snickerdoodle should send its own DMCC notices (via Resend) off webhooks, and use Stripe for billing mechanics. Gifts are best done as a one-off Checkout payment for a fixed term, with no Stripe subscription at all.

### Cited Findings
**Fees**
- UK pricing:
  - UK standard cards 1.5% + 20p;
  - EEA 2.5% + 20p;
  - international 3.15% + 20p;
  - +2% for currency conversion.

  — [Stripe UK pricing](https://stripe.com/gb/pricing)
- **Stripe Billing**: pay-as-you-go **0.7% of Billing volume** (excludes one-off invoices). A "Pay monthly" plan starts at £450/month on a 1-year contract. — [Stripe UK pricing](https://stripe.com/gb/pricing)
- **Stripe Tax**:
  - Basic no-code: 0.5% per transaction *where you're registered*;
  - API: £0.40 per transaction (10 calculations included);
  - Tax Complete: from £70/month.

  Invoicing Starter is 0.4% per paid invoice. — [Stripe UK pricing](https://stripe.com/gb/pricing)
- The UK VAT registration threshold is £90,000 taxable turnover (deregistration £88,000). — [gov.uk VAT thresholds](https://www.gov.uk/how-vat-works/vat-thresholds)

**Customer Portal**
- Features:
  - update payment method and billing info;
  - update, pause or resume subscriptions;
  - **cancel immediately or at period end**;
  - view and pay invoices;
  - branding, en-GB localisation, a no-code setup option.

  Sessions expire after 5 min if unused, or 1h after last activity. It can't be embedded in an iframe. — [Stripe: Customer portal](https://docs.stripe.com/customer-management)
- "Cancellation deflection" offers a coupon on cancel and collects reasons. — [Stripe: Customer portal](https://docs.stripe.com/customer-management). DBT says offers must not prolong or discourage exit, and feedback must be optional. — [DBT Draft Guidance §4.5.4](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf)
- Portal limits:
  - subscriptions with trial offers, multiple products or `send_invoice` can be cancelled but not updated;
  - subscriptions with a pending subscription schedule can't be updated *or cancelled* in the portal;
  - by default, editing a trialing subscription ends the trial (`trial_update_behavior=continue_trial` fixes this);
  - max 10 products for plan switching.

  — [Stripe: Customer portal](https://docs.stripe.com/customer-management)

**Stripe emails**
- Built-in emails: payment confirmation, failed payment, **trial ending reminder (fixed "7 days before a free trial ends")**, **renewal reminders** (days set in "Upcoming renewal events"; only for `charge_automatically`), expiring card (1 month before), and unpaid-invoice reminders. A "Manage subscription" link can point to the portal or your own page. — [Stripe: Automate customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)
- Stripe says its default receipts and stated terms already meet **Mastercard** recurring-billing rules. This is card-scheme compliance, not DMCC. — [Stripe Support: Mastercard recurring billing guidance](https://support.stripe.com/questions/guidance-for-mastercard-recurring-billing-compliance-updates)
- I found no Stripe document claiming DMCC compliance (search came up empty).

**Webhooks**
- `customer.subscription.created/updated/deleted/paused/resumed`.
- `customer.subscription.trial_will_end`: fired **3 days** before trial end.
- `invoice.upcoming`: a few days before renewal, per the dashboard "Upcoming renewal events" setting; not sent for `send_invoice`.
- `invoice.paid`: provision only if the subscription is `active`.
- `invoice.payment_failed`: the subscription goes `past_due`.
- `invoice.payment_action_required`: 3DS.
- `invoice.created`: an unacknowledged event delays finalisation up to 72h.
- `invoice.finalization_failed`.
- `subscription_schedule.*`, including `expiring` 7 days before.
- Plus `charge.refunded`, `charge.dispute.created` and `radar.early_fraud_warning.created`.
- Stripe retries webhooks up to 3 days in live mode.

  — [Stripe: Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- Dunning: Smart Retries, with configurable end-state after retries (`canceled` / `unpaid` / `past_due`). "Pause payment collection" keeps creating invoices and doesn't fire `paused`. True pause comes via trial-without-payment-method end behaviour or the portal pause feature. — [Stripe: Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks); [Stripe Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries); [Stripe pause payment collection](https://docs.stripe.com/billing/subscriptions/pause-payment); [Stripe portal pause](https://docs.stripe.com/customer-management/pause-subscriptions.md)

**Gifts and fixed terms**
- Stripe has no native gift subscription doc (search found none).
- Coupons don't work on one-off PaymentIntents. One-time Checkout discounts use a separate mechanism.
- `cancel_at` sets a future end time. `cancel_at_period_end` is deprecated in favour of `cancel_at` with `min_period_end` for flexible billing (basil changelog).

  — [Stripe coupons](https://docs.stripe.com/billing/subscriptions/coupons); [Stripe changelog: cancel_at enums](https://docs.stripe.com/changelog/basil/2025-05-28/cancel-at-enums); [Stripe: cancel subscriptions](https://edge-docs.stripe.com/billing/subscriptions/cancel)

### Inferences
- **Cost example**: a £12/month plan on a UK card costs 18p + 20p (card) + 8.4p (Billing) ≈ £0.46, about 3.9%. An annual £120 plan costs £1.80 + 20p + 84p = £2.84, about 2.4%. Annual billing roughly halves the fee share. A prepaid gift as a one-off Checkout payment avoids the 0.7% Billing fee entirely.
- **Stripe Tax**: not needed while under £90k turnover and not VAT-registered (0.5% applies only "where registered").
- **Gift pattern (recommended)**: a one-off Checkout payment for "12 months of keepsakes" stored as a prepaid entitlement in Postgres, with Snickerdoodle's own fulfilment schedule. There is no Stripe subscription, no auto-renew, and no card kept on file. Near the end, the payer gets a warm "it's ending — want to carry on?" email. Carrying on is a fresh, explicit sign-up. This keeps gifts outside DMCC Part 4 Ch 2.
  - Alternative: a subscription with `cancel_at` = term end and 100% off. This adds Billing fees and DMCC ambiguity, so avoid it.
- **DMCC notices are on us**. Stripe's renewal email can't guarantee Annex C content (previous amount, increase, minimum total, next date, deadline, cancel link). Its trial email is fixed at 7 days. Stripe sends no separate renewal cooling-off notice and doesn't clearly guarantee a 24h end-of-contract notice. So:
  - Turn off Stripe's renewal and trial emails, or keep them only as secondary.
  - Drive our own Resend emails from `invoice.upcoming` (set "Upcoming renewal events" to match the stated window, e.g. 7 days), `customer.subscription.trial_will_end` (note: 3 days; use our own scheduler if we promise 7), `invoice.paid` on the first post-trial or annual renewal (the separate cooling-off notice), and `customer.subscription.updated`/`deleted` with `cancel_at` set (the end-of-contract notice within 24h).
  - Store each sent notice (type, timestamp, content hash, recipient) as evidence.
- **Monthly reminders**: Stripe's `invoice.upcoming` fires every period. Our sender must decide which renewals need a DMCC reminder: the last in each 6-month window, every 12-month renewal, plus an earlier additional notice for annual plans (e.g. 30 days and 7 days). Sending every month is allowed and simpler, but may feel naggy. One reminder per 6 months is the legal floor.
- **Easy exit**: an in-account "stop my subscription" button calling the Stripe API directly (or a portal deep link to the cancel flow). There is no compulsory survey and at most one optional, gentle offer. Avoid subscription schedules on consumer plans, because they block portal cancellation.

### Gaps
- Stripe docs didn't say whether the renewal-reminder email is limited to certain billing intervals, or whether Stripe sends a cancellation confirmation email by default (logs list "Canceled subscriptions" but don't say it's sent). Test in a sandbox.
- I did not fetch the proration or subscription-schedule docs in detail. Prorations matter only if plan switching is offered.

## 6. Practical checklist: compliant, warm, non-pushy UK subscription (build to DMCC now; contracts from 1 Jan 2027 are caught)

### Takeaway
Treat the DMCC regime as live for anything sold from 1 Jan 2027. Prefer prepaid, non-renewing gifts. Price all-in including delivery. Show the key information inline. State a reminder window and keep to it. Send our own reminder, cooling-off and end notices. Make cancelling a single button with a 24h confirmation. Log everything.

### Cited Findings
(Requirements as sourced above — [DBT Draft Guidance](https://assets.publishing.service.gov.uk/media/6acf97da2de3184ccf8b814e/subscription-contracts-rules-guidance.pdf); [CMA209](https://assets.publishing.service.gov.uk/media/691b10065a253e2c40d705d9/Price_transparency_-_CMA209_.pdf); [ASA subscription traps](https://www.asa.org.uk/advice-online/promotional-marketing-subscription-traps.html); [CCR reg 28](https://www.legislation.gov.uk/uksi/2013/3134/regulation/28).)

**Sign-up page (inline, no click needed)**
1. Plain statement that it carries on, and you keep paying, until you stop it, plus any minimum period. Best for warmth: none.
2. Price per period, **including standard delivery**. For annual plans, add the monthly equivalent and the minimum total (e.g. "£120 a year — that's £10 a month; the least you'll pay is £120").
3. For a trial or intro price: when it ends, what the next charge is, and its date.
4. How to stop it ("one tap in your account — no phone calls, no forms").
5. When we'll remind you (e.g. "we'll email you 7–10 days before each yearly renewal, plus a heads-up 30 days before").
6. Cooling-off summary, including the **bespoke-goods statement**: "you can cancel within 14 days starting the day after you sign up; prints we've already made of your child's drawings can't be refunded".
7. Delivery restrictions and accepted payment methods.
8. A clearly labelled link to the full information (trader name and address, contact details, complaints, CRA rights reminder, full cooling-off detail).
9. A final button that names the obligation, e.g. "start my subscription — pay £10 a month". No pre-ticked add-ons.
10. "Free" claims: ASA-compliant, with conditions beside the claim. Don't call it a "free trial" if any non-refundable payment is involved.

**Emails (durable medium, clear subject lines)**
- At sign-up (before first supply): the full pre-contract information plus a confirmation of the terms.
- **Reminder notices**:
  - before the first full-price charge after any trial or discount;
  - then the last renewal in each 6-month window (monthly plans);
  - before every renewal for 9- or 12-month plans, with an extra earlier notice for 12+ month renewals;
  - content per Annex C, with prescribed information first and marketing secondary;
  - sent within the window stated at sign-up.
- **Renewal cooling-off notice**: on day 1 after the first post-trial payment and each annual renewal. It is a separate email with nothing else in it.
- **End-of-contract notice**: within 24h of online cancellation, stating the end date.
- Refunds within 14 days to the original method.
- Gift (prepaid, non-renewing): a purchase receipt to the payer, a "your gift has started" note to the recipient parent (parent-controlled), and an optional "ending soon" note. No auto-charge.

**Cancel**
- An online "stop my subscription" button where people look (account → subscriptions, plus footer help). It works in one go. Feedback is optional, and any single offer must not slow exit. Email or chat requests are also honoured as "clear statements". A bare email address is not enough as the online route.

**Billing rules**
- Never charge a renewal before its period starts.
- Smart Retries are fine, but tell the customer promptly.
- Don't use subscription schedules that block self-cancel.

**Record-keeping (burden-of-proof defence)**
- Keep a snapshot of the key and full information and price shown at sign-up, with its version.
- Record the acknowledgement click (timestamp, IP-light).
- Log each notice: type, sent-at, recipient, content hash or copy, provider message ID.
- Log the cancel event and its channel, plus refund records.
- Retain per the retention schedule. These are parent account records, not child data.

**Children's Code / brand**
- Sell only to adult account holders. Show no subscription prompts on child-facing surfaces, including the Draw app, where any purchase sits behind a parental gate.
- No profiling of children for offers.
- Warm, plain copy with no countdown timers or "only X left" pressure. That fits CMA scrutiny of time-limited offers ([Wiggin](https://www.wiggin.co.uk/insight/digital-markets-competition-and-consumer-act-tracker/)) and CLAUDE.md "no pushy upsell".

### Inferences
- The cheapest compliant shape for a solo operator:
  - (a) a **prepaid gift box** (one-off Checkout, fixed term, no renewal), outside DMCC;
  - (b) an **annual auto-renewing plan** (fewer reminders and lower fee share), plus maybe a monthly plan;
  - (c) **no free trial** at launch, which removes the trial reminder, the post-trial cooling-off notice and ASA "free" risk.
- Have a solicitor sanity-check the bespoke-goods statement and the final wording once the SI is made, and re-check the final DBT guidance, before 1 Jan 2027.

### Gaps
- Final (post-approval) guidance may change details. I did not verify a CMA-published subscription guide, as opposed to the DBT draft.
- No authoritative source on whether a recipient-family "account" that a grandparent's gift creates triggers any DMCC duty to the recipient. My inference is no.
