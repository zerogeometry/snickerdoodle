import { describe, it, expect } from 'vitest';
import {
  canViewAsset,
  assertCanViewAsset,
  effectiveVisibility,
  AuthzError,
  type AssetRef,
  type Membership,
  type ViewerContext,
} from '../index';
import { ACCESS_LEVELS, CIRCLES, VISIBILITY_TIERS, type VisibilityTier } from '../../domain/types';
import { circleSees } from '../tiers';

/**
 * THE launch-gate matrix for "who sees a keepsake" (D27, founder 10 Nov 2026):
 *   tiers ONLY_ME < HOME < FAMILY < EXTENDED; circles HOME < FAMILY < EXTENDED (the leader counts as home);
 *   whoever ADDED it chooses; on a little one's keepsake someone else added, the child's PARENT always sees it and
 *   may only narrow it (their ceiling); "only me" = the adder (+ that parent); family scope first; nothing public.
 */

const FAM_A = 'fam-A';
const FAM_B = 'fam-B';
const CONTROLLER = 'acct-controller'; // a parent who adds their own keepsakes (uploader = controller)
const UPLOADER = 'acct-uploader'; // a relative who added a little one's keepsake (controller = the child's parent)
const PARENT = CONTROLLER;

function asset(over: Partial<AssetRef> = {}): AssetRef {
  return {
    id: 'asset-1',
    familyId: FAM_A,
    uploaderAccountId: CONTROLLER, // default: uploader IS the controller (the adder's own keepsake)
    controllerAccountId: CONTROLLER,
    visibility: 'FAMILY',
    parentLimit: null,
    heldForReview: false,
    ...over,
  };
}

function mem(over: Partial<Membership> = {}): Membership {
  return {
    familyId: FAM_A,
    accountId: 'acct-member',
    circle: 'FAMILY',
    accessLevel: 'VIEW',
    status: 'ACTIVE',
    isOwner: false,
    ...over,
  };
}

function viewer(accountId: string | null, membership: Membership | null = null): ViewerContext {
  return { accountId, membership };
}

const tiers: VisibilityTier[] = [...VISIBILITY_TIERS];
const T = (only: boolean, home: boolean, family: boolean, extended: boolean): Record<VisibilityTier, boolean> => ({
  ONLY_ME: only,
  HOME: home,
  FAMILY: family,
  EXTENDED: extended,
});

// ── 1. The tier ladder itself ─────────────────────────────────────────────────
describe('the ladder: circle × tier', () => {
  const expected: Record<string, Record<VisibilityTier, boolean>> = {
    HOME: T(false, true, true, true),
    FAMILY: T(false, false, true, true),
    EXTENDED: T(false, false, false, true),
  };
  for (const c of CIRCLES) {
    for (const t of tiers) {
      it(`${c} circle sees ${t}: ${expected[c]![t]}`, () => expect(circleSees(c, t)).toBe(expected[c]![t]));
    }
  }
});

// ── 2. The full matrix: tier × circle × access × actor (an adult's own keepsake) ──
interface Row {
  name: string;
  viewer: ViewerContext;
  expect: Record<VisibilityTier, boolean>;
}

const own: Row[] = [
  { name: 'whoever added it (the controller)', viewer: viewer(CONTROLLER, mem({ accountId: CONTROLLER, circle: 'EXTENDED' })), expect: T(true, true, true, true) },
  { name: 'the family leader (not the adder) — counts as home', viewer: viewer('acct-lead', mem({ accountId: 'acct-lead', circle: 'FAMILY', isOwner: true })), expect: T(false, true, true, true) },
  { name: 'cross-tenant: a home member of ANOTHER family', viewer: viewer('acct-b', mem({ accountId: 'acct-b', familyId: FAM_B, circle: 'HOME' })), expect: T(false, false, false, false) },
  { name: 'cross-tenant: the leader of ANOTHER family', viewer: viewer('acct-b', mem({ accountId: 'acct-b', familyId: FAM_B, isOwner: true })), expect: T(false, false, false, false) },
  { name: 'removed member (was home)', viewer: viewer('acct-rm', mem({ accountId: 'acct-rm', circle: 'HOME', status: 'REMOVED' })), expect: T(false, false, false, false) },
  { name: 'member who left (was extended)', viewer: viewer('acct-left', mem({ accountId: 'acct-left', circle: 'EXTENDED', status: 'LEFT' })), expect: T(false, false, false, false) },
  { name: 'guest (email only, no account)', viewer: viewer(null, null), expect: T(false, false, false, false) },
  { name: 'anonymous', viewer: viewer(null, null), expect: T(false, false, false, false) },
];
// every circle × every access level: access never changes what you SEE
for (const circle of CIRCLES) {
  for (const accessLevel of ACCESS_LEVELS) {
    own.push({
      name: `${circle}-circle member with ${accessLevel}`,
      viewer: viewer('acct-m', mem({ accountId: 'acct-m', circle, accessLevel })),
      expect: { ONLY_ME: false, HOME: circleSees(circle, 'HOME'), FAMILY: circleSees(circle, 'FAMILY'), EXTENDED: true },
    });
  }
}

