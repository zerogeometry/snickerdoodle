import { describe, it, expect } from 'vitest';
import {
  canViewAsset,
  assertCanViewAsset,
  AuthzError,
  type AssetRef,
  type Membership,
  type ViewerContext,
} from '../index';
import type { VisibilityTier } from '../../domain/types';

const FAM_A = 'fam-A';
const FAM_B = 'fam-B';
const CONTROLLER = 'acct-controller';
const UPLOADER = 'acct-uploader';

function asset(over: Partial<AssetRef> = {}): AssetRef {
  return {
    id: 'asset-1',
    familyId: FAM_A,
    uploaderAccountId: CONTROLLER, // default: uploader IS the controller (a non-child asset)
    controllerAccountId: CONTROLLER,
    visibility: 'FAMILY',
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

// ── The full visibility × viewer matrix ──────────────────────────────────────
interface Row {
  name: string;
  viewer: ViewerContext;
  expect: Record<VisibilityTier, boolean>;
}

const rows: Row[] = [
  {
    // The controller is always an active member of the family.
    name: 'controller (active member)',
    viewer: viewer(CONTROLLER, mem({ accountId: CONTROLLER, circle: 'FAMILY', isOwner: true })),
    expect: { ONLY_ME: true, FAMILY: true, EXTENDED: true },
  },
  {
    name: 'Family-circle member',
    viewer: viewer('acct-fam', mem({ accountId: 'acct-fam', circle: 'FAMILY' })),
    expect: { ONLY_ME: false, FAMILY: true, EXTENDED: true },
  },
  {
    name: 'Extended-circle member',
    viewer: viewer('acct-ext', mem({ accountId: 'acct-ext', circle: 'EXTENDED' })),
    expect: { ONLY_ME: false, FAMILY: false, EXTENDED: true },
  },
  {
    name: 'member of ANOTHER family (cross-tenant)',
    viewer: viewer('acct-b', mem({ accountId: 'acct-b', familyId: FAM_B, circle: 'FAMILY' })),
    expect: { ONLY_ME: false, FAMILY: false, EXTENDED: false },
  },
  {
    name: 'removed member (was Family-circle)',
    viewer: viewer('acct-rm', mem({ accountId: 'acct-rm', circle: 'FAMILY', status: 'REMOVED' })),
    expect: { ONLY_ME: false, FAMILY: false, EXTENDED: false },
  },
  {
    name: 'member who left (was Extended-circle)',
    viewer: viewer('acct-left', mem({ accountId: 'acct-left', circle: 'EXTENDED', status: 'LEFT' })),
    expect: { ONLY_ME: false, FAMILY: false, EXTENDED: false },
  },
  {
    name: 'guest (email only, no account)',
    viewer: viewer(null, null),
    expect: { ONLY_ME: false, FAMILY: false, EXTENDED: false },
  },
  {
    name: 'anonymous',
    viewer: viewer(null, null),
    expect: { ONLY_ME: false, FAMILY: false, EXTENDED: false },
  },
];

const tiers: VisibilityTier[] = ['ONLY_ME', 'FAMILY', 'EXTENDED'];

for (const row of rows) {
  describe(`visibility matrix — ${row.name}`, () => {
    for (const tier of tiers) {
      it(`${tier} -> ${row.expect[tier] ? 'ALLOW' : 'DENY'}`, () => {
        const decision = canViewAsset(asset({ visibility: tier }), row.viewer);
        expect(decision.allowed).toBe(row.expect[tier]);
      });
    }
  });
}

// ── Adversarial cases: try to find a leak ────────────────────────────────────
describe('adversarial — tenancy isolation', () => {
  it('a Family-circle member of family B cannot see family A EXTENDED (most permissive tier)', () => {
    const v = viewer('acct-b', mem({ accountId: 'acct-b', familyId: FAM_B, circle: 'FAMILY' }));
    expect(canViewAsset(asset({ visibility: 'EXTENDED' }), v).allowed).toBe(false);
  });

  it('a stale membership for the wrong family is ignored (treated as no membership)', () => {
    // membership claims FAM_B while the asset is FAM_A
    const v = viewer('acct-x', mem({ accountId: 'acct-x', familyId: FAM_B, circle: 'FAMILY' }));
    expect(canViewAsset(asset({ familyId: FAM_A, visibility: 'FAMILY' }), v).allowed).toBe(false);
  });

  it('a membership whose accountId does not match the viewer is ignored', () => {
    const v = viewer('acct-real', mem({ accountId: 'acct-someone-else', circle: 'FAMILY' }));
    expect(canViewAsset(asset({ visibility: 'FAMILY' }), v).allowed).toBe(false);
  });
});

describe('adversarial — controller vs uploader on a child asset (ONLY_ME)', () => {
  // A relative uploaded a drawing OF a child controlled by a different parent.
  const childAsset = (visibility: VisibilityTier) =>
    asset({ uploaderAccountId: UPLOADER, controllerAccountId: CONTROLLER, visibility });

  it('the controlling parent CAN see the child ONLY_ME asset', () => {
    const v = viewer(CONTROLLER, mem({ accountId: CONTROLLER, circle: 'FAMILY' }));
    expect(canViewAsset(childAsset('ONLY_ME'), v).allowed).toBe(true);
  });

  it('the non-controller uploader CANNOT see the child ONLY_ME asset (no controller lockout / no co-uploader leak)', () => {
    const v = viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'FAMILY' }));
    expect(canViewAsset(childAsset('ONLY_ME'), v).allowed).toBe(false);
  });

  it('the non-controller uploader CAN still see the same asset at FAMILY (they uploaded it)', () => {
    const v = viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'FAMILY' }));
    expect(canViewAsset(childAsset('FAMILY'), v).allowed).toBe(true);
  });

  it('even the family OWNER cannot see another parent\'s child ONLY_ME asset', () => {
    const owner = viewer('acct-owner', mem({ accountId: 'acct-owner', circle: 'FAMILY', isOwner: true }));
    expect(canViewAsset(childAsset('ONLY_ME'), owner).allowed).toBe(false);
  });
});

