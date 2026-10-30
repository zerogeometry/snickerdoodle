import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, ne } from 'drizzle-orm';
import sharp from 'sharp';
import { accounts, auditRecords, emailChangeRequests, families, memberships, profileImages } from '@/db/schema';
import { canManageFamily, canViewProfileImage, SCREENING_NOT_CONFIGURED_LABEL } from '@/authz';
import { deleteObjectConfirmed, getObjectBytes, putObject } from '@/storage';
import { resolveViewerContext } from './assets';
import type { DbHandle } from './db';
import { recordErasure } from './erasureLedger';
import { appUrl, sendMail } from './mail';
import { defaultProviders, isModerationConfigured, moderateImage, type ModerationProviders } from './moderation';
import { containsAbusiveText } from './textSafety';

export type ProfileImageKind = 'AVATAR' | 'ACCOUNT_HEADER' | 'FAMILY_BANNER';

/** Output size per kind — re-encoding also drops every bit of metadata (EXIF/GPS). */
const SHAPE: Record<ProfileImageKind, { width: number; height: number }> = {
  AVATAR: { width: 512, height: 512 },
  ACCOUNT_HEADER: { width: 1600, height: 600 },
  FAMILY_BANNER: { width: 1800, height: 600 },
};
export const PROFILE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const MAX_INPUT_PIXELS = 60_000_000;

/** The ONLY way a profile image reaches a browser: this route, which runs canViewProfileImage. */
export const profileImageUrl = (id: string) => `/api/profile-image/${id}`;

export async function activeFamilyIdsFor(db: DbHandle, accountId: string): Promise<string[]> {
  const rows = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(and(eq(memberships.accountId, accountId), eq(memberships.status, 'ACTIVE')));
  return rows.map((r) => r.familyId);
}

export type SetImageResult = { ok: true; id: string; status: string } | { ok: false; reason: 'not-an-image' | 'too-big' | 'not-owner' };

/**
 * Set (or replace) a profile picture, profile header, or — owner only — a family banner. The new
 * image is re-encoded to a fixed size (no metadata survives), screened like every upload (CSAM
 * hash on the bytes as uploaded, then the classifier; fails closed in production when screening
 * isn't configured), stored privately, and the previous one is erased for real.
 */
