# Bristol outreach call sheet, from Fri 27 Nov 2026

Desk research done on Thu 26 Nov 2026. **I haven't contacted, booked or signed up for anything.** Every phone number and email
below is a business's own published contact. A person is named only where the business itself publishes them as the
contact (a franchise owner, or a practice manager on the practice's own site). Drive times from Shirehampton (BS11 9)
are my rough estimates.

This builds on the earlier reports in the main checkout's `reports/` folder: *Bristol Christmas markets near BS11*
(6 Nov) and *Christmas fairs and who to contact 2026* (18 Nov). It doesn't repeat their school-fair lists. Where a
fair from those reports has changed, the change is noted here.

**Part 1** (below) is for places you turn up at. **Part 2, "Leaflets without turning up"** (near the end), ranks places
that hand out your leaflets while you're elsewhere, plus paid reach, and ends with a top-20 tick-list. **Section 5** (added
Fri 27 Nov) adds 12 more independent kids' places: farms, shoe fitters and class franchisees.

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

**Snickerdoodle Draw:** it went live on [Google Play](https://play.google.com/store/apps/details?id=com.launchmode.snickerdoodle.draw)
on 26 Nov, and the /draw page links to it. The iPhone and iPad version is still in App Store review. Say "our free drawing app
is on Google Play now, and coming soon for iPhone and iPad, at snickerdoodle.co.uk/draw". Don't promise a date for iPhone and iPad.

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

### 5. More independent kids' places (added Fri 27 Nov)

These are new: none of them is anywhere else in this sheet. Each passes the same three tests: families with
under-10s, one person who can say yes, and something that can happen before the cut-off. They're ranked by how likely a
quick yes is. **If you're calling today, start with 5.1–5.6.** Remember that after about **Sat 5 Dec** it's too late
for Christmas, so pitch "thank-you cards from their drawings" from then on.

| ☐ | # | Who | Where, drive | Contact | Ask | Chance |
|---|---|---|---|---|---|---|
| ☐ | 5.1 | **Lawrence Weston Community Farm** (a community charity farm; runs **Farm Tots**, a woodland craft club and a gardening club) | Saltmarsh Drive, BS11 0NJ, **5 min**. Open Tue–Sun 9:30–4:30 | **0117 938 1128** · office@lwfarm.org.uk [confirmed site [lwfarm.org.uk](https://www.lwfarm.org.uk/); the email is from the farm's own job pack, and the charity register lists a staff member's address instead, so ring first] | Leaflets on the counter, a poster, leaflets at Farm Tots. Maybe a free bauble table on a weekend before 5 Dec | **High.** On your doorstep, and you can call in today |
| ☐ | 5.2 | **Jo Jingles Bristol** (Tracy Bees, franchisee): music and movement, 3 months–5 years, 12 classes a week | Christ the King Church, Bradley Stoke BS32 8EE (Mon and Fri 9:45, 10:45, 11:45, **15 min**) · The Chantry, Thornbury BS35 1HB (Wed) · Emersons Green Village Hall BS16 7AP (Tue) | **07713 943666** · jojingles.bristol@gmail.com [confirmed, [her territory page](https://booking.jojingles.com/discover/territory/bristol/)] | Leaflets at classes **Mon 30 Nov–Fri 4 Dec**, plus her own code in a message to her families. Her term ends 7–11 Dec, which is too late for Christmas leaflets | **High.** About 100 families a week [estimate: 12 classes × 8–10], and she decides |
| ☐ | 5.3 | **SoleLution** (family-owned shoe shop; every fitter is trained to fit children's shoes, by appointment) | 62 High Street, Portishead BS20 6EH, **15 min**. Mon–Fri 9–5:30, Sat 9–5 | **01275 843399** · enquiries@solelution.co.uk [confirmed, [solelution.co.uk](https://solelution.co.uk/pages/our-shop)] | Leaflets by the fitting seat, a poster, their own code (A) | **High.** Parents sit and wait while children are measured. About 40–80 families a week [estimate] |
| ☐ | 5.4 | **Oddsox** (independent children's shoe shop and fitter, toddlers up) | 204 Gloucester Road, Bishopston BS7 8NU, **20–25 min** | **0117 329 2423** · info@oddsoxshoes.co.uk [confirmed, [oddsoxshoes.co.uk](https://oddsoxshoes.co.uk); the street number is from a stockist list] | Same as SoleLution. December brings party shoes and winter boots | **High.** About 50–90 families a week [estimate]. Pair it with Totally Toys (Part 2, No. 109) on the same road |
| ☐ | 5.5 | **St Werburghs City Farm, Winter Fair, Sat 5 Dec, 11am–4pm** (a Christmas market of local traders, family activities and storytelling; free entry, £3 suggested donation) | Watercress Rd, BS2 9YJ, **20–25 min** | office@swcityfarm.co.uk [confirmed, [events](https://swcityfarm.co.uk/events/)]. No phone published | Offer a **free kids' "draw a bauble" table as one of the family activities**. If not, leaflets in the café (open Fri–Mon) | **Medium–high.** A perfect fit, but only 8 days away, so email today. It runs from 11, so it works after the Goldfinch workshop at 10 |
| ☐ | 5.6 | **The Creation Station Portishead** (Amy Cox, franchisee): arts and crafts for 0–11s | After-school Create Club at Portishead Primary (Mon and Wed 3:20) and Trinity Primary BS20 7JF; Tiny Treasures at Teapot and Tumble BS20 6PR; **15 min** | **07518 316883** · amycox@thecreationstation.co.uk [confirmed, [her page](https://www.thecreationstation.co.uk/portishead)] | Leaflets in club bags in the week of 30 Nov, plus her own code | **Medium–high.** She decides. Pitch it as "your families' artwork, made into keepsakes", so it adds to her clubs rather than competing |
| ☐ | 5.7 | **Windmill Hill City Farm** (community farm, plus a nursery for ages 0–5) | Philip Street, Bedminster BS3 4EA, **20 min**. Open daily 9–5 | **0117 963 3252** · info@windmillhillcityfarm.org.uk [confirmed, [contact](https://windmillhillcityfarm.org.uk/pages/contact)] | Leaflets at reception and the café, a poster, nursery bags | **Medium.** It runs its own bauble and card workshops ([calendar](https://www.windmillhillcityfarm.org.uk/whats-on/calendar), no dates shown), so it may say no |
| ☐ | 5.8 | **Cook Stars Bristol North** (Helen Ford, franchisee): kids' cooking classes | Emersons Green Village Hall BS16 7AP, Thu 5:15 (Minis 2–5, Juniors 5–11), **25 min**; Patchway BS34 5LP on Mon (ages 11–17) | **07482 846382** · helen.ford@cookstars.co.uk [confirmed, [her page](https://www.cookstars.co.uk/cooking-classes/bristol-north)] | Leaflets at Thursday pick-up (3 Dec), plus her own code | **Medium.** About 40–60 families a week [estimate] |
| ☐ | 5.9 | **Stagecoach Performing Arts Portishead** (Fae McIntyre, principal): ages 4–18 | Portishead, Fri (early years) and Sat. Venue not on its page [third-party] | **01275 845326** [confirmed, [stagecoach.co.uk/portishead](https://www.stagecoach.co.uk/portishead)] | A line and the code in her parents' email, and leaflets at Saturday pick-up | **Medium.** About 70–100 families [estimate], but it's drama, not drawing |
| ☐ | 5.10 | **Tumble Tots North Somerset** (physical play, 6 months to school age) | 2nd Portishead Scout Hall, Forester Rd (Wed 9:45 and 12:45) · Long Ashton Community Centre BS41 (Tue 9:45–12:45), **15–20 min** [third-party, Happity 2025–26] | No contact found. Its own centre pages are broken | Turn up 5 minutes before a class ends on **Tue 1 or Wed 2 Dec** and ask the leader | **Medium.** About 60–80 families a week [estimate], but it's unverified |
| ☐ | 5.11 | **Boing! Lawrence Weston**: already in Part 2 under Boing!, but **it's run separately, by a local community church**, so the Boing! head-office yes may not cover it. It's selling a **Father Christmas Experience** now (£15 a table) | 170 Kings Weston Lane, BS11 0QP, **5 min** | boing@communitychurch-lw.co.uk (one session lists boing@kings-cc.co.uk) [confirmed, [booking page](https://boinglawrenceweston.schedulista.com/)] | Leaflets on the tables at the Father Christmas sessions, plus a poster | **Medium–high.** Ask for the café lead |
| ☐ | 5.12 | **Bristol Forest School** (since 2004; ages 0–18; parties and holiday days) | Leigh Court Farm, Pill Rd, BS8 3RA, **10–15 min** | contact@bristolforestschool.co.uk [confirmed, [site](https://www.bristolforestschool.co.uk/)] | A line and the code in its next parents' email | **Medium–low.** No counter, so it's email only |

**Worth a walk-in or one email, but check they're still trading first** (all from directories that are 2–7 years old):
- **Ethel's Case**, 13 Old Church Road, Clevedon: a nearly-new kids' clothes shop for ages 4–13, where parents come in to sell as well as buy. 01275 340516 [third-party, about 2022]. **Medium.**
- **Kate Kirkby Photography**, 5 Bank Place, Pill: a newborn and family studio, about 10 minutes away. Pitch a cross-promotion: your leaflet goes in her finished orders and she gets her own code. No business site was found, so use her studio's public page. **Medium.**
- **Cairns Road Café**, Cairns Road Baptist Church, 78 Cairns Rd, BS6 7TQ: a free soft-play café for under-5s, with baby and toddler areas. Ask the church office [third-party, about 2019]. **Medium.**
- **Noah's Ark Zoo Farm**, Wraxall: Meet Santa on 28 and 29 Nov, 5 and 6 Dec and 12 Dec. 01275 852606 · info@noahsarkzoofarm.co.uk [confirmed, its own site]. Big footfall, but its marketing team decides, and it already gives children a decorate-your-own decoration. **Low–medium.**
- **Picture framers:** **Sky** (Clifton Village, since 1976) and **Fizz Gallery & Framing** (Clevedon). Pitch "frame the original, make the copy a bauble". No contacts were confirmed. **Low–medium.**
- **Playfull Toyshop**, 87 Gloucester Rd, BS7 8AS, 0117 944 6767 [third-party]. **A Bristol24/7 piece says its owners are retiring and closing it on 31 Dec**, and I couldn't tell which year. Walk past it on the Oddsox trip before counting on it.
- **Forest Child CIC** (Yvette McLoughlin, info@forestchild.co.uk): forest sessions across Bristol with no fixed base. **Low–medium.**
- **Hartcliffe City Farm**, BS13 0QH: Nature Stay and Play on Mon 30 Nov. Contact is only an "email us" button on its site, and it's 25–30 minutes away. **Medium–low.**
- **Baby massage and yoga teachers** listed in NHS and Happity directories (Kalma Baby at Portishead Youth Centre, and Daisy Baby at The Playport, Portishead). Unverified.

**Looked for, but found nothing usable nearby:**
- **Not found:** an independent children's hairdresser, an independent baby or nursery shop, or a kids' clothes boutique in Westbury, Henleaze or Bradley Stoke.
- **Toy and sling libraries:** no toy library in the north or west (the nearest is South Bristol, fortnightly on Saturdays), and the sling library now works mostly one-to-one.
- **No active Bristol franchise found:** Monkey Music, Bricks 4 Kidz, Theatre Bugs, Boogie Mites, Toddler Sense and Rhythm Time.
- **Look inactive:** Hartbeeps North Bristol and Moo Music Bristol.
- **Tiny Talk** (Westbury Village Hall and Jump at Cribbs): its listings have gone.
- **No route to a local person who can say yes:** Stagecoach Bristol North (form only) and Pauline Quirke Academy (head office only).
- **NCT Bristol** is volunteer-run with national rules on promotion, so it's a January newsletter job at best.
- **Felix Road Adventure Playground** is for ages 8–14, a weak fit.

**Phone opener for the class owners (5.2, 5.6, 5.8, 5.9):** "Hi, I'm Simon from Snickerdoodle in Shirehampton. We turn
children's drawings into Christmas baubles and cards. Could I drop you some colour-in bauble leaflets for your families
next week, with your own code that gets them a free card and earns you 10% of their first order?"

**Opener for the shoe shops (5.3, 5.4):** "Hi, I'm Simon, I run Snickerdoodle, a little Bristol business that turns
children's drawings into keepsakes. Parents are sat with you while their little ones get measured, which is exactly when
they'd pick up a leaflet. Could I leave a small pile by the fitting seat, with a code that pays you 10% of anything
ordered with it?"

**Opener for the farms (5.1, 5.5, 5.7):** "Hi, I'm Simon from Snickerdoodle, just round the corner in Shirehampton. We
turn children's drawings into Christmas baubles. Could I put a few leaflets and a poster up for your families? Or, if it
helps, run a free 'draw a bauble' table for the little ones, with grown-ups staying with their children?" (They're
charities, so offer a **no-commission code**, or a raffle keepsake (D), not the 10% deal.)

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
| Thu 10 – Sat 12 Dec | Last-orders reminders on counters. After 12 Dec, switch the pitch to January: thank-you cards from their drawings, the Keepsake Home and the Draw app (on Google Play now, coming soon for iPhone and iPad). Collect stands and thank each place |

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

## Part 2: Leaflets without turning up

You don't have many days to stand at events. This part is about **one call or email that puts leaflets in front of
lots of families while you're elsewhere.** Same rules as Part 1: I contacted nobody, every contact is a business's own
published one, and a person is named only where the business publishes them as its contact. Researched Thu 26 Nov.

### How I ranked them: families reached per hour of your time

**Weekly families** is the number of families with young children who'd plausibly see the leaflet or get it in a
week. Every figure is an [estimate], and the working is shown.
- **Classes:** classes a week × about 8–10 families. Puddle Ducks publishes a maximum of 10 a class.
- **Play cafés with booked sessions:** about 20 families a slot × 2–4 slots a day × 6 days.
- **Big soft plays and grottos:** daily visits × 7, at about 1.5 children per family.
- **Pharmacies and opticians:** about 60–100 family visits a week per pharmacy and 30–50 per optician. These are
  guesses; no shop publishes footfall.

**Your time** is the call or email (15–20 min each) plus dropping off or posting the leaflets, including the drive.
**Families per hour** = weekly families (midpoint) ÷ your hours.

Owners and teachers who **email or WhatsApp their own families** reach far more people per hour than a pile on a
counter, so they rank high. Ask them to send **the leaflet picture** (`project-office/gtm/C12-leaflet/preview-front.png`
and `preview-back.png`) with their code, as well as handing out paper copies.

**The Christmas line:** a leaflet a family picks up after about **Sat 5 Dec** leaves too little time to send a
drawing in before the cut-off (cards Thu 10 Dec, everything else Sat 12 Dec). So:
- make **two code stickers**: "**order by Sat 12 Dec for Christmas**" now, and "**thank-you cards from their
  drawings**" for anything still out after 5 Dec;
- where a route can't start until after 5 Dec, it's marked **January**.

### Which deal fits which place

| Place | Deal | Why |
|---|---|---|
| Owner-run businesses: classes, soft plays, play cafés, shops, opticians, nursery groups | **Partner code, CAMPAIGN, 10% of first orders** | Earns them money for no work, and costs you only when someone orders |
| A community nursery or CIC that wants to fundraise (e.g. Raised in Bristol) | **PTA-style code (earns on every order)** *only if they ask for it* | A PTA code pays on repeat orders too. At about £5 of margin an order (*UK marketing costs* report), keep it for schools and genuine fundraising partners |
| NHS pharmacies, GP surgeries, libraries, family hubs, leisure trusts, churches | **A no-commission code** | It's just for counting. They can't, or shouldn't, take a cut, and a free family activity is what they'll accept |
| Bookshops and big chains (Waterstones, Hobbycraft) | **Free placement**, with a counting code | Chains won't take a commission. Independents often just like helping a local maker |

**One-line ask (businesses):** "Could I leave 50 little colour-in leaflets on your counter? Your own code gets families
a free card, and you earn 10% of every first order. There's nothing for you to do."

**One-line ask (NHS, council, charity):** "Could I leave a few leaflets or one poster for families? It's a free
Christmas drawing activity, with no prices on it. I'm happy to take it down after the 12th."

**Email to paste (businesses).** Change the bits in brackets.

> **Subject:** Leaflets for your families? (a free card for them, 10% for you)
>
> Hi [name],
>
> I'm Simon, and I run Snickerdoodle from Shirehampton. We turn children's drawings into keepsakes: baubles, mugs and
> cards, with the wonky bits kept in.
>
> Could I leave [50] small leaflets [on your counter / in your party bags / for your classes]? Each one has a bauble to
> colour in on the back. I'll set up a code just for [business]: families get a free card with their first order, and
> you earn 10% of every first order made with it, paid monthly with a short statement. If it's easier, I can send you
> the leaflet as a picture to share with your families too.
>
> There's nothing for you or your team to do. We never ask anyone to collect or photograph children's drawings: parents
> do it all at home on their own phones, and everything stays private.
>
> I can post them or drop them in this week. Thanks very much!
>
> Simon · snickerdoodle.co.uk · [your phone]

**Email to paste (NHS, council, charity).** Same opening, then:

> Could I leave a few leaflets, or one A4 poster, for your families? It's a free Christmas drawing activity: a bauble to
> colour in, which parents can turn into a keepsake at home if they'd like. There are no prices on it, and it's aimed at
> grown-ups. I'm happy to collect it after 12 December. Thank you!

### The one-call routes, with who to ask

#### Classes: one owner hands leaflets to hundreds of families a week

- **Puddle Ducks Bristol & Bath** (baby and child swimming)
  - **Who:** Sarah Austin, the franchise owner [confirmed].
  - **Contact:** **0117 971 7165** · 9 Kensington Park Road, BS4 3HP · [enquiry form](https://www.puddleducks.com/local-teams/bristol-bath/).
  - **Reach:** swims at "numerous" pools, at most 10 a class [confirmed]. About 50–80 classes × about 8 =
    **400–640 families a week** [estimate].
  - **Ask:** send the leaflet picture to her families plus 200 paper copies for poolside receptions. A pool is a poor
    place for paper, so lead with the email.
  - **Deal:** code.
  - **Note:** the break is 19 Dec – 1 Jan (from Part 1), so ask this week.
- **Water Babies Bristol & Bath**
  - **Who:** the local franchise office.
  - **Contact:** **0117 946 6919** [third-party, Trustpilot], or the [form](https://waterbabies.co.uk/about-us/contact-us) [confirmed].
  - **Reach:** pools at Henbury, Abbots Leigh and Hartcliffe. About **300–600 families a week** [estimate].
  - **Deal:** code. **Chance: low–medium.** Head office may veto, so ask quickly and accept a no.
- **Baby Sensory: all three Bristol franchises.** Send three near-identical emails.
  - **East** (Kingswood, Lyde Green, Emersons Green, Warmley): Helen Williams, **07721 615412** ·
    bristoleast@babysensory.co.uk [confirmed](https://www.babysensory.com/bristol-east).
  - **North** (Bishopston, Bradley Stoke, Westbury Park, Redland): **07579 793259** · bristolnorth@babysensory.co.uk
    [confirmed](https://www.babysensory.com/bristol-north). The team page names "Emma".
  - **South** (Keynsham, Southville, Brislington): **07908 479936** · bristolsouth@babysensory.co.uk
    [confirmed](https://www.babysensory.com/bristol-south).
  - **Reach:** about 30–40 classes a week across the three × 10 = **280–400 families a week** [estimate].
  - **Deal:** code, pitched as "baby's first scribble or handprint bauble".
- **diddi dance Bristol** (Bedminster, Bromley Heath, Yate and more)
  - **Who:** area lead Emily Norman [confirmed](https://www.diddidance.com/diddi-dance-bristol/).
  - **Contact:** **07850 983821** · emily.norman@diddidance.com.
  - **Reach:** about 15–25 classes × 10 = **150–250 a week** [estimate].
  - **Deal:** code.
- **From Part 1:** Gymbo (07453 901951), both babyballet franchises (07715 340610 and 07395 805885), Sing and Sign
  (0759 4460 448) and Little Kickers (07506 346186). All can hand out leaflets without you there.
- **Probably inactive or not found:**
  - Splat Messy Play South & East shows no sessions from 26 Nov.
  - Jo Jingles shows "nothing scheduled".
  - Monkey Music and Toddler Sense have no Bristol franchise.

#### Soft plays and play cafés

- **Boing! Softplay** (Boing Bristol CIC, a community not-for-profit)
  - **Covers:** three sites: **Lawrence Weston** (next to BS11), Lockleaze and Inns Court.
  - **Contact:** **07958 592 586** · **info@boingsoftplay.com** [confirmed](https://www.boingsoftplay.com/). This is
    the same Boing! as the Lawrence Weston play café in Part 1, so **one email covers all three sites.**
  - **Reach:** 3 × 150–300 = **450–900 families a week** [estimate].
  - **Deal:** code (or PTA-style if they'd rather fundraise).
- **Noah's Ark Play Centre**, 828a Bath Road, Brislington, BS4 5LQ
  - **Contact:** **0117 971 2599** [confirmed](https://www.noahsarkplay.co.uk/). Open 7 days, with a four-storey
    play frame.
  - **Reach:** **400–600 a week** [estimate].
  - **Deal:** free placement, or a code.
- **Tiny Town Play Café**, Unit 17, Kings Chase Shopping Centre, Kingswood, BS15 8LP
  - **Contact:** **hello@tinytownplaycafe.co.uk** [confirmed](https://www.tinytownplaycafe.co.uk/).
  - **Reach:** booked 90-minute sessions with crafts. **200–300 a week** [estimate].
  - **Deal:** code.
- **Out There Indoors Play Café** (Paintworks, BS4 3AS; booking via [hoop](https://hoop.co.uk/outthereindoors)) and
  **Tots & Teapots** (186 Wells Road, BS4 2AL; [contact form](https://www.totsandteapots.co.uk/contact)) [confirmed]
  - They're close together, so post both on one trip.
  - **Reach:** **350–600 a week** combined [estimate].
  - **Deal:** code.
- **The Play Shed**, Yate (Facebook only), and **Jungle Kingdom** at Yate Leisure Centre (Active Centres, 0300 333 0300)
  - **Reach:** 300–500 a week each [estimate]. **Chance: low**: one has no public email, the other is run by a trust.
- **From Part 1:** Wild Things at Cribbs (0117 959 2514) and 123 Jump at Cribbs (01179 312 733).
- **Closed:** Jungle Mania in Broadmead closed, according to its own site. Jaq's Leisure looks gone.

#### Nursery groups and childminders (book-bag leaflets)

- **Snapdragons group** (Shirehampton, Horfield, Keynsham)
  - **Who:** the Bristol operations manager, published as "Lyndsey" [confirmed](https://snapdragonsnursery.com/important-information/leadership-team/).
    Use the enquiry form at snapdragonsnursery.com/contact.
  - **Reach:** about **300 families a week** through book bags [estimate].
  - **Deal:** code. **Before Christmas only if she agrees by about 1 Dec**; otherwise January.
- **Raised in Bristol** (Raised In CIC; 4 nurseries: Easton, Felix Road, St Pauls, Southmead/Greenway)
  - **Contact:** **0800 048 7968** [confirmed](https://www.raisedin.org.uk/).
  - **Reach:** about **200 families a week** [estimate]. It publishes a local indie gift guide for children
    [third-party], so it's a natural fit.
  - **Deal:** code, or PTA-style if they want to fundraise.
- **Bristol Childminding Network** (council-run; every Bristol childminder belongs, in 8–10 groups)
  - **Who:** Lucy Dale, Childminding Support Lead [confirmed](https://bristolearlyyears.org.uk/childminders/groups).
  - **Contact:** **CMSUPPORT@bristol.gov.uk**.
  - **Ask:** about free newsletter space only. A council team won't forward a commercial offer. **January.**
- **Skip before Christmas:** the big chains (Busy Bees, Kids Planet), whose head offices take weeks.

#### Pharmacy and optician groups (several branches, one yes)

- **Magna Pharmacy**: 19 branches [confirmed](https://www.magnapharmacy.co.uk/branches). About 8 are in Bristol and
  Portishead: **Shirehampton (46 High St, 0117 982 3543)**, Lawrence Weston, Henbury, Lockleaze, Knowle West and
  Portishead ×2.
  - **Who:** no head-office contact is published. Ask the Shirehampton branch manager to pass it to the area or head
    office [estimate].
  - **Reach:** 8 × 60–100 = **480–800 family visits a week** [estimate].
  - **Deal:** no-commission code, framed as a free family activity. **Chance: medium.**
- **Armstrong & North Opticians** (family-run): about 9 Bristol and South Glos branches, including **Shirehampton
  (12 High St)**, Henbury, Bishopston, Fishponds, Staple Hill, Winterbourne, Yate (01454 313594), Chipping Sodbury and
  Thornbury [third-party listings; their site blocked automated reading].
  - **Who:** the Shirehampton practice manager, asking for head office.
  - **Reach:** 9 × 30–50 = **270–450 a week** [estimate].
  - **Deal:** code (they're a private business). **Chance: medium.**
- **Dentists:** the multi-site Bristol dental groups are corporate (Bupa has 6, mydentist 6+), so expect no central
  yes. Ask independents one by one (Part 1).

#### Bookshops, toy shops, a pottery café and a kids' hairdresser

| Place | Contact | Reach a week [estimate] | Deal |
|---|---|---|---|
| **Totally Toys**, 109 Gloucester Rd, BS7 8AT | 0117 942 3833 [third-party] | 200–400 in December | Code or free placement |
| **Storysmith**, 236 North St, BS3 1JD (one shop now) | 0117 953 7961 · hello@storysmithbooks.com [confirmed](https://storysmithbooks.com/access/) | 100–200 (it runs free children's author events) | Free placement |
| **Bookmarked** (formerly Max Minerva's), 47 Henleaze Rd, BS9 4JU | 07498 538 858 · info@maxminervas.co.uk [confirmed](https://www.maxminervas.co.uk/) | 100–200 | Free placement |
| **Bookhaus**, 4 Rope Walk, Wapping Wharf, BS1 6ZJ | 0117 244 0326 · info@bookhausbristol.com [confirmed](https://bookhausbristol.com/) | 100–200 | Free placement |
| **Kiln Workshop** (paint your own pottery), 63 North Rd, BS6 5AD | 0117 942 0470 · kilnworkshop@gmail.com [confirmed](https://www.kilnworkshop.com/) | 80–150. **Its last Christmas firing is 29 Nov**, so families collect in early December, which is perfect timing | Code |
| **Kidz Cuts** (children only), 37b High St, Keynsham | Book via [Fresha](https://www.fresha.com/a/kidz-cuts-9gsbin76/reviews); 2,361 five-star reviews | 80–150. Parents wait while the cut happens | Code |
| Waterstones Cribbs | 0117 950 9813 [third-party] | — | Free placement. No leaflet policy found, and the Mall may need to approve. Low |

#### Big networks: huge reach, but slow (mostly January)

None of these councils or trusts publishes a poster or leaflet policy, and they'll want community material, not
adverts. **Send one short email each now for January**, using the no-commission template. A single branch saying yes on
the spot is a bonus.
- **Bristol Libraries** (27 branches): **bristol.library.service@bristol.gov.uk** · 0117 903 7250. Central Library
  displays go to librarybooking@bristol.gov.uk [confirmed](https://www.bristol.gov.uk/residents/libraries-and-archives/find-a-library/library-finder).
  The branch emails are in Part 1.
- **South Glos Libraries** (12 branches): **libraries@southglos.gov.uk** · 01454 868006 [third-party copy of a
  council leaflet]. It shares a card with the Active Centres leisure trust, "almost 100,000 card holders"
  [confirmed](https://activecentres.org/ABOUT-US/). One ask could cover both.
- **North Somerset Libraries**: libraries@n-somerset.gov.uk [third-party]. Portishead and Pill branch emails are in
  Part 1.
- **Bristol Family Hubs** (15 sites in 3 areas) [confirmed]:
  - North: **NBFH@bristol.gov.uk** · 0117 922 3779
  - East & Central: **ecfh@bristol.gov.uk** · 0117 922 3189
  - South: **sbfh@bristol.gov.uk** · 0117 922 2150
- **North Somerset Family Hubs** (13 centres): family.hub@n-somerset.gov.uk. **South Glos children's centres** (6):
  no central email found (the council pages returned errors).
- **Everyone Active, Bristol contract** (5 centres: Horfield, Bristol South Pool, Henbury, Easton, St Pauls)
  [confirmed](https://everyoneactive.com/news/bristol-leisure-contract). No leaflet process is published, so ask each
  centre's general manager. **Hengrove Park isn't in it** (it's run by Parkwood).
- **Active Centres, South Glos** (Bradley Stoke, Kingswood, Longwell Green, Thornbury, Yate): [contact form](https://activecentres.org/contact/)
  · 0300 333 0300.
- **Church networks:** the Diocese of Bristol publishes no children's adviser. Its contacts are
  officesupport@bristoldiocese.org and 0117 906 0100 [confirmed](https://bristol.anglican.org/childrenyoungpeopleministry).
  Toddler groups list themselves one by one, so there's no single route. **Low; January at best.**
- **Supermarkets:** every chain's community role (Tesco, Sainsbury's and Asda Community Champions; Morrisons) is for
  charities and good causes. No chain publishes a rule allowing small-business posters.
  - Co-op's Member Pioneer roles ended in 2024, so the store manager decides now [estimate].
  - Morrisons sells staffed in-store stands from about £330 a week through an agency (Access Point, 01704 544999)
    [third-party]. That isn't "without turning up".
  - **Low.** Only the Co-ops on your doorstep (Part 1) are worth a word.

### Paid reach: real prices

Prices exclude VAT unless stated.

**How to compare them:** roughly **1 in 5 homes has a child under 10** [estimate], so £40 per 1,000 homes works out
to about £200 per 1,000 young families.

**Christmas: almost nothing paid can still land by 5 Dec.**
- Every magazine's December issue has closed.
- Royal Mail needs about 3 weeks.
- **The one long shot is a private solus leaflet drop in BS11 on 1–5 Dec.** About 5,000 homes would cost roughly
  **£400–£725 + print** [estimate]. Ask whether they can still do it:
  - **Out of Hand** (Bristol BS3): solus from £145 per 1,000 in a print-and-deliver package. 0117 953 6363 ·
    hello@outofhand.co.uk [confirmed](https://outofhand.co.uk/distribution).
  - **Bristol Leaflet Delivery** (BS4): GPS-tracked, quote only. 0117 905 1144 [confirmed].
  - **Leaflet Media**: its Bristol page says solus £80, solus+1 £59, shared £49 per 1,000 (10,000 minimum for
    shared), but its national page shows higher prices [confirmed, the two pages conflict]. sales@leaflet-media.co.uk ·
    07375 590133.

**January (thank-you cards from their drawings): book these before mid-December.**

| Option | Reach | Price | Cost per 1,000 | Deadline / lands | Contact | Verdict |
|---|---|---|---|---|---|---|
| **The Bristol Nine** (BC Magazines; BS9: Stoke Bishop, Westbury, Coombe Dingle, Henleaze, Sneyd Park, Sea Mills) | 12,000+ homes | Your leaflet delivered with the magazine, up to A5, **no minimum**; all of it is about £480 + print | **£40** | **Book by 12 Dec**, lands by about 8–10 Jan | 0117 259 1964 · [advertising](https://www.bcmagazines.co.uk/advertising/) [confirmed] | **Best value.** Family-heavy, next door to BS11 |
| The Bristol Six + Eight (BC Magazines; Redland, Cotham, Westbury Park, Kingsdown, north Clifton) | 11,000+ homes | Same terms | £40 | Same | Same | Good second |
| **The Shire** (BS11) | 5,000 copies, delivered by volunteers | Quarter page £75. Inserts aren't mentioned, so ask | About £15 (an advert) | **January issue closes Thu 10 Dec** | adverts@shire.org.uk · 07742 804737 [confirmed, Nov issue] | **Yes.** Your home patch and the cheapest per copy |
| Henleaze & Westbury Voice | 8,500 copies | Quarter page £109 (£89 a month over 6 months). Inserts offered, price not published | About £13 (an advert) | About 16–17 Dec [estimate] | sales@henleazeandwestburyvoice.co.uk · 0117 908 2121 [confirmed](https://localvoicenetwork.co.uk/advertise-with-us/) | Maybe. It overlaps the Bristol Nine |
| The Bristol Magazine | 15,000 well-off homes | Inserts from £75 per 1,000 | £75 | January issue closes **11 Dec** | 0117 974 2800 · sales@thebristolmagazine.co.uk [confirmed] | Poor fit (not aimed at families) |
| **Royal Mail Leaflets** (door to door by postcode sector, about 3,000 homes each) | Every home in the sectors you pick | **About £84 per 1,000** (new customers about £75.60), £200 minimum | £75–£84 | About 3 weeks; hand over 10+ days before the delivery week. Book early-to-mid December for the week of 11 Jan [estimate] | 0345 266 0858 [third-party price; royalmail.com blocked reading] | A January test only. It reaches every home, most without young children |
| Out of Hand "flyers to outlets" | 80+ city-centre venues, one network arts and family | £75 per 1,000 flyers, topped up weekly | £75 | Not stated | nigel@outofhand.co.uk · 0117 953 6363 [confirmed](https://outofhand.co.uk/distribution) | Maybe. Ask which family venues it covers |

**For Mother's Day:**
- **Primary Times Avon** goes home in primary-school book bags: "over 52,000" copies [confirmed, 2026 pack].
- Inserts are **£35 per 1,000, minimum 10,000** (so £350 + print) [confirmed, 2025 pack].
- The next issue lands about **Mon 1 Feb 2027**, copy deadline about **mid-January** [estimate].
- Contact: 07736 945720, victoria.jelleyman@primarytimes.co.uk
  ([2026 pack](https://primarytimes.co.uk/assets/files/2026%20media%20packs/Avonmediapack_2026%20VJ.pdf)).
- **Book it for Mother's Day (7 Mar 2027).** Write to grown-ups only (CAP Code 5).

**Gone or skip:**
- The Journal series (Bradley Stoke, Patchway, Stoke Gifford) **ended in 2022**.
- *Families* magazine for the South West looks lapsed (last issue found: Oct 2024).
- Tourist leaflet racks reach visitors, not local families.

### Top 20 to do now, by families per hour

These are the ones that can work **before the Christmas cut-off**, ranked by families per hour. The big council
networks above are January jobs.

| ☐ | # | Who | Contact | Families a week [estimate] | Your time | Families / hour | Deal | Leaflets |
|---|---|---|---|---|---|---|---|---|
| ☐ | 1 | **Almondsbury Garden Centre**: counter stand by the grotto | 01454 457300 · enquiries@almondsbury.co.uk | 500–1,000 (about 70–140 grotto bookings a day × 7) | 1h | **~750** | Code | 300 + a stand |
| ☐ | 2 | **Puddle Ducks Bristol & Bath** (Sarah Austin): email to families plus paper | 0117 971 7165 | 400–640 (50–80 classes × 8) | 45 min | **~690** | Code | 200 + the picture |
| ☐ | 3 | **Water Babies Bristol & Bath** | 0117 946 6919 | 300–600 | 45 min | ~600 (chance low–med) | Code | 200 + the picture |
| ☐ | 4 | **Boing! Softplay**, 3 sites | 07958 592 586 · info@boingsoftplay.com | 450–900 (3 × 150–300) | 1.5h | **~450** | Code / PTA-style | 3 × 100 |
| ☐ | 5 | **Gymbo Bristol**: party gift bags plus counter | 07453 901951 | about 200 (25 classes × 8) | 30 min | ~400 | Code | 100 |
| ☐ | 6 | **Wild Things, Cribbs**: counter plus party bags | 0117 959 2514 | 300–500 | 1h | ~400 | Code | 200 |
| ☐ | 7 | **Baby Sensory** East, North and South | 07721 615412 · 07579 793259 · 07908 479936 | 280–400 (30–40 classes × 10) | 1h | ~340 | Code each | 3 × 100 + the picture |
| ☐ | 8 | **Noah's Ark Play Centre**, Brislington | 0117 971 2599 | 400–600 | 1.5h | ~330 | Free / code | 200 + a stand |
| ☐ | 9 | **Out There Indoors + Tots & Teapots** (BS4) | hoop booking · contact form | 350–600 | 1.5h | ~320 | Code each | 2 × 100 |
| ☐ | 10 | **Snapdragons** (Lyndsey, Bristol ops): book bags. Yes needed by about 1 Dec | snapdragonsnursery.com/contact | about 300 | 1h | ~300 | Code | 300 |
| ☐ | 11 | **Shirehampton walk-round**: library, Co-op, 2 pharmacies, GP, Public Hall, Ambition House, Armstrong & North (High St) | Part 1 numbers | about 400 combined | 1.5h | ~270 | No-commission (NHS, council) / code (shops) | 8 × 30 + 2 posters |
| ☐ | 12 | **diddi dance Bristol** (Emily Norman) | 07850 983821 · emily.norman@diddidance.com | 150–250 | 45 min | ~270 | Code | 150 + the picture |
| ☐ | 13 | **Magna Pharmacy**: via the Shirehampton branch to the area manager | 0117 982 3543 | 480–800 (8 × 60–100) | 2.5h | ~260 | No-commission | 8 × 50 |
| ☐ | 14 | **babyballet** Bristol (Leanne) and Bradley Stoke etc. (Emma) | 07715 340610 · 07395 805885 | about 200–300 | 1h | ~250 | Code each | 2 × 100 |
| ☐ | 15 | **Totally Toys**, Gloucester Rd | 0117 942 3833 | 200–400 in December | 1.25h | ~240 | Code / free | 100 + a stand |
| ☐ | 16 | **Bookshops**: Storysmith, Bookmarked, Bookhaus | 0117 953 7961 · 07498 538 858 · 0117 244 0326 | 300–600 (3 × 100–200) | 2h | ~225 | Free placement | 3 × 50 |
| ☐ | 17 | **Raised in Bristol**, 4 nurseries | 0800 048 7968 | about 200 | 1h | ~200 | Code / PTA-style | 200 |
| ☐ | 18 | **Tiny Town Play Café**, Kingswood | hello@tinytownplaycafe.co.uk | 200–300 | 1.25h | ~200 | Code | 100 |
| ☐ | 19 | **Armstrong & North Opticians**: via the Shirehampton practice | Shirehampton, 12 High St (walk in) | 270–450 (9 × 30–50) | 2h | ~180 | Code | 9 × 30 |
| ☐ | 20 | **Kiln Workshop**: collections in early December | 0117 942 0470 · kilnworkshop@gmail.com | 80–150 | 45 min | ~150 | Code | 100 |

**Total:** about 3,000 leaflets, plus 4–6 counter stands. That's within one 2,500–5,000 A6 print run (Part 1: about
£22–£30 per 500 from instantprint).

**If you only have two hours tomorrow:** ring 1, 2, 4 and 5, and email 7 and 12 the template with the leaflet picture.

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
- **Part 2 gaps:**
  - No venue publishes weekly footfall, so every reach figure is an estimate. Bristol library visit figures sit in a
    council data pack that blocked automated reading.
  - Magna and Armstrong & North head-office contacts weren't found.
  - Not checked: who runs Co-op boards since 2024, and Lidl and Aldi.
  - South Glos children's-centre contacts weren't found (the council pages returned errors).
  - Whether The Shire takes loose inserts, and its price.
  - Insert prices for the Voice magazines.
  - Private distributors' lead times.
  - Contacts for Playful Café, Skyboat Café and The Play Shed.
  - Whether EK Hair and iPlay are still trading.
- **Section 5 gaps:**
  - Jo Jingles' timetable comes from her own booking page, but Happity says nothing is scheduled. Text her before you
    drive out.
  - Tumble Tots and Tiny Talk pages were broken. Hartbeeps, Monkey Music and Happity blocked reading.
  - No phone number is published for St Werburghs or Bristol Forest School, and there's no stall-booking route for the
    St Werburghs fair.
  - Lawrence Weston Farm's office@ email comes from its job pack, and the charity register shows a staff member's
    address instead.
  - Ethel's Case, Cairns Road Café, Kate Kirkby Photography, Sky and Fizz all rest on listings that are 2–7 years old.
  - Playfull Toyshop's closing date has no year attached.
- The detailed research notes behind this sheet (with every source link) are in this session's scratchpad. They
  aren't part of the repository.
