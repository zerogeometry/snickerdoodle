import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, auditRecords, passkeyChallenges, passkeys, sessions } from '@/db/schema';
import { DrizzleAccountsAdapter } from '@/auth/adapter';
import type { RelyingParty } from '@/auth/passkeyConfig';
import { FRESH_SIGN_IN_MS, isFreshSignIn } from '@/lib/freshSignIn';
import { deleteAllPasskeys, finishAddPasskey, mayAddPasskey, finishPasskeySignIn, listPasskeys, removePasskey, startAddPasskey, startPasskeySignIn } from '@/server/passkeys';
import type { DbHandle } from '@/server/db';
import { softPasskey } from '@/test/softPasskey';

/**
 * "Sign in with Face ID" against a real Postgres and the real WebAuthn checks (a pretend phone, src/test/softPasskey.ts):
 * only someone signed in can add one; a sign-in makes a real, fresh database session Auth.js reads; challenges work
 * once; a removed passkey, a closed account, another site or an unchecked face never sign anyone in.
 * Skipped without DATABASE_URL.
 */
const URL = process.env.DATABASE_URL;
const rp: RelyingParty = { rpID: 'snickerdoodle.co.uk', origins: ['https://snickerdoodle.co.uk', 'https://www.snickerdoodle.co.uk'] };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

