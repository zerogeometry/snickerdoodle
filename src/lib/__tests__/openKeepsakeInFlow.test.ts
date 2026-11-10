import { beforeEach, describe, expect, it, vi } from 'vitest';

const keepsakeForStudioAction = vi.fn();
vi.mock('@/app/actions/keepsakePicker', () => ({
  keepsakeForStudioAction: (i: { assetId: string }) => keepsakeForStudioAction(i),
  copyKeepsakeAction: vi.fn(),
  discardCopyAction: vi.fn(),
}));

const { openKeepsakeInFlow } = await import('../keepsakeFork');
const { useUpload } = await import('../store');

const ID = '11111111-1111-4111-8111-111111111111';

// A keepsake's basket button at home: its art becomes the drawing in progress, already kept (the flow
// shows "kept ♥"), marked so its first edit forks a NEW keepsake — the original is never overwritten.
describe('openKeepsakeInFlow', () => {
  beforeEach(() => {
    keepsakeForStudioAction.mockReset();
    useUpload.getState().setUpload(null);
  });

  it('asks the server (by id only) and puts the keepsake in progress as already kept, to fork on edit', async () => {
    keepsakeForStudioAction.mockResolvedValue({ ok: true, dataUrl: 'data:image/jpeg;base64,AA', aspect: 1.5 });
    expect(await openKeepsakeInFlow(ID)).toBe(true);
    expect(keepsakeForStudioAction).toHaveBeenCalledWith({ assetId: ID });
    expect(useUpload.getState().upload).toMatchObject({ assetId: ID, kept: true, fromKeepsake: true, aspect: 1.5, key: `keepsake-${ID}` });
    expect(useUpload.getState().upload?.copyOf).toBeUndefined();
  });

  it('carries the table-trimmed copy when there is one', async () => {
    const trim = { url: 'https://signed.example/t', sourceObjectId: 'obj-1' };
    keepsakeForStudioAction.mockResolvedValue({ ok: true, dataUrl: 'data:image/jpeg;base64,AA', aspect: 1, trim });
    await openKeepsakeInFlow(ID);
    expect(useUpload.getState().upload).toMatchObject({ trim, cutout: { ...trim, trim: true } });
  });

  it('a refusal (not theirs to see) leaves nothing in progress', async () => {
    keepsakeForStudioAction.mockResolvedValue({ ok: false });
    expect(await openKeepsakeInFlow(ID)).toBe(false);
    expect(useUpload.getState().upload).toBeNull();
  });
});
