import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { accounts, profileImages } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { closeAccount } from '@/server/accountClosure';
import {
  confirmEmailChange,
  familyBannerFor,
  profileImagesFor,
  readProfileImage,
  removeProfileImage,
  requestEmailChange,
  setProfileImage,
  updateDisplayName,
} from '@/server/profile';
import { getObjectBytes } from '@/storage';
import type { DbHandle } from '@/server/db';
import type { ModerationProviders } from '@/server/moderation';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const CLEAR: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) } };
const FLAG: ModerationProviders = { hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: true, labels: ['x'] }) } };

/** A photo carrying EXIF, like a phone's. */
const photo = (w = 1200, h = 900) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'phone-metadata' } })
    .toBuffer();

describe.skipIf(!DB || !S3)('profiles — pictures, header, family banner, name, email', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    log.mockRestore();
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('a profile picture is re-encoded small, metadata gone, and visible only to the circle', async () => {
    const res = await setProfileImage(db, ids.samId, { kind: 'AVATAR', buffer: await photo() }, { providers: CLEAR });
    expect(res).toMatchObject({ ok: true, status: 'CLEAR' });
    if (!res.ok) return;
    const [row] = await db.select().from(profileImages).where(eq(profileImages.id, res.id));
    const meta = await sharp(await getObjectBytes(row!.key)).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();

    expect(await readProfileImage(db, res.id, ids.samId)).not.toBeNull(); // yourself
    expect(await readProfileImage(db, res.id, ids.rosieId)).not.toBeNull(); // shares Hartley
    expect(await readProfileImage(db, res.id, ids.blakeId)).toBeNull(); // another family
    expect(await readProfileImage(db, res.id, ids.malloryId)).toBeNull(); // removed member
    expect(await readProfileImage(db, res.id, null)).toBeNull(); // signed out — nothing public

    const map = await profileImagesFor(db, ids.rosieId, [ids.samId]);
    expect(map.get(ids.samId)?.avatarUrl).toBe(`/api/profile-image/${res.id}`);
    expect((await profileImagesFor(db, ids.blakeId, [ids.samId])).get(ids.samId)?.avatarUrl).toBeNull();
  });

  it('a flagged picture is seen only by its owner until reviewed', async () => {
    const res = await setProfileImage(db, ids.joId, { kind: 'ACCOUNT_HEADER', buffer: await photo() }, { providers: FLAG });
    expect(res).toMatchObject({ ok: true, status: 'FLAGGED' });
    if (!res.ok) return;
    expect(await readProfileImage(db, res.id, ids.joId)).not.toBeNull();
    expect(await readProfileImage(db, res.id, ids.samId)).toBeNull();
  });

  it('replacing erases the old image for real; removing erases it too', async () => {
    const first = await setProfileImage(db, ids.rosieId, { kind: 'AVATAR', buffer: await photo() }, { providers: CLEAR });
    const second = await setProfileImage(db, ids.rosieId, { kind: 'AVATAR', buffer: await photo(800, 800) }, { providers: CLEAR });
    if (!first.ok || !second.ok) throw new Error('upload');
    expect(await db.select().from(profileImages).where(eq(profileImages.id, first.id))).toHaveLength(0);
    expect(await readProfileImage(db, first.id, ids.rosieId)).toBeNull();
    expect(await removeProfileImage(db, ids.rosieId, 'AVATAR')).toEqual({ ok: true });
    expect(await db.select().from(profileImages).where(and(eq(profileImages.accountId, ids.rosieId), eq(profileImages.kind, 'AVATAR')))).toHaveLength(0);
  });

  it('only the parent sets the family banner; members see it, outsiders do not', async () => {
    expect(await setProfileImage(db, ids.joId, { kind: 'FAMILY_BANNER', buffer: await photo(), familyId: ids.hartleyId }, { providers: CLEAR })).toEqual({ ok: false, reason: 'not-owner' });
    const res = await setProfileImage(db, ids.samId, { kind: 'FAMILY_BANNER', buffer: await photo(), familyId: ids.hartleyId }, { providers: CLEAR });
    expect(res.ok).toBe(true);
    expect(await familyBannerFor(db, ids.rosieId, ids.hartleyId)).toMatch(/^\/api\/profile-image\//);
    expect(await familyBannerFor(db, ids.blakeId, ids.hartleyId)).toBeNull();
    expect(await removeProfileImage(db, ids.joId, 'FAMILY_BANNER', ids.hartleyId)).toEqual({ ok: false });
  });

  it('rejects something that is not a picture', async () => {
    expect(await setProfileImage(db, ids.samId, { kind: 'AVATAR', buffer: Buffer.from('not an image') }, { providers: CLEAR })).toEqual({ ok: false, reason: 'not-an-image' });
  });

  it('names are screened; 1–40 characters', async () => {
    expect(await updateDisplayName(db, ids.samId, '   ')).toEqual({ ok: false });
    expect(await updateDisplayName(db, ids.samId, 'x'.repeat(41))).toEqual({ ok: false });
    expect(await updateDisplayName(db, ids.samId, '  Sam   Hartley ')).toEqual({ ok: true, name: 'Sam Hartley' });
  });

  it('email changes only once the NEW address confirms; the link is single-use', async () => {
    const newEmail = `sam-new-${ids.nonce}@example.test`;
    const [rosie] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, ids.rosieId));
    expect(await requestEmailChange(db, ids.samId, rosie!.email)).toEqual({ ok: false, reason: 'taken' });
    expect(await requestEmailChange(db, ids.samId, 'nope')).toEqual({ ok: false, reason: 'invalid' });

    log.mockClear();
    expect(await requestEmailChange(db, ids.samId, newEmail)).toEqual({ ok: true });
    const mailed = log.mock.calls.map((c) => String(c[0])).join('\n');
    const token = /confirm-email\?token=([A-Za-z0-9_-]+)/.exec(mailed)?.[1];
    expect(token).toBeTruthy();
    const [before] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, ids.samId));
    expect(before!.email).not.toBe(newEmail); // nothing changes yet

    expect(await confirmEmailChange(db, 'wrong-token-wrong-token-wrong')).toEqual({ ok: false, reason: 'expired' });
    expect(await confirmEmailChange(db, token!)).toEqual({ ok: true });
    const [after] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, ids.samId));
    expect(after!.email).toBe(newEmail);
    expect(await confirmEmailChange(db, token!)).toEqual({ ok: false, reason: 'expired' }); // single use
  });

  it('closing an account erases its pictures; a closed family banner goes with it', async () => {
    await setProfileImage(db, ids.blakeId, { kind: 'AVATAR', buffer: await photo() }, { providers: CLEAR });
    await setProfileImage(db, ids.blakeId, { kind: 'FAMILY_BANNER', buffer: await photo(), familyId: ids.bloomId }, { providers: CLEAR });
    expect((await closeAccount(db, ids.blakeId)).ok).toBe(true);
    expect(await db.select().from(profileImages).where(eq(profileImages.accountId, ids.blakeId))).toHaveLength(0);
  });
});
