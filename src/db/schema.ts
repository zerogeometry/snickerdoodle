import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Phase-0 trust-spine schema (proposal/01-data-schema.md). The tables the central
 * authz module, private storage, retention/deletion jobs, audit, consent and DSAR
 * tooling depend on. Catalogue / creation / gifting / orders / occasions are added
 * in their own phase increments.
 *
 * Enum value lists are duplicated from src/domain/types.ts on purpose (drizzle's
 * pgEnum wants a literal tuple); db/__tests__/schema.test.ts asserts they stay in
 * sync, so any drift fails CI.
 */

// ── Enums ────────────────────────────────────────────────────────────────────
export const visibilityTier = pgEnum('visibility_tier', ['ONLY_ME', 'FAMILY', 'EXTENDED']);
// NB: the Postgres type is named `family_circle`, not `circle` — `circle` is a
// built-in geometric type, so a custom enum of that name collides at parameter
// binding (every insert of a circle value fails). The TS export stays `circle`.
export const circle = pgEnum('family_circle', ['FAMILY', 'EXTENDED']);
export const accessLevel = pgEnum('access_level', ['VIEW', 'VIEW_BUY', 'CONTRIBUTE']);
export const relationship = pgEnum('relationship', [
  'CHILD',
  'PARENT',
  'GRANDPARENT',
  'AUNT_UNCLE',
  'CLOSE_FRIEND',
  'OTHER',
]);
export const membershipStatus = pgEnum('membership_status', ['ACTIVE', 'REMOVED', 'LEFT']);
export const assetKind = pgEnum('asset_kind', ['DRAWING', 'PHOTO']);
// Content-safety state (decision D8). PENDING until the automated gate runs;
// CLEAR may be ordered/printed; FLAGGED waits in the review queue (never
// auto-rejected); BLOCKED = a CSAM hash match — preserved, never viewed/printed.
export const moderationStatus = pgEnum('moderation_status', ['PENDING', 'CLEAR', 'FLAGGED', 'BLOCKED']);
export const objectClass = pgEnum('object_class', ['ORIGINAL', 'DERIVATIVE', 'CREATION_LAYER']);
export const inviteStatus = pgEnum('invite_status', ['PENDING', 'VERIFIED', 'EXPIRED', 'REVOKED']);
export const consentChannel = pgEnum('consent_channel', ['EMAIL', 'SMS']);
export const consentPurpose = pgEnum('consent_purpose', ['MARKETING', 'REMINDERS']);
export const consentStatus = pgEnum('consent_status', ['GRANTED', 'WITHDRAWN']);
export const consentBasis = pgEnum('consent_basis', ['CONSENT', 'SOFT_OPT_IN']);
export const actorType = pgEnum('actor_type', ['MEMBER', 'GUEST', 'ANON', 'ADMIN', 'SYSTEM']);
export const rightsReqType = pgEnum('rights_req_type', [
  'ACCESS',
  'RECTIFICATION',
  'ERASURE',
  'RESTRICTION',
  'OBJECTION',
  'PORTABILITY',
  'COMPLAINT',
]);
export const rightsReqStatus = pgEnum('rights_req_status', [
  'RECEIVED',
  'CLOCK_PAUSED',
  'IN_PROGRESS',
  'COMPLETED',
  'DECLINED',
]);
export const subProcessorRole = pgEnum('sub_processor_role', [
  'HOSTING',
  'DB',
  'STORAGE',
  'AI_GENERATIVE',
  'POD',
  'PAYMENTS',
  'EMAIL_SMS',
  'ANALYTICS',
]);
export const auditEvent = pgEnum('audit_event', [
  'INVITE_SENT',
  'INVITE_ACCEPTED',
  'INVITE_REVOKED',
  'MEMBERSHIP_CREATED',
  'MEMBERSHIP_ACCESS_CHANGED',
  'MEMBERSHIP_CIRCLE_CHANGED',
  'MEMBER_REMOVED',
  'MEMBER_LEFT',
  'ASSET_VISIBILITY_CHANGED',
  'ASSET_DELETED',
  'CONTENT_FLAGGED',
  'CONTENT_BLOCKED',
  'ACCOUNT_CLOSED',
  'GIFT_LINK_CREATED',
  'GIFT_LINK_REVOKED',
  'GIFT_LINK_EXPIRED',
  'CONSENT_CHANGED',
  'PROVIDER_DELETION_REQUESTED',
  'PROVIDER_DELETION_CONFIRMED',
  'PURGE_EXECUTED',
  'RIGHTS_REQUEST_RECEIVED',
  'RIGHTS_REQUEST_COMPLETED',
]);