export async function setProfileImage(
  db: DbHandle,
  accountId: string,
  input: { kind: ProfileImageKind; buffer: Buffer; familyId?: string | null },
  opts: { providers?: ModerationProviders; env?: Record<string, string | undefined> } = {},
): Promise<SetImageResult> {
  const env = opts.env ?? process.env;
  if (input.buffer.byteLength > PROFILE_IMAGE_MAX_BYTES) return { ok: false, reason: 'too-big' };
  let familyId: string | null = null;
  if (input.kind === 'FAMILY_BANNER') {
    familyId = input.familyId ?? null;
    const viewer = familyId ? await resolveViewerContext(db, accountId, familyId) : null;
    if (!familyId || !viewer || !canManageFamily(viewer.membership) || viewer.membership!.familyId !== familyId) return { ok: false, reason: 'not-owner' };
  }

  let encoded: { data: Buffer; info: { width: number; height: number } };
  try {
    const { width, height } = SHAPE[input.kind];
    encoded = await sharp(input.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width, height, fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { ok: false, reason: 'not-an-image' };
  }

  // Screening (D8): same gate as drawings. Fail closed in production with no real screening.
  const unscreened = !opts.providers && env.NODE_ENV === 'production' && !isModerationConfigured(env);
  const verdict = unscreened
    ? { status: 'FLAGGED' as const, labels: [SCREENING_NOT_CONFIGURED_LABEL] }
    : await moderateImage(
        { buffer: encoded.data, sha256: createHash('sha256').update(encoded.data).digest('hex'), originalBuffer: input.buffer },
        opts.providers ?? defaultProviders(env),
      );

  // Replace: erase the old one first (one per slot), then store the new one.
  const [old] = await db.select().from(profileImages).where(slotWhere(accountId, input.kind, familyId));
  if (old) await eraseProfileImage(db, old);

  const id = randomUUID();
  const key = `profile/${id}.webp`;
  await putObject(key, encoded.data, 'image/webp');
  await db.insert(profileImages).values({
    id,
    kind: input.kind,
    accountId,
    familyId,
    key,
    contentType: 'image/webp',
    width: encoded.info.width,
    height: encoded.info.height,
    byteSize: encoded.data.byteLength,
    moderationStatus: verdict.status,
    moderatedAt: new Date(),
    moderationDetail: { labels: verdict.labels },
  });
  await db.insert(auditRecords).values({
    familyId,
    actorAccountId: accountId,
    actorType: 'MEMBER',
    event: 'PROFILE_UPDATED',
    targetType: 'profile_image',
    targetId: id,
    metadata: { field: input.kind },
  });
  if (verdict.status !== 'CLEAR') {
    await db.insert(auditRecords).values({
      familyId,
      actorType: 'SYSTEM',
      event: verdict.status === 'BLOCKED' ? 'CONTENT_BLOCKED' : 'CONTENT_FLAGGED',
      targetType: 'profile_image',
      targetId: id,
      metadata: { labels: verdict.labels },
    });
  }
  return { ok: true, id, status: verdict.status };
}

function slotWhere(accountId: string, kind: ProfileImageKind, familyId: string | null) {
  return kind === 'FAMILY_BANNER'
    ? and(eq(profileImages.kind, 'FAMILY_BANNER'), eq(profileImages.familyId, familyId!))
    : and(eq(profileImages.kind, kind), eq(profileImages.accountId, accountId));
}

/** Remove a picture / header (yours) or the family banner (owner only). Really erased. */
export async function removeProfileImage(db: DbHandle, accountId: string, kind: ProfileImageKind, familyId?: string | null): Promise<{ ok: boolean }> {
  if (kind === 'FAMILY_BANNER') {
    const viewer = familyId ? await resolveViewerContext(db, accountId, familyId) : null;
    if (!familyId || !viewer || !canManageFamily(viewer.membership) || viewer.membership!.familyId !== familyId) return { ok: false };
  }
  const [row] = await db.select().from(profileImages).where(slotWhere(accountId, kind, familyId ?? null));
  if (!row) return { ok: true };
  await eraseProfileImage(db, row);
  await db.insert(auditRecords).values({
    familyId: row.familyId,
    actorAccountId: accountId,
    actorType: 'MEMBER',
    event: 'PROFILE_UPDATED',
    targetType: 'profile_image',
    targetId: row.id,
    metadata: { field: kind, removed: true },
  });
  return { ok: true };
}

/** Bytes first (confirmed), then the row, then the out-of-DB ledger. CSAM-blocked is preserved. */
export async function eraseProfileImage(db: DbHandle, row: { id: string; key: string; moderationStatus: string }, opts: { skipLedger?: boolean } = {}): Promise<void> {
  if (row.moderationStatus === 'BLOCKED') {
    // D8 runbook: CSAM-matched bytes are PRESERVED for the report (never deleted, never shown).
    // Unlink it from the profile only; the CONTENT_BLOCKED audit row already names it.
    await db.delete(profileImages).where(eq(profileImages.id, row.id));
    await db.insert(auditRecords).values({ actorType: 'SYSTEM', event: 'CONTENT_BLOCKED', targetType: 'profile_image', targetId: row.id, metadata: { preservedKey: row.key, unlinked: true } });
    return;
  }
  await deleteObjectConfirmed(row.key);
  await db.delete(profileImages).where(eq(profileImages.id, row.id));
  if (!opts.skipLedger) await recordErasure({ kind: 'profile-image', id: row.id });
}

/** The bytes of one image, if THIS viewer may see it (canViewProfileImage) — else null (404). */
export async function readProfileImage(db: DbHandle, id: string, viewerAccountId: string | null): Promise<{ bytes: Buffer; contentType: string } | null> {
  const [row] = await db.select().from(profileImages).where(eq(profileImages.id, id));
  if (!row) return null;
  const viewerFamilies = viewerAccountId ? await activeFamilyIdsFor(db, viewerAccountId) : [];
  const ownerFamilies = row.kind === 'FAMILY_BANNER' ? [] : await activeFamilyIdsFor(db, row.accountId);
  const decision = canViewProfileImage(
    { kind: row.kind, accountId: row.accountId, familyId: row.familyId, moderationStatus: row.moderationStatus, ownerFamilyIds: ownerFamilies },
    { accountId: viewerAccountId, activeFamilyIds: viewerFamilies },
  );
  if (!decision.allowed) return null;
  return { bytes: await getObjectBytes(row.key), contentType: row.contentType };
}

/**
 * Picture + header ids for a set of people, as THIS viewer may see them — the url is only handed
 * out when canViewProfileImage allows it (the route re-checks anyway).
 */
export async function profileImagesFor(
  db: DbHandle,
  viewerAccountId: string,
  accountIds: string[],
): Promise<Map<string, { avatarUrl: string | null; headerUrl: string | null }>> {
  const out = new Map<string, { avatarUrl: string | null; headerUrl: string | null }>();
  if (accountIds.length === 0) return out;
  const rows = await db
    .select()
    .from(profileImages)
    .where(and(inArray(profileImages.accountId, accountIds), ne(profileImages.kind, 'FAMILY_BANNER')));
  const viewerFamilies = await activeFamilyIdsFor(db, viewerAccountId);
  for (const id of accountIds) out.set(id, { avatarUrl: null, headerUrl: null });
  for (const r of rows) {
    const ownerFamilies = await activeFamilyIdsFor(db, r.accountId);
    const ok = canViewProfileImage(
      { kind: r.kind, accountId: r.accountId, familyId: null, moderationStatus: r.moderationStatus, ownerFamilyIds: ownerFamilies },
      { accountId: viewerAccountId, activeFamilyIds: viewerFamilies },
    ).allowed;
    if (!ok) continue;
    const slot = out.get(r.accountId)!;
    if (r.kind === 'AVATAR') slot.avatarUrl = profileImageUrl(r.id);
    else slot.headerUrl = profileImageUrl(r.id);
  }
  return out;
}

/** The family banner url, if this viewer may see it. */
export async function familyBannerFor(db: DbHandle, viewerAccountId: string, familyId: string): Promise<string | null> {
  const [r] = await db.select().from(profileImages).where(and(eq(profileImages.kind, 'FAMILY_BANNER'), eq(profileImages.familyId, familyId)));
  if (!r) return null;
  const ok = canViewProfileImage(
    { kind: r.kind, accountId: r.accountId, familyId: r.familyId, moderationStatus: r.moderationStatus, ownerFamilyIds: [] },
    { accountId: viewerAccountId, activeFamilyIds: await activeFamilyIdsFor(db, viewerAccountId) },
  ).allowed;
  return ok ? profileImageUrl(r.id) : null;
}

// ── Name ─────────────────────────────────────────────────────────────────────────

/** Your display name, as your family sees it. Screened; 1–40 characters. */
export async function updateDisplayName(db: DbHandle, accountId: string, raw: string): Promise<{ ok: boolean; name?: string }> {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 40 || containsAbusiveText(name)) return { ok: false };
  await db.update(accounts).set({ displayName: name, updatedAt: new Date() }).where(eq(accounts.id, accountId));
  await db.insert(auditRecords).values({ actorAccountId: accountId, actorType: 'MEMBER', event: 'PROFILE_UPDATED', targetType: 'account', targetId: accountId, metadata: { field: 'name' } });
  return { ok: true, name };
}

