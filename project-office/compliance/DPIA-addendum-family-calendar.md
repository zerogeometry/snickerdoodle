# DPIA addendum — the family calendar, occasions and "the days we celebrate"

> Draft for the founder's sign-off · 27 Oct 2026 · extends `DPIA-draft.md` (PA-09 / PA-10).
> Status: **draft** — must be signed off, and the privacy-notice wording
> (`PRIVACY-NOTICE-family-calendar-draft.md`) published, before launch (LAUNCH-GATES).

## What changed

| ID | Processing | Data | Who sees it | Code |
|---|---|---|---|---|
| PA-09 (updated) | **Family calendar** | Children's birthdays (as before) **plus** occasions and festival days | The family owner; members the owner shared the calendar with (`memberships.sees_occasions`), each occasion only at the circle it's shared with (FAMILY by default, EXTENDED if widened). Other families' members only where they hold an ACTIVE membership of this family. | `src/authz/occasions.ts` (unit-tested matrix), `src/server/occasions/` |
| PA-11 (new) | **Occasions** | A title (≤ 60 chars, abuse-screened), a kind (birthday / anniversary / milestone / other), a date (year optional), whether it follows a lunar calendar, optionally who it's for (a child or a member of the family), the circle it's shared with, who added it. May be about someone who isn't a user ("granny and grandad's anniversary"). | As PA-09. Never a picture. | `occasions` table (migration 0047) |
| PA-12 (new) | **"The days we celebrate"** | One family-level list of festival groups (e.g. "Muslim festivals", "Chinese New Year and Mid-Autumn", "Buddhist festivals"). Individual festivals are not stored. | As PA-09. | `families.celebrate`; `src/lib/occasions/catalogue.ts` |
| PA-13 (new) | **Lunar birthdays** | A flag on a child's birthday: kept on the Chinese or Korean lunar calendar. No new personal data (the birth date was already held). | As PA-09. | `children.birthday_lunar` |
| PA-10 (updated) | **Reminders** | Now for **every** occasion the recipient may see (children's birthdays, occasions, festivals, baby milestones), **a month before and two weeks before** (founder, 27 Oct), sent as one digest, at most one email per recipient every 2 days. **Each recipient's own REMINDERS/EMAIL consent**, as before. | Recipient only. | `src/server/reminders/` (planner unit-tested) |

## Special-category data (Art 9) — PA-12

A family's choice of religious festivals can reveal **religious belief**, and a choice of cultural festivals
(e.g. Lunar New Year, Diwali) can hint at **racial or ethnic origin**. We treat the whole of PA-12 as
special-category data.

- **Art 6 basis:** contract — the calendar the user asked for.
- **Art 9 condition:** **explicit consent** (Art 9(2)(a)). The parent ticks each group themselves (nothing
  religious is pre-ticked except Christmas, which is on by default for its gifting role and can be
  unticked). The settings card says what the choice is for ("only ever used to put these days on your
  calendar. never for anything else"); the privacy notice says it plainly. Unticking withdraws it at once.
- **Minimisation:** groups only, never individual festivals; never inferred (no guessing from names,
  drawings, orders or location); one setting per family, not per person.
- **Purpose limitation (hard rule):** used only to (a) show those days on the family's own calendar and
  (b) include them in the reminders the family's members have each consented to. **Never** used for
  marketing, segmentation, recommendations, product targeting, analytics or anything shared outside the
  family. Not exported to any processor beyond the reminder email itself.
- **Disclosure:** a reminder email names the festival ("Diwali — in two weeks") only to a member of that
  family who can already see its calendar and has consented to reminders.
- **Retention:** kept while the family exists; deleted with the family (cascade). Changing the setting
  overwrites it (no history kept).

## Other notes

- **Occasions about non-users** (e.g. grandparents not on Snickerdoodle): a name and a date, entered by
  a family member for the family's own use — household-like, minimal, visible only inside the family.
  Basis: legitimate interests (keeping a family's important dates), balanced by minimisation (no contact
  details, no picture) and family-only visibility. Deleted with the occasion or the family.
- **Children:** no new child data; occasions may name a child's milestone ("Olivia's 100 days"). First
  names only, as everywhere.
- **Lunar calendars** use a bundled open-source library (`lunar-javascript`, MIT) and the runtime's own
  calendars — no external service, nothing leaves the box.

## Risk register additions

| ID | Risk | Likelihood | Impact | Controls | Residual |
|---|---|---|---|---|---|
| R-CAL-1 | Religion / ethnicity inferred from "the days we celebrate" and misused (marketing, segmentation, profiling) | Low | Medium | Hard purpose limitation in code + this DPIA; no marketing system reads `families.celebrate`; privacy notice; explicit opt-in per group | Low |
| R-CAL-2 | An occasion shown to someone the parent didn't intend | Low | Low–Medium | Central authz (`canSeeOccasion`), FAMILY default, owner-only calendar sharing, tests across circles and families | Low |
| R-CAL-3 | Too many reminder emails (nuisance; PECR) | Low | Low | Own consent per recipient; two nudges per occasion; digest; 2-day cap; one-tap off | Low |

## Open actions

1. **Publish the privacy-notice wording** (`PRIVACY-NOTICE-family-calendar-draft.md`) — before launch.
2. ~~Audit entry when "the days we celebrate" changes~~ — **done**: `CONSENT_CHANGED` / `family_celebrate`,
   recording only that it changed and how many groups are on (never which).
3. Hindu and Sikh festival dates are a checked table up to 2028 — refresh it yearly (a later year simply
   doesn't show until it's checked).

## Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Founder / controller | | | |