const createdAt = timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

// ── account — an adult account holder. Children are NEVER accounts. ───────────
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Emails are lowercased by the service before insert, so this plain unique
    // index is effectively case-insensitive (Grandma@x and grandma@x collide).
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    displayName: text('display_name'),
    isAdmin: boolean('is_admin').notNull().default(false),
    mfaSecret: text('mfa_secret'),
    createdAt,
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('account_email_unique').on(t.email)],
);

// ── family — the workspace. ───────────────────────────────────────────────────
export const families = pgTable('families', {
  id: uuid('id').defaultRandom().primaryKey(),
  displayName: text('display_name').notNull(),
  ownerAccountId: uuid('owner_account_id')
    .notNull()
    .references(() => accounts.id),
  createdAt,
});

// ── invite — pending, parent-initiated only. ─────────────────────────────────
export const invites = pgTable('invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  familyId: uuid('family_id')
    .notNull()
    .references(() => families.id),
  createdByAccountId: uuid('created_by_account_id')
    .notNull()
    .references(() => accounts.id),
  email: text('email').notNull(),
  relationship: relationship('relationship').notNull(),
  circle: circle('circle').notNull(),
  accessLevel: accessLevel('access_level').notNull(),
  token: text('token').notNull().unique(),
  status: inviteStatus('status').notNull().default('PENDING'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt,
});

// ── membership — an account's link to a family (relationship/circle/access). ──
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    relationship: relationship('relationship').notNull(),
    circle: circle('circle').notNull(),
    accessLevel: accessLevel('access_level').notNull(),
    status: membershipStatus('status').notNull().default('ACTIVE'),
    isOwner: boolean('is_owner').notNull().default(false),
    // NOT NULL for invited members — a membership exists only for the owner or
    // from a parent-created invite (the CHECK below). No self-join path.
    inviteId: uuid('invite_id').references(() => invites.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    // When the one-time join saving was spent on an order (null = still available).
    joinSavingConsumedAt: timestamp('join_saving_consumed_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    check('membership_owner_or_invite', sql`${t.isOwner} OR ${t.inviteId} IS NOT NULL`),
    // One ACTIVE membership per account per family.
    uniqueIndex('membership_active_unique')
      .on(t.familyId, t.accountId)
      .where(sql`${t.status} = 'ACTIVE'`),
    index('membership_family_status_idx').on(t.familyId, t.status),
  ],
);

// ── child — a keepsake SUBJECT, not an account. ──────────────────────────────
export const children = pgTable('children', {
  id: uuid('id').defaultRandom().primaryKey(),
  familyId: uuid('family_id')
    .notNull()
    .references(() => families.id),
  firstName: text('first_name').notNull(), // no surname collected (minimisation)
  birthday: date('birthday'),
  avatarAssetId: uuid('avatar_asset_id').references((): any => assets.id),
  controllerAccountId: uuid('controller_account_id')
    .notNull()
    .references(() => accounts.id),
  createdAt,
});

