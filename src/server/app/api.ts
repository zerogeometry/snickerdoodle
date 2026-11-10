import { and, asc, eq, isNull, gt, sql } from 'drizzle-orm';
import { AuthzError, canViewAsset } from '@/authz';
import { appArtistProgress, appCheckoutGrants, appTokens, assets, children, families, type AppProgressData } from '@/db/schema';
import { autoKeepsakesOn, parseProgress, parseSyncPatch, widens, type SyncChoices } from '@/lib/drawSync';
import { deleteAsset, KeepsakeInUseError, resolveViewerContext } from '@/server/assets';
import { assetRefOf } from '@/server/assetRef';
import { loadCatalogue } from '@/server/catalogue';
import { addChild, updateChild } from '@/server/children';
import { createGiftLink } from '@/server/giftLinks';
import { ingestOriginalAsset, type ScreeningOptions } from '@/server/ingest';
import { appUrl } from '@/server/mail';
import { getOrdersForAccount } from '@/server/orders';
import { LIMITS, rateLimit } from '@/server/rateLimit';
import type { DbHandle } from '@/server/db';
import { childInScope, type AppViewer } from './appAuth';
import { hashSecret, newSecret } from './secrets';
import { updateTokenSync } from './sync';

/**
 * What a linked Snickerdoodle Draw phone may do — and nothing more (COMPANION-APP-api-plan.md M6).
 * Each function takes the AppViewer resolved from the key (requireAppViewer) and goes through the
 * same server code (and src/authz) the website uses. The app never sends a family id, a price, a
 * visibility or an owner; all four are decided here. Answers are an ok value or an AppApiError the
 * route turns into `{ reason }` JSON.
 */

export class AppApiError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 422 | 429,
    readonly reason: string,
  ) {
    super(reason);
    this.name = 'AppApiError';
  }
}

export interface AppChild {
  id: string;
  firstName: string;
  birthday?: string;
}
/** A child as the app sees it. The birthday crosses only while the link's "first names and birthdays" is on. */
const toChild = (c: { id: string; firstName: string; birthday: string | null }, sync: SyncChoices): AppChild => ({
  id: c.id,
  firstName: c.firstName,
  ...(c.birthday && sync.children ? { birthday: c.birthday } : {}),
});

/** A sync choice is off for this link (DRAW-APP-sync-choices.md): 403 `{ reason: 'sync-off' }`. */
const syncOff = () => new AppApiError(403, 'sync-off');

// ── GET /products (no key) ────────────────────────────────────────────────────────────────────────

/** Exactly what the shop shows — names and blurbs only. NO prices, ever (founder, 2026-10-20). */
export async function listAppProducts(db: DbHandle): Promise<{ key: string; label: string; blurb: string }[]> {
  const shop = await loadCatalogue(db);
  return shop.map((p) => ({ key: p.key, label: p.label, blurb: p.blurb ?? '' }));
}

// ── GET /me ───────────────────────────────────────────────────────────────────────────────────────

/**
 * The family's name, the little ones this phone is for (first names — for matching a Draw artist to a
 * website child; birthdays only with "first names and birthdays" on) and the link's sync choices.
 * No email, no members, no keepsakes.
 */
export async function getAppMe(db: DbHandle, av: AppViewer): Promise<{ family: { name: string }; children: AppChild[]; sync: SyncChoices }> {
  const [family] = await db.select({ name: families.displayName }).from(families).where(eq(families.id, av.familyId));
  const kids = await db
    .select({ id: children.id, firstName: children.firstName, birthday: children.birthday })
    .from(children)
    .where(eq(children.familyId, av.familyId))
    .orderBy(asc(children.createdAt));
  return { family: { name: family?.name ?? 'your family' }, children: kids.filter((k) => childInScope(av, k.id)).map((k) => toChild(k, av.sync)), sync: av.sync };
}

// ── PATCH /me/sync ────────────────────────────────────────────────────────────────────────────────

/**
 * The grown-ups' corner changed what syncs (any subset). Validated; audited as a consent change. The
 * app may only NARROW or stop (keepsakes all → proud → none; a box on → off): widening happens on the
 * website's account page (founder, 10 Nov) — 403 `{ reason: 'widen-on-website' }`.
 */