for (const row of own) {
  describe(`matrix (adult's own keepsake) — ${row.name}`, () => {
    for (const tier of tiers) {
      it(`${tier} -> ${row.expect[tier] ? 'ALLOW' : 'DENY'}`, () => {
        expect(canViewAsset(asset({ visibility: tier }), row.viewer).allowed).toBe(row.expect[tier]);
      });
    }
  });
}

// ── 3. A little one's keepsake a RELATIVE added (adder ≠ the child's parent) ──
describe('a little one’s keepsake someone else added', () => {
  const childAsset = (visibility: VisibilityTier, parentLimit: VisibilityTier | null = null) =>
    asset({ uploaderAccountId: UPLOADER, controllerAccountId: PARENT, visibility, parentLimit });

  const rows: Row[] = [
    { name: 'the relative who added it (extended circle)', viewer: viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'EXTENDED', accessLevel: 'CONTRIBUTE' })), expect: T(true, true, true, true) },
    { name: 'the child’s parent (not the leader)', viewer: viewer(PARENT, mem({ accountId: PARENT, circle: 'HOME' })), expect: T(true, true, true, true) },
    { name: 'the family leader who is NOT this child’s parent', viewer: viewer('acct-lead', mem({ accountId: 'acct-lead', isOwner: true })), expect: T(false, true, true, true) },
    { name: 'a home member', viewer: viewer('acct-h', mem({ accountId: 'acct-h', circle: 'HOME' })), expect: T(false, true, true, true) },
    { name: 'a family member', viewer: viewer('acct-f', mem({ accountId: 'acct-f', circle: 'FAMILY' })), expect: T(false, false, true, true) },
    { name: 'an extended member', viewer: viewer('acct-e', mem({ accountId: 'acct-e', circle: 'EXTENDED' })), expect: T(false, false, false, true) },
    { name: 'another family', viewer: viewer('acct-b', mem({ accountId: 'acct-b', familyId: FAM_B, circle: 'HOME' })), expect: T(false, false, false, false) },
  ];
  for (const row of rows) {
    for (const tier of tiers) {
      it(`${row.name}: ${tier} -> ${row.expect[tier] ? 'ALLOW' : 'DENY'}`, () => {
        expect(canViewAsset(childAsset(tier), row.viewer).allowed).toBe(row.expect[tier]);
      });
    }
  }

  it('"only me" = the adder AND the child’s parent (founder answer A) — never the leader or anyone else', () => {
    expect(canViewAsset(childAsset('ONLY_ME'), viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'EXTENDED' }))).allowed).toBe(true);
    expect(canViewAsset(childAsset('ONLY_ME'), viewer(PARENT, mem({ accountId: PARENT }))).allowed).toBe(true);
    expect(canViewAsset(childAsset('ONLY_ME'), viewer('acct-lead', mem({ accountId: 'acct-lead', isOwner: true }))).allowed).toBe(false);
  });

  it('the parent’s ceiling wins over the adder’s wider choice, for everyone else', () => {
    // the relative chose extended; the parent narrowed it to home
    const a = childAsset('EXTENDED', 'HOME');
    expect(effectiveVisibility(a)).toBe('HOME');
    expect(canViewAsset(a, viewer('acct-e', mem({ accountId: 'acct-e', circle: 'EXTENDED' }))).allowed).toBe(false);
    expect(canViewAsset(a, viewer('acct-f', mem({ accountId: 'acct-f', circle: 'FAMILY' }))).allowed).toBe(false);
    expect(canViewAsset(a, viewer('acct-h', mem({ accountId: 'acct-h', circle: 'HOME' }))).allowed).toBe(true);
    // …and the adder still sees their own upload
    expect(canViewAsset(a, viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'EXTENDED' }))).allowed).toBe(true);
  });

  it('a ceiling WIDER than the adder’s choice never widens it', () => {
    const a = childAsset('HOME', 'EXTENDED');
    expect(effectiveVisibility(a)).toBe('HOME');
    expect(canViewAsset(a, viewer('acct-e', mem({ accountId: 'acct-e', circle: 'EXTENDED' }))).allowed).toBe(false);
  });

  it('a parent ceiling of ONLY_ME hides it from everyone but the adder and the parent', () => {
    const a = childAsset('EXTENDED', 'ONLY_ME');
    for (const circle of CIRCLES) expect(canViewAsset(a, viewer('acct-x', mem({ accountId: 'acct-x', circle }))).allowed).toBe(false);
    expect(canViewAsset(a, viewer('acct-lead', mem({ accountId: 'acct-lead', isOwner: true }))).allowed).toBe(false);
  });

  it('the leader cannot see another parent’s child ONLY_ME keepsake', () => {
    const a = asset({ uploaderAccountId: PARENT, controllerAccountId: PARENT, visibility: 'ONLY_ME' });
    expect(canViewAsset(a, viewer('acct-lead', mem({ accountId: 'acct-lead', isOwner: true }))).allowed).toBe(false);
  });
});