// ── asset — an uploaded drawing/photo and its kept form (the keepsake). ───────
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Tenancy key — the first authz gate. NULL only for a pre-account ephemeral
    // draft (a guest's upload, no family yet), which is gated by ephemeralClaimId.
    familyId: uuid('family_id').references(() => families.id),
    kind: assetKind('kind').notNull(),
    uploaderAccountId: uuid('uploader_account_id').references(() => accounts.id),
    childSubjectId: uuid('child_subject_id').references(() => children.id),
    // Resolved on insert: child's controller if child_subject set, else uploader.
    // NULL only for an ephemeral draft (adopted into a family on keep/sign-in).
    controllerAccountId: uuid('controller_account_id').references(() => accounts.id),
    // Single-use claim for a pre-account ephemeral upload (the signed cookie the
    // guest holds). Authz grants access to THIS asset alone when the claim matches.
    ephemeralClaimId: uuid('ephemeral_claim_id').unique(),
    // Lawful-basis record for a guest upload: the terms accepted at the upload
    // moment (the processing info lives in the terms). Travels with the asset.
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    termsVersion: text('terms_version'),
    // Privacy-by-default at the DB level: no insert path can default wider.
    visibility: visibilityTier('visibility').notNull().default('FAMILY'),
    // Content-safety gate (D8). An asset cannot reach a print order unless CLEAR.
    moderationStatus: moderationStatus('moderation_status').notNull().default('PENDING'),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    moderationDetail: jsonb('moderation_detail'),
    // The single source of truth for retention (the purge job JOINs the DB).
    keptInHome: boolean('kept_in_home').notNull().default(false),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    purgeAfter: timestamp('purge_after', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    index('asset_family_child_visibility_idx').on(t.familyId, t.childSubjectId, t.visibility),
    // Invariant: a real asset has a family + controller; an ephemeral draft has a claim.
    check(
      'asset_owned_or_ephemeral',
      sql`(${t.ephemeralClaimId} IS NOT NULL) OR (${t.familyId} IS NOT NULL AND ${t.controllerAccountId} IS NOT NULL)`,
    ),
  ],
);

// ── storage_object — the bytes. Originals are write-once; derivatives disposable.
export const storageObjects = pgTable(
  'storage_objects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    objectClass: objectClass('object_class').notNull(),
    bucket: text('bucket').notNull(),
    key: text('key').notNull(),
    contentType: text('content_type'),
    byteSize: bigint('byte_size', { mode: 'number' }),
    sha256: text('sha256'),
    kmsKeyAlias: text('kms_key_alias'),
    writeOnce: boolean('write_once').notNull().default(false),
    exifStripped: boolean('exif_stripped').notNull().default(false),
    createdAt,
  },
  (t) => [
    // Exactly one preserved ORIGINAL per asset.
    uniqueIndex('storage_one_original_per_asset')
      .on(t.assetId)
      .where(sql`${t.objectClass} = 'ORIGINAL'`),
    // Object keys are deterministic + write-once (originalKey/derivativeKey namespace
    // by asset), so a key is unique by construction. Enforcing it makes the write-once
    // upserts in render.ts + compositor.ts genuinely idempotent under concurrent races
    // (onConflictDoNothing({ target: key })) instead of racing to duplicate rows.
    uniqueIndex('storage_object_key_unique').on(t.key),
    index('storage_asset_idx').on(t.assetId),
  ],
);

// ── consent_record — PECR consent log (append a new row per change). ─────────
export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    channel: consentChannel('channel').notNull(),
    purpose: consentPurpose('purpose').notNull(),
    status: consentStatus('status').notNull(),
    basis: consentBasis('basis').notNull(),
    source: text('source'),
    evidence: jsonb('evidence'),
    createdAt,
  },
  (t) => [index('consent_lookup_idx').on(t.accountId, t.channel, t.purpose, t.createdAt)],
);

// ── audit_record — append-only evidence of the control-based trust model. ────
// Append-only is enforced by a trigger added in the migration (see db/migrations).
export const auditRecords = pgTable(
  'audit_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id'),
    actorAccountId: uuid('actor_account_id'),
    actorType: actorType('actor_type').notNull(),
    event: auditEvent('event').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata'),
    createdAt,
  },
  (t) => [
    index('audit_family_time_idx').on(t.familyId, t.createdAt),
    index('audit_event_time_idx').on(t.event, t.createdAt),
  ],
);

