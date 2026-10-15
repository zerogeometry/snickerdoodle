'use client';

import type { Upload } from '@/lib/store';

/**
 * Carries the drawing on screen across the sign-in hop (a guest tapped "+ keepsake"), so they come
 * back to their range instead of an empty page. IndexedDB, not session/local storage: a phone
 * photo can be several MB, and the magic link may open in a new tab. Taken (and deleted) the moment
 * the page reads it, and ignored after an hour — the drawing never lingers in the browser. The KEEP
 * itself doesn't depend on this: the server finishes it on any device (keepsakes.ts).
 * Best-effort throughout: private browsing / blocked storage just means no restore.
 */
const DB_NAME = 'snickerdoodle';
const STORE = 'handoff';
const KEY = 'pending-keep';
const MAX_AGE_MS = 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export async function savePendingKeep(upload: NonNullable<Upload>): Promise<void> {
  try {
    await run('readwrite', (s) => s.put({ upload, at: Date.now() }, KEY));
  } catch {
    /* no storage — the keep still finishes server-side */
  }
}

/** The handed-off drawing (once), or null. */
export async function takePendingKeep(): Promise<NonNullable<Upload> | null> {
  try {
    const rec = (await run('readonly', (s) => s.get(KEY))) as { upload: NonNullable<Upload>; at: number } | undefined;
    await run('readwrite', (s) => s.delete(KEY));
    if (!rec || Date.now() - rec.at > MAX_AGE_MS) return null;
    return rec.upload;
  } catch {
    return null;
  }
}