describe('adversarial — revocation (removal/leaving revokes access immediately)', () => {
  it('a REMOVED member cannot see a FAMILY asset they uploaded', () => {
    const a = asset({ uploaderAccountId: UPLOADER, controllerAccountId: CONTROLLER, visibility: 'FAMILY' });
    const v = viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'FAMILY', status: 'REMOVED' }));
    expect(canViewAsset(a, v).allowed).toBe(false);
  });

  it('a REMOVED member cannot see an EXTENDED asset they uploaded', () => {
    const a = asset({ uploaderAccountId: UPLOADER, controllerAccountId: CONTROLLER, visibility: 'EXTENDED' });
    const v = viewer(UPLOADER, mem({ accountId: UPLOADER, circle: 'FAMILY', status: 'REMOVED' }));
    expect(canViewAsset(a, v).allowed).toBe(false);
  });

  it('a REMOVED controller cannot see their own ONLY_ME asset', () => {
    const a = asset({ uploaderAccountId: CONTROLLER, controllerAccountId: CONTROLLER, visibility: 'ONLY_ME' });
    const v = viewer(CONTROLLER, mem({ accountId: CONTROLLER, status: 'REMOVED' }));
    expect(canViewAsset(a, v).allowed).toBe(false);
  });

  it('a member who LEFT cannot see a FAMILY asset they control', () => {
    const a = asset({ uploaderAccountId: CONTROLLER, controllerAccountId: CONTROLLER, visibility: 'FAMILY' });
    const v = viewer(CONTROLLER, mem({ accountId: CONTROLLER, status: 'LEFT' }));
    expect(canViewAsset(a, v).allowed).toBe(false);
  });
});

describe('assertCanViewAsset', () => {
  it('throws AuthzError on deny', () => {
    expect(() => assertCanViewAsset(asset({ visibility: 'ONLY_ME' }), viewer(null))).toThrow(AuthzError);
  });
  it('does not throw on allow', () => {
    expect(() =>
      assertCanViewAsset(
        asset({ visibility: 'EXTENDED' }),
        viewer(CONTROLLER, mem({ accountId: CONTROLLER })),
      ),
    ).not.toThrow();
  });
});

// ── Ephemeral pre-account drafts — gated SOLELY by the upload claim (STEP 0) ──
describe('ephemeral upload claim (pre-account guest draft)', () => {
  const CLAIM = 'claim-xyz';
  // An ephemeral draft has NO family / uploader / controller — only its claim.
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
    expect(canViewAsset(draft(), viewer(null)).allowed).toBe(false); // uploadClaim omitted entirely
  });

  it('a fully signed-in family member (no claim) cannot see someone else\'s ephemeral draft', () => {
    const member = viewer('acct-fam', mem({ accountId: 'acct-fam', circle: 'FAMILY' }));
    expect(canViewAsset(draft(), member).allowed).toBe(false);
  });

  it('the claim bypasses visibility tiers — even an ONLY_ME draft is visible to its claim holder', () => {
    expect(canViewAsset(draft({ visibility: 'ONLY_ME' }), claimViewer(CLAIM)).allowed).toBe(true);
  });

  it('a claim grants access to EXACTLY one asset — not another draft', () => {
    const other = draft({ id: 'asset-2', ephemeralClaimId: 'claim-for-asset-2' });
    expect(canViewAsset(other, claimViewer(CLAIM)).allowed).toBe(false);
  });

  it('a claim NEVER unlocks a real (family-scoped) asset — even if the viewer holds one', () => {
    // a real FAMILY asset (ephemeralClaimId null); a stray/forged claim must be ignored
    expect(canViewAsset(asset({ visibility: 'FAMILY' }), claimViewer(CLAIM)).allowed).toBe(false);
    // even if the claim equals the asset id, STEP 0 is skipped for a real asset
    expect(canViewAsset(asset({ visibility: 'EXTENDED' }), claimViewer('asset-1')).allowed).toBe(false);
  });

  it('assertCanViewAsset throws for a draft without the matching claim', () => {
    expect(() => assertCanViewAsset(draft(), claimViewer(null))).toThrow(AuthzError);
    expect(() => assertCanViewAsset(draft(), claimViewer(CLAIM))).not.toThrow();
  });
});