// ── rights_request — DUAA DSAR + s.164A complaints. ──────────────────────────
export const rightsRequests = pgTable('rights_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  subjectAccountId: uuid('subject_account_id').references(() => accounts.id),
  subjectEmail: text('subject_email'),
  type: rightsReqType('type').notNull(),
  status: rightsReqStatus('status').notNull().default('RECEIVED'),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  clockPausedAt: timestamp('clock_paused_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  outcome: text('outcome'),
  exportObjectId: uuid('export_object_id').references(() => storageObjects.id),
  complaintAckAt: timestamp('complaint_ack_at', { withTimezone: true }),
  createdAt,
});

// ── sub_processor — accountability register (mirrors the DPA pack). ──────────
export const subProcessors = pgTable('sub_processors', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  role: subProcessorRole('role').notNull(),
  region: text('region'),
  dpaSignedAt: timestamp('dpa_signed_at', { withTimezone: true }),
  transferMechanism: text('transfer_mechanism'),
  noTrainingAttested: boolean('no_training_attested').notNull().default(false),
  notes: text('notes'),
  createdAt,
});

// ── order — a placed order (server-priced; the client never sets totals). ────
export const orderStatus = pgEnum('order_status', ['PENDING', 'PAID', 'FULFILLING', 'SHIPPED', 'CANCELLED']);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ref: text('ref').notNull().unique(),
    accountId: uuid('account_id').references(() => accounts.id), // null for a guest
    familyId: uuid('family_id').references(() => families.id),
    status: orderStatus('status').notNull().default('PENDING'),
    subtotalPence: integer('subtotal_pence').notNull(),
    deliveryPence: integer('delivery_pence').notNull(),
    joinSavingPence: integer('join_saving_pence').notNull().default(0),
    familySetSavingPence: integer('family_set_saving_pence').notNull().default(0),
    totalPence: integer('total_pence').notNull(),
    currency: text('currency').notNull().default('GBP'),
    isGift: boolean('is_gift').notNull().default(false),
    stripeSessionId: text('stripe_session_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // ── POD submission (Prodigi) ──
    // The provider's order id — set EXACTLY once on successful submission; doubles as
    // the idempotency latch (an order with a prodigiOrderId is never re-submitted).
    prodigiOrderId: text('prodigi_order_id'),
    // Captured from Stripe Checkout's shipping_address_collection at payment time.
    // Null on the dev fallback path (submission substitutes a sandbox address).
    shippingAddress: jsonb('shipping_address').$type<{
      name: string;
      line1: string;
      line2?: string | null;
      townOrCity: string;
      postcode: string;
      countryCode: string;
    } | null>(),
    // What we actually asked the POD for ('Standard' | 'Express') — resolved at
    // submission from the order's lines, persisted for support/repricing forensics.
    shippingMethod: text('shipping_method'),
    // Latest shipment info from the status sync: carrier + tracking number/url.
    tracking: jsonb('tracking').$type<{ carrier?: string | null; number?: string | null; url?: string | null } | null>(),
    // The last submission failure (order stays PAID + claimable for retry).
    submitError: text('submit_error'),
    // When the PAID→FULFILLING claim was taken — keys the stale-claim recovery sweep
    // (a crash mid-submit must never strand a paid order invisibly).
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    // Bounded submission retry with backoff: attempts so far + the earliest next try.
    submitAttempts: integer('submit_attempts').notNull().default(0),
    nextSubmitAttemptAt: timestamp('next_submit_attempt_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [index('order_account_idx').on(t.accountId, t.createdAt)],
);

export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productKey: text('product_key').notNull(),
  // The catalogue variant (nullable during migration; the printed line carries an
  // order_item_artwork row with the server-authoritative spec).
  variantId: uuid('variant_id').references(() => productVariants.id),
  // WHAT WAS SOLD, frozen at order time: { sku, attributes, provider, providerSku,
  // providerConfig }. Variant rows can be re-seeded/repurposed after the order (a price
  // change, a supplier SKU swap, a default move) — fulfilment must consume THIS snapshot,
  // never a live lookup, so the customer receives exactly what they paid for. `provider`
  // distinguishes POD lines from MANUAL ones (a MANUAL row still carries an internal sku).
  spec: jsonb('spec').$type<{
    sku: string;
    attributes: Record<string, string>;
    provider?: string | null;
    providerSku: string | null;
    providerConfig: unknown;
  } | null>(),
  qty: integer('qty').notNull(),
  unitPricePence: integer('unit_price_pence').notNull(),
  linePence: integer('line_pence').notNull(),
});

