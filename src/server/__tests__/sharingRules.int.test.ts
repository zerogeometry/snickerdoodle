import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { accounts, assets, auditRecords, giftLinks, invites, memberships, occasions } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, canViewAsset } from '@/authz';
import { changeAssetVisibility, resolveViewerContext } from '@/server/assets';
import { assetRefOf } from '@/server/assetRef';
import { createGiftLink, getGiftLink, giftLinkPreview, revokeGiftLink, sendGiftLinks } from '@/server/giftLinks';
import { ingestOriginalAsset } from '@/server/ingest';
import { acceptInvite, createInvite, NotInvitableError, setMemberSeesOccasions } from '@/server/invites';
import { askPartnersIntoHome, removeMember, setMemberAccess } from '@/server/members';
import { addOccasion, loadCalendar, occasionsFor, reminderCandidates, updateOccasion } from '@/server/occasions';
import { addAppOccasion, listAppOccasions, updateAppOccasion } from '@/server/app/occasions';
import type { AppViewer } from '@/server/app/appAuth';
import { JOIN_CONSENT_VERSION } from '@/lib/joinConsent';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';
import type { VisibilityTier } from '@/domain/types';

/**
 * D27 (founder, 10 Nov 2026) end to end against the real database: one gift link per person (and what a forwarded
 * or revoked one shows), the adder vs the little one's parent, the join "yes", moving into home, "whose day is it?",
 * and the Draw app never widening a date. The rules themselves are unit-tested in src/authz; this proves the
 * services use them.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const YES = { version: JOIN_CONSENT_VERSION };
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 30, g: 60, b: 90 } } }).png().toBuffer();

describe.skipIf(!DB || !S3)('D27 sharing rules — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const keys: string[] = [];
  const extraAccounts: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    for (const k of keys) await deleteObject(k).catch(() => {});
    await db.delete(giftLinks).where(inArray(giftLinks.familyId, [ids.hartleyId, ids.bloomId]));
    await db.delete(occasions).where(inArray(occasions.familyId, [ids.hartleyId, ids.bloomId]));
    if (ids) await cleanupDemoFamilies(db, ids);
    if (extraAccounts.length) {
      await db.delete(memberships).where(inArray(memberships.accountId, extraAccounts));
      await db.delete(accounts).where(inArray(accounts.id, extraAccounts));
    }
    await client.end();
  });

  const as = (accountId: string) => resolveViewerContext(db, accountId, ids.hartleyId);

  /** A kept drawing in Hartley, added by `by` (Sam unless said), optionally filed under a little one, at a tier. */
  async function kept(opts: { by?: string; child?: string; tier?: VisibilityTier } = {}) {
    const r = await ingestOriginalAsset(db, await as(opts.by ?? ids.samId), { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true, childSubjectId: opts.child ?? null });
    keys.push(r.key);
    await db.update(assets).set({ moderationStatus: 'CLEAR', ...(opts.tier ? { visibility: opts.tier } : {}) }).where(eq(assets.id, r.assetId));
    return r.assetId;
  }

  // ── one gift link per person ───────────────────────────────────────────────
  describe('gift links: one per person, showing only what their circle may see', () => {
    it('Jo (family) and Rosie (extended) each get their OWN link; Rosie’s never shows the family-only drawing', async () => {
      const fam = await kept({ tier: 'FAMILY' });
      const ext = await kept({ tier: 'EXTENDED' });
      const sam = await as(ids.samId);
      const sent = await sendGiftLinks(db, sam, { familyId: ids.hartleyId, assetIds: [fam, ext], to: [{ memberAccountId: ids.joId }, { memberAccountId: ids.rosieId }] });
      expect(sent).toMatchObject({ sent: 2, skipped: [] });
      const links = await db.select().from(giftLinks).where(eq(giftLinks.batchId, sent.batchId));
      expect(links).toHaveLength(2);
      const jo = links.find((l) => l.recipientAccountId === ids.joId)!;
      const rosie = links.find((l) => l.recipientAccountId === ids.rosieId)!;
      expect([jo.audienceCircle, rosie.audienceCircle]).toEqual(['FAMILY', 'EXTENDED']);
      expect(jo.token).not.toBe(rosie.token);

      const joView = await getGiftLink(db, jo.token);
      const rosieView = await getGiftLink(db, rosie.token);
      expect(joView.state === 'active' && joView.items.map((i) => i.assetId).sort()).toEqual([fam, ext].sort());
      // Rosie's snapshot never even took the family-only one, and a forwarded copy of her link shows only hers
      expect(rosieView.state === 'active' && rosieView.items.map((i) => i.assetId)).toEqual([ext]);
      expect(await giftLinkPreview(db, rosie.token, fam)).toBeNull();
      expect(await giftLinkPreview(db, rosie.token, ext)).not.toBeNull();

      // switching off Jo's leaves Rosie's working
      await revokeGiftLink(db, sam, jo.id);
      expect((await getGiftLink(db, jo.token)).state).toBe('revoked');
      expect((await getGiftLink(db, rosie.token)).state).toBe('active');
    });

    it('a member’s link follows them live: narrowed when their circle narrows, stopped when removed', async () => {
      const fam = await kept({ tier: 'FAMILY' });
      const ext = await kept({ tier: 'EXTENDED' });
      const sam = await as(ids.samId);
      const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [fam, ext], recipient: { kind: 'member', accountId: ids.joId } });
      await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId, circle: 'EXTENDED' });
      const narrowed = await getGiftLink(db, token);
      expect(narrowed.state === 'active' && narrowed.items.map((i) => i.assetId)).toEqual([ext]);
      await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId, circle: 'FAMILY' });
    });

    it('a keepsake made narrower after sending drops off that person’s link; an extended link to only-home art is refused', async () => {
      const a = await kept({ tier: 'EXTENDED' });
      const b = await kept({ tier: 'EXTENDED' });
      const sam = await as(ids.samId);
      const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [a, b], recipient: { kind: 'member', accountId: ids.rosieId } });
      await changeAssetVisibility(db, a, sam, 'HOME');
      const v = await getGiftLink(db, token);
      expect(v.state === 'active' && v.items.map((i) => i.assetId)).toEqual([b]);
      const home = await kept({ tier: 'HOME' });
      await expect(createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [home], recipient: { kind: 'open', circle: 'EXTENDED' } })).rejects.toBeInstanceOf(AuthzError);
    });

    it('someone new by email: their own link at extended (or their invite’s circle), the invite bound to their address', async () => {
      const fam = await kept({ tier: 'FAMILY' });
      const sam = await as(ids.samId);
      const res = await sendGiftLinks(db, sam, { familyId: ids.hartleyId, assetIds: [fam], to: [{ email: 'new-gran@example.test' }, { email: 'new-dad@example.test', relationship: 'PARENT' }], invite: { accessLevel: 'VIEW_BUY' } });
      // the plain grandma is extended — nothing family-only for her; the invited co-parent's link is at home
      expect(res.skipped).toEqual(['new-gran@example.test']);
      const [link] = await db.select().from(giftLinks).where(eq(giftLinks.batchId, res.batchId));
      expect(link).toMatchObject({ recipientEmail: 'new-dad@example.test', audienceCircle: 'HOME' });
      const [inv] = await db.select().from(invites).where(eq(invites.id, link!.inviteId!));
      expect(inv).toMatchObject({ email: 'new-dad@example.test', circle: 'HOME' });
    });

    it('a link made before one-per-person (no audience) shows extended-level keepsakes only', async () => {
      const fam = await kept({ tier: 'FAMILY' });
      const ext = await kept({ tier: 'EXTENDED' });
      const sam = await as(ids.samId);
      const { id, token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [fam, ext], recipient: { kind: 'open', circle: 'FAMILY' } });
      await db.update(giftLinks).set({ audienceCircle: null }).where(eq(giftLinks.id, id)); // as migrated
      const v = await getGiftLink(db, token);
      expect(v.state === 'active' && v.items.map((i) => i.assetId)).toEqual([ext]);
    });
  });

  // ── the adder decides; the little one's parent may only narrow ───────────────
  describe('who sets a keepsake’s tier', () => {
    it('Jo adds a drawing of Olivia: Jo chooses; Sam (Olivia’s parent) may only narrow it, then lift it back', async () => {
      const a = await kept({ by: ids.joId, child: ids.oliviaId });
      const [row] = await db.select().from(assets).where(eq(assets.id, a));
      expect(row).toMatchObject({ uploaderAccountId: ids.joId, controllerAccountId: ids.samId, visibility: 'FAMILY', parentLimit: null });
      const jo = await as(ids.joId);
      const sam = await as(ids.samId);
      const rosie = await as(ids.rosieId);

      await changeAssetVisibility(db, a, jo, 'EXTENDED'); // the adder widens
      await expect(changeAssetVisibility(db, a, rosie, 'ONLY_ME')).rejects.toBeInstanceOf(AuthzError); // nobody else
      await changeAssetVisibility(db, a, sam, 'HOME'); // the parent narrows → their ceiling
      let [now] = await db.select().from(assets).where(eq(assets.id, a));
      expect(now).toMatchObject({ visibility: 'EXTENDED', parentLimit: 'HOME' });
      expect(canViewAsset(assetRefOf(now!), rosie).allowed).toBe(false);
      await expect(changeAssetVisibility(db, a, jo, 'FAMILY')).rejects.toBeInstanceOf(AuthzError); // over the ceiling
      await changeAssetVisibility(db, a, jo, 'ONLY_ME'); // under it is fine
      // "only me" here = Jo and Sam
      [now] = await db.select().from(assets).where(eq(assets.id, a));
      expect(canViewAsset(assetRefOf(now!), sam).allowed).toBe(true);
      expect(canViewAsset(assetRefOf(now!), jo).allowed).toBe(true);
      // the parent can never widen past the adder's choice (only me now)…
      await expect(changeAssetVisibility(db, a, sam, 'HOME')).rejects.toBeInstanceOf(AuthzError);
      // …the adder moves it back up to the ceiling, and the parent lifts their own limit back to the adder's choice
      await changeAssetVisibility(db, a, jo, 'HOME');
      await changeAssetVisibility(db, a, sam, 'HOME');
      [now] = await db.select().from(assets).where(eq(assets.id, a));
      expect(now).toMatchObject({ visibility: 'HOME', parentLimit: null });
      await changeAssetVisibility(db, a, jo, 'EXTENDED'); // no ceiling now: the adder's choice again
      [now] = await db.select().from(assets).where(eq(assets.id, a));
      expect(canViewAsset(assetRefOf(now!), rosie).allowed).toBe(true);
    });
  });

  // ── joining: their own yes; invite-time circle; moving into home ─────────────
  describe('joining', () => {
    async function newAccount(tag: string) {
      const email = `${tag}-${ids.nonce}@example.test`;
      const [a] = await db.insert(accounts).values({ email, displayName: tag }).returning({ id: accounts.id });
      extraAccounts.push(a!.id);
      return { id: a!.id, email };
    }

    it('no silent join: without the yes nothing happens; with it, the wording they said yes to is kept', async () => {
      const sam = await as(ids.samId);
      const who = await newAccount('partner');
      const inv = await createInvite(db, sam, { familyId: ids.hartleyId, email: who.email, relationship: 'PARENT', accessLevel: 'CONTRIBUTE', circle: 'HOME' });
      expect(await acceptInvite(db, who, inv.token, null)).toMatchObject({ ok: false, reason: 'no-consent' });
      expect(await acceptInvite(db, who, inv.token, { version: 'something-else' })).toMatchObject({ ok: false, reason: 'no-consent' });
      expect((await acceptInvite(db, who, inv.token, YES)).ok).toBe(true);
      const [m] = await db.select().from(memberships).where(and(eq(memberships.accountId, who.id), eq(memberships.familyId, ids.hartleyId)));
      expect(m).toMatchObject({ circle: 'HOME', joinConsentVersion: JOIN_CONSENT_VERSION });
      expect(m!.joinConsentedAt).toBeInstanceOf(Date);
    });

    it('invite-time circle: home only for a parent or grown-up child — never trusted from the form', async () => {
      const sam = await as(ids.samId);
      await expect(createInvite(db, sam, { familyId: ids.hartleyId, email: `g-${ids.nonce}@example.test`, relationship: 'GRANDPARENT', accessLevel: 'VIEW', circle: 'HOME' })).rejects.toBeInstanceOf(NotInvitableError);
      const ok = await createInvite(db, sam, { familyId: ids.hartleyId, email: `g2-${ids.nonce}@example.test`, relationship: 'GRANDPARENT', accessLevel: 'VIEW', circle: 'FAMILY' });
      const [row] = await db.select().from(invites).where(eq(invites.id, ok.inviteId));
      expect(row!.circle).toBe('FAMILY');
      const kid = await createInvite(db, sam, { familyId: ids.hartleyId, email: `ak-${ids.nonce}@example.test`, relationship: 'ADULT_CHILD', accessLevel: 'VIEW' });
      expect((await db.select().from(invites).where(eq(invites.id, kid.inviteId)))[0]!.circle).toBe('HOME');
    });

    it('go-live: a partner who joined before home existed is ASKED in once (never moved without their yes); grandparents aren’t', async () => {
      const sam = await as(ids.samId);
      const wife = await newAccount('wife');
      const inv = await createInvite(db, sam, { familyId: ids.hartleyId, email: wife.email, relationship: 'PARENT', accessLevel: 'CONTRIBUTE', circle: 'FAMILY' });
      expect((await acceptInvite(db, wife, inv.token, YES)).ok).toBe(true); // in the family circle, as before home
      const mine = async () => (await db.select().from(memberships).where(and(eq(memberships.accountId, wife.id), eq(memberships.familyId, ids.hartleyId))))[0]!;

      const first = await askPartnersIntoHome(db, { familyIds: [ids.hartleyId] });
      expect(first.asked).toBeGreaterThanOrEqual(1);
      expect((await mine()).circle).toBe('FAMILY'); // nothing moves until she says yes
      const asks = await db.select().from(invites).where(eq(invites.membershipId, (await mine()).id));
      expect(asks).toHaveLength(1);
      expect(asks[0]).toMatchObject({ circle: 'HOME', status: 'PENDING', email: wife.email });
      const [audit] = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, asks[0]!.id), eq(auditRecords.event, 'INVITE_SENT')));
      expect(audit).toMatchObject({ actorType: 'SYSTEM', actorAccountId: null });
      // Rosie (a grandparent) is never asked into home
      const [rosieM] = await db.select().from(memberships).where(and(eq(memberships.accountId, ids.rosieId), eq(memberships.familyId, ids.hartleyId), eq(memberships.status, 'ACTIVE')));
      expect(await db.select().from(invites).where(eq(invites.membershipId, rosieM!.id))).toHaveLength(0);

      // once, ever: running it again (every deploy) asks nobody new
      expect((await askPartnersIntoHome(db, { familyIds: [ids.hartleyId] })).asked).toBe(0);
      // her yes moves her, with the wording she said yes to
      expect((await acceptInvite(db, wife, asks[0]!.token, YES)).ok).toBe(true);
      expect(await mine()).toMatchObject({ circle: 'HOME', joinConsentVersion: JOIN_CONSENT_VERSION });
    });

    it('moving Jo into home waits for Jo’s own yes; a grandparent can’t be moved into home', async () => {
      const sam = await as(ids.samId);
      expect(await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId, circle: 'HOME' })).toMatchObject({ ok: true, homeAsked: true });
      const [still] = await db.select().from(memberships).where(and(eq(memberships.accountId, ids.joId), eq(memberships.familyId, ids.hartleyId), eq(memberships.status, 'ACTIVE')));
      expect(still!.circle).toBe('FAMILY');
      const [ask] = await db.select().from(invites).where(and(eq(invites.membershipId, still!.id), eq(invites.status, 'PENDING')));
      const [jo] = await db.select({ id: accounts.id, email: accounts.email }).from(accounts).where(eq(accounts.id, ids.joId));
      expect((await acceptInvite(db, jo!, ask!.token, YES)).ok).toBe(true);
      const [moved] = await db.select().from(memberships).where(eq(memberships.id, still!.id));
      expect(moved).toMatchObject({ circle: 'HOME', joinConsentVersion: JOIN_CONSENT_VERSION });
      expect(await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, circle: 'HOME' })).toEqual({ ok: false });
      // out of home is at once
      await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId, circle: 'FAMILY' });
    });
  });

  // ── "whose day is it?" ─────────────────────────────────────────────────────
  describe('occasions', () => {
    it('someone else’s day is stored and shown at home only, whatever was asked; no year line beyond home', async () => {
      const sam = await as(ids.samId);
      await setMemberSeesOccasions(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId, on: true });
      await setMemberSeesOccasions(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, on: true });
      const other = await addOccasion(db, ids.samId, ids.hartleyId, { title: 'Uncle Joe', kind: 'BIRTHDAY', date: '1980-03-04', whose: 'SOMEONE_ELSE', shareCircle: 'EXTENDED' });
      const ours = await addOccasion(db, ids.samId, ids.hartleyId, { title: 'our anniversary', kind: 'ANNIVERSARY', date: '2015-06-07', whose: 'OURS', shareCircle: 'EXTENDED' });
      expect(other.ok && ours.ok).toBe(true);
      if (!other.ok || !ours.ok) return;
      expect((await db.select().from(occasions).where(eq(occasions.id, other.id)))[0]).toMatchObject({ whose: 'SOMEONE_ELSE', shareCircle: 'HOME' });

      const ymd = (d: Date) => d.toISOString().slice(0, 10);
      const from = `${new Date().getUTCFullYear()}-01-01`;
      const to = `${new Date().getUTCFullYear() + 1}-12-31`;
      const joCal = await loadCalendar(db, ids.joId, ids.hartleyId, from, to);
      expect(joCal.some((e) => e.occasionId === other.id)).toBe(false); // family circle: not someone else's day
      const anniv = joCal.find((e) => e.occasionId === ours.id);
      expect(anniv).toBeTruthy();
      expect(anniv!.note).toBeNull(); // no "11th anniversary" — it gives the year away
      const samCal = await loadCalendar(db, ids.samId, ids.hartleyId, from, to);
      expect(samCal.find((e) => e.occasionId === ours.id)!.note).toMatch(/anniversary/);
      expect(samCal.some((e) => e.occasionId === other.id)).toBe(true);
      const sheetForJo = await occasionsFor(db, ids.joId, ids.hartleyId);
      expect(sheetForJo.find((o) => o.id === ours.id)!.date.startsWith('--')).toBe(true); // no year for Jo

      // reminders run the same rule
      const due = await reminderCandidates(db, ymd(new Date()), 400);
      expect(due.some((d) => d.accountId === ids.joId && d.key === `occ:${other.id}`)).toBe(false);
      expect(due.some((d) => d.accountId === ids.samId && d.key === `occ:${other.id}`)).toBe(true);

      // and nobody widens it later
      expect((await updateOccasion(db, ids.samId, other.id, { title: 'Uncle Joe', kind: 'BIRTHDAY', date: '1980-03-04', shareCircle: 'EXTENDED' })).ok).toBe(true);
      expect((await db.select().from(occasions).where(eq(occasions.id, other.id)))[0]!.shareCircle).toBe('HOME');
    });

    it('Rosie (extended, view & buy) adds her OWN birthday and picks who sees it — but can’t add someone else’s', async () => {
      const own = await addOccasion(db, ids.rosieId, ids.hartleyId, { title: 'Rosie', kind: 'BIRTHDAY', date: '--09-09', whose: 'OURS', memberAccountId: ids.rosieId, shareCircle: 'EXTENDED' });
      expect(own.ok).toBe(true);
      expect(await addOccasion(db, ids.rosieId, ids.hartleyId, { title: 'Bob', kind: 'BIRTHDAY', date: '--01-01', whose: 'SOMEONE_ELSE' })).toEqual({ ok: false, reason: 'not-allowed' });
      expect(await addOccasion(db, ids.rosieId, ids.hartleyId, { title: 'Jo', kind: 'BIRTHDAY', date: '--01-01', whose: 'OURS', memberAccountId: ids.joId })).toEqual({ ok: false, reason: 'not-allowed' });
      if (!own.ok) return;
      // Sam (the leader) may narrow Rosie's day, never change its details
      expect((await updateOccasion(db, ids.samId, own.id, { title: 'Rosie', kind: 'BIRTHDAY', date: '--09-09', whose: 'OURS', memberAccountId: ids.rosieId, shareCircle: 'HOME' })).ok).toBe(true);
      expect(await updateOccasion(db, ids.samId, own.id, { title: 'Granny R', kind: 'BIRTHDAY', date: '--09-09', whose: 'OURS', memberAccountId: ids.rosieId, shareCircle: 'HOME' })).toEqual({ ok: false, reason: 'not-allowed' });
      expect(await updateOccasion(db, ids.samId, own.id, { title: 'Rosie', kind: 'BIRTHDAY', date: '--09-09', whose: 'OURS', memberAccountId: ids.rosieId, shareCircle: 'EXTENDED' })).toEqual({ ok: false, reason: 'not-allowed' });
    });

    it('the Draw app: its dates land home-only; it lists only what the leader sees; it can’t change Rosie’s own day', async () => {
      const sam = await as(ids.samId);
      const av: AppViewer = {
        tokenId: 'test-token',
        accountId: ids.samId,
        familyId: ids.hartleyId,
        childIds: null,
        viewer: sam,
        sync: { keepsakes: 'none', children: false, progress: false, birthdays: true },
      };
      const made = await addAppOccasion(db, av, { name: 'Nana', kind: 'birthday', month: 5, day: 6 });
      expect((await db.select().from(occasions).where(eq(occasions.id, made.id)))[0]).toMatchObject({ whose: 'SOMEONE_ELSE', shareCircle: 'HOME', year: null });
      expect(Object.keys(made).sort()).toEqual(['day', 'id', 'kind', 'month', 'name', 'updatedAt']); // the contract's shape
      const rosies = (await db.select().from(occasions).where(and(eq(occasions.familyId, ids.hartleyId), eq(occasions.createdByAccountId, ids.rosieId))))[0]!;
      expect((await listAppOccasions(db, av)).some((o) => o.id === rosies.id)).toBe(true); // the leader sees it
      await expect(updateAppOccasion(db, av, rosies.id, { name: 'Gran' })).rejects.toMatchObject({ status: 403, reason: 'not-yours' });
      // a PATCH never widens
      await updateAppOccasion(db, av, made.id, { name: 'Nanna' });
      expect((await db.select().from(occasions).where(eq(occasions.id, made.id)))[0]).toMatchObject({ whose: 'SOMEONE_ELSE', shareCircle: 'HOME', title: 'Nanna' });
    });
  });

  it('removing a member stops their link at once (cleanup last: Jo is removed)', async () => {
    const ext = await kept({ tier: 'EXTENDED' });
    const sam = await as(ids.samId);
    const { token } = await createGiftLink(db, sam, { familyId: ids.hartleyId, assetIds: [ext], recipient: { kind: 'member', accountId: ids.joId } });
    expect((await getGiftLink(db, token)).state).toBe('active');
    await removeMember(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId });
    expect((await getGiftLink(db, token)).state).toBe('revoked');
  });
});