// ── Email ────────────────────────────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000; // an hour to click the link
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export type EmailChangeRequest = { ok: true } | { ok: false; reason: 'invalid' | 'same' };

/**
 * Ask to change your email: we send a confirmation link to the NEW address (proving it's yours)
 * and a heads-up to the current one. Nothing changes until the link is used. One live request
 * per account (a new one replaces the old).
 */
export async function requestEmailChange(db: DbHandle, accountId: string, rawEmail: string, now = new Date()): Promise<EmailChangeRequest> {
  const newEmail = String(rawEmail ?? '').trim().toLowerCase();
  if (newEmail.length > 254 || !EMAIL.test(newEmail)) return { ok: false, reason: 'invalid' };
  const [me] = await db.select({ email: accounts.email, name: accounts.displayName }).from(accounts).where(eq(accounts.id, accountId));
  if (!me) return { ok: false, reason: 'invalid' };
  if (me.email === newEmail) return { ok: false, reason: 'same' };
  const hi = `Hi${me.name ? ` ${me.name.split(' ')[0]}` : ''},`;
  const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, newEmail));
  if (taken) {
    // The SAME answer as a free address (08-B14: never tell a signed-in person whether an email
    // already has an account). Only that inbox's owner hears — and nothing changes for anyone.
    await sendMail({
      kind: 'email-change',
      to: newEmail,
      subject: 'someone tried to use this email on snickerdoodle',
      text: ['Hi,', '', 'Someone asked to move their Snickerdoodle account to this email address. You already have an account with it, so nothing has changed.', 'If that was you, just sign in with this address instead.', '', '— the Snickerdoodle team'].join('\n'),
    });
    return { ok: true };
  }

  const token = randomBytes(32).toString('base64url');
  await db.delete(emailChangeRequests).where(eq(emailChangeRequests.accountId, accountId));
  await db.insert(emailChangeRequests).values({ accountId, newEmail, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + EMAIL_CHANGE_TTL_MS) });

  await sendMail({
    kind: 'email-change',
    to: newEmail,
    subject: 'confirm your new email for snickerdoodle',
    text: [hi, '', 'Tap to make this your Snickerdoodle email (the link works for an hour):', appUrl(`/account/confirm-email?token=${token}`), '', 'Didn’t ask for this? Just ignore it — nothing changes.', '', '— the Snickerdoodle team'].join('\n'),
  });
  await sendMail({
    kind: 'email-change',
    to: me.email,
    subject: 'someone asked to change your snickerdoodle email',
    text: [hi, '', `We’ve sent a link to ${newEmail} to confirm it as your new email. Until it’s confirmed, nothing changes.`, 'If this wasn’t you, sign in and change nothing — the request simply expires in an hour.', '', '— the Snickerdoodle team'].join('\n'),
  });
  return { ok: true };
}

