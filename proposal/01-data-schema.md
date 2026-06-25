# 01 — Data Schema & Authorization Model

> **Status: PROPOSED — pending founder sign-off. Not yet built.**
> Models the domain and invariants in `docs/04` and the compliance rules in `docs/05`. Postgres. Every invariant below states **where it is enforced** (DB constraint / central authz module / background job / service), because "centralise the visibility logic in one tested place; never trust the client" is itself a `docs/04` requirement.
>
> ORM: **Drizzle** (TypeScript, SQL-first). Chosen over Prisma because the invariants lean heavily on DB-level guarantees — `DEFAULT`, `CHECK`, partial-unique indexes, append-only triggers — and Drizzle keeps that SQL explicit and in-repo. Prisma is an acceptable alternative if you prefer its DX; the schema below is ORM-agnostic.

---

## Enums

```sql
visibility_tier   : ONLY_ME | FAMILY | EXTENDED                       -- nests outward; default FAMILY
circle            : FAMILY | EXTENDED                                  -- what a member can SEE
access_level      : VIEW | VIEW_BUY | CONTRIBUTE                        -- what a member can DO (orthogonal to circle)
relationship      : CHILD | PARENT | GRANDPARENT | AUNT_UNCLE | CLOSE_FRIEND | OTHER
membership_status : ACTIVE | REMOVED | LEFT
invite_status     : PENDING | VERIFIED | EXPIRED | REVOKED
asset_kind        : DRAWING | PHOTO
object_class      : ORIGINAL | DERIVATIVE | CREATION_LAYER
order_origin      : DIRECT_MEMBER | GUEST | GIFT_LINK_GUEST | GIFT_LINK_JOIN
order_status      : PENDING_PAYMENT | PAID | IN_PRODUCTION | SHIPPED | DELIVERED | CANCELLED | REFUNDED
fulfilment_status : NOT_SUBMITTED | SUBMITTED | ACCEPTED | IN_PRODUCTION | SHIPPED | DELIVERED | FAILED | CANCELLED
gift_link_status  : ACTIVE | REVOKED | EXPIRED
occasion_type     : BIRTHDAY | STANDARD | CUSTOM
consent_channel   : EMAIL | SMS
consent_purpose   : MARKETING | REMINDERS
consent_status    : GRANTED | WITHDRAWN
consent_basis     : CONSENT | SOFT_OPT_IN
rights_req_type   : ACCESS | RECTIFICATION | ERASURE | RESTRICTION | OBJECTION | PORTABILITY | COMPLAINT
rights_req_status : RECEIVED | CLOCK_PAUSED | IN_PROGRESS | COMPLETED | DECLINED
audit_event       : INVITE_SENT | INVITE_ACCEPTED | INVITE_REVOKED | MEMBERSHIP_CREATED |
                    MEMBERSHIP_ACCESS_CHANGED | MEMBERSHIP_CIRCLE_CHANGED | MEMBER_REMOVED | MEMBER_LEFT |
                    ASSET_VISIBILITY_CHANGED | ASSET_DELETED | ACCOUNT_CLOSED |
                    GIFT_LINK_CREATED | GIFT_LINK_REVOKED | GIFT_LINK_EXPIRED |
                    CONSENT_CHANGED | PROVIDER_DELETION_REQUESTED | PROVIDER_DELETION_CONFIRMED |
                    PURGE_EXECUTED | RIGHTS_REQUEST_RECEIVED | RIGHTS_REQUEST_COMPLETED
```

---

## Entities

### `account` — an adult account holder (parent / relative). Children are **never** accounts.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| email | citext unique not null | |
| password_hash | text null | Argon2id; null when magic-link-only |
| email_verified_at | timestamptz null | |
| display_name | text | |
| is_admin | boolean not null default false | admin requires MFA |
| mfa_secret | text null | TOTP, admin only |
| created_at / updated_at | timestamptz | |

### `family` — the workspace.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| display_name | text not null | "The Hartley Family" |
| owner_account_id | uuid fk→account not null | the controller-in-chief |
| created_at | timestamptz | |

