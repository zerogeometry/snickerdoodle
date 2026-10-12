# The Keepsake Home & account — UX/UI strategy (2026-07-10)

> How the Keepsake Home + the user's account become a *wonderful place to be* — where a mum feels
> she's leading and helping her family and extended family connect, bring smiles to each other, get
> closer, and celebrate family through their creations. Synthesised from a 5-pillar design panel +
> an adversarial brand-guardian. Everything below builds on the system already shipped (circles,
> access, invites, gift-links, controller model) and holds every non-negotiable.

## The one reframe (north star)
**From a filing cabinet she administers → a hearth she tends.**
Today the Home is a private *gallery*: keepsakes filed in each child's corner, a member strip, a
gift-list CTA. It's lovely but static. The shift is not new mechanics — it's a new *felt role*: the
mum is not a "controller" setting "permissions." She is the **keeper of the family's warmth** — the
one holding everyone together, who gathers her people and keeps the little ones' magic safe. Every
control she already has (circles, access, invites, visibility, removal) is re-dressed as an **act of
care**, not admin. *Trust is shown through control* — so make control *feel like love*.

## The emotional engine — the "warmth loop"
The whole thing runs on one loop, around the child's creations:
1. **The mum opens a door** — she chooses who's in the circle and what's shared (control-as-care).
2. **The family delights, by name** — gran leaves a warm reaction (and later a note) on a drawing.
3. **It reflects back to the mum** — her Home quietly shows "gran loved this," so she *feels* the
   closeness she made — and she relays it to the child as a little ceremony ("look what gran said!").
Closeness comes from **being seen, by name, by people who love you** — a heart from a gran the child
can name carries weight a thousand anonymous likes never could. Warmth flows *both ways*, and the mum
is the joyful conductor of it.

## The bright lines (the moat — non-negotiable)
These are what make it a hearth and not a family Facebook. Every feature must pass them:
- **Never a number.** No counts, tallies, "most-loved," streaks, leaderboards, badges, or
  last-seen/active status. Warmth is shown as **named faces** ("gran, grandpa loved this"), never a
  metric. *Litmus test: could this make a family member feel measured, ranked, or behind? Then it's out.*
- **No algorithmic feed.** Organise by **child and by occasion**, never by recency. No infinite scroll.
- **The system does the celebrating, not the mum.** Auto-surfaced time/growth + occasions mean
  closeness accrues with **zero upkeep** — she is never the unpaid moderator, community-manager, or
  help-desk. *If a feature adds a recurring task to her week, it has failed the brief.*
- **Inbound is pre-safe by construction.** A fixed reaction set has nothing to moderate. Free text is
  deferred until screening + controller-removal + circle-inheritance are proven — and even then it's
  *addressed to family*, never a threaded comment stage.
- **Every artifact inherits the asset's circle** (via `canViewAsset`) and can never widen it; is
  **controller-removable**; and a removed member's warmth vanishes on removal. Notifications leak
  nothing — no child image, minimal/no name, no sensitive context on a lock screen.
- **Warm when she's alone in it.** Warmth comes from the *creations* and the *child's growth*, not
  other people's activity. **Never render a zero** ("0 loved this"). Empty/quiet states are warm,
  complete moments, not deficits. Grandparents are *receive-first* (email/print digest) so she never
  chases anyone.