// ── 4. Adversarial ────────────────────────────────────────────────────────────
describe('adversarial — tenancy isolation', () => {
  it('a home member of family B cannot see family A EXTENDED (the widest tier)', () => {
    const v = viewer('acct-b', mem({ accountId: 'acct-b', familyId: FAM_B, circle: 'HOME' }));
    expect(canViewAsset(asset({ visibility: 'EXTENDED' }), v).allowed).toBe(false);
  });

  it('the person who added it, now in ANOTHER family only, sees nothing (family scope first)', () => {
    const v = viewer(CONTROLLER, mem({ accountId: CONTROLLER, familyId: FAM_B, isOwner: true }));
    expect(canViewAsset(asset({ visibility: 'EXTENDED' }), v).allowed).toBe(false);
  });

  it('a stale membership for the wrong family is ignored (treated as no membership)', () => {
    const v = viewer('acct-x', mem({ accountId: 'acct-x', familyId: FAM_B, circle: 'HOME' }));
    expect(canViewAsset(asset({ familyId: FAM_A, visibility: 'FAMILY' }), v).allowed).toBe(false);
  });

  it('a membership whose accountId does not match the viewer is ignored', () => {
    const v = viewer('acct-real', mem({ accountId: 'acct-someone-else', circle: 'HOME' }));
    expect(canViewAsset(asset({ visibility: 'FAMILY' }), v).allowed).toBe(false);
  });

  it('person to person: being the adder’s relative in another family grants nothing here', () => {
    // granny is in family B with the adder; she is NOT a member of family A
    const granny = viewer('acct-granny', mem({ accountId: 'acct-granny', familyId: FAM_B, circle: 'HOME' }));
    expect(canViewAsset(asset({ visibility: 'EXTENDED' }), granny).allowed).toBe(false);
  });

  it('an unknown tier is denied (default-deny)', () => {
    const v = viewer('acct-h', mem({ accountId: 'acct-h', circle: 'HOME' }));
    expect(canViewAsset(asset({ visibility: 'PUBLIC' as VisibilityTier }), v).allowed).toBe(false);
  });
});

describe('adversarial — revocation (removal/leaving revokes access immediately)', () => {
  it('a REMOVED member cannot see a keepsake they added, at any tier', () => {
    for (const tier of tiers) {
      const a = asset({ uploaderAccountId: UPLOADER, controllerAccountId: CONTROLLER, visibility: tier });
      expect(canViewAsset(a, viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'HOME', status: 'REMOVED' }))).allowed).toBe(false);
    }
  });

  it('a REMOVED child’s parent cannot see their child’s keepsake', () => {
    const a = asset({ uploaderAccountId: UPLOADER, controllerAccountId: PARENT, visibility: 'ONLY_ME' });
    expect(canViewAsset(a, viewer(PARENT, mem({ accountId: PARENT, status: 'REMOVED' }))).allowed).toBe(false);
  });

  it('a member who LEFT cannot see a FAMILY keepsake they added', () => {
    const a = asset({ visibility: 'FAMILY' });
    expect(canViewAsset(a, viewer(CONTROLLER, mem({ accountId: CONTROLLER, status: 'LEFT' }))).allowed).toBe(false);
  });
});

describe('after a family hand-over (uploader cleared): the controller stands in as the adder', () => {
  it('the new leader sees the ONLY_ME keepsake; nobody else does', () => {
    const a = asset({ uploaderAccountId: null, controllerAccountId: 'acct-new', visibility: 'ONLY_ME' });
    expect(canViewAsset(a, viewer('acct-new', mem({ accountId: 'acct-new', isOwner: true }))).allowed).toBe(true);
    expect(canViewAsset(a, viewer('acct-h', mem({ accountId: 'acct-h', circle: 'HOME' }))).allowed).toBe(false);
  });
});

describe('assertCanViewAsset', () => {
  it('throws AuthzError on deny', () => {
    expect(() => assertCanViewAsset(asset({ visibility: 'ONLY_ME' }), viewer(null))).toThrow(AuthzError);
  });
  it('does not throw on allow', () => {
    expect(() => assertCanViewAsset(asset({ visibility: 'EXTENDED' }), viewer(CONTROLLER, mem({ accountId: CONTROLLER })))).not.toThrow();
  });
});