export async function updateAppSync(db: DbHandle, av: AppViewer, body: Record<string, unknown>): Promise<SyncChoices> {
  const parsed = parseSyncPatch(body);
  if (!parsed.ok) throw new AppApiError(422, parsed.reason);
  if (widens(av.sync, parsed.patch)) throw new AppApiError(403, 'widen-on-website');
  return updateTokenSync(db, { tokenId: av.tokenId, accountId: av.accountId, familyId: av.familyId }, parsed.patch, 'app');
}

// ── POST /children · PATCH /children/{id} ─────────────────────────────────────────────────────────

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Add a little one (first name + optional birthday), the same rules as the website: screened, no
 * surname. Allowed whatever the choices (a drawing needs a child to be filed under), but a birthday
 * is only kept while "first names and birthdays" is on — otherwise it's dropped, not stored.
 */
export async function addAppChild(db: DbHandle, av: AppViewer, body: Record<string, unknown>): Promise<AppChild> {
  const firstName = str(body.firstName);
  if (!firstName) throw new AppApiError(422, 'name');
  let birthday = body.birthday === undefined || body.birthday === null ? null : str(body.birthday);
  if (birthday === undefined) throw new AppApiError(422, 'birthday');
  if (!av.sync.children) birthday = null;
  const res = await addChild(db, av.viewer, { familyId: av.familyId, firstName, birthday });
  if (!res.ok) throw res.reason === 'not-owner' ? new AppApiError(403, 'not-owner') : new AppApiError(422, res.reason === 'birthday' ? 'birthday' : 'name');
  // a phone that's only for some of the children: the one it just added is one of them
  if (av.childIds !== null && !av.childIds.includes(res.child.id)) {
    await db
      .update(appTokens)
      .set({ childIds: sql`coalesce(${appTokens.childIds}, '[]'::jsonb) || ${JSON.stringify([res.child.id])}::jsonb` })
      .where(eq(appTokens.id, av.tokenId));
  }
  const [row] = await db.select({ id: children.id, firstName: children.firstName, birthday: children.birthday }).from(children).where(eq(children.id, res.child.id));
  return toChild(row!, av.sync);
}

/** A rename / birthday from the app — only while the link's "first names and birthdays" is on. */
export async function updateAppChild(db: DbHandle, av: AppViewer, childId: string, body: Record<string, unknown>): Promise<AppChild> {
  if (!av.sync.children) throw syncOff();
  if (!childInScope(av, childId)) throw new AppApiError(404, 'not-found');
  const patch: { firstName?: string; birthday?: string | null } = {};
  if (body.firstName !== undefined) {
    const n = str(body.firstName);
    if (!n) throw new AppApiError(422, 'name');
    patch.firstName = n;
  }
  if (body.birthday !== undefined) {
    if (body.birthday !== null && typeof body.birthday !== 'string') throw new AppApiError(422, 'birthday');
    patch.birthday = (body.birthday as string | null) || null;
  }
  const res = await updateChild(db, av.viewer, { familyId: av.familyId, childId, ...patch });
  if (!res.ok) {
    if (res.reason === 'not-owner') throw new AppApiError(404, 'not-found'); // not this family's child
    if (res.reason === 'taken') throw new AppApiError(409, 'taken');
    throw new AppApiError(422, res.reason === 'birthday' ? 'birthday' : 'name');
  }
  const [row] = await db.select({ id: children.id, firstName: children.firstName, birthday: children.birthday }).from(children).where(eq(children.id, childId));
  return toChild(row!, av.sync);
}

// ── GET / PUT /artists/{childId}/progress — the drawing-days backup ──────────────────────────────

/** This phone's child, in the key's family — or 404 (another family's, an unticked one, or no such child). */
async function progressChild(db: DbHandle, av: AppViewer, childId: string): Promise<string> {
  if (!av.sync.progress) throw syncOff();
  if (!/^[0-9a-f-]{36}$/i.test(childId) || !childInScope(av, childId)) throw new AppApiError(404, 'not-found');
  const [child] = await db.select({ id: children.id }).from(children).where(and(eq(children.id, childId), eq(children.familyId, av.familyId)));
  if (!child) throw new AppApiError(404, 'not-found');
  return child.id;
}

