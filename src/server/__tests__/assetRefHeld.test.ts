import { describe, expect, it } from 'vitest';
import { canViewAsset, type Membership, type ViewerContext } from '@/authz';
import { assetRefOf, isHeldForReport, isHiddenUntilCleared, type AssetRefRow } from '@/server/assetRef';

/**
 * Founder, 9 Nov 2026: a keepsake the safety checks haven't cleared — held by the automatic screening,
 * held by a report, or not screened yet — is seen only by its uploader/controller until a reviewer
 * clears it. Before, only a REPORT hid it from the family; a screening flag (possible nudity) still
 * showed in the family circle. Part of the visibility launch gate.
 */

const FAM = 'fam-A';
const PARENT = 'acct-parent';
const row = (moderationStatus: string, over: Partial<AssetRefRow> = {}): AssetRefRow => ({
  id: 'asset-1',
  familyId: FAM,
  uploaderAccountId: PARENT,
  controllerAccountId: PARENT,
  visibility: 'FAMILY',
  moderationStatus,
  moderationDetail: { labels: [] },
  ...over,
});
const mem = (accountId: string, over: Partial<Membership> = {}): Membership => ({ familyId: FAM, accountId, circle: 'FAMILY', accessLevel: 'VIEW_BUY', status: 'ACTIVE', isOwner: false, ...over });
const v = (accountId: string, over: Partial<Membership> = {}): ViewerContext => ({ accountId, membership: mem(accountId, over) });

const grandma = v('acct-grandma', { circle: 'EXTENDED' });
const otherParent = v('acct-other-parent', { circle: 'FAMILY', accessLevel: 'CONTRIBUTE' });
const parent = v(PARENT, { isOwner: true });

describe('who sees a keepsake the checks have not cleared', () => {
  it('held by the automatic screening (no report): only the uploading parent sees it', () => {
    const ref = assetRefOf(row('FLAGGED', { visibility: 'EXTENDED', moderationDetail: { labels: ['Explicit'] } }));
    expect(ref.heldForReview).toBe(true);
    expect(canViewAsset(ref, parent).allowed).toBe(true);
    expect(canViewAsset(ref, otherParent).allowed).toBe(false);
    expect(canViewAsset(ref, grandma).allowed).toBe(false);
  });

  it('not screened yet (PENDING, while the background check runs): hidden from the family too', () => {
    const ref = assetRefOf(row('PENDING', { visibility: 'EXTENDED' }));
    expect(ref.heldForReview).toBe(true);
    expect(canViewAsset(ref, parent).allowed).toBe(true);
    expect(canViewAsset(ref, grandma).allowed).toBe(false);
  });

  it('held by a report: hidden, as before', () => {
    const r = row('FLAGGED', { moderationDetail: { labels: ['reported'], reports: [{ reason: 'x' }] } });
    expect(isHeldForReport(r)).toBe(true);
    expect(canViewAsset(assetRefOf(r), otherParent).allowed).toBe(false);
  });

  it('a child’s drawing held by the checks: its controlling parent sees it, the uploading relative still does, others don’t', () => {
    const ref = assetRefOf(row('FLAGGED', { uploaderAccountId: 'acct-aunt', controllerAccountId: PARENT, visibility: 'FAMILY' }));
    expect(canViewAsset(ref, parent).allowed).toBe(true);
    expect(canViewAsset(ref, v('acct-aunt', { circle: 'FAMILY', accessLevel: 'CONTRIBUTE' })).allowed).toBe(true);
    expect(canViewAsset(ref, otherParent).allowed).toBe(false);
  });

  it('once cleared it shows to the family exactly as its tier allows', () => {
    const ref = assetRefOf(row('CLEAR', { visibility: 'EXTENDED' }));
    expect(ref.heldForReview).toBe(false);
    expect(canViewAsset(ref, otherParent).allowed).toBe(true);
    expect(canViewAsset(ref, grandma).allowed).toBe(true);
    expect(canViewAsset(assetRefOf(row('CLEAR', { visibility: 'FAMILY' })), grandma).allowed).toBe(false); // tiers unchanged
  });

  it('the rule itself: FLAGGED and PENDING hide; CLEAR does not (BLOCKED is filtered everywhere else)', () => {
    expect(isHiddenUntilCleared({ moderationStatus: 'FLAGGED' })).toBe(true);
    expect(isHiddenUntilCleared({ moderationStatus: 'PENDING' })).toBe(true);
    expect(isHiddenUntilCleared({ moderationStatus: 'CLEAR' })).toBe(false);
  });
});
