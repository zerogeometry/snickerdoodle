import { describe, expect, it } from 'vitest';
import {
  canDeleteAsset,
  canViewAsset,
  effectiveVisibility,
  filingChoicesFor,
  originatorOf,
  planFiling,
  tierRank,
  visibilityChoicesFor,
  type AssetRef,
  type ChildRef,
  type Membership,
  type ViewerContext,
} from '../index';
import { ACCESS_LEVELS, CIRCLES, VISIBILITY_TIERS } from '../../domain/types';

/**
 * Filing a keepsake into a little one's corner (founder, 17 Nov 2026: "only whoever added it"). Filing hands the
 * child's parent a say (D27), so it's a launch-gate rule like the rest of src/authz.
 */

const FAM = 'fam-A';
const OTHER_FAM = 'fam-B';
const MUM = 'acct-mum'; // the family leader; parent of Sonny and Ada
const GRAN = 'acct-gran'; // a CONTRIBUTE relative who adds pictures
const AUNT = 'acct-aunt'; // a parent of her own little one (Theo) in the same family
const STRANGER = 'acct-stranger';

const SONNY: ChildRef = { id: 'child-sonny', familyId: FAM, controllerAccountId: MUM };
const ADA: ChildRef = { id: 'child-ada', familyId: FAM, controllerAccountId: MUM };
const THEO: ChildRef = { id: 'child-theo', familyId: FAM, controllerAccountId: AUNT };
const ELSEWHERE: ChildRef = { id: 'child-elsewhere', familyId: OTHER_FAM, controllerAccountId: STRANGER };
const KIDS = [SONNY, ADA, THEO, ELSEWHERE];

type Filable = AssetRef & { childSubjectId: string | null };

function asset(over: Partial<Filable> = {}): Filable {
  return {
    id: 'asset-1',
    familyId: FAM,
    uploaderAccountId: MUM,
    controllerAccountId: MUM,
    childSubjectId: null,
    visibility: 'FAMILY',
    parentLimit: null,
    heldForReview: false,
    ...over,
  };
}

function mem(accountId: string, over: Partial<Membership> = {}): Membership {
  return { familyId: FAM, accountId, circle: 'FAMILY', accessLevel: 'CONTRIBUTE', status: 'ACTIVE', isOwner: false, ...over };
}

const as = (accountId: string | null, membership: Membership | null): ViewerContext => ({ accountId, membership });
const MUM_V = as(MUM, mem(MUM, { isOwner: true, circle: 'HOME' }));
const GRAN_V = as(GRAN, mem(GRAN));
const AUNT_V = as(AUNT, mem(AUNT));

/** Apply a plan's patch, as the server stores it. */
function filed(a: Filable, viewer: ViewerContext, child: ChildRef | null): Filable {
  const plan = planFiling(a, viewer, child, KIDS);
  if (!plan.allowed) throw new Error(plan.reason);
  return { ...a, ...plan.patch };
}

describe('filing — an unfiled keepsake', () => {
  it('whoever added it may file it under any little one in the family, or leave it unfiled', () => {
    expect(filingChoicesFor(asset(), MUM_V, KIDS)).toEqual({ childIds: [SONNY.id, ADA.id, THEO.id], canUnfile: true });
    expect(filingChoicesFor(asset({ uploaderAccountId: GRAN, controllerAccountId: GRAN }), GRAN_V, KIDS)).toEqual({
      childIds: [SONNY.id, ADA.id, THEO.id],
      canUnfile: true,
    });
  });

  it('never offers a little one from another family, and refuses one if asked', () => {
    expect(filingChoicesFor(asset(), MUM_V, KIDS)?.childIds).not.toContain(ELSEWHERE.id);
    expect(planFiling(asset(), MUM_V, ELSEWHERE, KIDS)).toMatchObject({ allowed: false });
  });

  it('nobody but the adder may file it — not the family leader, not a relative, not a stranger', () => {
    const grans = asset({ uploaderAccountId: GRAN, controllerAccountId: GRAN });
    expect(filingChoicesFor(grans, MUM_V, KIDS)).toBeNull(); // the leader can't file Granny's picture
    expect(planFiling(grans, MUM_V, SONNY, KIDS)).toMatchObject({ allowed: false });
    expect(filingChoicesFor(asset(), GRAN_V, KIDS)).toBeNull(); // a CONTRIBUTE relative can't file Mum's
    expect(filingChoicesFor(asset(), AUNT_V, KIDS)).toBeNull();
    expect(filingChoicesFor(asset(), as(STRANGER, mem(STRANGER, { familyId: OTHER_FAM })), KIDS)).toBeNull();
    expect(filingChoicesFor(asset(), as(null, null), KIDS)).toBeNull();
  });

  it('a removed or left adder can no longer file their own keepsake', () => {
    for (const status of ['REMOVED', 'LEFT'] as const) {
      const v = as(MUM, mem(MUM, { isOwner: true, status }));
      expect(filingChoicesFor(asset(), v, KIDS)).toBeNull();
      expect(planFiling(asset(), v, SONNY, KIDS).allowed).toBe(false);
    }
  });

  it('a guest’s draft is never filed (it has to be kept first)', () => {
    const draft = asset({ familyId: null, uploaderAccountId: null, controllerAccountId: null, ephemeralClaimId: 'claim-1' });
    expect(filingChoicesFor(draft, { accountId: null, membership: null, uploadClaim: 'claim-1' }, KIDS)).toBeNull();
  });

  it('filing under the adder’s own little one keeps them in sole charge', () => {
    const a = filed(asset(), MUM_V, SONNY);
    expect(a).toMatchObject({ childSubjectId: SONNY.id, controllerAccountId: MUM, parentLimit: null });
    expect(originatorOf(a)).toBe(MUM);
    expect(visibilityChoicesFor(a, MUM_V)?.role).toBe('adder');
  });

  it('Granny filing under Sonny hands Sonny’s parent a say — Granny still chooses, Mum may narrow or remove', () => {
    const a = filed(asset({ uploaderAccountId: GRAN, controllerAccountId: GRAN }), GRAN_V, SONNY);
    expect(a).toMatchObject({ childSubjectId: SONNY.id, controllerAccountId: MUM, uploaderAccountId: GRAN, parentLimit: null });
    expect(originatorOf(a)).toBe(GRAN);
    expect(visibilityChoicesFor(a, GRAN_V)?.role).toBe('adder');
    expect(visibilityChoicesFor(a, MUM_V)?.role).toBe('childParent');
    expect(canDeleteAsset(a, MUM_V)).toBe(true);
    expect(canViewAsset({ ...a, visibility: 'ONLY_ME' }, MUM_V).allowed).toBe(true); // the parent is never shut out
  });
});

