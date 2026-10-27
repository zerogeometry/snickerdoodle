import { describe, it, expect } from 'vitest';
import { canPurchaseViaGiftLink, canReportViaGiftLink, type GiftLinkAssetRef, type GiftLinkGrant } from '../index';

const NOW = new Date('2026-10-12T12:00:00Z');

function link(over: Partial<GiftLinkGrant> = {}): GiftLinkGrant {
  return {
    familyId: 'fam-A',
    status: 'ACTIVE',
    expiresAt: new Date('2026-11-11T12:00:00Z'),
    assetIds: ['asset-1', 'asset-2'],
    ...over,
  };
}

function asset(over: Partial<GiftLinkAssetRef> = {}): GiftLinkAssetRef {
  return { id: 'asset-1', familyId: 'fam-A', moderationStatus: 'CLEAR', visibility: 'FAMILY', ...over };
}

describe('canPurchaseViaGiftLink (a capability, not a membership)', () => {
  it('active link + snapshotted, same-family, cleared keepsake -> allowed', () => {
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

  it('the parent pulled the keepsake back to ONLY_ME after sharing -> denied', () => {
    expect(canPurchaseViaGiftLink(link(), asset({ visibility: 'ONLY_ME' }), NOW).allowed).toBe(false);
  });

  for (const visibility of ['FAMILY', 'EXTENDED']) {
    it(`shared tier (${visibility}) stays purchasable through the link`, () => {
      expect(canPurchaseViaGiftLink(link(), asset({ visibility }), NOW).allowed).toBe(true);
    });
  }
});

describe('canReportViaGiftLink (report scope = the link, not a membership)', () => {
  it('a live link may report any snapshotted, same-family, shared keepsake — whatever its screening state', () => {
    for (const status of ['CLEAR', 'PENDING', 'FLAGGED']) {
      expect(canReportViaGiftLink(link(), asset({ moderationStatus: status }), NOW).allowed).toBe(true);
    }
  });

  it('revoked or expired link -> denied', () => {
    expect(canReportViaGiftLink(link({ status: 'REVOKED' }), asset(), NOW).allowed).toBe(false);
    expect(canReportViaGiftLink(link({ expiresAt: NOW }), asset(), NOW).allowed).toBe(false);
  });

  it('never widened: not in the snapshot, another family, or pulled back to ONLY_ME -> denied', () => {
    expect(canReportViaGiftLink(link(), asset({ id: 'asset-9' }), NOW).allowed).toBe(false);
    expect(canReportViaGiftLink(link(), asset({ familyId: 'fam-B' }), NOW).allowed).toBe(false);
    expect(canReportViaGiftLink(link(), asset({ familyId: null }), NOW).allowed).toBe(false);
    expect(canReportViaGiftLink(link(), asset({ visibility: 'ONLY_ME' }), NOW).allowed).toBe(false);
  });
});
