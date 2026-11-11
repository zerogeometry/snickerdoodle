# 04 — Domain Model & Business Rules

> This describes the **problem domain and the invariants** you must honour — not a schema or a stack. Model it however you judge best, but these rules must hold. Centralise the visibility/permission logic in one tested place; never trust the client for visibility, price, or ownership.

## Core concepts (conceptual entities)

- **Family** — the workspace. Has a display name ("The Hartley Family"), an owner, members, children, assets, gift lists, occasions.
- **Member** (an adult account holder) + **Membership** — a person's link to a family, carrying their **relationship**, **circle**, **access level**, and status.
- **Child** — a keepsake **subject**, not an account. Has a name, optional birthday, optional avatar; belongs to a family; is managed by a parent.
- **Asset / Keepsake** — an uploaded drawing/photo (and its kept form). Has an uploader, an optional child subject, a preserved **original**, and a **visibility** tier.
- **Creation** — a Studio project derived from an asset (layers/edits, non-destructive), applied to products.
- **Product / Variant** — a catalogue item with a print specification (print area, required DPI, bleed) and fulfilment mapping.
- **Gift list** + **Gift link** — a curated set of items, and a shareable pre-filled-cart link with a token.
- **Order / line items** — a purchase (guest or member), gift metadata, and fulfilment status.
- **Occasion** — a dated event (birthday/standard/custom) per subject, driving reminders.
- **Invite** — a pending, parent-initiated invitation to join a family.
- **Audit record** — a log of access-relevant events.

## Business rules (invariants)

### Visibility tiers
`ONLY_ME | HOME | FAMILY | EXTENDED`, nesting outward (D27, founder 10 Nov 2026):
- **ONLY_ME** → whoever added it alone (on a child's keepsake someone else added: them **and the child's controlling parent**).
- **HOME** → those + members whose circle is **Home** (the family leader, partner / co-parent, grown-up children).
- **FAMILY** → + members whose circle is **Family**.
- **EXTENDED** → + Extended-circle members (everyone in the circle).

So a **Home** member sees Home, Family and Extended; a **Family**-circle member sees Family *and* Extended; an **Extended**-circle member sees **only** Extended. **New assets default to FAMILY.** Nothing is ever public. Sharing is person to person: a grant is to one account, never to that person's own family.

### Circles & relationship mapping
Each member has a **circle**: `Home | Family | Extended`. Relationship sets a default circle (Parent / Grown-up child → Home; Grandparent/Aunt-uncle/Close friend/Other → Extended), which the leader can change **at invite time** and later. **Home only for a parent or a grown-up child.** A little one (Child) is never invited. Relationship is **required** at invite time.

### Access levels
`VIEW` (see permitted keepsakes), `VIEW_BUY` (also buy from gift lists), `CONTRIBUTE` (also add their own). Access is orthogonal to circle (circle = what they can see; access = what they can do).

### Controller model
The parent/guardian is the **controller**. Children are subjects, not logins. The family leader manages members and can remove anyone (revoking access immediately). **Whoever adds a keepsake chooses who sees it** (D27). For anything filed under a child, the child's controlling parent can always make it **more private or remove it — never wider**; the adder and that parent always see it. Joining home means accepting that the family leader is responsible for the family's keepsakes and data.

### Invite & join lifecycle
Invites are **parent-initiated only** — there is no self-join. An invite carries email + relationship + circle (the leader's choice for that relationship) + access. The recipient **verifies their email** and **says yes on the join card** (D27), which creates a membership at the set circle/access. Moving someone into Home waits for their own yes. Email verification confirms identity; it does not replace parental authorisation. Removal revokes access immediately. Log invites, joins, access changes, removals.

### Gift-link lifecycle
A gift link **snapshots** chosen items (creation + product + variant + personalisation) so the recipient's cart is pre-filled. **One link per person** (D27): each is sent only to them, shows only what their circle may see (checked live), and is revocable on its own. The token is unguessable, non-indexed, **revocable, and expirable**. If the creator enabled **invite-to-family**, the recipient view offers **"join family & checkout"** (email → verify → membership at the link's circle/access, with the join saving applied); otherwise only guest checkout. Add-ons may be offered at checkout.

### Pricing & discounts
All prices, discounts, and totals are computed **server-side**; never trust client amounts. The join saving (e.g. **5%**) applies only via the join path. Add-ons are small and optional.

### Editing & originals
Editing is **non-destructive**; the untouched original is always recoverable. Deletion is **real and cascading** (original + derivatives + any provider-held copies).

### Print-readiness
For a chosen product, compute the effective DPI against the product's print area; if below the required threshold, surface a warning and offer the one-tap upscale. Don't let an under-resolution item proceed to fulfilment silently.

### Occasions & reminders
Occasions come from member/child birthdays (where given) + standard dates + custom. Reminders are **gentle, well-timed, frequency-capped**, and sent only on **consented** channels (PECR). Never spammy. They surface as "coming up" and deep-link into Create.

## Engineering invariants
- One central, **unit-tested** module owns "who can see / do what." Every asset read passes through it.
- Validate at every trust boundary; verify ownership and visibility server-side on every mutation.
- Treat children's images as the most sensitive data in the system.
