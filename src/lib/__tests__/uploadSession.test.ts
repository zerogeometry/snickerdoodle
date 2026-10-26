import { describe, expect, it } from 'vitest';
import { toSessionUpload, uploadSessionStorage, UPLOAD_SESSION_KEY, type UploadSessionState } from '@/lib/uploadSession';

/** A tab's sessionStorage, with a size limit like the real one. */
class TabStorage implements Storage {
  data = new Map<string, string>();
  constructor(private limit = Infinity) {}
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    if (v.length > this.limit) throw new DOMException('quota', 'QuotaExceededError');
    this.data.set(k, v);
  }
}

const drawing = (n = 1) => ({ dataUrl: `data:image/png;base64,${'A'.repeat(40 * n)}`, name: 'lily-age4.png', assetId: `asset-${n}`, aspect: 1.5, kept: true, cutout: { url: 'https://x/c', sourceObjectId: 'obj-1' } });
const write = (s: ReturnType<typeof uploadSessionStorage>, upload: unknown) => s.setItem(UPLOAD_SESSION_KEY, { state: { upload } as UploadSessionState, version: 0 });

describe('the drawing kept for the tab (sessionStorage only)', () => {
  it('keeps the drawing, its asset id, cutout, shape and kept flag — and a refresh reads it back', () => {
    const tab = new TabStorage();
    const s = uploadSessionStorage(() => tab);
    write(s, drawing());
    const back = s.getItem(UPLOAD_SESSION_KEY) as { state: UploadSessionState };
    expect(back.state.upload).toMatchObject({ dataUrl: drawing().dataUrl, assetId: 'asset-1', aspect: 1.5, kept: true, cutout: { sourceObjectId: 'obj-1' } });
  });

  it('remembers a one-tap "remove background" with the drawing, so "put the background back" survives leaving the page', () => {
    expect(toSessionUpload({ ...drawing(), cutout: { url: 'https://x/c', sourceObjectId: 'obj-1', oneTap: true } })!.cutout).toEqual({ url: 'https://x/c', sourceObjectId: 'obj-1', oneTap: true });
    // a Studio edit carries no flag (undoing it there would throw away Studio work)
    expect(toSessionUpload(drawing())!.cutout).toEqual({ url: 'https://x/c', sourceObjectId: 'obj-1' });
  });

  it('never keeps the file name (it can carry a child’s name) — just its type', () => {
    expect(toSessionUpload(drawing())!.name).toBe('drawing.png');
    expect(toSessionUpload({ dataUrl: 'data:image/jpeg;base64,AA', name: 'Tom Smith.JPG' })!.name).toBe('drawing.jpg');
  });

  it('a new drawing replaces the old one; removing it clears the key (not a stored null)', () => {
    const tab = new TabStorage();
    const s = uploadSessionStorage(() => tab);
    write(s, drawing(1));
    write(s, drawing(2));
    expect((s.getItem(UPLOAD_SESSION_KEY) as { state: UploadSessionState }).state.upload!.assetId).toBe('asset-2');
    write(s, null);
    expect(tab.getItem(UPLOAD_SESSION_KEY)).toBeNull();
    expect(s.getItem(UPLOAD_SESSION_KEY)).toBeNull();
  });

  it('too big for the tab: not kept, no error — and an OLDER drawing is never left behind', () => {
    const tab = new TabStorage(1000);
    const s = uploadSessionStorage(() => tab);
    write(s, drawing(1)); // small: kept
    expect(tab.getItem(UPLOAD_SESSION_KEY)).not.toBeNull();
    expect(() => write(s, drawing(100))).not.toThrow(); // 4KB > the limit
    expect(tab.getItem(UPLOAD_SESSION_KEY)).toBeNull(); // the old one is gone too
  });

  it('no storage (server render, private browsing that throws) is quietly nothing', () => {
    const none = uploadSessionStorage(() => undefined);
    expect(none.getItem(UPLOAD_SESSION_KEY)).toBeNull();
    expect(() => write(none, drawing())).not.toThrow();
    const throwing = uploadSessionStorage(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(throwing.getItem(UPLOAD_SESSION_KEY)).toBeNull();
    expect(() => write(throwing, drawing())).not.toThrow();
  });

  it('junk or anything that isn’t an image data URL is treated as nothing (and cleared)', () => {
    const tab = new TabStorage();
    const s = uploadSessionStorage(() => tab);
    tab.setItem(UPLOAD_SESSION_KEY, '{not json');
    expect(s.getItem(UPLOAD_SESSION_KEY)).toBeNull();
    expect(tab.getItem(UPLOAD_SESSION_KEY)).toBeNull();
    tab.setItem(UPLOAD_SESSION_KEY, JSON.stringify({ state: { upload: { dataUrl: 'https://elsewhere/x.png', name: 'x' } }, version: 0 }));
    expect(s.getItem(UPLOAD_SESSION_KEY)).toBeNull();
    write(s, { dataUrl: 'javascript:alert(1)', name: 'x' });
    expect(tab.getItem(UPLOAD_SESSION_KEY)).toBeNull();
  });
});