/** The backup for a new phone to pick up. 404 `{ reason: 'none' }` when there isn't one. */
export async function getAppProgress(db: DbHandle, av: AppViewer, childId: string): Promise<AppProgressData> {
  const id = await progressChild(db, av, childId);
  const [row] = await db.select({ data: appArtistProgress.data }).from(appArtistProgress).where(eq(appArtistProgress.childId, id));
  if (!row) throw new AppApiError(404, 'none');
  return row.data;
}

/** Replace the backup with the phone's (checked, trimmed to the five fields). */
export async function putAppProgress(db: DbHandle, av: AppViewer, childId: string, body: Record<string, unknown>, now = new Date()): Promise<void> {
  const id = await progressChild(db, av, childId);
  const parsed = parseProgress(body);
  if (!parsed.ok) throw new AppApiError(422, 'progress');
  await db
    .insert(appArtistProgress)
    .values({ childId: id, familyId: av.familyId, data: parsed.data, updatedAt: now })
    .onConflictDoUpdate({ target: appArtistProgress.childId, set: { data: parsed.data, updatedAt: now } });
}

// ── POST /assets — "keep it" / "make it real" ─────────────────────────────────────────────────────

export const APP_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/**
 * UK Children's Code: no real child's drawing comes from the app until the sign-off
 * (COMPANION-APP-api-plan.md Phase 0). The app has its own switch (REAL_DRAWING_UPLOADS_SIGNED_OFF);
 * this is the website's, OFF unless `DRAW_APP_UPLOADS=on`. Turn it on for the test site (sample art
 * only) now, and on the live site only on the founder's word once the sign-off is done.
 */
export function appUploadsOpen(env: Record<string, string | undefined> = process.env): boolean {
  return env.DRAW_APP_UPLOADS === 'on';
}

const isPng = (b: Buffer) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** A YYYY-MM-DD that's a real day, not before 2000 and not after tomorrow (time zones). */
export function validMadeOn(raw: unknown, now = new Date()): string | null {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  if (d.getUTCFullYear() < 2000 || d.getTime() > now.getTime() + 86_400_000) return null;
  return raw;
}

export interface AppKeepInput {
  image: Blob | null;
  childId: unknown;
  madeOn: unknown;
  source: unknown;
  /** 'manual' (a grown-up's one-off keep it / make it real / ready-to-buy link — the default, for older
   * app versions) or 'auto' (the app's sync queue, allowed only while keepsakes is proud or all). */
  trigger?: unknown;
}

/** `manual` when absent (older app versions); anything but the two values is refused. */
export function parseTrigger(raw: unknown): 'manual' | 'auto' | null {
  if (raw === undefined || raw === null || raw === '') return 'manual';
  return raw === 'manual' || raw === 'auto' ? raw : null;
}

/**
 * The grown-up tapped "keep it" (or "make it real") on one drawing — or, with `trigger: 'auto'`, the
 * app's sync queue sent it under the grown-up's keepsakes choice. Either way it goes through the SAME ingest
 * as a website upload: EXIF/GPS stripped, private bucket, FAMILY visibility, kept in the keepsake
 * home, and the safety checks (run after the response, as the website does — D26: until they clear,
 * only the grown-up can see it). The answer never says "flagged": a child might be looking.
 * The app's optional `title` is not stored (we don't need it; minimisation).
 */
