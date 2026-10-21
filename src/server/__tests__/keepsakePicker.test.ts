import { describe, expect, it } from 'vitest';
import type { Membership, ViewerContext } from '@/authz';
import { pickableKeepsakes, type PickerRow } from '../keepsakePicker';

/**
 * The card-pack keepsake picker lists exactly what the authz gate lets the viewer see — never a
 * stranger's or another family's drawing, never BLOCKED content — and only a CLEAR keepsake is
 * pickable for print (the order-time content-safety gate, D8).
 */
const FAM = 'fam-A';
const PARENT = 'acct-parent';
const OTHER_PARENT = 'acct-other-parent';

const row = (id: string, over: Partial<PickerRow['asset']> = {}): PickerRow => ({
  asset: {
    id,
    familyId: FAM,
    uploaderAccountId: PARENT,
    controllerAccountId: PARENT,
    visibility: 'FAMILY',
    keptInHome: true,
    moderationStatus: 'CLEAR',
    createdAt: new Date('2026-10-01'),
    childSubjectId: null,
    ...over,
  },
  key: `originals/${id}.png`,
});
const mem = (over: Partial<Membership> = {}): Membership => ({ familyId: FAM, accountId: 'acct-member', circle: 'FAMILY', accessLevel: 'VIEW_BUY', status: 'ACTIVE', isOwner: false, ...over });
const viewer = (accountId: string | null, membership: Membership | null): ViewerContext => ({ accountId, membership });
const ids = (rows: PickerRow[], v: ViewerContext) => pickableKeepsakes(rows, v).map((r) => r.row.asset.id);

describe('pickableKeepsakes', () => {
  const parent = viewer(PARENT, mem({ accountId: PARENT, isOwner: true }));

  it('lists the parent’s own kept drawings, all tiers', () => {
    const rows = [row('fam'), row('ext', { visibility: 'EXTENDED' }), row('mine', { visibility: 'ONLY_ME' })];
    expect(ids(rows, parent)).toEqual(['fam', 'ext', 'mine']);
  });

  it('never lists a drawing that isn’t kept in the home', () => {
    expect(ids([row('draft', { keptInHome: false })], parent)).toEqual([]);
  });

  it('never lists BLOCKED content (no URL is ever minted for it)', () => {
    expect(ids([row('b', { moderationStatus: 'BLOCKED' })], parent)).toEqual([]);
  });

  it('lists PENDING / FLAGGED but only CLEAR is printable', () => {
    const got = pickableKeepsakes([row('clear'), row('pending', { moderationStatus: 'PENDING' }), row('flagged', { moderationStatus: 'FLAGGED' })], parent);
    expect(got.map((g) => [g.row.asset.id, g.printable])).toEqual([
      ['clear', true],
      ['pending', false],
      ['flagged', false],
    ]);
  });

  it('denies another family’s drawings outright (the family-scope check)', () => {
    expect(ids([row('theirs', { familyId: 'fam-B' })], parent)).toEqual([]);
  });

  it('keeps ONLY_ME to its controlling parent — not the other parent', () => {
    const other = viewer(OTHER_PARENT, mem({ accountId: OTHER_PARENT, circle: 'FAMILY' }));
    expect(ids([row('private', { visibility: 'ONLY_ME' }), row('shared')], other)).toEqual(['shared']);
  });

  it('an EXTENDED-circle member sees only EXTENDED drawings', () => {
    const gran = viewer('acct-gran', mem({ accountId: 'acct-gran', circle: 'EXTENDED' }));
    expect(ids([row('fam'), row('ext', { visibility: 'EXTENDED' })], gran)).toEqual(['ext']);
  });

  it('a removed member and a guest see nothing', () => {
    const removed = viewer('acct-gone', mem({ accountId: 'acct-gone', status: 'REMOVED' }));
    expect(ids([row('fam'), row('ext', { visibility: 'EXTENDED' })], removed)).toEqual([]);
    expect(ids([row('fam')], viewer(null, null))).toEqual([]);
  });
});
