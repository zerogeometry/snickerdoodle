import { describe, it, expect } from 'vitest';
import {
  canBuyFromGiftList,
  canContributeCreations,
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