describe('filing — a keepsake already in another parent’s child’s corner', () => {
  const inSonnys = () => filed(asset({ uploaderAccountId: GRAN, controllerAccountId: GRAN }), GRAN_V, SONNY);

  it('only that parent may move it, and only to another of their own little ones', () => {
    expect(filingChoicesFor(inSonnys(), MUM_V, KIDS)).toEqual({ childIds: [SONNY.id, ADA.id], canUnfile: false });
    expect(planFiling(inSonnys(), MUM_V, ADA, KIDS)).toMatchObject({ allowed: true, patch: { childSubjectId: ADA.id, controllerAccountId: MUM } });
    expect(planFiling(inSonnys(), MUM_V, THEO, KIDS)).toMatchObject({ allowed: false }); // not to another parent's child
    expect(planFiling(inSonnys(), MUM_V, null, KIDS)).toMatchObject({ allowed: false }); // not dropping the say she was given
  });

  it('the adder can’t take it back out of the parent’s hands', () => {
    expect(filingChoicesFor(inSonnys(), GRAN_V, KIDS)).toBeNull();
    expect(planFiling(inSonnys(), GRAN_V, null, KIDS).allowed).toBe(false);
    expect(planFiling(inSonnys(), GRAN_V, THEO, KIDS).allowed).toBe(false);
  });

  it('the parent’s ceiling travels with it between her own little ones', () => {
    const narrowed = { ...inSonnys(), visibility: 'EXTENDED' as const, parentLimit: 'HOME' as const };
    const moved = filed(narrowed, MUM_V, ADA);
    expect(moved.parentLimit).toBe('HOME');
    expect(effectiveVisibility(moved)).toBe('HOME');
  });
});

describe('filing — a family handed over (no adder recorded)', () => {
  const handedOver = () => asset({ uploaderAccountId: null, controllerAccountId: MUM });

  it('the controller files among their own little ones only — never making another parent its originator', () => {
    expect(filingChoicesFor(handedOver(), MUM_V, KIDS)).toEqual({ childIds: [SONNY.id, ADA.id], canUnfile: true });
    expect(planFiling(handedOver(), MUM_V, THEO, KIDS).allowed).toBe(false);
    expect(originatorOf(filed(handedOver(), MUM_V, ADA))).toBe(MUM);
  });
});

describe('filing — the invariants, across every tier, circle and access', () => {
  const adders = [MUM, GRAN, AUNT];
  const targets: (ChildRef | null)[] = [null, SONNY, ADA, THEO];

  it('never changes who added it, and never makes it wider', () => {
    for (const adder of adders)
      for (const visibility of VISIBILITY_TIERS)
        for (const from of targets)
          for (const to of targets) {
            const start = from ? filed(asset({ uploaderAccountId: adder, controllerAccountId: adder, visibility }), as(adder, mem(adder)), from) : asset({ uploaderAccountId: adder, controllerAccountId: adder, visibility });
            for (const who of [MUM, GRAN, AUNT]) {
              const plan = planFiling(start, as(who, mem(who)), to, KIDS);
              if (!plan.allowed) continue;
              const after = { ...start, ...plan.patch };
              expect(originatorOf(after)).toBe(adder);
              expect(tierRank(effectiveVisibility(after))).toBeLessThanOrEqual(tierRank(effectiveVisibility(start)));
              expect(after.visibility).toBe(start.visibility); // the adder's own choice is untouched
            }
          }
  });

  it('circle and access never grant filing on their own: only the adder or the child’s parent', () => {
    for (const circle of CIRCLES)
      for (const accessLevel of ACCESS_LEVELS)
        for (const isOwner of [true, false]) {
          const v = as('acct-someone', mem('acct-someone', { circle, accessLevel, isOwner }));
          expect(filingChoicesFor(asset(), v, KIDS)).toBeNull();
          expect(filingChoicesFor(asset({ uploaderAccountId: GRAN, controllerAccountId: MUM, childSubjectId: SONNY.id }), v, KIDS)).toBeNull();
        }
  });
});