export async function keepAppDrawing(
  db: DbHandle,
  av: AppViewer,
  input: AppKeepInput,
  opts: { env?: Record<string, string | undefined>; screening?: ScreeningOptions } = {},
): Promise<{ assetId: string; kept: true }> {
  if (!appUploadsOpen(opts.env)) throw new AppApiError(403, 'not-yet');
  const trigger = parseTrigger(input.trigger);
  if (!trigger) throw new AppApiError(422, 'trigger');
  // the app sending drawings by itself needs the grown-up's standing choice (proud pile / all drawings)
  if (trigger === 'auto' && !autoKeepsakesOn(av.sync.keepsakes)) throw syncOff();
  const childId = str(input.childId);
  if (!childId || !childInScope(av, childId)) throw new AppApiError(422, 'child');
  const [child] = await db.select({ id: children.id }).from(children).where(and(eq(children.id, childId), eq(children.familyId, av.familyId)));
  if (!child) throw new AppApiError(422, 'child');
  const source = input.source === 'app-screen' || input.source === 'app-paper' ? input.source : null;
  if (!source) throw new AppApiError(422, 'source');
  const madeOn = validMadeOn(input.madeOn);
  if (!madeOn) throw new AppApiError(422, 'made-on');
  if (!input.image || typeof input.image.arrayBuffer !== 'function') throw new AppApiError(422, 'image');
  if (input.image.size > APP_UPLOAD_MAX_BYTES) throw new AppApiError(413, 'too-big');
  const buffer = Buffer.from(await input.image.arrayBuffer());
  if (!isPng(buffer) && !isJpeg(buffer)) throw new AppApiError(415, 'image');

  const gate = await rateLimit(db, { ...LIMITS.homeUploadPerAccount, caller: av.accountId });
  if (!gate.ok) throw new AppApiError(429, 'slow-down');

  let assetId: string;
  try {
    ({ assetId } = await ingestOriginalAsset(db, av.viewer, { familyId: av.familyId, kind: 'DRAWING', childSubjectId: childId, buffer, keptInHome: true }, opts.screening ?? { background: true }));
  } catch (e) {
    if (e instanceof AuthzError) throw new AppApiError(403, 'not-owner');
    throw new AppApiError(422, 'image'); // not an image sharp can read
  }
  await db.update(assets).set({ source, madeOn }).where(eq(assets.id, assetId));
  return { assetId, kept: true };
}

/** A keepsake THIS app sent, in the key's family — the only kind the app may touch (M6). */
async function appAsset(db: DbHandle, av: AppViewer, assetId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new AppApiError(404, 'not-found');
  const [row] = await db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.familyId, av.familyId)));
  if (!row || row.source === 'web') throw new AppApiError(404, 'not-found');
  if (row.childSubjectId && !childInScope(av, row.childSubjectId)) throw new AppApiError(404, 'not-found');
  return row;
}

// ── DELETE /assets/{id} ───────────────────────────────────────────────────────────────────────────

/** Really delete a keepsake the app sent (bytes, row, ledger — the website's own cascading delete). */
export async function deleteAppAsset(db: DbHandle, av: AppViewer, assetId: string): Promise<void> {
  await appAsset(db, av, assetId);
  try {
    await deleteAsset(db, assetId, av.viewer);
  } catch (e) {
    if (e instanceof KeepsakeInUseError) throw new AppApiError(409, 'in-order');
    if (e instanceof AuthzError) throw new AppApiError(404, 'not-found');
    throw e;
  }
}

// ── POST /checkout-grants — "make it real" opens the website ──────────────────────────────────────

export const CHECKOUT_GRANT_TTL_MS = 15 * 60_000;

async function liveProduct(db: DbHandle, productKey: unknown): Promise<string> {
  const key = str(productKey);
  const shop = await loadCatalogue(db);
  if (!key || !shop.some((p) => p.key === key)) throw new AppApiError(422, 'product');
  return key;
}

/**
 * A single-use, 15-minute pass that opens the website's maker for THIS keepsake on THIS product, in
 * the phone's browser. It is NOT a sign-in: the grown-up signs in to the website (if they aren't
 * already) as the same account, so a leaked pass can't show or buy anything on its own. The price
 * is worked out by the website at checkout, never by the app.
 */
export async function mintAppCheckoutGrant(db: DbHandle, av: AppViewer, body: Record<string, unknown>, now = new Date()): Promise<{ url: string; expiresAt: string }> {
  const row = await appAsset(db, av, str(body.assetId) ?? '');
  if (!row.keptInHome || row.moderationStatus === 'BLOCKED') throw new AppApiError(404, 'not-found');
  const productKey = await liveProduct(db, body.productKey);
  const pass = newSecret('sdg_');
  const expiresAt = new Date(now.getTime() + CHECKOUT_GRANT_TTL_MS);
  await db.insert(appCheckoutGrants).values({ tokenHash: hashSecret(pass), appTokenId: av.tokenId, accountId: av.accountId, familyId: av.familyId, assetId: row.id, productKey, expiresAt });
  return { url: appUrl(`/app/checkout/${pass}`), expiresAt: expiresAt.toISOString() };
}

