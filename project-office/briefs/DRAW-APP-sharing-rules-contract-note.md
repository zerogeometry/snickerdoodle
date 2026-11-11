# Snickerdoodle Draw: what D27 (who sees what) changes for the app

**For:** the Draw repo (`C:\Users\Simon\dev\snickerdoodle-draw`, `docs/API_CONTRACT.md` v4). **From:** website branch
`claude/sharing-rules-afcef8`, founder decisions of 10 Nov 2026 (D27, `project-office/DECISIONS.md`).

**The contract stays v1 / v4-compatible.** No endpoint, field or shape changed; nothing was removed. The app needs no
code change to keep working. Two new answers and two pieces of wording are worth adding.

## What the website now does
- `GET /occasions` lists only the dates the linked grown-up (the family lead) may see. In practice that's every date
  in their family, so the list looks the same.
- `POST /occasions`: the new date is stored as **someone else's day, seen by home only** (the leader, a partner,
  grown-up children). The app's birthdays list is mostly relatives' birthdays, and those are theirs to share. On the
  website the grown-up can mark a date "ours" and share it wider. The response shape is unchanged.
- `PATCH /occasions/{id}` never changes whose day it is or who sees it. The app can't widen anything.
- `POST /wishes` ("share a ready-to-buy link"): we can't know who opens a link from the share sheet, so it shows only
  drawings shared with the **extended** family (founder answer C). A drawing kept to family, home or "only me" can't go
  on one.

## New answers the app should handle
| Call | New answer | What the app should do |
|---|---|---|
| `PATCH /occasions/{id}` | **403 `{ reason: 'not-yours' }`**: the date was added by someone else in the family (for example a relative's own birthday). The lead can take it off but not change it. | Treat it like a 422: take the website's version, and don't offer the edit again. |
| `POST /wishes` | **409 `{ reason: 'family-only' }`**: the drawing isn't shared with extended family. | Say so gently, e.g. "this drawing is just for your family for now. to send it to anyone, share it with your extended family on the website first." Don't retry. (`409 not-ready` still means "the safety check isn't done yet".) |

## Wording for the grown-ups' corner
- Birthdays list: "these stay in your home unless you share them on the website."
- Ready-to-buy link: "it shows only drawings you've shared with your extended family."

## Contract doc changes to make (v5)
Add the two rows above to the endpoint table's notes. Add one principle line: "who sees what is the website's to
decide (D27): app dates are home-only until the grown-up shares them; the app never widens a date or a drawing."