### `membership` — an account's link to a family (relationship, circle, access, status).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| family_id | uuid fk→family not null | tenancy key |
| account_id | uuid fk→account not null | |
| relationship | relationship not null | |
| circle | circle not null | default derived from relationship, overridable by controller |
| access_level | access_level not null | |
| status | membership_status not null default ACTIVE | |
| is_owner | boolean not null default false | |
| invite_id | uuid fk→invite null | **NOT NULL for invited members** (see CHECK) |
| joined_at | timestamptz null | set on verification |
| revoked_at | timestamptz null | set on removal/leave |
| created_at | timestamptz | |

- `CHECK (is_owner OR invite_id IS NOT NULL)` → **a membership can only exist for the owner or from a parent-created invite** — no self-join path can mint one. *(docs/04 invite lifecycle; docs/05 §3/§4)*
- `UNIQUE (family_id, account_id) WHERE status = 'ACTIVE'` (partial) → one active membership per person per family.
- Index `(family_id, status)` — the hot path for the authz family-scope check.

### `child` — a keepsake **subject**, not an account.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| family_id | uuid fk→family not null | |
| first_name | text not null | **no surname collected** (DPIA minimisation) |
| birthday | date null | feeds occasions |
| avatar_asset_id | uuid fk→asset null | |
| controller_account_id | uuid fk→account not null | **the controlling parent** |
| created_at | timestamptz | |

### `asset` — an uploaded drawing/photo and its kept form (the **keepsake**). Visibility lives here.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| family_id | uuid fk→family **not null** | **tenancy key — first authz gate** |
| kind | asset_kind not null | |
| uploader_account_id | uuid fk→account not null | who uploaded it |
| child_subject_id | uuid fk→child null | the child it is by/of |
| controller_account_id | uuid fk→account not null | **resolved**: child's controller if `child_subject_id` set, else uploader |
| visibility | visibility_tier **not null default 'FAMILY'** | **privacy-by-default at the DB level** |
| kept_in_home | boolean not null default false | **the single source of truth for retention** |
| fulfilled_at | timestamptz null | set when an order using this asset is fulfilled |
| purge_after | timestamptz null | `fulfilled_at + 30d` when not kept; null when kept |
| created_at | timestamptz | |

- `visibility … DEFAULT 'FAMILY'` is a **column default**, so *no* insert path (service, admin tool, migration, import) can create a wider-than-Family asset without an explicit action. *(NN2; docs/04 line 27; docs/05 §2)*
- `controller_account_id` is set by the service on insert (resolves child→controller); the authz module trusts this column. *(fixes the uploader-vs-controller ambiguity)*
- Index `(family_id, child_subject_id, visibility)`.

### `storage_object` — the bytes. Originals are write-once; derivatives are disposable.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| asset_id | uuid fk→asset not null | |
| object_class | object_class not null | ORIGINAL (one per asset) / DERIVATIVE / CREATION_LAYER |
| bucket | text not null | private, UK/EU region |
| key | text not null | |
| content_type | text | |
| byte_size | bigint | |
| sha256 | text | integrity |
| kms_key_alias | text | originals key ≠ derivatives key |
| write_once | boolean not null default false | true for ORIGINAL (governance-mode immutability) |
| exif_stripped | boolean not null default false | **GPS/device/timestamp removed on ingest** (DPIA) |
| created_at | timestamptz | |

- `UNIQUE (asset_id) WHERE object_class = 'ORIGINAL'` → exactly one preserved original per asset. *(NN8)*
- **Immutability is governance-mode / app-level write-once, NOT S3 Object Lock compliance mode** — compliance mode would block a parent's one-tap erasure and DUAA right-to-erasure. Immutability protects against *edit overwrites*, never against *deletion*. *(verifier fix)*
- **EXIF/GPS stripped from all derivatives on ingest** (and originals re-saved stripped where lawful to do so without losing provenance) — a phone photo of a drawing carries home coordinates; stripping is data-minimisation and mitigates the DPIA re-identification risk. *(verifier fix; spine-1 §6.4)*
- `ON DELETE` of an `asset` cascades to all its `storage_object` rows and enqueues a hard storage purge.

### `creation` — a Studio project derived from an asset (non-destructive layers/edits).
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| asset_id | uuid fk→asset not null | the source original it derives from |
| family_id | uuid fk→family not null | denormalised tenancy key |
| name | text | |
| layers | jsonb not null | non-destructive edit graph (image/paint/text/sticker/background layers; visibility/opacity/lock/order) |
| applied_variant_id | uuid fk→variant null | currently-applied product |
| placement | jsonb null | position/scale/rotate within print area |
| autosaved_at / updated_at | timestamptz | |

