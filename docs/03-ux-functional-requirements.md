# 03 — UX & Functional Requirements

> What every screen, flow, and component must do. The HTML mockups are the visual reference; this doc is the behavioural contract. The Studio has its own full spec (`snickerdoodle-studio-functional-spec.md`) — this doc summarises its role and the mobile pattern, but that spec governs.

---

## Global requirements

**Information architecture / navigation**
- **Marketing surface (logged-out):** Landing, how-it-works, gifts, our story, public trust pages. Goal: reach "start creating".
- **App surface (logged-in):** the Family Keepsake Home is the hub. Nav = **Home · Create · Family · Orders**. On mobile this is a **bottom tab bar**; the Studio is full-screen.
- **Gift-link surface (often logged-out):** the pre-filled cart recipient view; minimal chrome; opened from a shared link, usually on a phone.

**Responsive / mobile-first**
- Design mobile first. Primary action **pinned to the bottom thumb zone** on every action screen. 2-column product grids. Horizontal-scroll chip rows. No horizontal page overflow. Tap targets ≥44px.
- The Studio uses a distinct mobile pattern (full-bleed canvas, floating brush HUD, bottom sheets, scrolling tool bar).

**States (design all four for every list/async surface)**
- **Empty:** warm, inviting, first-time guidance (never a blank void).
- **Loading:** skeletons, progressive reveal — never a spinner wall blocking the screen.
- **Error:** plain, kind, recoverable.
- **Success:** clear confirmation.

**Accessibility:** semantic structure, labelled controls, keyboard operable, sufficient contrast, `prefers-reduced-motion` honoured, alt text on imagery.

**Motion:** restrained and meaningful (hero draw-in, product-morph, gentle CTA wobble). Never gratuitous; always reduced-motion safe.

**Content safety (behavioural — see `docs/05` content-moderation; decision D8)**
- **On upload:** every image is hash-checked (CSAM) and run through the moderation classifier **before** it can reach a print order. The common path is invisible (no friction). A **flagged** item enters an "under review" state — kind, non-accusatory copy ("we just need a quick look at this one"), never a cold rejection, and **never silently binned**. A confirmed-illegal match is handled by the back-end runbook, not surfaced as a normal error.
- **Report / takedown:** a one-tap "report this / something's wrong" affordance is present wherever a creation or gift link is viewed; it routes to a fast removal path wired to real deletion.
- **Copyright framing (S3-b):** Start Creating, Catalogue and Studio copy steer toward the child's **own original drawing** ("frame the wonky bits in gold"), with a plain, warm note that we can't make products of other people's characters or logos. The rights-warranty lives at the keep/checkout step, in brand voice — informative, not a legalistic wall.
- **Text fields** (Studio text, gift message, member name) screen for abuse and enforce **child first name only, never surname**.

---

## Screens

### 1. Landing
- **Purpose:** convert a cold visitor to "start creating".
- **Must contain:** hero (eyebrow, "Keep the magic" headline, sub, primary CTA, trust line, the morphing product showing one drawing across products); a "one drawing → 40+ products" range strip; a 3-step how-it-works; a closing CTA; footer. Scrollable; hero fills the first view.
- **Behaviours:** every "start creating" CTA (nav, hero, footer) is the cinnamon-orange primary and routes into Start Creating. Restrained hero/morph animation.
- **Mobile:** single column; primary CTA pinned to a bottom bar.
- **Acceptance:** a first-time visitor reaches Start Creating in one tap from any CTA; the page communicates "drawings → keepsakes" and "your stuff is private" without an account.

### 2. Start Creating (the wow moment)
- **Purpose:** deliver the magic *before* any sign-up — upload → instant product range.
- **Must contain:** upload affordance (file + camera); the uploaded drawing shown back with a reassurance line ("this stays yours"); the "made real" heading; a grid of the drawing previewed on several products with prices; CTAs to "see the full range" and "open in studio"; a gentle prompt to keep it (account) — but no wall before the wow.
- **Behaviours:** no account required to reach the range view. Auto-crop/deskew a photographed drawing. Keeping a creation prompts lightweight account creation.
- **Mobile:** 2-col preview grid; primary CTA pinned bottom.
- **Acceptance:** from upload, a user sees their drawing on multiple real products within seconds, with no forced sign-up first.

