import { describe, it, expect } from 'vitest';
import { canPurchaseViaGiftLink, giftLinkAudience, giftLinkShows, type GiftLinkAssetRef, type GiftLinkGrant } from '../index';
import { CIRCLES, VISIBILITY_TIERS, type Circle, type VisibilityTier } from '../../domain/types';
import { circleSees } from '../tiers';

const NOW = new Date('2026-10-12T12:00:00Z');

function link(over: Partial<GiftLinkGrant> = {}): GiftLinkGrant {
  return {
    familyId: 'fam-A',
    status: 'ACTIVE',
    expiresAt: new Date('2026-11-11T12:00:00Z'),
    assetIds: ['asset-1', 'asset-2'],
    audienceCircle: 'FAMILY',
    ...over,
  };
}

function asset(over: Partial<GiftLinkAssetRef> = {}): GiftLinkAssetRef {
  return { id: 'asset-1', familyId: 'fam-A', moderationStatus: 'CLEAR', visibility: 'FAMILY', parentLimit: null, ...over };
}

describe('canPurchaseViaGiftLink (a capability, not a membership)', () => {
  it('active link + snapshotted, same-family, cleared keepsake its person may see -> allowed', () => {
    expect(canPurchaseViaGiftLink(link(), asset(), NOW).allowed).toBe(true);
  });

  it('revoked link -> denied (revocation bites immediately)', () => {
    expect(canPurchaseViaGiftLink(link({ status: 'REVOKED' }), asset(), NOW).allowed).toBe(false);
  });

  it('expired link -> denied, including exactly at expiry', () => {
    expect(canPurchaseViaGiftLink(link({ expiresAt: new Date('2026-10-01T00:00:00Z') }), asset(), NOW).allowed).toBe(false);
    expect(canPurchaseViaGiftLink(link({ expiresAt: NOW }), asset(), NOW).allowed).toBe(false);
  });

  it('keepsake NOT in the frozen snapshot -> denied (a token is never widened)', () => {
    expect(canPurchaseViaGiftLink(link(), asset({ id: 'asset-9' }), NOW).allowed).toBe(false);
  });

  it('cross-family: snapshotted id but the asset now lives in another family -> denied', () => {
    expect(canPurchaseViaGiftLink(link(), asset({ familyId: 'fam-B' }), NOW).allowed).toBe(false);
  });

  for (const status of ['PENDING', 'FLAGGED', 'BLOCKED']) {
    it(`content not cleared (${status}) -> denied (D8)`, () => {
      expect(canPurchaseViaGiftLink(link(), asset({ moderationStatus: status }), NOW).allowed).toBe(false);
    });
  }

  it('pulled back to ONLY_ME after sharing -> denied on every link', () => {
    for (const audienceCircle of CIRCLES) expect(canPurchaseViaGiftLink(link({ audienceCircle }), asset({ visibility: 'ONLY_ME' }), NOW).allowed).toBe(false);
  });
});

/**
 * D27 (founder, 10 Nov 2026): ONE link per person, showing only what THAT person's circle may see —
 * the full audience-circle × tier matrix, the parent's ceiling, forwarding, and per-person revocation.
 */
describe('a per-person link shows only what that person’s circle may see', () => {
  for (const audienceCircle of CIRCLES) {
    for (const visibility of VISIBILITY_TIERS) {
      const expected = circleSees(audienceCircle, visibility);
      it(`a ${audienceCircle} person's link, ${visibility} keepsake -> ${expected ? 'on it' : 'not on it'}`, () => {
        expect(canPurchaseViaGiftLink(link({ audienceCircle }), asset({ visibility }), NOW).allowed).toBe(expected);
        expect(giftLinkShows(audienceCircle, asset({ visibility }))).toBe(expected);
      });
    }
  }

  it('the little one’s parent’s ceiling counts: an extended keepsake capped at home is off a family link', () => {
    expect(canPurchaseViaGiftLink(link({ audienceCircle: 'FAMILY' }), asset({ visibility: 'EXTENDED', parentLimit: 'HOME' }), NOW).allowed).toBe(false);
    expect(canPurchaseViaGiftLink(link({ audienceCircle: 'HOME' }), asset({ visibility: 'EXTENDED', parentLimit: 'HOME' }), NOW).allowed).toBe(true);
  });

  it('a link made before D27 (shared with many) shows extended-level keepsakes only', () => {
    const legacy = link({ audienceCircle: null });
    expect(giftLinkAudience(legacy)).toBe('EXTENDED');
    expect(canPurchaseViaGiftLink(legacy, asset({ visibility: 'EXTENDED' }), NOW).allowed).toBe(true);
    for (const v of ['ONLY_ME', 'HOME', 'FAMILY'] as VisibilityTier[]) expect(canPurchaseViaGiftLink(legacy, asset({ visibility: v }), NOW).allowed).toBe(false);
  });

  it('FORWARDED: whoever holds granny’s (extended) link sees only what granny may — never a family keepsake', () => {
    // the grant is the token's, not the holder's: a family-circle member opening granny's link gets granny's view
    const grannysLink = link({ audienceCircle: 'EXTENDED' });
    expect(canPurchaseViaGiftLink(grannysLink, asset({ visibility: 'FAMILY' }), NOW).allowed).toBe(false);
    expect(canPurchaseViaGiftLink(grannysLink, asset({ visibility: 'HOME' }), NOW).allowed).toBe(false);
  });

  it('REVOKING person A’s link leaves person B’s working', () => {
    const a = link({ audienceCircle: 'FAMILY', status: 'REVOKED' });
    const b = link({ audienceCircle: 'FAMILY', status: 'ACTIVE' });
    expect(canPurchaseViaGiftLink(a, asset(), NOW).allowed).toBe(false);
    expect(canPurchaseViaGiftLink(b, asset(), NOW).allowed).toBe(true);
  });

  it('an unknown circle on a link shows nothing (default-deny)', () => {
    expect(canPurchaseViaGiftLink(link({ audienceCircle: 'PUBLIC' as Circle }), asset({ visibility: 'EXTENDED' }), NOW).allowed).toBe(false);
  });
});
