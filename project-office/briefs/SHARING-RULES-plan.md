# Who sees what: the new sharing rules (plan for founder sign-off)

**Status:** **approved by the founder, 10 Nov 2026** ("yes, build it"), with these answers (recorded as **D27**):
- **A. "Only me" on a little one's keepsake someone else added** → the person who added it **and the child's parent**.
- **B. Can the parent undo their own narrowing?** → **yes**, back up to what the person who added it chose, never wider.
- **C. Links we can't tie to one person** (copy / WhatsApp / text) → **you pick "who's it for: home / family / extended"**
  (extended pre-picked). **Draw app ready-to-buy links show extended-level keepsakes only.**

Branch `claude/sharing-rules-afcef8`.

---

## 1. The circles, in plain words

| Circle | Who's in it | Sees keepsakes marked… |
|---|---|---|
| **home** *(new)* | the family leader, their partner / co-parent, grown-up children | home · family · extended |
| **family** | whoever the leader puts here (e.g. close grandparents) | family · extended |
| **extended** | grandparents, aunts, uncles, friends (the usual default) | extended only |

And every keepsake has one of four settings, narrowest first: **only me < home < family < extended.** New keepsakes still
start at **family** (privacy by default). Nothing is ever public.

- The family leader always counts as home.
- Little ones are still never accounts and never invited.
- Only a **parent** or a **grown-up child** can be in home. Everyone else can be family or extended.
- Sharing is always person to person. A grant goes to one account; nobody in that person's own family gets anything through them.

## 2. Who decides a keepsake's setting

- **Whoever added it decides** who sees it, any of the four settings. This holds even when that person isn't the family leader.
- **Anything filed under a little one:** that child's parent can always make it **more private** or **take it off**, but never wider.
  When the parent narrows it, that becomes a ceiling: the person who added it can move it anywhere **at or under** the parent's choice.
- **Always see it, whatever the setting:** the person who added it and, for a little one's keepsake, that child's parent.
  The parent can never be shut out of their own child's things.
- **"Only me"** means just the person who added it. On a little one's keepsake it means them **and the child's parent** (question A).
- **Delete:** the person who added it, or the child's parent.
- **Edit the look / order it:** as today: you must be able to see it, plus be the adder, the child's parent, or have "buy" / "add" access.

## 3. Joining: a short "yes" instead of a silent join

Today the join page accepts the moment you've proved your email. Instead it will show one card with a button.

**Joining home**
> ### join the Hartleys' home
> home is the closest circle: you'll see what's shared with home, family and extended.
> by joining, you're happy for **Sam** to look after the family's keepsakes and details (they're the grown-up responsible for them).
> anything you add stays yours to share, or not. you can leave any time.
>
> **[ yes, join the home ]**  ·  not now

**Joining family / extended**
> ### join the Hartley family
> you'll see the keepsakes Sam shares with the **family circle** *(or: extended family)*.
> Sam looks after the family's keepsakes and details. anything you add, you choose who sees. you can leave any time.
>
> **[ yes, join the family ]**  ·  not now

We store the yes (when, and which wording) on the membership.

**Moving someone into home later:** they get the same "yes" card first. They stay where they are until they tap it.
Moving someone *out* of home (narrower) takes effect at once.

## 4. Inviting: pick the circle yourself

The add-member sheet keeps its relationship chips and adds **Grown-up child**. Below them sits a new row,
**"which circle?"**: home · family · extended. It's pre-picked from the relationship (Parent and Grown-up child → home;
grandparent, aunt / uncle, friend, other → extended), and you can change it. Home appears only for a parent or a grown-up child.
The server checks the choice; it's never trusted from the form.

The pinboard's **home** row ("you and the little ones") now also holds the partner and grown-up children who joined home.

## 5. Visibility sheet (every place a setting is picked)

