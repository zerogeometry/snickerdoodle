# Occasions: "Home" visibility, and never sharing someone else's day without them

**Status:** **decided and built — founder, 10 Nov 2026 (D27).** First raised the same day as a parked request; the
founder then made the decisions below. The full who-sees-what plan is `SHARING-RULES-plan.md`.

## The founder's words
> Currently when I add an occasion I have options to give visibility to Family Circle or Extended Family. I think there,
> and everywhere where there are visibility settings, we should be able to limit visibility to Home as well.
>
> My issue with occasions currently, is that I could add to my occasions "Brother-in-laws birthday" and if I grant
> extended family access to my sister-in-law on the other side of the family, I'm handing his information over to her
> without his consent. I could even enter a friend's birthday or something more personal for my own personal reminders.
> How do I avoid sharing that with a third party whilst reminding the third party of my anniversary or baby shower? How
> do we manage the right balance of sharing events with the people you want to so they're kept up to date with
> birthdays, etc., without being able to share events about other non-consenting third parties?

## The problem
Who saw an occasion was decided by the *viewer's* circle, not by *whose day it is*. A parent could put a third party's
personal data (a brother-in-law's birthday, a friend's) in front of other relatives who never had it. Keeping it for
your own reminders is household use; sharing it on is where that person's consent matters (UK GDPR; Children's Code
minimisation applies to the children's dates).

## Decided (D27)
1. **A Home tier on every visibility choice** (occasions, keepsakes, wherever a tier is picked): the family leader,
   partner / co-parent and grown-up children. Tiers nest home < family < extended (`src/authz/tiers.ts`).
2. **"Whose day is it?"** is the first question when adding an occasion:
   - **mine / ours** (the leader, partner, the family's own little ones — our anniversary, a baby shower): shared at
     home, home + family, or everyone.
   - **someone else's** (a brother-in-law, a friend): **home only, and the wider choices aren't offered at all.** The
     server holds it at home whatever is sent (`effectiveOccasionShare`), so a forged or old row can't widen it.
3. **Members add their own days** (their birthday) to a family they've joined — from "my families" on the Family page —
   and choose who sees them: sharing your own day is your own consent. People outside home can only add their own days.
   Whoever adds a day changes it; the family leader can always make someone's day more private or take it off.
4. **Minimal when shared:** beyond home (and whoever added it), a date carries the first name, the day and the month —
   no year, and no "turns 40" / "10th anniversary" line that gives one away. No private notes exist.
5. **Draw sync:** the app lists only the dates its grown-up may see; dates added from the app land as **someone else's,
   home only** (the app's list is mostly relatives' birthdays) until the grown-up marks one "ours" on the website; a
   change from the app keeps whose day it is and who sees it exactly as they were; the app may only change dates its
   grown-up added (`403 not-yours` otherwise) but can take any off. Contract shapes unchanged.

## Existing dates (migration 0055)
A little one's day, a day someone added for themselves, or one for the family leader or a parent in the family stays
"ours". Everything else became **someone else's (home only)** — the private side. The leader can re-mark any as ours.

## Built in
`src/authz/occasions.ts` (+ tests), `src/server/occasions`, `src/app/family/OccasionSheet.tsx`, "my families" on
/family, reminders (same rule), `src/server/app/occasions.ts`, both privacy notices.

## Still to do (outside this repo)
- DPIA addendum / Children's Code assessment: note the whose-day rule and the home-only default for third parties (A-61).
- Snickerdoodle Draw: one line of wording in the birthdays list ("these stay in your home unless you share them on the
  website"), and handle `403 not-yours` on an edit like a 422 (take the website's version). See `docs/API_CONTRACT.md`.
