import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * Keeps the drawing on screen for THIS TAB (founder, 24 Oct): a refresh on /start-creating or
 * /customize/* no longer loses it. sessionStorage ONLY — tab-scoped, gone when the tab closes; never
 * localStorage or IndexedDB (it's a child's drawing: CLAUDE.md privacy by default). Best-effort: a
 * drawing too big for the tab's storage simply isn't kept (the customize page's "your drawing isn't
 * loaded" notice is the fallback), and a failed write never leaves an OLDER drawing behind.
 */
export const UPLOAD_SESSION_KEY = 'sd_upload';

/** The fields a refresh needs to put the same drawing back — and nothing else. */
export type SessionUpload = {
  dataUrl: string;
  name: string;
  assetId?: string;
  key?: string;
  cutout?: { url: string; sourceObjectId: string; oneTap?: boolean; trim?: boolean; px?: { width: number; height: number } };
  trim?: { url: string; sourceObjectId: string };
  aspect?: number;
  kept?: boolean;
  opaqueBg?: boolean;
  scratch?: boolean;
};
export type UploadSessionState = { upload: SessionUpload | null };

/** Only what's needed. The file's own name can carry a child's name ("lily-age4.png") — keep just
 * its type, which is all the app reads from it. */
export function toSessionUpload(u: (SessionUpload & Record<string, unknown>) | null | undefined): SessionUpload | null {
  if (!u || typeof u.dataUrl !== 'string' || !u.dataUrl.startsWith('data:image/')) return null;
  const ext = /\.(png|jpe?g|webp|gif|heic)$/i.exec(u.name ?? '')?.[1]?.toLowerCase() ?? (u.dataUrl.startsWith('data:image/png') ? 'png' : 'jpg');
  const out: SessionUpload = { dataUrl: u.dataUrl, name: `drawing.${ext}` };
  if (typeof u.assetId === 'string') out.assetId = u.assetId;
  if (u.cutout && typeof u.cutout.url === 'string' && typeof u.cutout.sourceObjectId === 'string') {
    out.cutout = { url: u.cutout.url, sourceObjectId: u.cutout.sourceObjectId };
    if (u.cutout.oneTap === true) out.cutout.oneTap = true;
    if (u.cutout.trim === true) out.cutout.trim = true;
    const px = u.cutout.px;
    if (px && Number.isFinite(px.width) && Number.isFinite(px.height) && px.width > 0 && px.height > 0) out.cutout.px = { width: Math.round(px.width), height: Math.round(px.height) };
  }
  if (u.trim && typeof u.trim.url === 'string' && typeof u.trim.sourceObjectId === 'string') out.trim = { url: u.trim.url, sourceObjectId: u.trim.sourceObjectId };
  if (typeof u.key === 'string') out.key = u.key.slice(0, 80);
  if (typeof u.aspect === 'number' && Number.isFinite(u.aspect) && u.aspect > 0) out.aspect = u.aspect;
  if (u.kept === true) out.kept = true;
  if (typeof u.opaqueBg === 'boolean') out.opaqueBg = u.opaqueBg;
  if (u.scratch === true) out.scratch = true;
  return out;
}

/**
 * The persist storage for the upload. `store` is looked up on every call (no window at SSR; private
 * browsing can throw on access). Rules:
 *  - no drawing (removed / "create another") → the key is REMOVED, not written as null;
 *  - a new drawing REPLACES the old one;
 *  - a write that fails (quota — a big photo) removes the key, so a refresh never brings back an
 *    older drawing than the one on screen;
 *  - anything unreadable is treated as "nothing kept" (and cleared).
 */
export function uploadSessionStorage(store: () => Storage | undefined): PersistStorage<UploadSessionState> {
  const safe = () => {
    try {
      return store();
    } catch {
      return undefined;
    }
  };
  const remove = (name: string) => {
    try {
      safe()?.removeItem(name);
    } catch {
      /* nothing to clear */
    }
  };
  return {
    getItem: (name) => {
      const s = safe();
      if (!s) return null;
      try {
        const raw = s.getItem(name);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StorageValue<UploadSessionState>;
        const upload = toSessionUpload(parsed?.state?.upload as SessionUpload | null);
        if (!upload) {
          remove(name);
          return null;
        }
        return { state: { upload }, version: parsed.version };
      } catch {
        remove(name);
        return null;
      }
    },
    setItem: (name, value) => {
      const s = safe();
      if (!s) return;
      const upload = toSessionUpload(value.state.upload as SessionUpload | null);
      if (!upload) return remove(name);
      try {
        s.setItem(name, JSON.stringify({ state: { upload }, version: value.version }));
      } catch {
        remove(name); // too big for the tab — just don't keep it (and never leave an older one)
      }
    },
    removeItem: remove,
  };
}

/** Forget the tab's drawing (sign-out). Safe anywhere. */
export function clearUploadSession() {
  try {
    sessionStorage.removeItem(UPLOAD_SESSION_KEY);
  } catch {
    /* no storage */
  }
}