describe.skipIf(!URL)('passkeys — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const nonce = randomUUID().slice(0, 8);
  const made: string[] = [];

  async function newAccount(who: string) {
    const [a] = await db.insert(accounts).values({ email: `pk-${who}-${nonce}@example.test`, emailVerifiedAt: new Date(), displayName: who }).returning();
    made.push(a!.id);
    return { id: a!.id, email: a!.email, name: a!.displayName };
  }

  /** Add-passkey options, as for someone who signed in just now (`now` moves the clock for the challenge). */
  const opts = async (account: { id: string; email: string; name: string | null }, now = new Date()) => {
    const r = await startAddPasskey(db, account, rp, now, now);
    if (!r.ok) throw new Error('not fresh');
    return r.options;
  };

  /** Sign in by email, add a passkey on a pretend phone, and hand both back. */
  async function withPasskey(who: string, aaguid?: string) {
    const account = await newAccount(who);
    const phone = softPasskey({ rpID: rp.rpID, origin: 'https://snickerdoodle.co.uk', aaguid });
    const options = (await opts(account));
    const added = await finishAddPasskey(db, account, rp, phone.register(options), IPHONE, new Date());
    expect(added).toEqual({ ok: true, passkey: expect.anything() });
    return { account, phone };
  }

  const signIn = async (phone: ReturnType<typeof softPasskey>, o: Parameters<ReturnType<typeof softPasskey>['authenticate']>[1] = {}, browser?: (c: string) => string | null) => {
    const options = await startPasskeySignIn(db, rp);
    return finishPasskeySignIn(db, rp, phone.authenticate(options, o), browser ? browser(options.challenge) : options.challenge);
  };

  beforeAll(() => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
  });

  afterAll(async () => {
    if (made.length) await db.delete(accounts).where(inArray(accounts.id, made)); // cascades passkeys, sessions, challenges
    await client.end();
  });

  it('adding keeps only the public key and a plain label, made by the signed-in account, and logs it', async () => {
    const { account, phone } = await withPasskey('add', 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd');
    const [row] = await db.select().from(passkeys).where(eq(passkeys.accountId, account.id));
    expect(row!.credentialId).toBe(phone.id);
    expect(row!.deviceLabel).toBe('an iphone · icloud keychain');
    expect(Object.keys(row!).sort()).toEqual(['accountId', 'counter', 'createdAt', 'credentialId', 'deviceLabel', 'id', 'lastUsedAt', 'publicKey', 'transports']);
    expect(await listPasskeys(db, account.id)).toEqual([{ id: row!.id, label: 'an iphone · icloud keychain', addedOn: expect.stringMatching(/^\d{4}-\d\d-\d\d$/), lastUsedOn: null }]);
    const logged = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'PASSKEY_ADDED'), eq(auditRecords.targetId, row!.id)));
    expect(logged).toHaveLength(1);
    expect(logged[0]!.actorAccountId).toBe(account.id);
  });

  it('an add challenge works once, only for the account it was made for, and only within five minutes', async () => {
    const sam = await newAccount('sam');
    const jo = await newAccount('jo');
    const phone = softPasskey({ rpID: rp.rpID, origin: 'https://snickerdoodle.co.uk' });
    // Sam's challenge can't add a passkey to Jo
    const forSam = (await opts(sam));
    expect(await finishAddPasskey(db, jo, rp, phone.register(forSam), IPHONE, new Date())).toEqual({ ok: false, reason: 'expired' });
    // run out
    const old = (await opts(sam, new Date(Date.now() - 6 * 60_000)));
    expect(await finishAddPasskey(db, sam, rp, phone.register(old), IPHONE, new Date())).toEqual({ ok: false, reason: 'expired' });
    // used once
    const fresh = (await opts(sam));
    const reg = phone.register(fresh);
    expect((await finishAddPasskey(db, sam, rp, reg, IPHONE, new Date())).ok).toBe(true);
    expect(await finishAddPasskey(db, sam, rp, reg, IPHONE, new Date())).toEqual({ ok: false, reason: 'expired' });
    expect(await db.select().from(passkeys).where(eq(passkeys.accountId, jo.id))).toHaveLength(0);
  });

  it('adding needs a sign-in in the last 15 minutes — a long-signed-in tablet can’t add one (A-63)', async () => {
    const sam = await newAccount('stale');
    const phone = softPasskey({ rpID: rp.rpID, origin: 'https://snickerdoodle.co.uk' });
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    expect(mayAddPasskey(new Date(now.getTime() - 60_000), now)).toBe(true);
    expect(mayAddPasskey(yesterday, now)).toBe(false);
    expect(mayAddPasskey(null, now)).toBe(false);
    expect(await startAddPasskey(db, sam, rp, yesterday, now)).toEqual({ ok: false, reason: 'sign-in-again' });
    // and the second step checks again (the card was left open past the 15 minutes)
    const options = await opts(sam);
    expect(await finishAddPasskey(db, sam, rp, phone.register(options), IPHONE, yesterday)).toEqual({ ok: false, reason: 'sign-in-again' });
    expect(await db.select().from(passkeys).where(eq(passkeys.accountId, sam.id))).toHaveLength(0);
  });

  it('refuses a passkey made for another site, or one where the device did not check it was them', async () => {
    const sam = await newAccount('sam2');
    const phone = softPasskey({ rpID: 'snickerdoodle-gifts.example', origin: 'https://snickerdoodle-gifts.example' });
    expect(await finishAddPasskey(db, sam, rp, phone.register((await opts(sam))), IPHONE, new Date())).toEqual({ ok: false, reason: 'failed' });
    const lazy = softPasskey({ rpID: rp.rpID, origin: 'https://snickerdoodle.co.uk' });
    expect(await finishAddPasskey(db, sam, rp, lazy.register((await opts(sam)), { uv: false }), IPHONE, new Date())).toEqual({ ok: false, reason: 'failed' });
    expect(await db.select().from(passkeys).where(eq(passkeys.accountId, sam.id))).toHaveLength(0);
  });

  it('signing in makes a real database session — fresh for A-63, marked passkey — that Auth.js reads like any other', async () => {
    const { account, phone } = await withPasskey('signin');
    const before = Date.now();
    const res = await signIn(phone);
    if (!res.ok) throw new Error(`sign-in refused: ${res.reason}`);
    expect(res.accountId).toBe(account.id);
    const [s] = await db.select().from(sessions).where(eq(sessions.sessionToken, res.sessionToken));
    expect(s!.userId).toBe(account.id);
    expect(s!.signInMethod).toBe('passkey');
    // A-63: a passkey sign-in counts as fresh, for the same 15 minutes as the email
    expect(isFreshSignIn(s!.createdAt)).toBe(true);
    expect(isFreshSignIn(s!.createdAt, new Date(s!.createdAt.getTime() + FRESH_SIGN_IN_MS + 1000))).toBe(false);
    // a year from now, like every sign-in (src/auth/sessionPolicy.ts)
    expect(s!.expires.getTime()).toBeGreaterThan(before + 364 * 86_400_000);
    // Auth.js's adapter sees it as a signed-in session for this account
    const seen = await DrizzleAccountsAdapter(db).getSessionAndUser!(res.sessionToken);
    expect(seen?.user.id).toBe(account.id);
    expect(seen?.user.email).toBe(account.email);
    // the account page says it was used
    expect((await listPasskeys(db, account.id))[0]!.lastUsedOn).not.toBeNull();
  });

  it('a sign-in challenge works once, and only in the browser it was given to', async () => {
    const { phone } = await withPasskey('replay');
    const options = await startPasskeySignIn(db, rp);
    const signed = phone.authenticate(options);
    expect(await finishPasskeySignIn(db, rp, signed, 'some-other-challenge')).toEqual({ ok: false, reason: 'expired' });
    // (a signature sent from another browser is refused without spending it) — the right browser works…
    expect((await finishPasskeySignIn(db, rp, signed, options.challenge)).ok).toBe(true);
    // …and replaying it does not
    expect(await finishPasskeySignIn(db, rp, signed, options.challenge)).toEqual({ ok: false, reason: 'expired' });
    expect(await db.select().from(passkeyChallenges).where(eq(passkeyChallenges.challenge, options.challenge))).toHaveLength(0);
  });

  it('never signs in with a wrong signature, an unchecked face, another site, or someone else’s user handle', async () => {
    const { phone } = await withPasskey('bad');
    const other = await newAccount('other');
    expect(await signIn(phone, { tamper: true })).toEqual({ ok: false, reason: 'failed' });
    expect(await signIn(phone, { uv: false })).toEqual({ ok: false, reason: 'failed' });
    expect(await signIn(phone, { origin: 'https://snickerdoodle-gifts.example' })).toEqual({ ok: false, reason: 'failed' });
    expect(await signIn(phone, { userHandle: Buffer.from(other.id).toString('base64url') })).toEqual({ ok: false, reason: 'failed' });
    expect(await db.select().from(sessions).where(eq(sessions.userId, other.id))).toHaveLength(0);
  });

  it('remove: only your own; it stops signing in at once; logged', async () => {
    const { account, phone } = await withPasskey('remove');
    const intruder = await newAccount('intruder');
    const [row] = await db.select().from(passkeys).where(eq(passkeys.accountId, account.id));
    expect((await removePasskey(db, intruder.id, row!.id)).ok).toBe(false); // someone else's: untouched
    expect((await signIn(phone)).ok).toBe(true);
    expect((await removePasskey(db, account.id, row!.id)).ok).toBe(true);
    expect(await signIn(phone)).toEqual({ ok: false, reason: 'unknown' });
    expect(await listPasskeys(db, account.id)).toEqual([]);
    expect(await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'PASSKEY_REMOVED'), eq(auditRecords.targetId, row!.id)))).toHaveLength(1);
  });

  it('deleteAllPasskeys (member removal, account closure) takes every one, logs each, and sign-in stops', async () => {
    const { account, phone } = await withPasskey('all');
    const laptop = softPasskey({ rpID: rp.rpID, origin: 'https://www.snickerdoodle.co.uk' });
    expect((await finishAddPasskey(db, account, rp, laptop.register((await opts(account)), { origin: 'https://www.snickerdoodle.co.uk' }), null, new Date())).ok).toBe(true);
    expect(await deleteAllPasskeys(db, account.id, 'member-removed', { accountId: null, actorType: 'SYSTEM' })).toBe(2);
    expect(await signIn(phone)).toEqual({ ok: false, reason: 'unknown' });
    expect(await signIn(laptop, { origin: 'https://www.snickerdoodle.co.uk' })).toEqual({ ok: false, reason: 'unknown' });
    const logged = await db.select().from(auditRecords).where(eq(auditRecords.event, 'PASSKEY_REMOVED'));
    expect(logged.filter((r) => (r.metadata as { account?: string }).account === account.id)).toHaveLength(2);
  });

  it('a closed account can never sign in with a passkey, even one somehow left behind', async () => {
    const { account, phone } = await withPasskey('closed');
    await db.update(accounts).set({ email: `closed-${account.id}@closed.invalid`, emailVerifiedAt: null }).where(eq(accounts.id, account.id));
    expect(await signIn(phone)).toEqual({ ok: false, reason: 'unknown' });
  });
});
