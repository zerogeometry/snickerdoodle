# Snickerdoodle Draw ↔ website: the website side (built 9 Nov 2026)

> Builds Phase 1 + 2 of `COMPANION-APP-api-plan.md` to the app's contract (`snickerdoodle-draw/docs/API_CONTRACT.md` v3).
> Branch `feat/draw-app-link`. Code: `src/server/app/`, `src/app/api/app/v1/`, `src/app/app/`.

## What a parent sees

1. **In the app** (grown-ups' corner): "link to snickerdoodle". The phone's browser opens **/app/connect**.
2. **Sign in or sign up** with the usual magic link. A brand-new grown-up gets their keepsake box made here.
3. **"connect snickerdoodle draw?"**: what the app can and can't do, which family (if they run more
   than one), and which little ones draw on this phone (all ticked by default). Then **connect** / **not now**.
4. Back in the app it says "linked ✓". From then on, **keep it** and **make it real** work.
5. **Account page → snickerdoodle draw**: each linked phone with an **unlink** button, or a "link
   snickerdoodle draw" button (→ **/app/link**, which opens the app on a phone, or shows the three steps on a computer).

## The rules it enforces

- Only the family's **owner** can link. Anyone else is told to "ask the grown-up who runs your family".
- The phone's key covers **one family**, and only the ticked children (plus any added in the app).
  It can't read the rest of the keepsake box, the members or any email. It can only delete what the app sent.
- The key stops **immediately** on unlink (app or account page), owner handover, member removal,
  account closure, or 90 days unused. It's re-checked on every call.
- **No prices** cross to the app. "Make it real" opens the website's maker with a single-use,
  15-minute pass that only works for the same grown-up, signed in. It is never a sign-in on its own.
- Uploads go through the website's normal path: EXIF stripped, private bucket, FAMILY visibility,
  kept, safety checks run in the background (D26). The app is never told "flagged".
- **Uploads are OFF** unless `DRAW_APP_UPLOADS=on` (Children's Code gate, alongside the app's own switch).
- Audit trail: `APP_LINKED`, `APP_UNLINKED` (with the reason). Linked phones appear in "download my data".
  The hourly retention job clears old codes, used passes and long-revoked keys.

## Deliberately not built (waiting on decisions)

| App asks for | Why not yet |
|---|---|
| Progress backup (`/artists/{id}/progress`) | Behavioural data about a child, not in the DPIA (plan M4/Phase 3). GET says "none", PUT says "not yet". |
| `familyBirthdays` on `/me` | Founder decision 20 Oct: no dates for other relatives. The app's contract still asks for it, so the two need settling. |
| Background removal endpoint | The app no longer calls it (contract note 3). |
| The drawing's `title` | Not stored. We don't need it (minimisation). |
| A QR code on /app/link | No QR library in the project yet. |

## Settings (see `.env.example`)

`DRAW_APP_UPLOADS`, `DRAW_ANDROID_CERT_SHA256`, `DRAW_APPLE_TEAM_ID`, `DRAW_APP_STORE_URL`, `DRAW_PLAY_STORE_URL`.

## Tests

`src/server/app/__tests__/link.test.ts` (PKCE, the connect-request checks, helpers) and
`src/server/__tests__/drawAppLink.int.test.ts` (the key's allow/deny matrix, uploads, deletes,
make-it-real passes, handover/closure). Migration `0052_draw_app_link`.
