import { describe, it, expect } from 'vitest';
import {
  canBuyAsset,
  canBuyFromGiftList,
  canEditAsset,
  canContributeCreations,
  canDeleteAsset,
  canManageFamily,
  canSetAssetVisibility,
  planVisibilityChange,
  visibilityChoicesFor,
  type AssetRef,
  type Membership,
  type ViewerContext,
} from '../index';
import { CIRCLES, VISIBILITY_TIERS, type AccessLevel, type VisibilityTier } from '../../domain/types';
import { circleSees } from '../tiers';

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

/**
 * WHO SETS a keepsake's tier (D27, founder 10 Nov 2026): whoever added it chooses, any tier up to the little one's
 * parent's ceiling; the child's parent may only narrow (their ceiling) or lift it back to the adder's choice
 * (founder answer B) — never wider. Nobody else; only while ACTIVE.
 */
describe('setting who sees a keepsake — the adder vs the child’s parent', () => {
  const RELATIVE = 'acct-uploader';
  const PARENT = 'acct-controller';
  const childAsset = (visibility: VisibilityTier, parentLimit: VisibilityTier | null = null): AssetRef => ({
    id: 'a1',
    familyId: 'fam-A',
    uploaderAccountId: RELATIVE,
    controllerAccountId: PARENT,
    visibility,
    parentLimit,
    heldForReview: false,
  });
  const ownAsset = (visibility: VisibilityTier): AssetRef => ({ ...childAsset(visibility), uploaderAccountId: PARENT });
  const activeIn = (accountId: string, over: Partial<Membership> = {}): ViewerContext => ({
    accountId,
    membership: mem({ accountId, familyId: 'fam-A', ...over }),
  });

  it('the adder may pick ANY tier on their own keepsake (not just the family leader)', () => {
    for (const next of VISIBILITY_TIERS) {
      const plan = planVisibilityChange(ownAsset('FAMILY'), activeIn(PARENT, { circle: 'EXTENDED' }), next);
      expect(plan).toEqual({ allowed: true, role: 'adder', patch: { visibility: next } });
    }
  });

  it('a relative who added a little one’s keepsake chooses its tier (the originator keeps the choice)', () => {
    expect(canSetAssetVisibility(childAsset('FAMILY'), activeIn(RELATIVE, { circle: 'EXTENDED' }))).toBe(true);
    expect(planVisibilityChange(childAsset('FAMILY'), activeIn(RELATIVE), 'EXTENDED')).toMatchObject({ allowed: true, patch: { visibility: 'EXTENDED' } });
  });

  it('the child’s parent may make it more private (their ceiling), at every narrower tier', () => {
    for (const next of ['ONLY_ME', 'HOME', 'FAMILY'] as const) {
      expect(planVisibilityChange(childAsset('EXTENDED'), activeIn(PARENT), next)).toEqual({ allowed: true, role: 'childParent', patch: { parentLimit: next } });
    }
  });

  it('the child’s parent can NEVER widen past the adder’s choice', () => {
    for (const next of ['FAMILY', 'EXTENDED'] as const) {
      expect(planVisibilityChange(childAsset('HOME'), activeIn(PARENT), next).allowed).toBe(false);
    }
  });

  it('the child’s parent may lift their own ceiling back to the adder’s choice (answer B) — that clears it', () => {
    expect(planVisibilityChange(childAsset('EXTENDED', 'HOME'), activeIn(PARENT), 'EXTENDED')).toEqual({ allowed: true, role: 'childParent', patch: { parentLimit: null } });
    expect(planVisibilityChange(childAsset('EXTENDED', 'ONLY_ME'), activeIn(PARENT), 'FAMILY')).toEqual({ allowed: true, role: 'childParent', patch: { parentLimit: 'FAMILY' } });
  });

  it('the adder can only move it at or under the parent’s ceiling', () => {
    const capped = childAsset('EXTENDED', 'HOME');
    expect(planVisibilityChange(capped, activeIn(RELATIVE), 'ONLY_ME').allowed).toBe(true);
    expect(planVisibilityChange(capped, activeIn(RELATIVE), 'HOME').allowed).toBe(true);
    expect(planVisibilityChange(capped, activeIn(RELATIVE), 'FAMILY').allowed).toBe(false);
    expect(planVisibilityChange(capped, activeIn(RELATIVE), 'EXTENDED').allowed).toBe(false);
    expect(visibilityChoicesFor(capped, activeIn(RELATIVE))).toEqual({ role: 'adder', widest: 'HOME', current: 'HOME' });
  });

  it('nobody else may change it: the leader, a CONTRIBUTE home member, a stranger, anonymous', () => {
    for (const v of [
      activeIn('acct-lead', { isOwner: true, circle: 'HOME' }),
      activeIn('acct-h', { circle: 'HOME', accessLevel: 'CONTRIBUTE' }),
      activeIn('acct-other'),
      { accountId: null, membership: null } as ViewerContext,
    ]) {
      expect(canSetAssetVisibility(childAsset('FAMILY'), v)).toBe(false);
      expect(planVisibilityChange(childAsset('FAMILY'), v, 'ONLY_ME').allowed).toBe(false);
    }
  });

  it('removed / left / other-family adders and parents can change nothing', () => {
    for (const status of ['REMOVED', 'LEFT'] as const) {
      expect(canSetAssetVisibility(childAsset('FAMILY'), activeIn(RELATIVE, { status }))).toBe(false);
      expect(canSetAssetVisibility(childAsset('FAMILY'), activeIn(PARENT, { status }))).toBe(false);
    }
    expect(canSetAssetVisibility(childAsset('FAMILY'), { accountId: PARENT, membership: mem({ accountId: PARENT, familyId: 'fam-B' }) })).toBe(false);
  });

  it('an unknown tier is refused', () => {
    expect(planVisibilityChange(ownAsset('FAMILY'), activeIn(PARENT), 'PUBLIC' as VisibilityTier).allowed).toBe(false);
  });
});