export type ConsumeGrantResult = { ok: true; assetId: string; productKey: string } | { ok: false; reason: 'gone' | 'other-account' };

/**
 * The website side of the pass (/app/checkout/<pass>), for the SIGNED-IN account. Burned atomically on
 * first use, only by the account that made it, and only if that account can still see the keepsake.
 */
export async function consumeAppCheckoutGrant(db: DbHandle, pass: string, accountId: string, now = new Date()): Promise<ConsumeGrantResult> {
  if (!/^sdg_[A-Za-z0-9_-]{43}$/.test(pass)) return { ok: false, reason: 'gone' };
  const tokenHash = hashSecret(pass);
  const [used] = await db
    .update(appCheckoutGrants)
    .set({ usedAt: now })
    .where(and(eq(appCheckoutGrants.tokenHash, tokenHash), isNull(appCheckoutGrants.usedAt), gt(appCheckoutGrants.expiresAt, now), eq(appCheckoutGrants.accountId, accountId)))
    .returning();
  if (!used) {
    const [other] = await db.select({ accountId: appCheckoutGrants.accountId, usedAt: appCheckoutGrants.usedAt, expiresAt: appCheckoutGrants.expiresAt }).from(appCheckoutGrants).where(eq(appCheckoutGrants.tokenHash, tokenHash));
    const stillLive = other && !other.usedAt && other.expiresAt.getTime() > now.getTime();
    return { ok: false, reason: stillLive && other.accountId !== accountId ? 'other-account' : 'gone' };
  }
  const [asset] = await db.select().from(assets).where(eq(assets.id, used.assetId));
  const viewer = await resolveViewerContext(db, accountId, used.familyId);
  if (!asset || asset.familyId !== used.familyId || !canViewAsset(assetRefOf(asset), viewer).allowed) return { ok: false, reason: 'gone' };
  return { ok: true, assetId: used.assetId, productKey: used.productKey };
}

// ── POST /wishes — "share a ready-to-buy link" ───────────────────────────────────────────────────

/** The website's own gift link for one keepsake × product (14 days, revocable, owner-only, cleared art only). */
export async function mintAppWish(db: DbHandle, av: AppViewer, body: Record<string, unknown>): Promise<{ url: string }> {
  const row = await appAsset(db, av, str(body.assetId) ?? '');
  const productKey = await liveProduct(db, body.productKey);
  const gate = await rateLimit(db, { ...LIMITS.giftLinksPerAccount, caller: av.accountId });
  if (!gate.ok) throw new AppApiError(429, 'slow-down');
  let title: string | null = null;
  if (row.childSubjectId) {
    const [c] = await db.select({ firstName: children.firstName }).from(children).where(eq(children.id, row.childSubjectId));
    if (c) title = `${c.firstName}’s wishlist`;
  }
  try {
    const { token } = await createGiftLink(db, av.viewer, { familyId: av.familyId, assetIds: [row.id], productKey, title, invite: null });
    return { url: appUrl(`/g/${token}`) };
  } catch (e) {
    // not cleared yet (or the product can't go on a gift link): the app says "not just yet"
    if (e instanceof AuthzError) throw new AppApiError(409, 'not-ready');
    throw e;
  }
}

// ── GET /orders ───────────────────────────────────────────────────────────────────────────────────

/** The grown-up's own orders, as a short list: reference, day placed, status. Nothing else. */
export async function listAppOrders(db: DbHandle, av: AppViewer): Promise<{ id: string; placedOn: string; status: string }[]> {
  const orders = await getOrdersForAccount(db, av.accountId);
  return orders.map((o) => ({ id: o.ref, placedOn: o.createdAtISO.slice(0, 10), status: o.status }));
}