- A creation **references** the original and never mutates it (non-destructive). Deleting the asset cascades to its creations; deleting a creation never touches the original. *(NN8; docs/04 line 48)*

### `product` / `variant` — catalogue with print spec.
`product`: id, slug (unique), name, category (CARDS_PRINTS|HOME|WEAR|BOOKS|GIFTS), active, created_at.
`variant`: id, product_id fk, name, **print_area** jsonb (px + mm), **required_dpi** int, **bleed_mm** numeric, safe_area jsonb, **provider_sku_map** jsonb (per-provider SKU/attributes), base_price_pence int, currency (GBP), active.

- The Studio's print-readiness check reads `required_dpi`/`print_area`/`bleed_mm` to compute effective DPI and gate fulfilment. *(docs/04 print-readiness; studio §15)*

### `gift_list` / `gift_list_item`
`gift_list`: id, family_id fk, child_subject_id fk null, name, created_at.
`gift_list_item`: id, gift_list_id fk, creation_id fk, variant_id fk, personalisation jsonb, position.

### `gift_link` — a shareable, pre-filled-cart link with a **frozen snapshot**.
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| family_id | uuid fk→family not null | |
| created_by_account_id | uuid fk→account not null | |
| token | citext unique not null | **unguessable** (≥128-bit), `noindex` |
| occasion_label | text null | |
| note | text null | |
| invite_to_family | boolean not null default false | unlocks "join family & checkout" |
| invite_circle | circle null | required when `invite_to_family` |
| invite_access | access_level null | required when `invite_to_family` |
| **snapshot** | jsonb not null | **frozen by-value**: `[{ preview_object_key, product, variant, personalisation, price_pence_at_snapshot }]` + `subtotal_at_snapshot` |
| status | gift_link_status not null default ACTIVE | |
| revoked_at | timestamptz null | |
| expires_at | timestamptz not null | **always expirable** |
| created_at | timestamptz | |

- `CHECK (NOT invite_to_family OR (invite_circle IS NOT NULL AND invite_access IS NOT NULL))`.
- **Snapshot is written once and never updated** — a later edit to the creation, a price change, or a deletion of the source cannot mutate what the recipient sees/buys. *(docs/04 line 42; verifier fix)*
- **Deletion of a source asset/creation invalidates the link** (a delete cascade flips referencing links to `EXPIRED`/`REVOKED`; the serving path returns `410 Gone`, never a stale image). *(verifier fix)*
- Recipient viewing is a **narrow capability**: the gift-link serving path mints scoped signed URLs for *exactly the snapshot's `preview_object_key`s*, gated by token validity — it does **not** call `canViewAsset` or expose the keepsake box.

### `order` / `order_line_item` / `order_fulfilment`
`order`:
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| family_id | uuid fk→family null | null for pure guest |
| buyer_account_id | uuid fk→account null | null for guest |
| guest_email | citext null | guest path (email only) |
| origin | order_origin not null | DIRECT_MEMBER / GUEST / GIFT_LINK_GUEST / GIFT_LINK_JOIN |
| origin_gift_link_id | uuid fk→gift_link null | provenance |
| join_context_membership_id | uuid fk→membership null | the membership minted **in this transaction** via join |
| is_gift | boolean not null default false | |
| gift_message | text null | |
| gift_hide_prices | boolean not null default false | |
| subtotal_pence / discount_pence / delivery_pence / tax_pence / total_pence | integer not null | **all server-computed** |
| currency | text not null default 'GBP' | |
| stripe_payment_intent_id | text null | token only — **no card data** |
| status | order_status not null default PENDING_PAYMENT | |
| created_at / paid_at | timestamptz | |

- **5% join saving — enforced by provenance, not a flag:** `CHECK (discount_pence = 0 OR (origin = 'GIFT_LINK_JOIN' AND join_context_membership_id IS NOT NULL))`. The pricing service computes the discount **solely** from the server-derived join context (a membership created in this same transaction from a gift link with `invite_to_family = true`) — never from a client field/query param. *(docs/04 line 45; verifier fix)*
- Order/transaction records retained **6 years** (HMRC) — financial records are held **separately** from children's images so erasure of an image does not touch the tax record (and vice-versa). *(spine-1 §3/§7)*