describe('canDeleteAsset (whoever added it, or the little one’s parent, while active — NN8)', () => {
  const asset: AssetRef = {
    id: 'a1',
    familyId: 'fam-A',
    uploaderAccountId: 'acct-uploader',
    controllerAccountId: 'acct-controller',
    visibility: 'FAMILY',
    parentLimit: null,
    heldForReview: false,
  };
  const activeIn = (accountId: string, over: Partial<Membership> = {}): ViewerContext => ({ accountId, membership: mem({ accountId, familyId: 'fam-A', ...over }) });

  it('the little one’s parent (active) can always take it off', () => expect(canDeleteAsset(asset, activeIn('acct-controller'))).toBe(true));
  it('the relative who added it can delete their own upload', () => expect(canDeleteAsset(asset, activeIn('acct-uploader', { circle: 'EXTENDED' }))).toBe(true));
  it('the family leader who neither added it nor is the child’s parent cannot', () => expect(canDeleteAsset(asset, activeIn('acct-lead', { isOwner: true }))).toBe(false));
  it('a removed parent cannot delete', () => expect(canDeleteAsset(asset, activeIn('acct-controller', { status: 'REMOVED' }))).toBe(false));
  it('a CONTRIBUTE home member who didn’t add it cannot delete', () => expect(canDeleteAsset(asset, activeIn('acct-x', { circle: 'HOME', accessLevel: 'CONTRIBUTE' }))).toBe(false));
  it('a member of ANOTHER family cannot delete (family-scope)', () =>
    expect(canDeleteAsset(asset, { accountId: 'acct-controller', membership: mem({ accountId: 'acct-controller', familyId: 'fam-B' }) })).toBe(false));
  it('anonymous cannot delete', () => expect(canDeleteAsset(asset, { accountId: null, membership: null })).toBe(false));
});

/**
 * EDIT and BUY a keepsake as a member (07-B2, 04-B2 / 07-B4): Circle decides what you can SEE,
 * Access decides what you can DO. The full matrix: tier × circle × access × actor, plus the
 * family-scope / removed-member / held / ephemeral-draft cases.
 */
describe('canEditAsset / canBuyAsset — tier × circle × access × actor', () => {
  const tiers = VISIBILITY_TIERS;
  const circles = CIRCLES;
  const levels: AccessLevel[] = ['VIEW', 'VIEW_BUY', 'CONTRIBUTE'];
  const asset = (visibility: (typeof tiers)[number], over: Partial<AssetRef> = {}): AssetRef => ({
    id: 'a1',
    familyId: 'fam-A',
    uploaderAccountId: 'acct-controller',
    controllerAccountId: 'acct-controller',
    visibility,
    parentLimit: null,
    heldForReview: false,
    ...over,
  });
  const member = (circle: (typeof circles)[number], accessLevel: AccessLevel, over: Partial<Membership> = {}): ViewerContext => ({
    accountId: 'acct-member',
    membership: mem({ accountId: 'acct-member', circle, accessLevel, ...over }),
  });
  const sees = (tier: VisibilityTier, circle: (typeof circles)[number]) => circleSees(circle, tier);

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
