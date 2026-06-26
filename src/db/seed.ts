import { randomUUID } from 'node:crypto';
import { accounts, assets, children, families, invites, memberships } from './schema';
import type { DbHandle } from '@/server/db';

/**
 * A brand-safe demo dataset (no real children / no real personal data) that
 * exercises the whole trust model: an owner, a Family-circle parent, an
 * Extended-circle grandparent, a REMOVED member (to prove revocation), two
 * children as keepsake *subjects*, assets at every visibility tier, and a second
 * family to prove cross-family isolation.
 *
 * Used by the data-layer integration tests, and ready to back a `db:seed` CLI.
 * Ids/emails are unique per call so it never collides with an existing dataset.
 */
export interface SeededIds {
  nonce: string;
  hartleyId: string;
  bloomId: string;
  samId: string; // owner of Hartley
  joId: string; // parent · Family circle · CONTRIBUTE
  rosieId: string; // grandparent · Extended circle · VIEW_BUY
  malloryId: string; // ex-member · REMOVED (sees nothing)
  blakeId: string; // owner of Bloom
  oliviaId: string; // child subject (controller: Sam)
  maxId: string; // child subject (controller: Sam)
  assetFamily: string; // Hartley · FAMILY · controller Sam
  assetExtended: string; // Hartley · EXTENDED · controller Sam
  assetOnlyMe: string; // Hartley · ONLY_ME · controller Sam
  assetJoFamily: string; // Hartley · FAMILY · uploader+controller Jo
  assetBloomFamily: string; // Bloom · FAMILY · controller Blake
}