`order_line_item`: id, order_id fk, creation_id fk null, variant_id fk, description, personalisation jsonb, unit_price_pence, qty, print_object_id fk→storage_object (the print-ready derivative used).

`order_fulfilment`: id, order_id fk, provider text, provider_order_id text, status fulfilment_status, last_event_at, **asset_deletion_requested_at**, **asset_deletion_confirmed_at**, raw_status jsonb.
- The two deletion timestamps make provider-side deletion **confirmed-vs-requested**, with retry until confirmed. *(verifier fix; docs/05 §7 "provider-side")*

### `occasion` / `reminder_send`
`occasion`: id, family_id fk, subject_type (CHILD|MEMBER), subject_id, type occasion_type, date, label, created_at. *(birthdays apply to all members, not just kids — docs/03 add-member modal)*
`reminder_send`: id, occasion_id fk, account_id fk, channel consent_channel, sent_at, suppressed_reason null. → the **frequency cap** is a query over recent `reminder_send` rows before any dispatch; a send is blocked unless a live `consent_record` GRANTS that channel/purpose. *(docs/04 occasions; docs/05 PECR; verifier fix)*

### `invite` — pending, parent-initiated only.
id, family_id fk, created_by_account_id fk, email citext, relationship, circle, access_level, token unique, status invite_status default PENDING, expires_at, verified_at, created_at.
- A `membership` may only be created from a `VERIFIED` invite (`membership.invite_id` FK). **Verifying an email with no matching open invite creates no membership** — verification confirms identity, not authorisation. *(docs/04 line 39; docs/05 §4)*

### `consent_record` — PECR consent log (append-only).
id, account_id fk, channel, purpose, status, basis, source, evidence jsonb, created_at.
- New row per change; current state = latest per `(account, channel, purpose)`. `SMS basis = CONSENT` always; `EMAIL` may use `SOFT_OPT_IN` only for existing customers re similar products. *(spine-1 §13; verifier fix)*

### `audit_record` — append-only evidence of the control-based trust model.
id, family_id null, actor_account_id null, actor_type (MEMBER|GUEST|ANON|ADMIN|SYSTEM), event audit_event, target_type, target_id, metadata jsonb, created_at.
- **Append-only**: `UPDATE`/`DELETE` revoked at the DB-role level; a trigger raises on mutation. Covers the full `docs/05` list **plus** gift-link create/revoke/expire, asset/account deletion, provider-deletion request/confirm, and purge execution. *(docs/05 audit; verifier fix)*

### `rights_request` — DUAA DSAR + s.164A complaints.
id, subject_account_id null, subject_email citext null, type rights_req_type, status rights_req_status, received_at, **clock_paused_at** (stop-the-clock for ID/clarification), due_at, completed_at, outcome text, export_object_id fk→storage_object null (portability export), complaint_ack_at, created_at.
- Backs the self-service rights tools, the portability export format, the "decline → signpost complaint to us *and* ICO" duty, and the **s.164A 30-day acknowledgement** workflow. P0 scope. *(spine-1 §9/§10; verifier fix)*

### `sub_processor` — accountability register (lightweight; mirrors the DPA pack).
id, name, role (HOSTING|DB|STORAGE|AI_GENERATIVE|POD|PAYMENTS|EMAIL_SMS|ANALYTICS), region, dpa_signed_at, transfer_mechanism, no_training_attested boolean, notes.
- The AI-generative row must have `no_training_attested = true` and a transfer mechanism before any live image is sent (LG6/LG3 gate).

### Auth tables
Standard Auth.js (NextAuth) tables — `account`(above doubles as user), `session`, `verification_token` — all in-region Postgres. Sessions are invalidated immediately on member removal.

---

## Authorization rule (the central, unit-tested module — `src/authz`)

> Every asset read, every signed-URL mint, and every mutation calls this server-side. The client is **never** trusted for visibility, price, or ownership. *(docs/04 engineering invariants; NN1/NN2/NN3)*