> **Who can see this keepsake?**
> ○ **only me**: private to you *(on a child's keepsake someone else added: "just you and Sam")*
> ○ **home**: you, Sam and the grown-ups at home
> ● **family**: home and the family circle
> ○ **extended family**: everyone you've invited, grandparents too
>
> *New keepsakes start as family. Nothing is ever public.*

**When you're the little one's parent but didn't add it:** the wider options are greyed out, with the note
"Granny added this. you can make it more private, or take it off."

## 6. Occasions: "whose day is it?"

The add-an-occasion sheet gets a new first question:

> **whose day is it?**
> [ mine / ours ]  [ someone else's ]
>
> *someone else's: "kept to your home. it's their day to share, not ours."*

- **Mine / ours** (the leader, partner, the family's own little ones: our anniversary, a baby shower): **who sees it** can be
  home · home + family · everyone (+ extended).
- **Someone else's** (a brother-in-law, a friend): **home only, and the wider choices aren't offered at all.** The server enforces it too.
- **Members add their own days.** A relative in your family sees "add your birthday to the Hartleys' calendar" and picks who sees it.
  Sharing your own day is your own consent. People who aren't in home can only add their own days.
- **What travels:** a first name plus the day and month. No year, and no "turns 40" / "10th anniversary" line for anyone outside home.
- **Who changes it:** whoever added it. The family leader can always make it more private or take it off.
- **Reminders** follow exactly the same rule (they already reuse it).

## 7. Ready-to-buy links: one per person

The flow turns around: **pick the keepsakes → pick the people → we make a separate link for each person**, sent only to them.

- Each link shows only what **that person's circle** may see. If a pick is too private for someone, the sheet says so before sending
  ("Granny won't see 2 of these: they're home-only").
- Family members: their link follows their circle, checked again every time it's opened (moved or removed → it shrinks or stops).
- Someone not in the family yet: the circle you'd invite them to (or extended if you don't invite them).
- Opening a link still needs no sign-in. The "join family & checkout" invite inside each link is bound to that person's email.
- Each link can be **switched off on its own**. Switching off Granny's leaves Grandad's working. "Switch them all off" is there too.
- A **forwarded** link still shows only what its *original* person's circle may see.
- **Copy link / WhatsApp / text** (we can't know who'll open it) and **the app's "share a ready-to-buy link"**: see question C.
- **Links already out there** keep working until they expire (14 days), but show **extended-level keepsakes only**, because we can't know who holds them.

## 8. Other gaps closed

- **Profile pictures and headers** count as a **family-level** picture in each family you share: home and family circles
  see them; extended relatives see initials. You always see your own. The family banner stays visible to the whole family, as now.
- **Snickerdoodle Draw (birthdays sync):** the app only gets the dates the leader can see. Dates added from the app land as
  **someone else's, home only**; the leader can mark one "ours" and widen it on the website. The app can never change who sees a date.
  It can only change dates the leader added, though it can take any date off. **The contract stays v1-compatible:** same fields, nothing removed.
  The Draw app needs no code change, only a line of wording ("these stay in your home unless you share them on the website") and a contract note.
- **Invite-time circle choice:** §4.

## 9. What changes for data already there (all on the private side)

- **Partners already in the family circle** stay there. Nobody is moved into home without their own yes.
- **Little ones' keepsakes a relative added:** the parent's current setting becomes the ceiling. The relative can narrow it but never widen past what the parent chose.
  *One widening:* a relative who added a keepsake the parent set to "only me" will now see their own upload again. Probably zero
  of these exist on the live site; the founder can check with `select count(*) from assets where child_subject_id is not null and uploader_account_id <> controller_account_id and visibility = 'ONLY_ME';`.
- **Existing occasions:** a little one's day, or a day someone added for themselves (or for the leader / partner), stays
  **ours**. Everything else becomes **someone else's (home only)**. The leader can re-mark any as ours in one tap.
- **Old shared gift links:** §7.

## 10. Under the hood (for the build)

- Migration **0055_sharing_rules**: add `HOME` to `visibility_tier` and `family_circle`, and `ADULT_CHILD` to `relationship`.
  Add `assets.parent_limit`, the `occasion_whose` enum + `occasions.whose`, and `gift_links.recipient_email` / `recipient_account_id` / `audience_circle` / `batch_id`.
  Add `memberships.join_consent_version` / `join_consented_at`, and `invites.membership_id` (the "move into home" invite).
  The new enum values aren't used inside the migration itself (Postgres rule). Someone-else's days are held to home in authz, not just in data.
- All rules live in `src/authz` (`canViewAsset`, `canSetAssetVisibility(asset, viewer, next)`, occasions, gift-link audience, profile pictures).
  The test matrix becomes tier × circle × access × actor with home in it, and covers:
  - the adder vs. child-parent narrow-only rule;
  - someone-else's days staying home-only;
  - per-person links (forwarded A shows only A's view; revoking A leaves B);
  - cross-family deny.
- Also updated: both privacy notices, CLAUDE.md's authorization bullet, DECISIONS.md (D27), and the whose-day brief.
- Checked at phone width (~390px) and desktop before calling it done.
