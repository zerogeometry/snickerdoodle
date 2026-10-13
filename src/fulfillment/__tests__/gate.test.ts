import { describe, expect, it } from 'vitest';
import { assertPodEgressAllowed, GateError, isChildImage, type EgressAsset, type GateEnv } from '../gate';
import type { DbHandle } from '@/server/db';

// A minimal fake DB whose subProcessors lookup returns `rows`. The gate only ever runs
// `db.select({...}).from(t).where(c).limit(n)` → Promise<rows>.
function fakeDb(rows: { id: string }[]): DbHandle {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
  } as unknown as DbHandle;
}
const POD_SIGNED = fakeDb([{ id: 'pod-1' }]); // a signed POD row exists (LG6 green)
const POD_UNSIGNED = fakeDb([]); // no fully-signed POD row

const drawing = (childSubjectId: string | null): EgressAsset => ({ childSubjectId, kind: 'DRAWING' });
const fixture: EgressAsset = { childSubjectId: null, kind: 'DRAWING', isBrandSafeFixture: true };
const photo = (childSubjectId: string | null): EgressAsset => ({ childSubjectId, kind: 'PHOTO' });
const SANDBOX: GateEnv = { podMode: 'SANDBOX', lg3SignedOff: false };
const LIVE = (lg3: boolean): GateEnv => ({ podMode: 'LIVE', lg3SignedOff: lg3 });

const expectBlocked = (p: Promise<void>) => expect(p).rejects.toBeInstanceOf(GateError);

describe('POD egress gate — launch-gate matrix (child × {sandbox,live} × {gate green, not})', () => {
  it('EVERY user upload is a child image (G11) — only a brand-safe test fixture is not', () => {
    expect(isChildImage(drawing('kid-1'))).toBe(true);
    expect(isChildImage(drawing(null))).toBe(true); // an unfiled drawing is STILL a child's art
    expect(isChildImage(photo(null))).toBe(true);
    expect(isChildImage(fixture)).toBe(false);
  });

  // ── SANDBOX: can NEVER carry a child image, regardless of any flag ──
  it('sandbox + brand-safe fixture → allowed', async () => {
    await expect(assertPodEgressAllowed(POD_UNSIGNED, fixture, SANDBOX)).resolves.toBeUndefined();
  });
  it('sandbox + UNFILED drawing → BLOCKED (it is still a child image)', async () => {
    await expectBlocked(assertPodEgressAllowed(POD_SIGNED, drawing(null), SANDBOX));
  });
  it('sandbox + child drawing → BLOCKED', async () => {
    await expectBlocked(assertPodEgressAllowed(POD_SIGNED, drawing('kid-1'), SANDBOX));
  });
  it('sandbox + photo (unlinked) → BLOCKED (conservative)', async () => {
    await expectBlocked(assertPodEgressAllowed(POD_SIGNED, photo(null), SANDBOX));
  });

  // ── LIVE + non-child → allowed regardless of gates ──
  it('live + UNFILED drawing + gates not green → BLOCKED (the G11 hole, closed)', async () => {
    await expectBlocked(assertPodEgressAllowed(POD_UNSIGNED, drawing(null), LIVE(false)));
  });

  // ── LIVE + child → requires BOTH LG3 sign-off AND a register-backed signed DPA ──
  it('live + child + LG3 green + DPA signed → allowed', async () => {
    await expect(assertPodEgressAllowed(POD_SIGNED, drawing('kid-1'), LIVE(true))).resolves.toBeUndefined();
  });
  it('live + child + LG3 green but NO signed DPA → BLOCKED', async () => {
    await expectBlocked(assertPodEgressAllowed(POD_UNSIGNED, drawing('kid-1'), LIVE(true)));
  });
  it('live + child + DPA signed but LG3 NOT signed off → BLOCKED', async () => {
    await expectBlocked(assertPodEgressAllowed(POD_SIGNED, drawing('kid-1'), LIVE(false)));
  });
  it('live + child + neither gate green → BLOCKED', async () => {
    await expectBlocked(assertPodEgressAllowed(POD_UNSIGNED, drawing('kid-1'), LIVE(false)));
  });
  it('live + child PHOTO + both gates green → allowed', async () => {
    await expect(assertPodEgressAllowed(POD_SIGNED, photo('kid-1'), LIVE(true))).resolves.toBeUndefined();
  });
});

describe('brand-safe fixtures can only be minted outside production', () => {
  it('dev opt-in works; production ignores it', async () => {
    const { devUploadsAreFixtures } = await import('@/server/ingest');
    expect(devUploadsAreFixtures({ NODE_ENV: 'development', DEV_UPLOADS_ARE_BRAND_SAFE_FIXTURES: 'true' })).toBe(true);
    expect(devUploadsAreFixtures({ NODE_ENV: 'production', DEV_UPLOADS_ARE_BRAND_SAFE_FIXTURES: 'true' })).toBe(false);
    expect(devUploadsAreFixtures({ NODE_ENV: 'development' })).toBe(false);
  });
});