/** The link from the new inbox: switch the account's email (if still free) and tell the old one. */
export async function confirmEmailChange(db: DbHandle, token: string, now = new Date()): Promise<{ ok: boolean; reason?: 'expired' | 'taken' }> {
  const [req] = await db
    .select()
    .from(emailChangeRequests)
    .where(and(eq(emailChangeRequests.tokenHash, hashToken(String(token ?? ''))), gt(emailChangeRequests.expiresAt, now)));
  if (!req) return { ok: false, reason: 'expired' };
  const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, req.newEmail));
  if (taken && taken.id !== req.accountId) {
    await db.delete(emailChangeRequests).where(eq(emailChangeRequests.id, req.id));
    return { ok: false, reason: 'taken' };
  }
  const [before] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, req.accountId));
  await db.update(accounts).set({ email: req.newEmail, emailVerifiedAt: now, updatedAt: now }).where(eq(accounts.id, req.accountId));
  await db.delete(emailChangeRequests).where(eq(emailChangeRequests.id, req.id));
  await db.insert(auditRecords).values({ actorAccountId: req.accountId, actorType: 'MEMBER', event: 'EMAIL_CHANGED', targetType: 'account', targetId: req.accountId });
  if (before?.email) {
    await sendMail({
      kind: 'email-change',
      to: before.email,
      subject: 'your snickerdoodle email has changed',
      text: ['Hi,', '', `Your Snickerdoodle email is now ${req.newEmail}. If that wasn’t you, reply to this email straight away and we’ll help.`, '', '— the Snickerdoodle team'].join('\n'),
    });
  }
  return { ok: true };
}

/** Everything profile-ish an account holds — for the data export. */
export async function profileDataFor(db: DbHandle, accountId: string) {
  const images = await db
    .select({ kind: profileImages.kind, familyId: profileImages.familyId, addedAt: profileImages.createdAt, status: profileImages.moderationStatus })
    .from(profileImages)
    .where(eq(profileImages.accountId, accountId));
  const owned = await db.select({ id: families.id }).from(families).where(eq(families.ownerAccountId, accountId));
  return { images, ownsFamilies: owned.map((f) => f.id) };
}