// ── webhook_events — idempotency ledger for payment webhooks. ─────────────────
export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(), // the provider's event id
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── ml_operations — ledger for the per-account budget cap on the self-hosted
// image ops (background removal / upscale). Keeps the (already small, CPU-only)
// bill bounded and abuse out.
export const mlOp = pgEnum('ml_op', ['BG_REMOVE', 'UPSCALE']);
export const mlOperations = pgTable(
  'ml_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // NULL for a pre-account guest magic edit — budgeted per-creation (assetId) instead.
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    op: mlOp('op').notNull(),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    createdAt,
  },
  (t) => [index('ml_op_account_time_idx').on(t.accountId, t.createdAt)],
);

// ── POD catalogue (proposal/04) — products → variants (PRICE lives here) → print
// templates, with a PROVIDER-AGNOSTIC sku mapping (a second POD is a new row, not
// a schema change). Seeded from src/pricing; pricing reads the variant price from
// here, falling back to the static catalogue while unseeded. Print geometry is
// SERVER-AUTHORITATIVE; the values are placeholders until the Prodigi sync lands.
export const productCategory = pgEnum('product_category', [
  'PRINT',
  'MUG',
  'APPAREL',
  'CUSHION',
  'BLANKET',
  'BOOK',
  'PUZZLE',
  'BAG',
  'CARD',
  'FESTIVE',
  'ADDON',
]);
export const orientation = pgEnum('orientation', ['PORTRAIT', 'LANDSCAPE', 'SQUARE']);
export const fitMode = pgEnum('fit_mode', ['CONTAIN', 'COVER']);
export const providerSlug = pgEnum('provider_slug', ['PRODIGI', 'MANUAL']);
// Material of a product's print surface — selects the mockup blend recipe (a
// DARK_FABRIC underbase stops the art crushing to black, etc.). See compositor.ts.
export const materialClass = pgEnum('material_class', ['PAPER', 'LIGHT_FABRIC', 'DARK_FABRIC', 'CERAMIC', 'GLOSS']);
// Brand-safe (NON-child) template asset kinds for the mockup compositor.
export const templateAssetKind = pgEnum('template_asset_kind', ['BLANK', 'MASK', 'LIGHTING', 'TEXTURE', 'DISPLACEMENT']);
// Per-item fulfilment state (per the locked decision: per-item, item A ships while B retries).
export const fulfillmentState = pgEnum('fulfillment_state', [
  'PENDING',
  'RENDERING',
  'RENDER_FAILED',
  'READY',
  'SUBMITTED',
  'IN_PRODUCTION',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'BLOCKED_GATE',
  'ERROR',
]);

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(), // matches today's productKey, e.g. 'framedPrint'
  category: productCategory('category').notNull(),
  label: text('label').notNull(),
  blurb: text('blurb'), // short tagline on the tile
  // The expandable product description + specs (material/dimensions/finish). These
  // are POPULATED BY THE PRODIGI CATALOGUE SYNC (P3); seeded with brand-voice
  // placeholders for now. The blurb headline stays in our voice; specs come from
  // Prodigi.
  description: text('description'),
  specs: jsonb('specs'),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  // Curated "Most Popular" rank (1 = first). NULL ⇒ the product lives only in the
  // Full Catalogue, not the front-of-shop popular grid. Founder-curated for now;
  // ready to be driven by real order counts later.
  popularRank: integer('popular_rank'),
  // STOREFRONT curation (founder decision 2026-07-07): only products whose whole
  // experience is "bang on" are on show — launch = the framed print alone. Display
  // curation only: `active` remains the sellable/priceable axis, so hidden products
  // stay fully workable in the backend and graduate by flipping this flag +
  // reseeding — no code change.
  visibleInShop: boolean('visible_in_shop').notNull().default(false),
  createdAt,
});

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull().unique(), // internal sku, e.g. 'framedPrint-a4-black'
    label: text('label').notNull(),
    // Size / colour / finish axes (Prodigi-shaped, e.g. { size: 'A4', colour: 'oak' }).
    attributes: jsonb('attributes').$type<Record<string, string>>(),
    pricePence: integer('price_pence').notNull(), // PRICE lives here — pricing reads this
    currency: text('currency').notNull().default('GBP'),
    isDefault: boolean('is_default').notNull().default(false), // the variant a quick-add uses
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt,
  },
  (t) => [index('variant_product_idx').on(t.productId)],
);

