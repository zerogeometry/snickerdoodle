# Bristol outreach call sheet, from Fri 27 Nov 2026

Desk research done on Thu 26 Nov 2026. **I haven't contacted, booked or signed up for anything.** Every phone number and email
below is a business's own published contact. A person is named only where the business itself publishes them as the
contact (a franchise owner, or a practice manager on the practice's own site). Drive times from Shirehampton (BS11 9)
are my rough estimates.

This builds on the earlier reports in the main checkout's `reports/` folder: *Bristol Christmas markets near BS11*
(6 Nov) and *Christmas fairs and who to contact 2026* (18 Nov). It doesn't repeat their school-fair lists. Where a
fair from those reports has changed, the change is noted here.

**Labels:** **[confirmed]** = the place's own website, seen 26 Nov · **[third-party]** = a directory, press article or
listing · **[estimate]** = my judgement.

---

## How I picked and ranked these

Your three examples (Cribbs, GP surgeries, Gymboree) show the pattern. A good spot passes three tests:

1. **Families with under-10s are already there**, in the mood for Christmas or a party.
2. **One person can say yes on the phone**: an owner, a franchisee, a store or practice manager. Not a head office.
3. **It can happen before your Christmas cut-off.** The last order day is **Sat 12 Dec** for most things and **Thu 10 Dec
   for cards** (the site's own Christmas dates, `src/lib/season.ts`). So a family you meet by about **Sat 5 Dec** has a week
   to send a drawing in.

That is why **owner-run class franchises, independent soft plays, art cafés and garden centres sit at the top**, and the
big shopping centres sit lower. Cribbs is worth an email, but the Mall's promo space goes through an agency, costs money
and needs paperwork, so it's a weekday-next-week job, not a tomorrow job.

**What's moved since the 18 Nov report:**
- **Weston Museum's market is closed.** The form now says it "is no longer accepting responses" [confirmed].
- **Penny Brohn's festive market** no longer shows on its events page, so treat it as unconfirmed.
- **The Shirehampton Christmas High Street Market (Thu 3 Dec)** is confirmed in the November *Shire* paper.

---

## What you can offer (the deal menu)

Pick **one** of these per place. Don't offer all five. Each place's best fit is suggested below.

| | Deal | What it costs you | Fits |
|---|---|---|---|
| **A** | **Their own partner code.** A family typing it gets a free greetings card with their first order. The place earns **10% of every first order** made with it, paid monthly with a short statement | Nothing unless someone orders. The site's margin guard stops any code pushing an order below 10% contribution | Any business |
| **B** | **A free "draw a bauble" table** at their class, party, open day or workshop. You bring the easel, paper and paint, and the parent stays with their child | About £10 of materials and 2–3 hours | Classes, soft play, art cafés, garden centres |
| **C** | **Leaflets in party bags or on the counter**, A6 with a bauble outline to colour on the back | About 5p a leaflet | Party hosts, shops, cafés |
| **D** | **A keepsake for their raffle or their own staff**, such as a bauble or mug made from a drawing | About £10–£20 at cost (order it through admin's sample-at-cost route) | Churches, toddler groups, PTAs |
| **E** | **"Your free card" as the party gift**: a leaflet plus the place's code, so every child goes home with a free card waiting | Nothing up front. Each card costs you only when it's used | Christmas parties (Gymbo, Wild Things) |

**Making the codes (Your turn).** Make each place's code on the admin codes screen (`/admin/codes`): free card, partner
type **CAMPAIGN**, commission **10**, the place's name as the partner, ending **24 Dec**. Or use the script:

```bash
node --env-file=.env scripts/promo-codes.mjs create GYMBO --free-card --commission 10 --partner "Gymbo Bristol" --type CAMPAIGN --ends 2026-12-24
```

- A **CAMPAIGN** code earns on the family's **first** paid order only. Only PTA codes earn on every order
  (`src/pricing/promo.ts`, `codeTerms`).
- Noticeboards (GPs, libraries, family hubs, supermarkets) get a code with **no commission**. NHS and council places can't
  take a cut, and it would look wrong if they did. The code is still worth making, because it's how you'll see which
  board works.
- **Watch the results** on `/admin/codes`, or with `node --env-file=.env scripts/promo-codes.mjs partners`.

**Something to know about the leaflets.** The C12 leaflet README suggests a QR link like `…/start-creating?code=DRAWIT`.
**The site doesn't read a code from the link.** I checked: nothing in `src/` picks up `?code=`, and the site has no
`utm_` tracking either. The QR code gets families to the site, but only the code they type at checkout tells you which
place sent them. So:
- use **one QR code for everything**, pointing to `https://snickerdoodle.co.uk/start-creating`;
- print the **place's code big and clear** next to it ("your code: **GYMBO**, a free card with your first order"). A
  round sticker on a stack of generic leaflets works fine.

If you'd like the link to fill in the code automatically, that's a small site change. It's not part of this report.

**Snickerdoodle Draw:** the app isn't in the stores yet (iOS is in review, and the store links in `src/lib/drawApp.ts` are
still empty). Say "our free drawing app is coming soon, look at snickerdoodle.co.uk/draw". Don't promise a date.

---

## Tomorrow, Fri 27 Nov: the calls in order

**Before 9am (Your turn):**
- Buy **£5m public liability insurance** (see the kit list below; about £70–£100 a year).
- Make the first codes: GYMBO, WILDTHINGS, GOLDFINCH, ALMONDSBURY, and SHIRE for the Shirehampton noticeboards.
- Print 4 laminated A4 posters at home.

**Why these times [estimate]:** ring class teachers before their first class or at lunch. Ring practice managers
mid-morning or mid-afternoon (10:30–12 or 2–3:30), when the 8am phone rush is over. Ring shops and garden centres on a
weekday morning, never a Saturday.

| ☐ | Time | Who | How | What to ask | If they say no |
|---|---|---|---|---|---|
| ☐ | **9:10** | **Gymbo (Gymboree) Bristol**, Polly (owner) | **07453 901951** · bristol@gymbo.co.uk | Leaflets plus "your free card" in every Christmas-party gift bag, and a GYMBO code earning 10% | A stack on the counter and a mention in her members' message |
| ☐ | **9:30** | **Almondsbury Garden Centre**, centre manager | **01454 457300** · enquiries@almondsbury.co.uk | A draw-a-bauble table by the grotto exit on a weekend morning, plus an ALMONDSBURY code at 10% | A counter leaflet stand by the grotto queue |
| ☐ | **9:45** | **Wild Things Play Project, Cribbs**, site manager | **0117 959 2514** · cribbs@wildthingsplay.co.uk | A free table on **Mon 30 Nov or Wed 2 Dec at 10am**, next to Baby Ballet, plus leaflets in party bags | Counter leaflets and a WILDTHINGS code |
| ☐ | **10:00** | **Goldfinch Create and Play**, Westbury-on-Trym | **Email only:** info@goldfinchcreateandplay.co.uk. Walk into Pinkmans Café this afternoon | A table beside the **Sat 5 Dec, 10am** family decorations workshop, plus a GOLDFINCH code | Leaflets on the café counter |
| ☐ | **10:15** | **Shirehampton Markets / SCAF** | **0117 982 9963** · shirehamptonmarkets@outlook.com | A table at the **Thu 3 Dec** Christmas High Street Market (9am–2pm) | The cancellation list, and a free listing for a draw-a-bauble table on shirehamptonaction.org.uk/events |
| ☐ | **10:30** | **Ambition Lawrence Weston** | **0117 923 5112** · contact@ambitionlw.org | A table at the **Sat 5 Dec** Christmas community market | Leaflets at Ambition House reception |
| ☐ | **10:45** | **St Mary's Shirehampton** (walk in: Welcoming Space runs Fri 10–2) | Parish office 0117 907 7026 · office@stmarysshire.org | A corner at **tomorrow's (Sat 28 Nov, 10–2) Christmas Fair**, or a raffle bauble (deal D) | Leaflets on the welcome table |
| ☐ | **11:00** | **Shirehampton Group Practice** (walk in) | 0117 916 2226 · bnssg.sgp@nhs.net | One laminated A4 poster on the family board, addressed "FAO the Practice Manager" | Leave the poster and a note, then send an eConsult admin request |
| ☐ | **11:30** | **Hobbycraft Bristol**, store manager | **03300 261024** · bristol@hobbycraft.co.uk | A free kids' bauble-drawing demo on **Sat 5 Dec**. Buy the paint kit while you're there | Leaflets for the workshop noticeboard |
| ☐ | **12:30** | **babyballet Bristol**, Miss Leanne / **babyballet Bradley Stoke, Thornbury & Portishead**, Miss Emma | Text first: **07715 340610** / **07395 805885** | End-of-term leaflets plus a code each | A raffle bauble for their Christmas class |
| ☐ | **13:00** | **Sing and Sign Bristol**, Katherine Amor / **Little Kickers Bristol & Bath** | **0759 4460 448** / **07506 346186** | Leaflets before the break plus a code (Little Kickers: hand them out at Saturday pick-up) | A January thank-you-card offer instead |
| ☐ | **13:30** | **Toddler groups:** Lighthouse (St Andrew's Avonmouth), Seedlings (St Edyth's Sea Mills), Boing! play café (Lawrence Weston) | 0117 325 8720 · 0117 968 6965 · boing@communitychurch-lw.co.uk | A free table at **Mon 30 Nov**, **Wed 2 Dec** or Boing's Christmas session | Leaflets on the welcome table |
| ☐ | **14:00** | **The Mall at Cribbs**, CBRE commercialisation | **Email:** ukcommercialisation@cbre.com. Reception 0117 915 5555 | Price and dates for a small promo pitch on a weekday the week of 7 Dec | Ask about January. **The Galleries** (carina@shoppertainmentmanagement.co.uk) is a cheaper fallback |
| ☐ | **14:30** | **Pioneer Medical Group**, Rachelle Lambert (Practice Manager) / **Heywood Family Practice, Pill**, Vicky Gigg (Practice Manager) | bnssg.pmg@nhs.net / 01275 372105 | One poster each. One Pioneer yes covers Avonmouth, Ridingleaze and Bradgate | — |
| ☐ | **15:00–17:00** | **Walk-round in Shirehampton** | Library (open 1–5), Co-op High St, the pharmacies, Shirehampton Dental | Posters or counter leaflets | — |

**This evening (Your turn):** order leaflets (see the kit list), send the follow-up emails, and fill in the risk assessment.

---

## The full call sheet, by kind of place

Each entry gives the place, who to ask for and how to reach them, then the deal, cost and timing, best family times,
rules, my guess at the chance of a yes, a word-for-word phone opener, and a three-line pitch.

### 1. Businesses like Gymboree: small, owner-run, all families

These are the best bets: one person decides, they want new things for their families, and their families are your
buyers.

#### 1.1 ★ Gymbo (formerly Gymboree Play & Music) Bristol
- **Where:** The Annexe, 38 Eastfield, Westbury on Trym, BS9 4BE, behind the RAFA Club, with a car park [confirmed]
  ([gymbo.co.uk/locations/bristol](https://www.gymbo.co.uk/locations/bristol)). **10–12 min.**
- **Ask for:** Polly, the owner, teacher and party host ("franchisee since 2024") [confirmed].
- **Contact:**
  - **07453 901951** · **bristol@gymbo.co.uk** · [party enquiry form](https://gymbo.co.uk/enquire-now/?enquiry-type=party&location=bristol) [confirmed]
  - The brand changed from Gymboree to Gymbo. The old bristol@gymboreeclasses.co.uk and 0117 number are out of date.
- **What's on:**
  - Weekday classes from 9:30am, weekend open gym £5.50, membership £49 a month [confirmed].
  - In 2025 its Christmas parties were **Sat 6 and Sat 20 Dec**, with "a Christmas gift for everyone" [confirmed]
    ([2025 post](https://gymbo.co.uk/news/bristol/christmasparties2025/)).
  - Gymbo's national post (17 Nov 2026) says each centre sets its own dates, and Bristol's aren't up yet. Expect
    about 5/6 and 19/20 Dec [estimate].
- **Best deal:** **E + A + C.** Leaflets and "your free card" go in the gift bags at the early-December party, with a
  GYMBO code. A table (B) only if Polly likes the idea.
- **Cost and lead time:** about 60 leaflets and stickers. Agree it by about Tue 1 Dec for a 5/6 Dec party. **The
  mid-December party is too late for Christmas orders**, so pitch it there as a January thank-you card instead.
- **Rules:** she may need to check co-branding with Gymbo's head office [estimate]. Have your insurance certificate ready.
- **Chance:** **high–medium.** She's an owner-operator who runs a new offer every month. Head-office approval is the
  only risk.
- **Opener:** "Hi Polly, it's Simon from Snickerdoodle. I'm just down the road in Shirehampton. We turn children's
  drawings into baubles and cards. I've got an idea for your Christmas parties that costs you nothing. Have you got
  two minutes?"
- **Pitch:**
  1. "Every child at your Christmas party goes home with a bauble to colour in and a free card waiting for them."
  2. "Your own GYMBO code earns you 10% of every first order, paid monthly. There's nothing for your team to do."
  3. "We never touch or photograph the drawings. Parents do it all on their own phones, so it's private."

#### 1.2 ★ Wild Things Play Project, The Mall at Cribbs
- **Where:** The Mall, level 2, Unit 209, BS34 5DG [confirmed] ([wildthingsplay.co.uk/bristol](https://wildthingsplay.co.uk/bristol)).
  **12–15 min.**
- **Ask for:** the site manager (not named). The company, WPP Trading Co Ltd, has sites in Bristol and Plymouth.
- **Contact:** **0117 959 2514** · **cribbs@wildthingsplay.co.uk** [confirmed].
- **What's on:**
  - Open Mon–Sat 9:30–6, Sun 10:30–5.
  - Baby Ballet Mon and Wed at 10am, Sing & Sign Tue at 10am, Dino School Wed–Fri [confirmed]
    ([what's on](https://wildthingsplay.co.uk/bristol/whats-on)).
  - Parties: Wild Craft £21.95 a head, Fluffy Stuffies £25.95, Stay & Play £17.95, party bags £2.95 extra [confirmed]
    ([parties](https://wildthingsplay.co.uk/bristol/parties)).
- **Best deal:** **B + C + A.** A free draw-a-bauble table on a weekday morning, leaflets in every party bag, and a
  WILDTHINGS code.
- **Cost and lead time:** free. It could happen **Mon 30 Nov or Wed 2 Dec**.
- **Busy times:** class mornings, and weekend parties.
- **Rules:** the table goes **inside their unit**, not in the Mall's walkway, which would need the Mall's permission.
  Expect them to ask for insurance. Bring dry paint sticks if they don't want wet paint [estimate].
- **Chance:** **medium.** It's a small chain, so the manager may need a quick OK from above.
- **Opener:** "Hi, it's Simon from Snickerdoodle, a little Bristol business that turns children's drawings into
  Christmas baubles. I'd love to run a free drawing table for your families one morning next week. Who's the best
  person to ask?"
- **Pitch:**
  1. "A free 'draw a bauble' table inside Wild Things one weekday morning: a craft activity your families get for nothing."
  2. "A leaflet in every party bag, and your WILDTHINGS code earns you 10% of each first order."
  3. "No photos and no collecting drawings. Parents snap them at home on their own phones."

#### 1.3 ★ Goldfinch Create and Play (art studio and café), Westbury-on-Trym
- **Where:** 10 Canford Lane, BS9 3DH [confirmed] ([goldfinchcreateandplay.co.uk](https://www.goldfinchcreateandplay.co.uk/)).
  **About 10 min.**
- **Contact:** **info@goldfinchcreateandplay.co.uk**, bookings booking@goldfinchcreateandplay.co.uk. **No phone
  published** [confirmed] ([contact](https://www.goldfinchcreateandplay.co.uk/contact-us/)). Pinkmans Café on site
  opens Mon–Sat 8–5, Sun 8:30–5, so you can walk in and ask for the manager.
- **What's on:**
  - Festive family workshops on **Sat 28 Nov** (wreaths, 10am and 4pm), **Sat 5 Dec at 10am** (family decorations)
    and **Sat 12 Dec at 10am** (print and collage cards) [confirmed].
  - Art parties from £190 [confirmed].
- **Best deal:** **B + C + A.** A table beside the 5 Dec decorations workshop, leaflets on the café counter, and a
  GOLDFINCH code. **Don't pitch printed cards here.** Their 12 Dec workshop makes cards, so lead with baubles and
  keepsakes.
- **Chance:** **high–medium.** It's exactly your audience and an independent.
- **Opener (in person):** "Hi, I'm Simon from Snickerdoodle in Shirehampton. We turn children's drawings into baubles
  and keepsakes, and Goldfinch feels like the right home for it. Is the owner or manager about?"
- **Pitch:**
  1. "Your families already make things here. We turn what they make into a bauble or a keepsake they keep."
  2. "A free table next to your 5 Dec workshop, and a GOLDFINCH code that pays you 10% of each first order."
  3. "It doesn't compete with your workshops. It's for the drawings that live on the fridge."

#### 1.4 ★ babyballet Bristol (Miss Leanne)
- **Contact:** **07715 340610** · **bristol@babyballet.co.uk** · [babyballet.co.uk/bristol](https://www.babyballet.co.uk/bristol)
  [confirmed].
- **Where:** classes at Westbury Village Hall (Eastfield Rd, BS9 4AG; Thursdays, Tinies 10:00 and Movers 10:45),
  Southmead, Filton, Little Stoke, Abbots Leigh, Failand and Long Ashton [confirmed / third-party].
  **10–12 min to Westbury.**
- **Best deal:** **C + A**, plus **D** (a raffle bauble) if she runs a Christmas class.
- **Chance:** **medium–high.** A sole franchisee can say yes on the spot. Text first, because she teaches in the mornings.
- **Opener (text, then call):** "Hi Miss Leanne, I'm Simon from Snickerdoodle in Shirehampton. We turn children's
  drawings into Christmas baubles and cards. Could I drop you some colour-in bauble leaflets for your families,
  with your own code that gets them a free card and earns you 10%?"
- **Pitch:**
  1. "Little colour-in bauble leaflets for your end-of-term class."
  2. "Your own code: families get a free card, and you get 10% of each first order."
  3. "I'll drop them at Westbury on Thursday. There's nothing else for you to do."

#### 1.5 ★ babyballet Bradley Stoke, Thornbury & Portishead (Miss Emma)
- **Contact:** **07395 805885** · **bradleystokethornburyportishead@babyballet.co.uk** ·
  [her franchise page](https://www.babyballet.co.uk/bradley-stoke-thornbury-portishead) [confirmed].
- **Where:** Portishead Youth Centre, EPiC Gym Portishead, EPiC Bradley Stoke, Wild Things at Cribbs (Mon and Wed
  at 10am), Alveston and Olveston [confirmed]. **12–15 min.**
- **Best deal:** **C + A.** Pair it with the Wild Things table on the same morning (1.2).
- **Chance:** **medium–high.** Use the same opener and pitch as 1.4.

#### 1.6 Sing and Sign Bristol (Katherine Amor)
- **Contact:** **0759 4460 448** · **katherineamor@singandsign.co.uk** ·
  [classes page](https://www.singandsign.co.uk/classes/classes-near-you/bristol) [confirmed].
- **Where:** Henleaze (St Peter's Church, BS9 4LD; Wed and Fri), Horfield (Mon and Thu), Bedminster, and Wild Things
  (Tue) [confirmed / third-party]. **About 15 min.**
- **Note:** the next term starts 8 Jan 2027, so only a week or two of classes are left this term.
- **Best deal:** **C + A**, pitched for babies: "baby's first scribble or handprint, made into a bauble."
- **Chance:** **medium.**
- **Opener:** "Hi Katherine, I'm Simon from Snickerdoodle in Shirehampton. We turn babies' first scribbles and
  handprints into keepsake baubles. Could I send some leaflets for your families before the Christmas break, with a
  code that gets them a free card and earns you 10%?"
- **Pitch:**
  1. "Your families' first-Christmas keepsake: their baby's scribble or handprint, made into a bauble."
  2. "Your own code gets them a free card and earns you 10% of each first order."
  3. "It's private by default. The parent does everything at home."

#### 1.7 Little Kickers Bristol & Bath
- **Contact:** **07506 346186**; email is through a form only [confirmed]
  ([venues](https://www.littlekickers.co.uk/en-gb/locations/bristol-bath/venues)).
- **Where:** Saturdays at Westbury-on-Trym Academy (Channells Hill, BS9 3HZ; 8:30am–12:35pm, five sessions) and
  Henleaze Junior School; Stoke Bishop Village Hall in term time [confirmed]. **8–12 min.**
- **Best deal:** **C + A.** Hand leaflets out at Saturday pick-up ("draw your little footballer").
- **Chance:** **medium.**
- **Opener:** "Hi, I'm Simon from Snickerdoodle in Shirehampton. We turn children's drawings into Christmas baubles.
  Could I give your Saturday parents a leaflet at pick-up, with your own code that earns you 10% of each first order?"

#### 1.8 Little Beats Music (Sarah), Westbury Park
- **Where:** Westbury Park Methodist Church, BS6 7QB, Thursdays 9:15–10:30, ages 0–5, from £8. Next session **3 Dec**
  [third-party] ([Happity](https://www.happity.co.uk/little-beats-music)).
- **Contact:** only Happity's "send enquiry" form. You could also turn up 10 minutes before the session ends on 3 Dec
  and ask.
- **Best deal:** **C + A.** **Chance: medium.**

#### 1.9 Pottery and art cafés
These businesses already sell "made by your child" keepsakes. Pitch Snickerdoodle as an add-on for the drawings at home
that never get to the café.
- **Flying Saucers** (painting pottery café): 9 Byron Place, Clifton, BS8 1JT, **0117 927 3666** [third-party,
  unclaimed listing]
  ([Day Out With The Kids](https://www.dayoutwiththekids.co.uk/attractions/flying-saucers-the-painting-pottery-cafe-c0a7b709)).
  **About 15 min.** Deal **C + A**. **Chance: medium–low**, because it already makes keepsakes itself.
- **Wot Pots** (pottery studio): at Westbury Wildlife Park, Trym Road, BS9 3ET. An unclaimed listing gives
  **07527 957237** [third-party] ([NHS directory](https://www.nhs.uk/services/service-directory/wot-pots-pottery-studio/N10892152)).
  Its hours may be Fri–Sun only, 10–5 [third-party]. **About 12 min.** It ran the park's craft fair in 2025
  (Info@wotpots.co.uk, from the 6 Nov report).
  - Deal **B + C.** Ask whether there's a December fair or a weekend you could bring a table.
  - **Chance: medium.**
- **Opener for both:** "Hi, I'm Simon from Snickerdoodle in Shirehampton. We turn the drawings families have at home
  into baubles and mugs, so we're a nice add-on to what you do, not a rival. Could I leave a small stack of leaflets
  on your counter, with a code that earns you 10%?"

#### 1.10 Independent gift and toy shops that families use
- **Kondi Gifts:** 103 Henleaze Road, BS9 4JP, **0117 962 5464** [third-party, 2018 listing; Bristol24/7 profile,
  Jan 2026] ([Bristol24/7](https://www.bristol247.com/lifestyle/shops/shop-of-the-week-kondi-gifts-henleaze/)).
  It sells cards, local artists' work and children's toys. **About 15 min.**
  - Ask for the owner. Deal **C + A**: counter leaflets.
  - Or ask whether she'd show one sample bauble with a "made from your child's drawing" card.
  - **Chance: medium.**
- **We Make Bristol:** 16 Canford Lane, Westbury-on-Trym, BS9 3DH. A shop of Bristol makers' gifts (about 65 makers)
  [third-party] ([Bristol24/7](https://www.bristol247.com/lifestyle/shops/shop-of-the-week-we-make-bristol-westbury-on-trym/)).
  It's next door to Goldfinch, so go to both on one trip.
  - Ask the owner about counter leaflets now, and a sample on the shelf next year.
  - **Chance: medium–low** for Christmas.
- **Flutterbies** (wooden-toy shop): 2 The Old Bakery, 42a High Street, Portishead [third-party, undated]
  ([North Somerset Times](https://www.northsomersettimes.co.uk/news/business/20439055.new-shop-portishead/)).
  **No phone found**, so walk in. **About 15 min.**
  - Deal **C + A.** **Chance: medium.**
- **Opener:** "Hi, I'm Simon, I run Snickerdoodle from Shirehampton. We turn children's drawings into keepsakes. Your
  customers are exactly the grandparents and parents who'd love one. Could I leave a few leaflets by the till, with a
  code that pays you 10% of anything ordered with it?"

#### 1.11 Nurseries in BS11
- **Mama Bear's Day Nursery:** 112–116 Grove Leaze, Shirehampton, BS11 9QU, **0117 982 3345** [third-party, council
  childcare directory]
  ([daynurseries.co.uk](https://www.daynurseries.co.uk/day_nursery_search_results.cfm/searchtown/Shirehampton)).
  **3 min.**
- **Snapdragons Nursery Shirehampton:** The Wylands, Lower High Street, BS11 0DA, 120 places [third-party]
  ([Bristol free childcare listing](https://bristol.gov.uk/residents/schools-learning-and-early-years/early-years-and-childcare/help-with-childcare-costs/free-childcare-for-under-5s/find-extended-hours-free-childcare/30-hours-free-childcare-provider?id=239)).
  The listing's phone number looks wrong, so ring via the Snapdragons website or walk in.
- **Avonmouth Children's Centre / Avonmouth CE nursery class:** Catherine St, BS11 9LG, 0117 903 0271 [third-party].
- **Best deal:** **C + A**, or a free bauble table at their Christmas party (B). Nativities are usually the first two
  weeks of December, so ask this week [estimate].
- **Rules:** the nursery manager decides. A table during the nursery day would need their safeguarding OK, so offer a
  pick-up-time table or leaflets in the children's bags. **Address leaflets to grown-ups only** (advertising code
  CAP 5: never urge children to ask for things).
- **Chance: medium.**
- **Opener:** "Hi, I'm Simon from Snickerdoodle, a Shirehampton business. We turn children's drawings into baubles and
  cards. Could I give your families a leaflet with a nursery code? It gets them a free card, and the nursery earns 10%
  towards anything you're saving for."

### 2. Big family footfall (Cribbs and the like)

#### 2.1 ★ Almondsbury Garden Centre (the best grotto bet)
- **Where:** Over Lane, Almondsbury, BS32 4BP [confirmed] ([almondsbury.co.uk](https://www.almondsbury.co.uk/)).
  **About 15 min.**
- **Contact:** **01454 457300** · **enquiries@almondsbury.co.uk** [confirmed]. Ask for the centre manager or whoever
  runs the grotto.
- **What's on:**
  - A five-room 2026 grotto, an **SEN grotto day on 11 Dec**, Baby's 1st Santa and Santa Paws, all booked online
    [confirmed] ([grotto page](https://www.almondsbury.co.uk/pages/almondsbury-christmas-grotto)).
  - Open Mon–Sat 9–5:30, Sun 10–4:30. In 2025 the grotto ran 29 Nov – 24 Dec [third-party].
- **Best deal:** **B + A**, a draw-a-bauble table near the grotto exit on a weekend morning. Fallback **C**: a
  counter stand.
- **Rules:** expect them to ask for insurance and a risk assessment [estimate].
- **Chance:** **medium.** It's independent, close and family-focused. It may see you as rival gift retail.
- **Opener:** "Hi, it's Simon from Snickerdoodle in Shirehampton. We turn children's drawings into Christmas baubles. I
  wondered if I could put something lovely by your grotto for families waiting to see Santa. Who looks after the
  grotto?"
- **Pitch:**
  1. "Children in the grotto queue colour in a bauble, and their parent turns it into a real one at home."
  2. "Your own code earns the centre 10% of every first order. There's no staff time and no stock."
  3. "I'm insured, I bring everything, and I take it all away the moment you'd like."

#### 2.2 Hobbycraft Bristol (Cribbs)
- **Where:** Centaurus Road, Cribbs Causeway, BS34 5TS. Open Mon–Fri 9–8, Sat 9–6, Sun 10:30–4:30 [confirmed]
  ([store page](https://hobbycraft.co.uk/stores/bristol-cribbs-causeway)). **About 13 min.**
- **Contact:** **03300 261024** · **bristol@hobbycraft.co.uk** [confirmed]. Ask for the store manager.
- **Best deal:** **B.** A free kids' bauble-drawing demo on a Saturday, using Hobbycraft's own paints (that's their
  angle), with leaflets. **No commission:** a national chain won't take one, so use a HOBBYCRAFT campaign code just for
  counting.
- **Chance:** **medium–low.** Head office runs most events, but managers sometimes say yes to free kids' activities.
  You need to go there anyway to buy paint, so ask in person.
- **Opener:** "Hi, I'm Simon, a local Bristol maker. I'd love to run a free 'draw a bauble' table for children on a
  Saturday, using paints from your shelves. Could I speak to the store manager?"

#### 2.3 The Mall at Cribbs Causeway
- **Who:** promotional pitches are booked through **CBRE's commercialisation team: ukcommercialisation@cbre.com**
  [confirmed] ([contact page](https://mallcribbs.com/contact-us/)).
  - Centre management: 0117 915 5555. Information desk: 0117 903 0303.
  - Digital screens are sold by Bauer Media Outdoor (salesenquiries-uk@bauermediaoutdoor.com).
  - Shop lettings are through Cushman & Wakefield.
  - **The earlier note that "Cribbs does short shop leases" isn't verified.** No pop-up offer is published.
- **Cost:** no rate card is published.
  - Comparable centres: Fox Valley £60–£70 + VAT a day for a 3 × 3m pitch; Leeds council £150 a day [third-party].
  - Cribbs in December: about **£150–£400 a day + VAT**, with weekends dearest [estimate].
- **Rules [estimate]:** £5m public liability, a risk assessment and method statement, PAT certificates for anything
  plugged in, usually leaflets and sampling only (no selling), and probably **no wet paint** on the Mall floor, so
  bring paint sticks.
- **Christmas:** runs from 26 Nov to 3 Jan: an interactive tree in the Lower Mall, Santa's Christmas Storytime and the
  Frostbite's Frozen Fortress kids' challenge, all free [confirmed] ([Christmas page](https://mallcribbs.com/christmas)).
- **Free space:** only for its charities (The Grand Appeal, St Peter's Hospice and the Charity of the Year)
  [confirmed] ([community page](https://mallcribbs.com/community/)).
- **Best deal:** a paid weekday pitch in the week of 7 Dec, if CBRE has a gap. Don't book a weekend you can't afford.
- **Chance:** **low–medium** this side of Christmas. Worth a short email tomorrow.
- **Email subject:** "Small promo pitch at Cribbs, a weekday w/c 7 Dec?"
- **Email body:** "Hello, I run Snickerdoodle, a small Bristol business that turns children's drawings into keepsakes.
  I'd like a small promotional pitch (a table and an easel, about 2m × 2m, no selling, a free kids' drawing activity
  with leaflets) on a weekday between 7 and 11 December. I hold £5m public liability insurance and will send a risk
  assessment. Could you tell me what's available and the cost? Thank you."

#### 2.4 The Galleries, Broadmead (the cheaper Cribbs)
- **Where:** 25 Union Gallery, BS1 3XD. Reception 0117 929 0569. **20–25 min.**
- **Who:** promotions and kiosk hire are handled by an agency, **carina@shoppertainmentmanagement.co.uk** [confirmed]
  ([commercialisation](https://www.galleriesbristol.co.uk/commercialisation)). No rates are published.
- **Chance:** **medium.** A quieter centre is more likely to fill a December gap cheaply, but it has fewer families
  than Cribbs. Send the same email as 2.3.

#### 2.5 Worth one email, low odds this Christmas
- **Cabot Circus:** brandpartnerships@hammerson.com (promotions) and specialityleasing@hammerson.com (kiosks)
  [confirmed] ([contact](https://www.cabotcircus.co.uk/contact-us)). It's a premium centre with a weekend grotto.
  **Low.**
- **Aerospace Bristol** (Patchway, info@aerospacebristol.org): no Christmas events in its 2026 calendar, though it ran
  Christmas workshops in earlier years [confirmed]. It's a charity museum that might co-host a kids' drawing table in
  January. **Low–medium.**
- **Asda Patchway, the Cribbs Asda** (Community_Patchway@asda.uk, 0117 317 2400) and **Morrisons Cribbs**: their
  Community Champions help charities, not businesses [confirmed]. Ask only if you pair a free table with a charity
  collection. **Low.**

#### Skip for this Christmas
None of these takes outside stalls, or they decide centrally:
- **John Lewis Cribbs:** workshops are central and adult-only [confirmed].
- **M&S Cribbs** and **Smyths.**
- **LEGO** and **Build-A-Bear:** they sell rival kids' products.
- **The Range:** there's no Cribbs store.
- **We The Curious:** no makers' events.
- **Bristol Museum:** it has a grotto on 5–20 Dec, but no stalls [confirmed].
- **Bristol Zoo Project:** Wild Lights, no stalls.
- **Tyntesfield:** no makers.
- **Dobbies Thornbury** and **Cadbury Garden Centre:** both chains.

### 3. Fairs and markets you can still get into

| ☐ | When | What | Contact | Status |
|---|---|---|---|---|
| ☐ | **Sat 28 Nov, 10–2** | **St Mary's Shire Christmas Fair**, High St, BS11 0DW (3 min) | 0117 907 7026 · office@stmarysshire.org. Walk in on Fri 10–2 | Confirmed in the church's Shire column. Ask for a corner or a raffle prize |
| ☐ | Sat 28 Nov, 11–2 | St Mary's Henbury Christmas Fair, Henbury Village Hall, BS10 7QF (10 min) | 0117 959 3757 | Confirmed [achurchnearyou](https://www.achurchnearyou.com/church/11714/service-and-events/events/1370367/). Stalls unlikely; ask about leaflets |
| ☐ | Sat 28 Nov | Horfield CE, Collegiate, Clifton High (from the 18 Nov report) | See that report | Probably full; ask about dropouts only |
| ☐ | **Thu 3 Dec, 9–2** | **Shirehampton Christmas High Street Market**, Methodist Church/Hub, BS11 0DY | shirehamptonmarkets@outlook.com · 0117 982 9963 | Confirmed (Shire, Nov). Indoors, with a Father Christmas visit |
| ☐ | Wed 2 Dec, 4–8pm | Henleaze Christmas Festival (outdoors, street) | [contact form](https://www.henleazechristmasfestival.co.uk) | From the 6 Nov report: dark and cold. Only with a gazebo and lights |
| ☐ | **Sat 5 Dec** | **Lawrence Weston Community Market, Christmas edition**, Ambition House, BS11 0PZ (7 min) | 0117 923 5112 · contact@ambitionlw.org | Confirmed (Shire). Gift-focused, 30+ stalls. May be full |
| ☐ | Sat 5 Dec | Tockington Manor, St Michael's Stoke Gifford (2–6pm), Hatherell's Yard | See the 18 Nov report | Hatherell's had space on 5 Dec as of 18 Nov |
| ☐ | Sun 6 Dec, 11–4 | Curious Bazaar, Trinity Centre, BS2 0NW | [organiser](http://www.emergeeventsdesign.co.uk/event-details-registration/curious-bazaar-trinity-centre) | A gothic and alternative crowd, so a **poor fit** |
| ✗ | Sun 29 Nov | Weston Museum | — | **Closed to new stallholders** |

**Opener for any fair:** "Hi, I'm Simon from Snickerdoodle in Shirehampton. We turn children's drawings into keepsakes.
Is there any chance of a small table at your Christmas fair? I'm insured, and I'm happy to fill a gap if someone drops
out."

### 4. GP surgeries and other noticeboards

**How GP leaflets really work:**
- No NHS rule bans a local business poster in a GP surgery.
- GP contract rules cover the NHS logo and not advertising *private medical* services
  ([SI 2019/1137 reg 17](https://legislation.gov.uk/id/uksi/2019/1137/regulation/17?view=plain)).
- NHS England's advertising standards (written for trusts) rule out implying NHS endorsement and **anything that
  exploits children's inexperience** ([NHS England FAQ](https://www.england.nhs.uk/nhsidentity/faq/can-an-nhs-organisation-sell-advertising-space-to-generate-income/)).
- **The practice manager decides**: a 2018 *BJGP* study found practice managers ran the displays in 58% of practices
  ([BJGP](https://bjgp.org/content/early/2018/10/22/bjgp18X699773.full.pdf)).
- Infection-control habits mean **one laminated A4 poster** stands a far better chance than a pile of loose paper.

**What the poster should look like:**
- A free activity first: "draw your little one's Christmas picture: free drawing sheet at snickerdoodle.co.uk".
- No prices, no "buy now", no NHS logo, nothing aimed at children.
- Offer to take it down after 12 Dec.
- **Expect about 1–3 yeses out of the 14 practices** [estimate]. Your own surgery is your best chance.

**Patient groups (PPGs)** at every practice are form-only and meet every 2–3 months, so skip them for Christmas.

| ☐ | Practice | Address | Contact | Route | Chance |
|---|---|---|---|---|---|
| ☐ | **Shirehampton Group Practice** | Health Centre, Pembroke Rd, BS11 9SB (walk) | 0117 916 2226 · bnssg.sgp@nhs.net | Walk in, poster "FAO the Practice Manager", then an eConsult admin request | **Medium** |
| ☐ | **Pioneer Medical Group** (Avonmouth, Ridingleaze, Bradgate) | Collins St, BS11 9JJ, and others | 0117 959 1919 · bnssg.pmg@nhs.net | Email **Rachelle Lambert, Practice Manager** (named on its own site), with the poster attached. One yes covers three sites | Low–medium |
| ☐ | **Heywood Family Practice, Pill** | 1 Lodway Gardens, BS20 0DL (10–12 min) | 01275 372105 | **Vicky Gigg, Practice Manager** (named on its own site). Small and informal | **Medium** |
| ☐ | Sea Mills Surgery (Mendip Vale) | 2 Riverleaze, BS9 2HL | 0117 968 1182 · bnssg.mvmg.seamillssurgery@nhs.net | Ask for the Surgery Manager | Low–medium |
| ☐ | Greenway Community Practice | Greystoke Ave, BS10 6AF | 0117 959 8939 | eConsult admin request | Low–medium |
| ☐ | Southmead & Henbury Family Practice | Ullswater Rd, BS10 6DF | 0117 950 7150 · bnssg.mvmg.shfp@nhs.net | Surgery Manager | Low–medium |
| ☐ | Westbury-on-Trym Primary Care Centre | Westbury Hill, BS9 3AA | 0117 962 3406 | Reception | Low |
| ☐ | Fallodon Way Medical Centre | 13 Fallodon Way, BS9 4HT | 0117 962 4692 | Reception | Low |
| ☐ | Coniston (Patchway), Stokes Bradley Stoke and Stoke Gifford | — | 0117 969 2508 · 01454 616262 · 0117 979 9430 | Reception | Low |

Sources: each practice's own site, plus the BNSSG ICB practice list
([FOI PDF](https://bnssghealthiertogether.org.uk/wp-content/uploads/2025/12/FOI.ICB-2526_302-GP-Practices-in-BNSSG-and-Capacity-Final-Response-combined.pdf)).
**Opener (at reception):** "Hi, I'm a local Shirehampton business. Could I leave this for the practice manager? It's one
poster for the family board: a free Christmas drawing activity. I'm happy to take it down after the 12th."

**Libraries: posters yes, tables no.**
- Bristol Libraries need **a month's notice**, £5m insurance and a risk assessment for any event, and say "we cannot
  accommodate last minute bookings" [confirmed]
  ([checklist](https://www.bristol.gov.uk/files/documents/7243-event-and-activity-booking-checklist-for-friends)).
  So a table before 12 Dec is off.
- **Ask the branch supervisor to put up a poster.** Rhyme times are when to drop it in.

| ☐ | Library | Contact | Families are in for |
|---|---|---|---|
| ☐ | **Shirehampton**, Public Hall, Station Rd, BS11 9TU | 0117 903 8570 · shirehampton.library@bristol.gov.uk | Rhymes **Thu 11am** (3 and 10 Dec), LEGO Club Sat 5 Dec 10:30. Open Fri 1–5 |
| ☐ | Avonmouth, Avonmouth Rd, BS11 9EN | 0117 903 8580 · avonmouth.library@bristol.gov.uk | Rhymes Wed 11am |
| ☐ | Sea Mills, Sylvan Way, BS9 2NA | 0117 903 8555 · seamills.library@bristol.gov.uk | Rhymes Tue 10:45. **Closed on 25 Nov after a fire next door; ring first** |
| ☐ | Henbury, Crow Lane, BS10 7DR | 0117 903 8522 · henbury.library@bristol.gov.uk | Rhymes Mon and Wed 11:30 |
| ☐ | Westbury-on-Trym, Falcondale Rd, BS9 3JZ | 0117 903 8552 · westbury.library@bristol.gov.uk | Rhymes Wed and Fri 11:15 |
| ☐ | Henleaze, Northumbria Drive, BS9 4HP | 0117 903 8541 · henleaze.library@bristol.gov.uk | Rhymes Tue 11:30, Thu and Fri 2pm |
| ☐ | Patchway (South Glos), Rodway Rd, BS34 5PE | Patchway.Library@southglos.gov.uk | Rhymetime Tue 10:30 |
| ☐ | Pill (North Somerset), Crockerne House, BS20 0AT | 01934 426 070 · pill.library@n-somerset.gov.uk | Rhymetime Fri 9:30 |

**Family hubs.**
- **Bristol North Best Start Family Hubs** (Avonmouth, Long Cross, Sea Mills and Southmead): **0117 922 3779 ·
  NBFH@bristol.gov.uk**, Mon–Fri 8:30–4:30 [confirmed]
  ([North hub](https://www.bristol.gov.uk/bristol-family-hubs/your-family-hubs/north-family-hub)).
  - Ask the hub manager to put a poster in the parents' area. A table at a council session is unlikely.
  - Southmead's free Stay and Play is Fri 8:30–9:45 (27 Nov and 4 Dec).
- **Portishead Family Hub:** 01275 884 001 · North.familyhub@n-somerset.gov.uk.
- Chance: **low–medium**, and the reply will be slow.

**Toddler groups, community centres and churches (BS11 first).** These are run by one person or a small team, and
they're often glad of a free activity.

| ☐ | Place | When | Contact | Ask | Chance |
|---|---|---|---|---|---|
| ☐ | **Boing! play café**, 170 Kings Weston Lane, BS11 0QP | Ages 0–5, crafts, a Father Christmas experience | boing@communitychurch-lw.co.uk | A free bauble table at a session | **Medium–high** |
| ☐ | **Lighthouse Toddler Group**, St Andrew's Avonmouth | **Mon 10–11:30, free.** Next: 30 Nov, 7 Dec | 0117 325 8720 · office@standrews-stpeters.org | A free table, or a raffle bauble | Medium |
| ☐ | **Seedlings Toddler Group**, St Edyth's Sea Mills | **Wed 9:30–11** (book). Next: 2 and 9 Dec | 0117 968 6965 · office@stedyths.org.uk | A free table | Medium |
| ☐ | **St Mary's Shire** coffee mornings with a play area | Mon, Tue, Wed, Fri, Sat 10–12 | 0117 907 7026 | Leaflets | Medium |
| ☐ | **Ambition House**, Lawrence Weston | Mon–Fri | 0117 923 5112 · contact@ambitionlw.org | Leaflets at reception | **High** |
| ☐ | Shirehampton Public Hall (library, SCAF, *Shire* paper) | Jolly Melodies baby music Tue 10–11 | 0117 982 9963 · bookings@shirepubhall.org.uk | Leaflets on the hall board | Medium |
| ☐ | Shirehampton Methodist Hub | Drop-in Mon and Thu 10–12:30 | (via the 3 Dec market) | Leaflets | Medium |
| ☐ | Avonmouth Community Centre, 257 Avonmouth Rd | — | 0117 982 7445 | Leaflets | Medium |

**The *Shire* paper:** adverts are £7.95 a unit, a quarter page £75 (adverts@shire.org.uk). The December deadline has
passed; **the January issue closes 10 Dec**, which suits a "thank-you cards from their drawings" advert.

**Shops on your doorstep: pharmacies, dentists and supermarkets** (a walk-round, with posters or counter leaflets).
- **Independent-looking pharmacies [estimate]:**
  - Shirehampton Pharmacy (Health Centre) 0117 982 3134
  - Avonmouth Pharmacy, 205 Avonmouth Rd, 0117 982 3158
  - Lawrence Weston Pharmacy, 62 Ridingleaze, 0117 982 3507
  - Magna Pharmacy, 46 High St, 0117 982 3543
  - Chance: **medium.** Ask the pharmacist or manager mid-morning.
- **Shirehampton Dental Practice**, 21 Station Rd, 0117 982 2119: **medium.**
- **Co-op** Shirehampton High St (0117 982 2181), Avonmouth (0117 982 2267) and Lawrence Weston (0117 982 8578): ask
  the store manager for the community board. **Medium.**
- The big supermarkets' Community Champions support charities, not businesses. **Low.**
- **Leisure centres** (ask the duty manager; busiest after school and at weekends):
  - Henbury Leisure Centre 0117 353 2555 (Everyone Active)
  - Parish Wharf, Portishead 01275 848494: Play & Bounce on Fri, Sat and Sun mornings
  - Bradley Stoke 0300 333 0300
  - Chance: **medium–low.** There's **no swimming pool in Shirehampton.**

---

## The two weeks to the Christmas cut-off

| Day | Do this |
|---|---|
| **Fri 27 Nov** | The calls above. Walk round Shirehampton. Buy the paint kit at Hobbycraft (open till 8). Order leaflets. Insurance. Risk assessment |
| **Sat 28 Nov** | St Mary's Shire fair (10–2) if you have a corner. Otherwise drop leaflets at Almondsbury and Goldfinch, and visit We Make Bristol next door |
| Sun 29 Nov | Make the codes for every yes you got. Put stickers on leaflets. Send leave-behind emails (the C12 `venue-pitch.md` has one) |
| **Mon 30 Nov** | Lighthouse toddler group (10–11:30). **Wild Things table** from 10am with babyballet, if agreed |
| Tue 1 Dec | Drop leaflets and codes to Gymbo for the party bags. Pharmacies, Co-ops and library posters you didn't get to |
| **Wed 2 Dec** | Seedlings (9:30–11). Wild Things (if Wednesday suits better). Henleaze Christmas Festival 4–8pm only if you have a gazebo and lights |
| **Thu 3 Dec** | **Shirehampton Christmas Market (9–2).** Little Beats in Westbury Park (9:15) for leaflets. Shirehampton library rhymes (11am) |
| Fri 4 Dec | Top up every counter stand. Check `/admin/codes`: which codes have orders? Put the next week's effort there |
| **Sat 5 Dec** | **The best Saturday.** Goldfinch workshop table (10am). Lawrence Weston market. Hobbycraft demo, if agreed. Gymbo party bags go out |
| Sun 6 Dec | Almondsbury grotto table, if agreed (the grotto's busiest weeks) |
| Mon 7 – Wed 9 Dec | Cribbs or Galleries weekday pitch, if booked. Toddler groups again (7 and 9 Dec). The leaflet message becomes "**cards by Thu 10 Dec, everything else by Sat 12 Dec**" |
| Thu 10 – Sat 12 Dec | Last-orders reminders on counters. After 12 Dec, switch the pitch to January: thank-you cards from their drawings, the Keepsake Home and the Draw app. Collect stands and thank each place |

---

## Kit and compliance checklist

### Insurance: buy tonight, covered tomorrow
- **Buy an annual £5m public liability policy that includes product liability.** Bristol council markets require £5m
  ([Indies' Market](https://www.bristol.gov.uk/st-nicholas-markets/trade-with-us/trade-bristol-indies-market)), and
  shopping centres and garden centres will ask too.
- **Craft Insurance (Ian Wallace, underwritten by Hiscox)**
  - Says "buy today, covered today", and teaching and demonstrating are included
    ([craftinsurance.co.uk](https://www.craftinsurance.co.uk/)).
  - Ring **01202 826 127** first to check a free supervised children's painting table is covered.
- **Simply Business**
  - Same-day documents. An example sole-trader £5m quote was **£73.30 a year**
    ([page](https://www.simplybusiness.co.uk/insurance/public-liability/public-liability-market-trader/)).
- **Howden / Liability1st**
  - **£67.20 a year for £5m** ([page](https://www.howdeninsurance.co.uk/small-business/by-business-type/shop-and-retail/stallholders-insurance/)).
- **Avoid:** Protectivity's one-day stallholder cover, which **excludes product liability**.
- **When it asks what you do, write:** "craft stall / exhibitor at shopping centres, fairs and soft plays; free
  supervised children's painting activity (parents stay with their children); selling printed keepsakes online."
- **Keep the certificate PDF on your phone.**

### Risk assessment
- Use the **HSE's free template** ([HSE](https://www.hse.gov.uk/simple-health-safety/risk/risk-assessment-template-and-examples.htm)).
  Its five steps: spot the hazards, decide who might be harmed, control the risks, write it down, review it.
- Print two copies. A worked children's-craft example:
  [The Fun Experts](https://www.thefunexperts.co.uk/files/risk-assessments/c/craft-workshop-ra-valid-to-31-march-2026-docx.pdf).
- **Copy these rows in:**

| Hazard | Who | Control |
|---|---|---|
| Tripping over table or easel legs, bags or cables | Visitors, children | Stay inside the agreed footprint, bags under the table, no cables (battery only), tape down the floor-sheet edges |
| Easel tipping or pinching | Children | A low, wide A-frame, fully opened and locked, backed against the table; no leaning or climbing |
| Slipping on spilt paint or water | Everyone | Taped floor sheet, non-spill pots, wipes and kitchen roll within reach, clean up at once; **dry paint sticks on shiny floors** |
| Paint in the mouth or eyes | Children | Washable paint marked EN 71-3 / AP only, the grown-up beside the child, water and wipes for rinsing, crayons for the very young |
| Allergies | Children | Ask the grown-up first, offer crayons instead, keep the paint label in the bag |
| Choking on small sample parts (lids, keyrings, magnets) | Under-3s | Samples kept at adult height, nothing small within reach, counted back in |
| A lost or unaccompanied child | Children | Rule: **the grown-up stays the whole time.** Never take charge of a child. If a child is alone, keep them in view and call venue staff or security; note the lost-child procedure on arrival |
| Safeguarding | Children | Never alone with a child, no photos (see below), no surnames, the artwork goes home with the family |
| Blocking exits and walkways | Everyone | Never in front of fire exits, fire points or shop fronts |
| Lifting at set-up and pack-down | You | A trolley, two trips |

### DBS check
- **Get a Basic DBS check now**: £20 online, usually about 3 days ([GOV.UK](https://www.gov.uk/request-copy-criminal-record)).
  Libraries, churches and some soft plays will ask.
- **Is it required?** It's not regulated activity if parents stay with their children and remain responsible for them
  [estimate, not legal advice].
- **The rules changed on 1 Sept 2026.** The "supervised" exemption was removed, so keep the **parent-stays rule**
  visible ([GOV.UK](https://www.gov.uk/government/publications/working-or-volunteering-in-regulated-activity-with-children/regulated-activity-removal-of-the-supervision-exemption-comes-into-force-1-september-2026)).
  The change created no new duty to check ([GOV.UK](https://www.gov.uk/government/news/regulated-activity-with-children-common-misconceptions-about-the-sept-2026-supervision-exemption-changes)).

### Paint, easel and mess kit
All from **Hobbycraft Cribbs**; Click & Collect is usually ready within an hour.
- **Crayola Washable Kids' Paint, 6 × 2oz: £4.12** in the Black Friday price, normally £5.50
  ([Hobbycraft](https://hobbycraft.co.uk/crayola-washable-kids-paints-6-pack/585243-1000)).
- **Galt Painting Sticks, 6 pack: £5.** No water or brushes, quick-drying, ages 3+
  ([Hobbycraft](https://www.hobbycraft.co.uk/galt-painting-sticks-6-pack/6420801000.html)).
  **Lead with these at Cribbs, garden centres and soft plays.** Bring wet paint only where it's allowed.
- **Chunky washable crayons:** for under-3s, and the lowest-mess fallback.
- **What the labels mean:** look for **EN 71-3** or the **AP seal** on the pack; "non-toxic" alone is a marketing word
  ([BSI](https://knowledge.bsigroup.com/products/safety-of-toys-specification-for-migration-of-certain-elements),
  [ACMI](https://www.acmiart.org/classroom-art-materials-safety)).
- **Easel:** a children's A-frame easel with paper clips (Argos, e.g. [7836325](https://www.argos.co.uk/product/7836325)).
  Or a **tabletop easel**, which can't tip into a walkway.
- **Mess kit:**
  - wipe-clean PVC tablecloth and a plastic floor sheet with gaffer tape
  - disposable kids' aprons (about £2 per 100)
  - baby wipes, kitchen roll, hand gel, bin bags, a lidded water pot
  - A3 cartridge paper, or pre-printed bauble outlines
- **Display:**
  - 3–5 samples (bauble, mug, card, framed print)
  - acrylic A6 leaflet holders (about £4–£8 each)
  - one big QR card ("scan to start creating")
  - a round-sticker sheet for each place's code

### Leaflets and QR codes
- **QR code:** make **one static QR code** at [goQR.me](https://goqr.me/) (free, never expires).
  - Point it at `https://snickerdoodle.co.uk/start-creating`.
  - **Don't use a "dynamic" QR service.** If the subscription lapses, every printed code dies.
  - Print it **at least 25mm** with a white border, and test a print on two phones.
- **The code per place** goes beside the QR code, on a sticker. That's your tracking (see "Something to know about the
  leaflets" above).
- **Printing for tomorrow and next week:**
  - **Azimuth Print, Bedminster:** "12-hour flyers"; an order placed by **7am Friday** can be collected 12 hours later
    [third-party] ([Azimuth](https://azimuthprint.wavecdn.net/printing/12-hour-flyers/)). Ring them to confirm.
  - **instantprint:** 500 A6 for **£22.52–£29.55**; approved by 6:30pm, dispatched for next-working-day delivery
    ([instantprint](https://www.instantprint.co.uk/flyers-leaflets/a6)). Ordered on Friday, that probably means
    **Monday**.
  - **Tomorrow's stopgap:** print A4 sheets at home and cut each into four A6s.
- **The leaflet design** is ready in `project-office/gtm/C12-leaflet/` (`leaflet-A6-print.pdf`). Swap its QR for the
  plain `/start-creating` one and leave a space for the code sticker.
- **Wording rule:** speak to grown-ups only. Never "ask your mum for…" (CAP Code 5,
  [ASA](https://www.asa.org.uk/type/non_broadcast/code_section/05.html)).

### The photo rule (no exceptions)
- **Never photograph a child, or a child's drawing, without the parent's clear yes.**
- Business photos aren't "household use", so data protection law applies
  ([ICO](https://ico.org.uk/for-the-public/schools/photos/)).
- **Easiest of all: take no photos of children at all.** The parent photographs the drawing on **their own phone** and
  uploads it through the QR code, so it goes straight into their private Keepsake Home and you never handle it.
- If you want a stall photo for social media, take it before anyone arrives, with no people in shot.
- **No child surnames, ever.** First names only, and only if the site asks. No school names written down.

### Collecting emails
- **No paper sign-up sheet.** The QR code takes parents to sign up on their own phone, so the site keeps the consent
  record (who, when, what wording).
- Any marketing box must be **unticked** and say plainly what they'll get, e.g. "Email me Snickerdoodle news and
  offers, about once a month. Unsubscribe any time."
  - No pre-ticked boxes ([ICO](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/)).
  - Someone who signs up without buying doesn't count as having agreed to marketing.
- **A prize draw must never need a marketing opt-in to enter**
  ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/consent/what-is-valid-consent/)).
- Collect nothing about the child.

### Leafleting and selling rules
- **Inside a venue, you need that venue's permission, in writing.** An email reply is enough.
- **On the pavement outside:**
  - Councils can designate zones where handing out leaflets needs consent (EPA 1990 Sch 3A,
    [legislation.gov.uk](https://www.legislation.gov.uk/ukpga/1990/43/schedule/3A)).
  - No Bristol scheme was found, but don't leaflet in the street until you've checked with **licensing@bristol.gov.uk**.
  - Cribbs is in **South Gloucestershire**, and it's private land, so the Mall's own rules apply there.
- **Don't take money at a table** unless you've booked a stall where selling is allowed. Selling in a "street"
  (which can include open-air private precincts) needs a council street-trading consent, and Bristol takes about 150
  days to decide one ([Bristol](https://www.bristol.gov.uk/business/licences-and-permits/street-trading)).
- Families order on their own phones, so you never need to.

---

## What this report couldn't check

- Facebook-only places, including most toddler groups and PTAs, and some class schedules (Happity's pages are partly
  scripted).
- Clifton Down shopping centre's site didn't load.
- Children's hairdressers turned up only on booking-site listings, e.g. Tara's Beautique, Lonicera Hairdressing and
  Henleaze Hair & Beauty on [Fresha](https://fresha.com/lp/en/tt/children's-haircuts/in/gb-bristol/westbury-on-trym-and-henleaze).
  They're unverified, so they're left out of the ranking.
- **The Hideaway** café with a play area (63 Shirehampton Rd, BS9) has conflicting reports: reopened in 2025, then
  announced as closed. Walk past before counting on it.
- The detailed research notes behind this sheet (with every source link) are in this session's scratchpad. They
  aren't part of the repository.
