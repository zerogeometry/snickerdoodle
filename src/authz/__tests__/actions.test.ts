import { describe, it, expect } from 'vitest';
import {
  canBuyFromGiftList,
  canContributeCreations,
  canDeleteAsset,
  canDiscardDraft,
  canManageFamily,
  canSetAssetVisibility,
  type AssetRef,
  type Membership,
  type ViewerContext,
} from '../index';
import type { AccessLevel } from '../../domain/types';

function mem(over: Partial<Membership> = {}): Membership {
  return {
    familyId: 'fam-A',
    accountId: 'acct-member',
    circle: 'FAMILY',
    accessLevel: 'VIEW',
    status: 'ACTIVE',
    isOwner: false,
    ...over,
  };
}

describe('canBuyFromGiftList (access = what you can DO)', () => {
  const cases: Array<[AccessLevel, boolean]> = [
    ['VIEW', false],
    ['VIEW_BUY', true],
    ['CONTRIBUTE', true],
  ];
  for (const [level, expected] of cases) {
    it(`${level} -> ${expected}`, () => {
      expect(canBuyFromGiftList(mem({ accessLevel: level }))).toBe(expected);
    });
  }
  it('null membership -> false', () => expect(canBuyFromGiftList(null)).toBe(false));
  it('removed member with VIEW_BUY -> false', () =>
    expect(canBuyFromGiftList(mem({ accessLevel: 'VIEW_BUY', status: 'REMOVED' }))).toBe(false));
});

describe('canContributeCreations', () => {
  it('CONTRIBUTE -> true', () => expect(canContributeCreations(mem({ accessLevel: 'CONTRIBUTE' }))).toBe(true));
  it('VIEW_BUY -> false', () => expect(canContributeCreations(mem({ accessLevel: 'VIEW_BUY' }))).toBe(false));
  it('VIEW -> false', () => expect(canContributeCreations(mem({ accessLevel: 'VIEW' }))).toBe(false));
  it('left member with CONTRIBUTE -> false', () =>
    expect(canContributeCreations(mem({ accessLevel: 'CONTRIBUTE', status: 'LEFT' }))).toBe(false));
});

describe('canManageFamily (owner only, for now)', () => {
  it('owner -> true', () => expect(canManageFamily(mem({ isOwner: true }))).toBe(true));
  it('non-owner member -> false', () => expect(canManageFamily(mem({ isOwner: false }))).toBe(false));
  it('null -> false', () => expect(canManageFamily(null)).toBe(false));
  it('removed owner -> false', () =>
    expect(canManageFamily(mem({ isOwner: true, status: 'REMOVED' }))).toBe(false));
});

describe('canSetAssetVisibility (the asset controller, while an active member)', () => {
  const asset: AssetRef = {
    id: 'a1',
    familyId: 'fam-A',
    uploaderAccountId: 'acct-uploader',
    controllerAccountId: 'acct-controller',
    visibility: 'FAMILY',
    heldForReview: false,
  };
  const activeIn = (accountId: string): ViewerContext => ({
    accountId,
    membership: mem({ accountId, familyId: 'fam-A' }),
  });

  it('the controller (active member) can set visibility', () =>
    expect(canSetAssetVisibility(asset, activeIn('acct-controller'))).toBe(true));
  it('a REMOVED controller cannot set visibility', () =>
    expect(
      canSetAssetVisibility(asset, {
        accountId: 'acct-controller',
        membership: mem({ accountId: 'acct-controller', familyId: 'fam-A', status: 'REMOVED' }),
      }),
    ).toBe(false));
  it('the non-controller uploader cannot set visibility', () =>
    expect(canSetAssetVisibility(asset, activeIn('acct-uploader'))).toBe(false));
  it('a stranger cannot set visibility', () =>
    expect(canSetAssetVisibility(asset, activeIn('acct-other'))).toBe(false));
  it('anonymous cannot set visibility', () =>
    expect(canSetAssetVisibility(asset, { accountId: null, membership: null })).toBe(false));
});

describe('canDeleteAsset (controller-only, while an active member — NN8)', () => {
  const asset: AssetRef = {
    id: 'a1',
    familyId: 'fam-A',
    uploaderAccountId: 'acct-uploader',
    controllerAccountId: 'acct-controller',
    visibility: 'FAMILY',
    heldForReview: false,
  };
  const activeIn = (accountId: string): ViewerContext => ({ accountId, membership: mem({ accountId, familyId: 'fam-A' }) });

  it('the controlling parent (active) can delete', () =>
    expect(canDeleteAsset(asset, activeIn('acct-controller'))).toBe(true));
  it('the non-controller uploader (e.g. a co-uploading relative) cannot delete', () =>
    expect(canDeleteAsset(asset, activeIn('acct-uploader'))).toBe(false));
  it('a removed controller cannot delete', () =>
    expect(
      canDeleteAsset(asset, {
        accountId: 'acct-controller',
        membership: mem({ accountId: 'acct-controller', familyId: 'fam-A', status: 'REMOVED' }),
      }),
    ).toBe(false));
  it('an Extended-circle member (not controller) cannot delete', () =>
    expect(canDeleteAsset(asset, { accountId: 'acct-x', membership: mem({ accountId: 'acct-x', familyId: 'fam-A', circle: 'EXTENDED' }) })).toBe(false));
  it('a member of ANOTHER family cannot delete (family-scope)', () =>
    expect(canDeleteAsset(asset, { accountId: 'acct-controller', membership: mem({ accountId: 'acct-controller', familyId: 'fam-B' }) })).toBe(false));
  it('anonymous cannot delete', () =>
    expect(canDeleteAsset(asset, { accountId: null, membership: null })).toBe(false));
});

describe('canDiscardDraft (only the holder of a draft’s upload claim)', () => {
  const draft: AssetRef = { id: 'd1', familyId: null, uploaderAccountId: null, controllerAccountId: null, visibility: 'FAMILY', ephemeralClaimId: 'claim-1', heldForReview: false };
  const kept: AssetRef = { id: 'a1', familyId: 'fam-A', uploaderAccountId: 'acct-c', controllerAccountId: 'acct-c', visibility: 'FAMILY', ephemeralClaimId: null, heldForReview: false };

  it('the claim holder can discard their own draft', () =>
    expect(canDiscardDraft(draft, { accountId: null, membership: null, uploadClaim: 'claim-1' })).toBe(true));
  it('a signed-in claim holder can too', () =>
    expect(canDiscardDraft(draft, { accountId: 'acct-x', membership: null, uploadClaim: 'claim-1' })).toBe(true));
  it('a different claim cannot', () =>
    expect(canDiscardDraft(draft, { accountId: null, membership: null, uploadClaim: 'claim-2' })).toBe(false));
  it('no claim cannot (anonymous)', () => expect(canDiscardDraft(draft, { accountId: null, membership: null })).toBe(false));
  it('a family member without the claim cannot', () =>
    expect(canDiscardDraft(draft, { accountId: 'acct-m', membership: mem({ accountId: 'acct-m' }) })).toBe(false));
  it('a kept (family) asset is never discardable as a draft — even by its controller holding an old claim', () =>
    expect(canDiscardDraft(kept, { accountId: 'acct-c', membership: mem({ accountId: 'acct-c' }), uploadClaim: 'claim-1' })).toBe(false));
  it('an asset with no claim recorded at all cannot', () =>
    expect(canDiscardDraft({ ...kept, ephemeralClaimId: undefined }, { accountId: null, membership: null, uploadClaim: 'claim-1' })).toBe(false));
});