export const printTemplates = pgTable('print_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  variantId: uuid('variant_id')
    .notNull()
    .references(() => productVariants.id, { onDelete: 'cascade' })
    .unique(),
  orientation: orientation('orientation').notNull(),
  printWidthMm: integer('print_width_mm').notNull(),
  printHeightMm: integer('print_height_mm').notNull(),
  bleedMm: integer('bleed_mm').notNull().default(3),
  safeInsetMm: integer('safe_inset_mm').notNull().default(5),
  requiredDpi: integer('required_dpi').notNull().default(300),
  printWidthPx: integer('print_width_px').notNull(),
  printHeightPx: integer('print_height_px').notNull(),
  aspectMilli: integer('aspect_milli').notNull(), // w/h * 1000
  fitMode: fitMode('fit_mode').notNull().default('CONTAIN'),
  minSourceWidthPx: integer('min_source_width_px').notNull(),
  minSourceHeightPx: integer('min_source_height_px').notNull(),
  // ── Mockup-compositor template (NULL ⇒ the catalogue falls back to the SVG
  // ProductMockup for this variant). The print geometry above stays the single
  // source of truth for what Prodigi prints; the mockup reuses it so the preview
  // can't drift from the print. Template assets are brand-safe + NON-child
  // (template_assets), never the child's design. See src/server/print/compositor.ts.
  templateVersion: integer('template_version').notNull().default(1), // cache-invalidation lever (in the derivative key)
  materialClass: materialClass('material_class').notNull().default('PAPER'),
  blankObjectId: uuid('blank_object_id').references(() => templateAssets.id, { onDelete: 'set null' }),
  printQuad: jsonb('print_quad').$type<[number, number][]>(), // 4 normalised corners TL,TR,BR,BL of the print surface on the blank
  maskObjectId: uuid('mask_object_id').references(() => templateAssets.id, { onDelete: 'set null' }),
  lightingObjectId: uuid('lighting_object_id').references(() => templateAssets.id, { onDelete: 'set null' }),
  textureObjectId: uuid('texture_object_id').references(() => templateAssets.id, { onDelete: 'set null' }),
  displacementObjectId: uuid('displacement_object_id').references(() => templateAssets.id, { onDelete: 'set null' }),
  displacementAmpX: integer('displacement_amp_x').notNull().default(0),
  displacementAmpY: integer('displacement_amp_y').notNull().default(0),
  mapResolutionPx: integer('map_resolution_px').notNull().default(1500), // canonical res the maps were authored at
  iccProfile: text('icc_profile').notNull().default('srgb'),
});