export async function seedDemoFamilies(db: DbHandle): Promise<SeededIds> {
  const nonce = randomUUID().slice(0, 8);
  const id = {
    hartley: randomUUID(),
    bloom: randomUUID(),
    sam: randomUUID(),
    jo: randomUUID(),
    rosie: randomUUID(),
    mallory: randomUUID(),
    blake: randomUUID(),
    olivia: randomUUID(),
    max: randomUUID(),
    aFamily: randomUUID(),
    aExtended: randomUUID(),
    aOnlyMe: randomUUID(),
    aJoFamily: randomUUID(),
    aBloom: randomUUID(),
    invJo: randomUUID(),
    invRosie: randomUUID(),
    invMallory: randomUUID(),
  };

  await db.insert(accounts).values([
    { id: id.sam, email: `sam-${nonce}@example.com`, displayName: 'Sam' },
    { id: id.jo, email: `jo-${nonce}@example.com`, displayName: 'Jo' },
    { id: id.rosie, email: `rosie-${nonce}@example.com`, displayName: 'Rosie' },
    { id: id.mallory, email: `mallory-${nonce}@example.com`, displayName: 'Mallory' },
    { id: id.blake, email: `blake-${nonce}@example.com`, displayName: 'Blake' },
  ]);

  await db.insert(families).values([
    { id: id.hartley, displayName: 'The Hartleys', ownerAccountId: id.sam },
    { id: id.bloom, displayName: 'The Blooms', ownerAccountId: id.blake },
  ]);

  const expires = new Date('2030-01-01T00:00:00Z');
  await db.insert(invites).values([
    { id: id.invJo, familyId: id.hartley, createdByAccountId: id.sam, email: `jo-${nonce}@example.com`, relationship: 'PARENT', circle: 'FAMILY', accessLevel: 'CONTRIBUTE', token: `tok-jo-${nonce}`, status: 'VERIFIED', expiresAt: expires },
    { id: id.invRosie, familyId: id.hartley, createdByAccountId: id.sam, email: `rosie-${nonce}@example.com`, relationship: 'GRANDPARENT', circle: 'EXTENDED', accessLevel: 'VIEW_BUY', token: `tok-rosie-${nonce}`, status: 'VERIFIED', expiresAt: expires },
    { id: id.invMallory, familyId: id.hartley, createdByAccountId: id.sam, email: `mallory-${nonce}@example.com`, relationship: 'CLOSE_FRIEND', circle: 'EXTENDED', accessLevel: 'VIEW', token: `tok-mallory-${nonce}`, status: 'REVOKED', expiresAt: expires },
  ]);

  await db.insert(memberships).values([
    { familyId: id.hartley, accountId: id.sam, relationship: 'PARENT', circle: 'FAMILY', accessLevel: 'CONTRIBUTE', status: 'ACTIVE', isOwner: true },
    { familyId: id.hartley, accountId: id.jo, relationship: 'PARENT', circle: 'FAMILY', accessLevel: 'CONTRIBUTE', status: 'ACTIVE', isOwner: false, inviteId: id.invJo },
    { familyId: id.hartley, accountId: id.rosie, relationship: 'GRANDPARENT', circle: 'EXTENDED', accessLevel: 'VIEW_BUY', status: 'ACTIVE', isOwner: false, inviteId: id.invRosie },
    { familyId: id.hartley, accountId: id.mallory, relationship: 'CLOSE_FRIEND', circle: 'EXTENDED', accessLevel: 'VIEW', status: 'REMOVED', isOwner: false, inviteId: id.invMallory },
    { familyId: id.bloom, accountId: id.blake, relationship: 'PARENT', circle: 'FAMILY', accessLevel: 'CONTRIBUTE', status: 'ACTIVE', isOwner: true },
  ]);

  await db.insert(children).values([
    { id: id.olivia, familyId: id.hartley, firstName: 'Olivia', controllerAccountId: id.sam },
    { id: id.max, familyId: id.hartley, firstName: 'Max', controllerAccountId: id.sam },
  ]);

  await db.insert(assets).values([
    // Sam is the controller (Olivia's controlling parent) for these.
    { id: id.aFamily, familyId: id.hartley, kind: 'DRAWING', uploaderAccountId: id.sam, childSubjectId: id.olivia, controllerAccountId: id.sam, visibility: 'FAMILY' },
    { id: id.aExtended, familyId: id.hartley, kind: 'DRAWING', uploaderAccountId: id.sam, childSubjectId: id.olivia, controllerAccountId: id.sam, visibility: 'EXTENDED' },
    { id: id.aOnlyMe, familyId: id.hartley, kind: 'DRAWING', uploaderAccountId: id.sam, childSubjectId: id.olivia, controllerAccountId: id.sam, visibility: 'ONLY_ME' },
    // Uploaded by Jo, who is therefore its controller.
    { id: id.aJoFamily, familyId: id.hartley, kind: 'DRAWING', uploaderAccountId: id.jo, childSubjectId: id.max, controllerAccountId: id.jo, visibility: 'FAMILY' },
    // A different family entirely.
    { id: id.aBloom, familyId: id.bloom, kind: 'DRAWING', uploaderAccountId: id.blake, controllerAccountId: id.blake, visibility: 'FAMILY' },
  ]);

  return {
    nonce,
    hartleyId: id.hartley,
    bloomId: id.bloom,
    samId: id.sam,
    joId: id.jo,
    rosieId: id.rosie,
    malloryId: id.mallory,
    blakeId: id.blake,
    oliviaId: id.olivia,
    maxId: id.max,
    assetFamily: id.aFamily,
    assetExtended: id.aExtended,
    assetOnlyMe: id.aOnlyMe,
    assetJoFamily: id.aJoFamily,
    assetBloomFamily: id.aBloom,
  };
}

/** Remove a seeded dataset (audit rows are append-only and intentionally left). */
export async function cleanupDemoFamilies(db: DbHandle, ids: SeededIds): Promise<void> {
  const { inArray } = await import('drizzle-orm');
  const familyIds = [ids.hartleyId, ids.bloomId];
  const accountIds = [ids.samId, ids.joId, ids.rosieId, ids.malloryId, ids.blakeId];
  await db.delete(assets).where(inArray(assets.familyId, familyIds));
  await db.delete(children).where(inArray(children.familyId, familyIds));
  await db.delete(memberships).where(inArray(memberships.familyId, familyIds));
  await db.delete(invites).where(inArray(invites.familyId, familyIds));
  await db.delete(families).where(inArray(families.id, familyIds));
  await db.delete(accounts).where(inArray(accounts.id, accountIds));
}