## The five pillars (one system)
1. **The Matriarch — leadership made joyful.** Language + a private, controller-only "keeper's note"
   layer that reflects her stewardship back ("you're the one holding this together"; "24 kept, all
   safe with you") and hands her *one* gentle, one-tap act of generosity at a time. Reskin: "who's
   gathered round," "welcome someone in," "pull up a chair for gran," warm visibility subtitles
   ("just for you" / "the whole family" / "everyone who loves them"). No mechanic changes.
2. **Connection & delight loops.** A cosy, no-metrics way for family to bless a keepsake — warm
   reaction stamps shown as named faces, and (later) short Caveat notes — that flow to the mum, who
   relays them to the child as a ceremony ("look what gran said!"), then sends a one-tap "mia loved
   that!" back so the giver feels received. Gated by `canViewAsset`; notes screened + parent-gated
   before they ever reach the child.
3. **The extended family's experience.** A real "you're in the circle" home for an invited gran/aunt
   (not a dead gift-link): scoped by authz to exactly what their circle sees; react, "pop it on my
   fridge" (a private saved set), "order one for your own wall" (reuse checkout), and — only with
   CONTRIBUTE — "add one of yours" (their own creation, lands FAMILY, parent still moderates). Their
   warmth reflects onto the mum's Home. Unlocked by one new primitive: a **family switcher**.
4. **The living archive (time & growth).** Turn the pile into a living story: a `grid | story` toggle
   per corner with season/year bands and **age-at-the-time captions** ("she was 2 years, 4 months
   here"), a gentle cadence-capped "a year ago today" look-back, and an annual "the year in mia's
   corner." This is **system-generated warmth that needs no one else** — it solves cold-start and
   burden at once. All auto-derived from dates already in the DB.
5. **Celebration & occasions.** A creation becomes a *message*: "made for gran" (a `dedicatedTo`
   label of intent, not an access grant) with a reveal on the recipient's gift-link page ("ada made
   this just for you ♥"); a capped "coming up" rail from members' day+month birthdays that gently
   deep-links into making a card; and a gentle in-family gift economy ("send a little something") —
   all on the existing gift-link + circles.

## Information architecture (no new top-level tab)
It all lives inside the existing **Home · Create · Family · Orders**:
- **Home = the hearth.** Keeper's welcome + one keeper's note · "who's gathered round" (circle) ·
  each child's corner with `grid|story`, warmth (named faces) + dedication ribbons · a "coming up"
  occasion rail · a "look back" card · the gift list.
- **Family switcher** (own family / families you're joined into) — the single new primitive; it turns
  the gift-link recipient into a member with a real home.
- **Member home** (gran's view) = the same Home, scoped by authz, controls hidden, react/fridge/
  buy/contribute affordances.
- **Account** = "families you're in" (read-only circle/access chips + leave) · your shared birthday
  (day+month only, opt-in) · resurfacing + notification preferences · data rights (as today).

## Build order (cheap, safe warmth first)
- **Phase 0 — Reskin to the hearth (copy only, ~zero backend).** Relabel to keeper/hosting language
  across Home, the invite modal, the visibility tiers, /family, /account. Shifts the entire *tone*
  from filing cabinet to hearth for almost nothing. Do this first.
- **Phase 1 — System warmth + the extended-family home + one safe reaction** (the guardian's
  "build first"): the `grid|story` toggle + age labels + one auto "a year ago today" card (account
  on/off); the **family switcher + member home** (`loadHomeFor(familyId)`, controls hidden) + a
  single ❤ reaction shown as **named faces** to the creator + "order one for your own wall" + account
  "families you're in." → the mum feels her family smiling at the creations *and* the child growing,
  at the lowest possible risk. Pure liveness, no moderation surface.
- **Phase 2 — Warmth in words + relay + celebration loop:** screened handwritten notes + the
  "show the child" relay ceremony + reciprocal "mia loved that!"; dedication ("made for gran") + the
  "coming up" rail + the recipient reveal; My Fridge; CONTRIBUTE "add one of yours"; opt-in weekly
  digest.
- **Phase 3 — Rich archive + gift economy:** memory captions + "first scribble" pin + growth ribbon +
  the full story route + the annual "year in the corner" (with the tasteful "make it real" tie into a
  future book/calendar); the in-family gift economy ("send a little something," surprise-safe, one
  transactional note to mum); grandparent "ask for a drawing" routed to the parent; seasonal moments.

## New data (minimal, introduced by phase)
Phase 1: a per-account resurfacing "seen/dismissed" record; a `reactions` table (asset × member ×
fixed stamp). Phase 2: `keepsake_notes` (screened, first-name-only, controller-removable);
`dedicatedToMembershipId` on the creation; member `birthdayDayMonth` (opt-in). Phase 3: asset
`memoryCaption` + `firstScribble` pin. New audit events: REACTION_ADDED / NOTE_ADDED, alongside the
existing invite/join/visibility/removal logs. All connection artifacts pass through `canViewAsset`
and the existing `textSafety` screen; nothing bypasses `src/authz`.

## One decision to flag (stop-and-ask, touches retention)
When a parent removes a member, their past reactions/notes should **hide instantly** (they already
lose access). But do we **retain them (hidden) for audit**, or **crypto-shred** them? This touches
the retention schedule and the child-data rules — a founder call before we build notes (Phase 2).

## The gift-concierge engine (the brain under Celebration)
The apex of Celebration: instead of "gran's birthday is coming → go make a card," the home says
**"we've made something for gran's birthday — [finished preview]. send it?"** A precision
recommendation + auto-composition engine that presents a *pre-customised, finished* product. It is
not a new feature bolted on — it is the **intelligence layer under Celebration**, fed by the other
pillars. Two layers, sequenced:

- **A) The deterministic engine (build this — no AI, no new safety surface).** For a (recipient ×
  occasion) it selects the best **creation × product × variant × placement**, auto-composes a REAL
  preview (reusing the compositor + the improved bg-removal), and presents it as done. It uses the
  child's OWN art (already the input) + signals we already hold/accrue — no generation required. This
  is ~90% of the magic and it rides the spine.
- **B) The generative layer (Phase 3, gated).** Stylising *uploaded imagery of the recipient/child*
  (the founder's "images of Naomi") is generative AI on a (possibly child's) face — the same
  no-retention / no-training / consent / re-screen gate as the personalised-book plan. Powerful, but
  the whole engine must NOT be gated on it; it's the later upgrade, not the launch.

### The bright lines (this is the whole ballgame)
- **Concierge, never upsell.** It must feel like a thoughtful gift the app *made for her*, never a
  sales pitch. She always keeps control: **keep it · tweak it · never mind.** Rare, high-precision,
  dismissible, opt-out-able — never a nag, never an "engagement" ping. (Same test as the whole home:
  if it adds a task or pressures a purchase, it's failed.)
- **Never profile or target the CHILD.** Constitution: no profiling of children, no behavioural ads
  to/about children. The engine targets the **adult buyer/recipient** using the family's own data;
  the child is the **creator** (their art is an input), never a behavioural profile or an ad target.
- **Precision over recall.** A mediocre auto-recommendation is *negative* value — it reads as spam and
  cheapens the brand. Fire only on a STRONG signal. Start with the "obvious perfect" case (the child
  dedicated a drawing "for gran" + gran's birthday is near = present it, done) and widen as
  confidence grows.
- **The warmth loop IS the preference engine.** What gran *fridged*/loved, what the child
  *dedicated*, past orders, season — those already-collected signals ARE the "preferences." So
  Connection + Archive + Orders feed the engine; no external data, no covert tracking, no inferred
  sensitive traits. Cold-start is intentionally quiet and warms as data accrues.
- **Minimise + consent + DPIA.** Only opt-in day/month birthdays, order history, in-app warmth
  signals. Any automated targeting of people + any child-data processing needs a DPIA note; the
  generative layer needs the full Phase-3 AI gates.

### Architecture
Signals (occasions · creations + dedications · orders · reactions/fridge · season) → candidate
generator + **scorer** (rule-based first, ML later): pick the top (creation × product × variant ×
placement) tuple → **auto-composer** (existing compositor + placement + bg-removal) renders the
finished preview → **presentation** = a gentle "we made this for {recipient}" card in the Home
occasion rail (and later an opt-in email that *arrives like a gift*) with keep/tweak/never-mind →
**guardrails** (precision threshold, frequency cap, controller-only, no child profiling, opt-out).

### Phasing
- **P1 (with Celebration):** the "obvious perfect" recommendation only — a *dedicated* drawing + a
  near occasion → auto-composed card/print, "we made this for gran." Deterministic, high-precision.
- **P2:** broaden signals (fridge/reactions/orders/season) + a real scorer; offer 1–2 candidates;
  recipient's own colour/preference; the opt-in "arrives like a gift" email (PECR consent, warm tone).
- **P3:** the generative personalisation layer (recipient/child stylisation), behind the full AI /
  child-data gates.

## Why this wins
It gives the mum the one thing family life at a distance can't: **proof that her people showed up for
her child** — by name, on the days that matter — and it makes her the beloved centre of that, with no
chores. It's the emotional opposite of a social network, which is exactly the brand. And it's almost
entirely *presentation + language + a couple of small, authz-respecting tables* over the trust spine
you've already built — so it's buildable, warm, and safe from Phase 0.