// ── template_assets — brand-safe, NON-child mockup template images (blank product
// photos + the maps derived from them). DELIBERATELY has no assetId/childSubjectId,
// so it is structurally outside the children's-data world: never touched by the
// retention purge, never seen by the egress gate. Only the child's DESIGN lives in
// storage_objects; these blanks/maps can come from anywhere (CLAUDE.md asymmetry).
export const templateAssets = pgTable(
  'template_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: templateAssetKind('kind').notNull(),
    bucket: text('bucket').notNull(),
    key: text('key').notNull().unique(), // e.g. templates/{variantId}/v{n}/blank.webp — NO assets/ prefix
    contentType: text('content_type'),
    byteSize: bigint('byte_size', { mode: 'number' }),
    sha256: text('sha256'),
    widthPx: integer('width_px'),
    heightPx: integer('height_px'),
    createdAt,
  },
);

export const productVariantProviders = pgTable(
  'product_variant_providers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'cascade' }),
    provider: providerSlug('provider').notNull(),
    providerSku: text('provider_sku').notNull(), // the POD's sku, e.g. Prodigi 'GLOBAL-FAP-A4'
    providerConfig: jsonb('provider_config'),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('variant_provider_unique').on(t.variantId, t.provider),
    uniqueIndex('variant_default_provider').on(t.variantId).where(sql`${t.isDefault}`),
  ],
);

// ── order_item_artwork — the SERVER-AUTHORITATIVE print spec for a printed line.
// The frozen template snapshot + clamped normalised transform are the ONLY
// geometry the renderer trusts; the print file is a DERIVATIVE under the existing
// asset → storage_objects cascade (so authz + retention already cover it).
export const orderItemArtwork = pgTable(
  'order_item_artwork',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' })
      .unique(),
    // Nullable + SET NULL: once a source asset is purged (post-fulfilment, past
    // retention), the link drops but the FROZEN spec (templateSnapshot) survives
    // for the historical order line. The in-flight-order guard prevents purging a
    // source that's still needed to render.
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id),
    controllerAccountId: uuid('controller_account_id')
      .notNull()
      .references(() => accounts.id),
    templateSnapshot: jsonb('template_snapshot').notNull(), // {printWidthMm,…,requiredDpi} FROZEN at order time
    transform: jsonb('transform').notNull(), // {scale,offsetX,offsetY,rotationDeg} normalised, server-clamped
    sourceObjectId: uuid('source_object_id').references(() => storageObjects.id),
    printObjectId: uuid('print_object_id').references(() => storageObjects.id),
    renderedDpi: integer('rendered_dpi'),
    upscaled: boolean('upscaled').notNull().default(false),
    status: fulfillmentState('status').notNull().default('PENDING'),
    renderError: text('render_error'),
    providerItemId: text('provider_item_id'),
    createdAt,
  },
  (t) => [index('artwork_asset_idx').on(t.assetId), index('artwork_status_idx').on(t.status)],
);

// ── gift_link — a shareable, ready-to-buy cart. The item snapshot is FROZEN at
// creation (immutable jsonb); if a source keepsake is later deleted the link is
// served as "gone". Unguessable token, expirable, revocable, never indexed.
export const giftLinkStatus = pgEnum('gift_link_status', ['ACTIVE', 'REVOKED', 'EXPIRED']);

export const giftLinks = pgTable(
  'gift_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id),
    createdByAccountId: uuid('created_by_account_id')
      .notNull()
      .references(() => accounts.id),
    token: text('token').notNull().unique(),
    title: text('title'),
    /** Frozen [{ assetId, productKey, label, unitPricePence }] — never mutated. */
    items: jsonb('items').notNull(),
    inviteId: uuid('invite_id').references(() => invites.id), // optional embedded family invite
    status: giftLinkStatus('status').notNull().default('ACTIVE'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [index('gift_link_family_idx').on(t.familyId)],
);

// ── Auth.js (passwordless magic-link) — DATABASE sessions so a session is
// revocable (a removed/closed account's sessions can be invalidated server-side).
// The "user" is our own `accounts` row; the adapter maps between the two. No OAuth
// account table — email magic-link only.
export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);