### 3. Catalogue
- **Purpose:** make "one drawing → a whole range" feel astonishing, and let users browse/apply.
- **Must contain:** the user's current artwork reference; category filters (cards & prints, home, wear, books, gifts); a rich product grid showing the drawing on each product with name + price; a clear "40+ products" framing.
- **Behaviours:** filtering by category; selecting a product opens its application/preview; the framing number reflects live SKU count.
- **Mobile:** 2-col grid; horizontal-scroll filter chips; bottom tab bar.
- **Acceptance:** from one saved drawing, the catalogue shows it across many products; a user can filter and open any product.

### 4. Studio (governed by the Studio functional spec)
- **Purpose:** create/edit a keepsake and apply it to products. The make-or-break creative core.
- **Naming / evolution (decision D9):** one Studio that **grows and improves** — never renamed, never split into a separate "Editor". Today it is upload-led (you bring a drawing/photo and make it real). Future end-to-end / create-from-scratch / standalone generative capability arrives as **"Studio Plus"**, an upgraded mode *within* the same surface, not a separate product. Near term, **all generative use is in pursuit of a purchasable product** (it's a COGS line, priced in); standalone generation-for-its-own-sake is a Studio Plus concern, deferred. Keep the budget/abuse cap regardless.
- **Must contain (summary; full list in the Studio spec):** canvas with product-tied dimensions, bleed/safe guides; layers (visibility/opacity/lock/reorder); brush + eraser with **size, smoothness, opacity**; transform/scale/crop; text; stickers/frames; colour adjustments; preset filters; **magic edits** (remove background, tidy lines, brighten, style, **upscale-to-print**); **per-asset visibility control** (Only me / Family / Extended, default Family); product application + live preview + switch products; **print-readiness/DPI indicator + one-tap upscale**; undo/redo, autosave, recoverable original; save to Keepsake Home / add to basket.
- **Mobile (required pattern):** full-bleed canvas; **floating brush HUD** (size/colour) on the canvas; active tool's options as a **draggable bottom sheet**; tools as a **scrolling bottom bar**. Must be usable by **finger and stylus** (pressure→size/opacity, palm rejection, stylus-only mode) per spec §19a.
- **Acceptance:** see the Studio spec's MVP cut; minimally — upload, edit (incl. one magic edit), set visibility, save; original recoverable; usable by finger and stylus on a phone; low-res image triggers the DPI warning and upscale resolves it.

### 5. Checkout
- **Purpose:** take payment with minimal friction, support gifting.
- **Must contain:** cart line items; a gift/wishlist fork (send as gift → wrap + hide prices + message; or add to a gift list); a **small, tasteful add-on row** ("add a little something"); order summary; **guest checkout** prominently available; a trust line.
- **Behaviours:** totals recomputed server-side; gift option wraps + hides prices; add-ons add to cart; guest checkout requires only email; member checkout uses the account.
- **Mobile:** single thumb-friendly column; total + "checkout" pinned bottom; add-ons horizontally scrollable.
- **Acceptance:** a guest and a member can both complete a purchase; gifting hides prices and adds a message; add-ons attach; guest path is never buried.

### 6. Family Keepsake Home
- **Purpose:** the private hub — a family-branded keepsake box that grows with the child; the 18-year relationship surface.
- **Must contain:** family-branded header (**"The [Name] Family Keepsake Home"**, greeting, "kept together" counter); the **family circle** (member avatars incl. extended members, with an **invite-family** affordance); **per-member sections** (a member selector — e.g. Olivia / Max / Family — switching whose keepsakes show); the selected member's **keepsake box** (a grid of saved creations + a "create new" tile); the **gift list** card (share a ready-to-buy link); a **"coming up"** card (the occasion engine); a trust/control footer.
- **Behaviours:** switching members changes the keepsake view; invite-family opens the add-member modal; share-link opens the create-gift-link modal; "coming up" deep-links into Create.
- **Mobile:** scrollable; family circle as a swipeable avatar row (invite at the end); member selector as chips; keepsakes 2-col; bottom tab bar.
- **Acceptance:** a family with multiple children and invited relatives can view per-member keepsakes, see who's in the circle, invite a member, share a gift link, and see upcoming occasions — all clearly private and controllable.

### 7. Gift link (recipient view)
- **Purpose:** let an invited relative buy in under a minute, and optionally join the family.
- **Must contain:** a warm header (occasion, who set it up, an optional personal note); the **pre-filled cart** (the parent's chosen items, ready to buy); a tasteful **add-on row**; an order summary; **"join family & checkout"** (email entry → verify; a colourful saving accent, e.g. "save 5%") *and* a clearly available **"checkout as guest"**; a trust line.
- **Behaviours:** the cart is already filled from the link — no browsing required. "Join family & checkout" appears **only if** the creating parent enabled invite-to-family on the link; it collects an email, sends a verification, and on join applies the saving and adds the person to the family at the link's set circle/access. Guest checkout requires only email.
- **Mobile:** scrollable single column; primary action pinned bottom; add-ons horizontally scrollable. This screen is opened on a phone more than any other — optimise for it.
- **Acceptance:** an invited grandparent opens the link on a phone, and either joins via email+verify (landing at the correct circle/access with the saving applied) or checks out as guest, with the cart pre-filled and the path obvious.

---

## Modals

### Create gift link
- **Must contain:** selectable item checklist (pre-checked); an optional note/occasion; the generated **unguessable link** + copy/share options (WhatsApp/email/text); an **"invite to family"** toggle that, when on, reveals an **access level** ("can view & buy" etc.) and explains the saving + access the recipient receives; a create/share action.
- **Behaviours:** enabling invite-to-family is what unlocks "join family & checkout" on the recipient view. The link is revocable and expirable.
- **Acceptance:** a parent selects items, optionally enables invite + sets access, and shares a working link.

### Add a family member
- **Must contain:** photo upload; name; **relationship** (Child / Parent / Grandparent / Aunt-uncle / Close friend / Other) — **required**, and it sets the member's **circle** (Family vs Extended), shown to the creator and overridable; optional **birthday** (feeds the occasion engine — applies to all members, not just kids); an optional **"invite to the family workspace"** toggle revealing email + access level, with an explanation of email verification.
- **Behaviours:** picking "Child" hides the email-invite block entirely (a minor is added as a subject, not invited). Adult relationships show the invite option. The relationship→circle default is overridable.
- **Acceptance:** a parent can add a child (no invite) or invite an adult relative (email → verify → joins at the set circle/access); the invite block is absent for children.

### Per-asset visibility
- **Must contain:** the asset preview + name; a three-tier selector — **Only me / Family / Extended family** — each showing who is included (member avatars); the current selection; a note that new keepsakes default to **Family** and nothing is public.
- **Behaviours:** changing visibility updates who can see the asset per the rules in `docs/04`. For a child's asset, the controlling parent sets this.
- **Acceptance:** a parent can set any keepsake to Only me / Family / Extended and immediately understands who that includes.

---

## Key flows (end-to-end behaviours)

1. **Onboarding / wow:** land → upload → instant "made real" range (no account) → create/customise → prompt to keep (account) → Keepsake Home.
2. **Create:** pick a drawing (or upload) → Studio (edit + magic edits, set visibility) → apply to product(s) → preview → add to basket.
3. **Gift loop:** build a gift list → create a pre-filled link (optionally invite-to-family) → recipient opens → guest checkout *or* join-family-&-checkout (email → verify → joins at set circle/access, saving applied) → add-ons → pay.
4. **Family:** invite member (relationship sets circle) → email → verify → workspace access at set level → appears in the circle, gets reminders.
5. **Retention:** occasion engine surfaces "coming up" + gentle nudges → "make a card" → back into Create.

## Component inventory (reusable)
Primary/secondary/ghost buttons; chips (filter/relationship/tab); product card; keepsake tile; member/child avatar (with tier); modal; bottom sheet; slider; toggle; three-tier visibility selector; member card; occasion row; cart line item; add-on card; gift-link block; trust line; the Studio component set (canvas stage, tool rail/bar, layer row, brush HUD, magic-edit chip, DPI badge). Build these once; reuse everywhere; match the mockups.
