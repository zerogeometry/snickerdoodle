import { beforeEach, describe, expect, it, vi } from 'vitest';

const keepsakeForStudioAction = vi.fn();
const copyKeepsakeAction = vi.fn();
const discardCopyAction = vi.fn();
vi.mock('@/app/actions/keepsakePicker', () => ({
  keepsakeForStudioAction: (i: { assetId: string }) => keepsakeForStudioAction(i),
  copyKeepsakeAction: (i: { assetId: string }) => copyKeepsakeAction(i),
  discardCopyAction: (i: { assetId: string }) => discardCopyAction(i),
}));

const { forkPickedKeepsake, keepsakePicture, openKeepsakeInFlow, unforkUnsavedCopy } = await import('../keepsakeFork');
const { studioOpensCutOut } = await import('../studioEditTarget');
const { savedInStudio } = await import('../studioDetour');
const { useUpload } = await import('../store');

const KEEP = '11111111-1111-4111-8111-111111111111';
const COPY = '22222222-2222-4222-8222-222222222222';
const trim = { url: 'https://signed.example/trim', sourceObjectId: 'trim-1' };
const look = { url: 'https://signed.example/cutout', sourceObjectId: 'cut-1' };
const opened = (extra: object = {}) => ({ ok: true, dataUrl: 'data:image/png;base64,AA', aspect: 1, trim, ...extra });

// Founder, 25 Nov: in the Studio (making a card pack), a picture's background was removed and saved
// as a new keepsake — reopened, the Studio treated it as never cut out (and its next save threw the
// cut-out away). A keepsake opened again now carries its saved edit, and the Studio puts it back.
describe('a lifted background is remembered when a keepsake is opened again', () => {
  beforeEach(() => {
    keepsakeForStudioAction.mockReset();
    copyKeepsakeAction.mockReset();
    discardCopyAction.mockReset();
    useUpload.getState().setUpload(null);
  });

  it('a keepsake saved cut out opens ON its cut-out — and the Studio lays it back over the drawing', async () => {
    keepsakeForStudioAction.mockResolvedValue(opened({ look }));
    await openKeepsakeInFlow(KEEP);
    const u = useUpload.getState().upload!;
    expect(u.cutout).toEqual(look); // its edit, not the plain trimmed drawing
    expect(u.trim).toEqual(trim); // the drawing itself is still there to go back to
    expect(u.dataUrl).toBe('data:image/png;base64,AA'); // the Studio still edits the untouched drawing
    expect(studioOpensCutOut(u, true)).toBe(true);
  });

  it('a keepsake never cut out (its look is the drawing) opens as the drawing, as before', async () => {
    keepsakeForStudioAction.mockResolvedValue(opened());
    await openKeepsakeInFlow(KEEP);
    const u = useUpload.getState().upload!;
    expect(u.cutout).toEqual({ ...trim, trim: true });
    expect(studioOpensCutOut(u, true)).toBe(false); // a stale stored cut-out is never put back on
  });

  it('the copy the Studio edits (from the keepsake box) opens on the keepsake’s cut-out too', async () => {
    useUpload.getState().setUpload({ dataUrl: 'data:image/png;base64,AA', name: 'drawing.png', assetId: KEEP, kept: true, fromKeepsake: true, ...keepsakePicture({ trim, look }) });
    copyKeepsakeAction.mockResolvedValue({ ok: true, assetId: COPY });
    const copyLook = { url: 'https://signed.example/copy-cutout', sourceObjectId: 'cut-2' };
    keepsakeForStudioAction.mockResolvedValue(opened({ look: copyLook }));
    expect(await forkPickedKeepsake()).toBe(COPY);
    const u = useUpload.getState().upload!;
    expect(u).toMatchObject({ assetId: COPY, copyOf: KEEP, cutout: copyLook });
    expect(studioOpensCutOut(u, true)).toBe(true);
  });

  it('leaving the Studio unsaved puts the keepsake back on its own cut-out', async () => {
    useUpload.getState().setUpload({ dataUrl: 'data:image/png;base64,AA', name: 'drawing.png', assetId: COPY, kept: true, copyOf: KEEP, cutout: { url: 'x', sourceObjectId: 'cut-2' } });
    discardCopyAction.mockResolvedValue({ ok: true });
    keepsakeForStudioAction.mockResolvedValue(opened({ look }));
    await unforkUnsavedCopy();
    expect(discardCopyAction).toHaveBeenCalledWith({ assetId: COPY });
    expect(useUpload.getState().upload).toMatchObject({ assetId: KEEP, fromKeepsake: true, cutout: look });
  });

  it('a design’s real pixel size rides along (print quality is judged on it)', () => {
    const px = { width: 2400, height: 1800 };
    expect(keepsakePicture({ trim, look: { ...look, px } }).cutout).toEqual({ ...look, px });
    expect(keepsakePicture({})).toEqual({});
  });

  it('putting the background back (no edit in use) opens the Studio on the plain drawing', () => {
    useUpload.getState().setUpload({ dataUrl: 'data:image/png;base64,AA', name: 'drawing.png', assetId: KEEP, kept: true, ...keepsakePicture({ trim, look }) });
    useUpload.getState().setCutout(null);
    expect(studioOpensCutOut(useUpload.getState().upload, true)).toBe(false);
    expect(studioOpensCutOut({ cutout: look }, false)).toBe(false); // nothing stored to put back
  });
});

// The card-pack / calendar picker opens a keepsake in the Studio as a COPY, then (back from the Studio)
// keeps the copy only if it was saved. A copy can now OPEN on its saved cut-out, so "it shows an edit"
// no longer means "it was saved".
describe('savedInStudio — back in the picker, keep the copy or tidy it away', () => {
  const detour = { assetId: COPY, copyOf: KEEP };
  it('a copy that opened on its cut-out and was left unsaved is not counted as saved', () => {
    expect(savedInStudio({ assetId: COPY, cutout: look }, { ...detour, openedAs: look.sourceObjectId })).toBe(false);
  });
  it('the Studio’s save note keeps it — even a save that puts the background back', () => {
    expect(savedInStudio({ assetId: COPY, cutout: { ...trim, trim: true } }, { ...detour, openedAs: look.sourceObjectId, saved: true })).toBe(true);
    expect(savedInStudio({ assetId: COPY, cutout: look }, { ...detour, openedAs: look.sourceObjectId, saved: true })).toBe(true);
  });
  it('without a note: a copy showing a NEW edit was saved; one showing the plain drawing was not', () => {
    expect(savedInStudio({ assetId: COPY, cutout: { url: 'd', sourceObjectId: 'design-9' } }, { ...detour, openedAs: look.sourceObjectId })).toBe(true);
    expect(savedInStudio({ assetId: COPY, cutout: { url: 'd', sourceObjectId: 'design-9' } }, detour)).toBe(true);
    expect(savedInStudio({ assetId: COPY, cutout: { ...trim, trim: true } }, detour)).toBe(false);
    expect(savedInStudio({ assetId: COPY }, detour)).toBe(false);
  });
  it('never when the drawing in progress is no longer the copy', () => {
    expect(savedInStudio({ assetId: KEEP, cutout: look }, { ...detour, saved: true })).toBe(false);
    expect(savedInStudio(null, { ...detour, saved: true })).toBe(false);
  });
});