// ── Ephemeral pre-account drafts — gated SOLELY by the upload claim (STEP 0) ──
describe('ephemeral upload claim (pre-account guest draft)', () => {
  const CLAIM = 'claim-xyz';
  const draft = (over: Partial<AssetRef> = {}): AssetRef =>
    asset({ familyId: null, uploaderAccountId: null, controllerAccountId: null, ephemeralClaimId: CLAIM, ...over });
  const claimViewer = (claim: string | null, membership: Membership | null = null): ViewerContext => ({
    accountId: null,
    membership,
    uploadClaim: claim,
  });

  it('the holder of the matching claim CAN see their own draft', () => {
    expect(canViewAsset(draft(), claimViewer(CLAIM)).allowed).toBe(true);
  });
  it('a WRONG claim cannot see the draft', () => {
    expect(canViewAsset(draft(), claimViewer('some-other-claim')).allowed).toBe(false);
  });
  it('a guest with NO claim cannot see the draft', () => {
    expect(canViewAsset(draft(), claimViewer(null)).allowed).toBe(false);
    expect(canViewAsset(draft(), viewer(null)).allowed).toBe(false);
  });
  it('a fully signed-in home member (no claim) cannot see someone else’s ephemeral draft', () => {
    expect(canViewAsset(draft(), viewer('acct-h', mem({ accountId: 'acct-h', circle: 'HOME' }))).allowed).toBe(false);
  });
  it('the claim bypasses visibility tiers — even an ONLY_ME draft is visible to its claim holder', () => {
    expect(canViewAsset(draft({ visibility: 'ONLY_ME' }), claimViewer(CLAIM)).allowed).toBe(true);
  });
  it('a claim grants access to EXACTLY one asset — not another draft', () => {
    expect(canViewAsset(draft({ id: 'asset-2', ephemeralClaimId: 'claim-for-asset-2' }), claimViewer(CLAIM)).allowed).toBe(false);
  });
  it('a claim NEVER unlocks a real (family-scoped) asset', () => {
    expect(canViewAsset(asset({ visibility: 'FAMILY' }), claimViewer(CLAIM)).allowed).toBe(false);
    expect(canViewAsset(asset({ visibility: 'EXTENDED' }), claimViewer('asset-1')).allowed).toBe(false);
  });
  it('assertCanViewAsset throws for a draft without the matching claim', () => {
    expect(() => assertCanViewAsset(draft(), claimViewer(null))).toThrow(AuthzError);
    expect(() => assertCanViewAsset(draft(), claimViewer(CLAIM))).not.toThrow();
  });
});

// ── Held for review (D8; founder, 26 Oct and 9 Nov) ─────────────────────────────
describe('a keepsake held for review', () => {
  const held = (over: Partial<AssetRef> = {}) => asset({ heldForReview: true, uploaderAccountId: UPLOADER, ...over });

  it('stays visible to whoever added it and the child’s parent (so they can see why, or delete it)', () => {
    for (const tier of tiers) {
      expect(canViewAsset(held({ visibility: tier }), viewer(CONTROLLER, mem({ accountId: CONTROLLER, isOwner: true }))).allowed).toBe(true);
      expect(canViewAsset(held({ visibility: tier }), viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'EXTENDED' }))).allowed).toBe(true);
    }
  });

  it('is hidden from every other member — the leader too — whatever their circle or access', () => {
    for (const tier of tiers) {
      for (const circle of CIRCLES) {
        for (const accessLevel of ACCESS_LEVELS) {
          const m = viewer('acct-member', mem({ circle, accessLevel }));
          expect(canViewAsset(held({ visibility: tier }), m).allowed).toBe(false);
          expect(() => assertCanViewAsset(held({ visibility: tier }), m)).toThrow(AuthzError);
        }
      }
      expect(canViewAsset(held({ visibility: tier }), viewer('acct-lead', mem({ accountId: 'acct-lead', isOwner: true }))).allowed).toBe(false);
    }
  });

  it('never widens anything: other families, ex-members and anonymous viewers stay denied', () => {
    expect(canViewAsset(held(), viewer('acct-other', mem({ accountId: 'acct-other', familyId: FAM_B }))).allowed).toBe(false);
    expect(canViewAsset(held(), viewer('acct-member', mem({ status: 'REMOVED' }))).allowed).toBe(false);
    expect(canViewAsset(held(), viewer(null)).allowed).toBe(false);
  });

  it('once cleared it is visible again exactly as its tier allows', () => {
    expect(canViewAsset(held({ heldForReview: false }), viewer('acct-member', mem({ circle: 'FAMILY' }))).allowed).toBe(true);
    expect(canViewAsset(held({ heldForReview: false, visibility: 'HOME' }), viewer('acct-member', mem({ circle: 'FAMILY' }))).allowed).toBe(false);
  });
});
