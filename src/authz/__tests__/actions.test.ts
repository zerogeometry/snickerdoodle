import { describe, it, expect } from 'vitest';
import {
  canBuyAsset,
  canBuyFromGiftList,
  canEditAsset,
  canContributeCreations,
  canDeleteAsset,
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

/**
 * EDIT and BUY a keepsake as a member (07-B2, 04-B2 / 07-B4): Circle decides what you can SEE,
 * Access decides what you can DO. The full matrix: tier × circle × access × actor, plus the
 * family-scope / removed-member / held / ephemeral-draft cases.
 */
describe('canEditAsset / canBuyAsset — tier × circle × access × actor', () => {
  const tiers = ['ONLY_ME', 'FAMILY', 'EXTENDED'] as const;
  const circles = ['FAMILY', 'EXTENDED'] as const;
  const levels: AccessLevel[] = ['VIEW', 'VIEW_BUY', 'CONTRIBUTE'];
  const asset = (visibility: (typeof tiers)[number], over: Partial<AssetRef> = {}): AssetRef => ({
    id: 'a1',
    familyId: 'fam-A',
    uploaderAccountId: 'acct-controller',
    controllerAccountId: 'acct-controller',
    visibility,
    heldForReview: false,
    ...over,
  });
  const member = (circle: (typeof circles)[number], accessLevel: AccessLevel, over: Partial<Membership> = {}): ViewerContext => ({
    accountId: 'acct-member',
    membership: mem({ accountId: 'acct-member', circle, accessLevel, ...over }),
  });
  const sees = (tier: string, circle: string) => tier === 'EXTENDED' || (tier === 'FAMILY' && circle === 'FAMILY');

  for (const tier of tiers) {
    for (const circle of circles) {
      for (const level of levels) {
        const v = sees(tier, circle);
        it(`member ${circle}/${level} on a ${tier} keepsake → edit ${v && level === 'CONTRIBUTE'}, buy ${v && level !== 'VIEW'}`, () => {
          expect(canEditAsset(asset(tier), member(circle, level)).allowed).toBe(v && level === 'CONTRIBUTE');
          expect(canBuyAsset(asset(tier), member(circle, level)).allowed).toBe(v && level !== 'VIEW');
        });
      }
    }
    it(`the controller (an active member) edits and buys their own ${tier} keepsake`, () => {
      const ctl: ViewerContext = { accountId: 'acct-controller', membership: mem({ accountId: 'acct-controller', accessLevel: 'VIEW' }) };
      expect(canEditAsset(asset(tier), ctl).allowed).toBe(true);
      expect(canBuyAsset(asset(tier), ctl).allowed).toBe(true);
    });
  }

  it('an uploader who is NOT the controller, demoted to VIEW, can neither edit nor buy', () => {
    const a = asset('FAMILY', { uploaderAccountId: 'acct-member' });
    expect(canEditAsset(a, member('FAMILY', 'VIEW')).allowed).toBe(false);
    expect(canBuyAsset(a, member('FAMILY', 'VIEW')).allowed).toBe(false);
  });

  it('family scope first: a CONTRIBUTE member of ANOTHER family, a removed member, a guest — nothing', () => {
    for (const viewer of [
      member('FAMILY', 'CONTRIBUTE', { familyId: 'fam-B' }),
      member('FAMILY', 'CONTRIBUTE', { status: 'REMOVED' }),
      { accountId: 'acct-controller', membership: mem({ accountId: 'acct-controller', status: 'REMOVED' }) },
      { accountId: null, membership: null },
    ] as ViewerContext[]) {
      expect(canEditAsset(asset('EXTENDED'), viewer).allowed).toBe(false);
      expect(canBuyAsset(asset('EXTENDED'), viewer).allowed).toBe(false);
    }
  });

  it('a keepsake held after a report: only its controller, never a CONTRIBUTE relative', () => {
    const held = asset('FAMILY', { heldForReview: true });
    expect(canEditAsset(held, member('FAMILY', 'CONTRIBUTE')).allowed).toBe(false);
    expect(canBuyAsset(held, member('FAMILY', 'CONTRIBUTE')).allowed).toBe(false);
  });

  it('a guest’s own draft: the claim holder may edit it, never buy it before it is kept; another claim, nothing', () => {
    const draft = asset('FAMILY', { familyId: null, uploaderAccountId: null, controllerAccountId: null, ephemeralClaimId: 'claim-1' });
    expect(canEditAsset(draft, { accountId: null, membership: null, uploadClaim: 'claim-1' }).allowed).toBe(true);
    expect(canBuyAsset(draft, { accountId: null, membership: null, uploadClaim: 'claim-1' }).allowed).toBe(false);
    expect(canEditAsset(draft, { accountId: null, membership: null, uploadClaim: 'claim-2' }).allowed).toBe(false);
  });
});