```text
canViewAsset(viewer, asset):
  # ── STEP 1 · FAMILY-SCOPE PRECONDITION (tenancy isolation) — evaluated FIRST ──
  isOwnerOrController = viewer.accountId in { asset.uploader_account_id, asset.controller_account_id }
  membership          = activeMembership(viewer.accountId, asset.family_id)   # status = ACTIVE only
  if not isOwnerOrController and membership is null:
      return DENY        # a member of another family NEVER sees this family's asset

  # ── STEP 2 · ONLY_ME ──
  if asset.visibility == ONLY_ME:
      return ALLOW if viewer.accountId == asset.controller_account_id else DENY
      # controller = controlling parent for a child's asset; uploader otherwise

  # ── STEP 3 · controller/uploader always sees their own ──
  if isOwnerOrController:
      return ALLOW

  # ── STEP 4 · tier × circle nesting (membership established above) ──
  if asset.visibility == FAMILY:
      return ALLOW if membership.circle == FAMILY else DENY     # Family-circle only
  if asset.visibility == EXTENDED:
      return ALLOW                                              # BOTH Family- and Extended-circle members

  return DENY   # default-deny
```

This yields exactly the `docs/04` semantics, **independently confirmed by the visibility mockup** ("Extended" members see Extended-shared keepsakes, *"never your Family-only or private ones"*):

| viewer circle ↓ / asset visibility → | ONLY_ME | FAMILY | EXTENDED |
|---|---|---|---|
| controller / uploader | ✅ | ✅ | ✅ |
| Family-circle member | ❌ | ✅ | ✅ |
| Extended-circle member | ❌ | ❌ | ✅ |
| member of another family | ❌ | ❌ | ❌ |
| guest / anonymous | ❌ | ❌ | ❌ |

**Actions** (`canDo`): buying from a gift list requires `VIEW_BUY`; adding own creations requires `CONTRIBUTE`; managing members / changing a child-asset's visibility / removing members requires owner-or-controller. Circle = what you can see; access = what you can do; they are orthogonal. *(docs/04 access levels)*

**Gift-link viewing is a separate, narrow capability** (not `canViewAsset`): the serving path validates the token (ACTIVE, not expired/revoked, sources still exist) and mints scoped signed URLs for *only* the snapshot's `preview_object_key`s.

---

## Invariant → enforcement matrix

| Invariant (docs/04 / docs/05) | Enforced where |
|---|---|
| New asset defaults to FAMILY; nothing public | **DB** `visibility DEFAULT 'FAMILY' NOT NULL`; no public surface exists; `noindex` on app/gift/checkout |
| Visibility nesting (Family-circle sees Family+Extended; Extended sees Extended only) | **authz module** `canViewAsset` + exhaustive unit-test matrix |
| Family-scope before tier (no cross-tenant leak) | **authz module** step 1 + `asset.family_id NOT NULL` |
| ONLY_ME on a child asset = controlling parent | **DB** `asset.controller_account_id` (resolved) + **authz** step 2 |
| Parent-initiated invites only; no self-join | **DB** `membership CHECK (is_owner OR invite_id NOT NULL)` + service mints membership only from a VERIFIED invite |
| Verification = identity, not authorisation | **service** (membership pre-set from invite, not from verification) |
| Removal revokes access immediately | **DB** `membership.status`; **authz** honours ACTIVE only; **service** invalidates sessions on removal |
| Gift-link snapshot immutable; revocable; expirable; unguessable; noindex | **DB** write-once snapshot + `status`/`revoked_at`/`expires_at` + unique high-entropy `token`; **service** serves 410 on deleted source |
| Server-side pricing; 5% only via join path | **service** (pricing) computes from server state; **DB** `order CHECK (discount=0 OR origin=GIFT_LINK_JOIN AND join_context NOT NULL)` |
| Non-destructive; original always recoverable | **DB** one ORIGINAL per asset, write-once (governance mode); creations reference, never mutate |
| Real cascading deletion (DB→storage→provider→backups) | **service** + **jobs** (`rights-service`, `account-deletion`, `retention-purge`); provider deletion confirmed-with-retry; backups crypto-shredded / originals excluded from long-lived backups |
| Retention: source purged after fulfilment+30d unless kept | **DB** is source of truth (`kept_in_home`, `fulfilled_at`, `purge_after`); **job** JOINs the DB to select (S3 tags are a defence-in-depth hint only) |
| EXIF/GPS minimisation | **service** strips on ingest; **DB** `storage_object.exif_stripped` |
| Audit of all access-relevant events | **DB** append-only `audit_record` (mutation trigger) written by services |
| PECR consent + frequency cap on reminders | **DB** `consent_record` + `reminder_send`; **job** checks both before dispatch |
| DSAR / s.164A 30-day ack / stop-the-clock / portability | **DB** `rights_request` + **service**/workflow |
