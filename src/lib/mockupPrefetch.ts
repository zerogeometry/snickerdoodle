'use client';

/**
 * The catalogue REVEAL: get every tile's picture as early as possible.
 *
 *  1. Product photos + print areas for INSTANT previews are fetched as soon as the range's products
 *     are known — they don't depend on the drawing at all (/api/mockup/contexts).
 *  2. The moment the drawing is ingested, the whole range's photoreal mockups are requested up
 *     front, in a few parallel BATCHES (/api/mockup/batch) — not one request per tile as it
 *     scrolls into view. Results are preloaded into the browser's image cache.
 *  3. Every MockupPreview looks here first; a tile scrolled to later finds its picture waiting.
 *
 * Module-level caches, per tab. Signed URLs live 10 minutes on the server; we reuse them for 8.
 */
import type { InstantContext } from './instantMockup';

export interface MockupRequest {
  assetId: string;
  variantId: string;
  transform: unknown;
  size?: 'thumb' | 'zoom';
  sourceObjectId?: string | null;
  view?: string | null;
  fill?: string | null;
  /** a repeat-pattern base colour token */
  ground?: string | null;
  spanHalf?: 'front' | 'back' | null;
}
type Result = { ok: true; url: string } | { ok: false; fallback: true; needsAuth?: boolean; transient?: boolean };

/** The SAME key MockupPreview builds for its inputs — one place, so a prefetch always matches. */
export function mockupKey(r: { assetId?: string | null; sourceObjectId?: string | null; variantId?: string | null; transform?: unknown; size?: string | null; view?: string | null; fill?: string | null; spanHalf?: string | null; ground?: string | null }): string {
  return `${r.assetId ?? ''}|${r.sourceObjectId ?? ''}|${r.variantId ?? ''}|${JSON.stringify(r.transform ?? null)}|${r.size ?? ''}|${r.view ?? ''}|${r.fill ?? ''}|${r.spanHalf ?? ''}|${r.ground ?? ''}`;
}

const URL_REUSE_MS = 8 * 60_000;
const BATCH_SIZE = 4; // small batches: the first row of tiles lands without waiting for the last
const PARALLEL_BATCHES = 4;
const MAX_BATCH = 12; // = MOCKUP_BATCH_MAX on the server

const done = new Map<string, { url: string; at: number }>();
const failed = new Set<string>();
const pending = new Map<string, Promise<Result>>();
// Photos the browser has fully downloaded + decoded (ready to paint at once), and ones it couldn't
// load — together they say when a whole range has finished (see whenMockupsSettled).
const loaded = new Set<string>();
const unloadable = new Set<string>();
const contexts = new Map<string, InstantContext | null>();
const pendingContexts = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeMockups(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A ready, still-fresh mockup URL for this key, if the prefetch has one. */
export function cachedMockup(key: string): string | null {
  const hit = done.get(key);
  return hit && Date.now() - hit.at < URL_REUSE_MS ? hit.url : null;
}
/** The prefetch's in-flight request for this key, if any. */
export const pendingMockup = (key: string): Promise<Result> | undefined => pending.get(key);
/** Did the prefetch already get a definite "no picture" for this key (no template / not allowed)? */
export const mockupFailed = (key: string): boolean => failed.has(key);

/** Drop a cached URL that turned out dead (e.g. expired) — the tile recomposes. */
export function forgetMockup(key: string): void {
  done.delete(key);
  loaded.delete(key);
}

/**
 * Forget every mockup made from this source object. The Studio re-saves a design IN PLACE (same
 * object id, new pixels — new text, a new background), so without this the tiles would keep showing
 * the old picture until the URLs aged out. The server's own cache key carries the content hash, so
 * the next request composes the new design.
 */
export function forgetMockupsFor(sourceObjectId: string): void {
  const tag = `|${sourceObjectId}|`;
  for (const k of [...done.keys()]) if (k.includes(tag)) done.delete(k);
  for (const k of [...failed]) if (k.includes(tag)) failed.delete(k);
  for (const k of [...pending.keys()]) if (k.includes(tag)) pending.delete(k);
  for (const k of [...loaded]) if (k.includes(tag)) loaded.delete(k);
  for (const k of [...unloadable]) if (k.includes(tag)) unloadable.delete(k);
  notify();
}

/** Record a result a tile fetched itself, so others (and a re-mount) reuse it. */
export function rememberMockup(key: string, url: string): void {
  done.set(key, { url, at: Date.now() });
  preload(key, url); // a tile's own compose counts towards the range being ready too
}

/** Is this mockup finished — its photo ready to paint, or definitely not coming? */
export const mockupSettled = (key: string): boolean => loaded.has(key) || failed.has(key) || unloadable.has(key);

/**
 * Call `onSettled` once every one of these mockups is finished (photo downloaded + decoded, or
 * failed for good). The create page holds its "making your range" loader until then, so the range
 * is revealed with every picture in place. Returns an unsubscribe.
 */
export function whenMockupsSettled(keys: string[], onSettled: () => void): () => void {
  let fired = false;
  const check = () => {
    if (fired || !keys.every(mockupSettled)) return;
    fired = true;
    unsubscribe();
    onSettled();
  };
  const unsubscribe = subscribeMockups(check);
  check();
  return unsubscribe;
}

/**
 * Ask for these mockups now, in parallel batches, in the order given (put what's on screen first).
 * Anything already done or in flight is skipped. Fire-and-forget; tiles pick results up from here.
 */
export function prefetchMockups(reqs: MockupRequest[]): void {
  const todo = reqs.filter((r) => {
    const k = mockupKey(r);
    return !cachedMockup(k) && !pending.has(k) && !failed.has(k);
  });
  for (let i = 0; i < todo.length; i += BATCH_SIZE) enqueue(todo.slice(i, i + Math.min(BATCH_SIZE, MAX_BATCH)), 1);
  pump();
}

/** A photo whose request hiccuped (a slow / timed-out batch) is asked for again ON ITS OWN, after a
 * pause, up to this many tries in all — and the range keeps its loader up meanwhile (founder, 23 Oct:
 * "the loading animation disappears before the catalogue appears"). Only after the last try does the
 * range stop waiting for it (the tile then retries itself when shown). */
const MAX_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 1200;

function enqueue(batch: MockupRequest[], attempt: number): void {
  let settle!: (rs: Result[]) => void;
  const all = new Promise<Result[]>((res) => (settle = res));
  batch.forEach((r, i) => {
    const k = mockupKey(r);
    const p = all.then((rs): Result => rs[i] ?? { ok: false, fallback: true, transient: true }); // network hiccup
    pending.set(k, p);
    void p.then((res) => {
      const mine = pending.get(k) === p;
      if (res.ok) {
        if (mine) pending.delete(k);
        done.set(k, { url: res.url, at: Date.now() });
        preload(k, res.url);
      } else if (!res.needsAuth && !res.transient) {
        if (mine) pending.delete(k);
        failed.add(k);
      } else if (!res.needsAuth && attempt < MAX_ATTEMPTS) {
        // try again, alone (a lone compose finishes well inside a host's request time limit)
        setTimeout(() => {
          if (done.has(k) || failed.has(k)) return; // a tile got it meanwhile
          enqueue([r], attempt + 1);
          pump();
        }, RETRY_PAUSE_MS * attempt);
        return; // not settled yet — the range keeps waiting
      } else {
        if (mine) pending.delete(k);
        unloadable.add(k); // out of tries: the tile retries itself when shown; the range doesn't wait
      }
      notify();
    });
  });
  queue.push(() => runBatch(batch).then(settle, () => settle([])));
}

const queue: Array<() => Promise<void>> = [];
let running = 0;
function pump() {
  while (running < PARALLEL_BATCHES && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => {
      running--;
      pump();
    });
  }
}

async function runBatch(batch: MockupRequest[]): Promise<Result[]> {
  const res = await fetch('/api/mockup/batch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: batch.map((r) => ({
        assetId: r.assetId,
        variantId: r.variantId,
        transform: r.transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 },
        size: r.size,
        sourceObjectId: r.sourceObjectId ?? undefined,
        view: r.view ?? undefined,
        fill: r.fill ?? undefined,
        ground: r.ground ?? undefined,
        spanHalf: r.spanHalf ?? undefined,
      })),
    }),
  });
  if (!res.ok) return [];
  return ((await res.json()) as { results?: Result[] }).results ?? [];
}

/** Warm the browser's image cache, so a tile's swap to the photo is instant; note when it's ready. */
function preload(key: string, url: string, attempt = 1) {
  if (typeof window === 'undefined') return;
  loaded.delete(key);
  unloadable.delete(key);
  const img = new window.Image();
  img.decoding = 'async';
  img.onload = () => {
    void img
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (done.get(key)?.url !== url) return; // superseded by a fresher URL
        loaded.add(key);
        notify();
      });
  };
  img.onerror = () => {
    if (done.get(key)?.url !== url) return;
    // a dropped download: one more go before the range stops waiting on it
    if (attempt < 2) return void setTimeout(() => done.get(key)?.url === url && preload(key, url, attempt + 1), RETRY_PAUSE_MS);
    unloadable.add(key); // the tile re-composes itself; the range doesn't wait on it
    notify();
  };
  img.src = url;
}

/** Just warm the browser's image cache (nothing waits on it). */
function warm(url: string) {
  if (typeof window === 'undefined') return;
  const img = new window.Image();
  img.decoding = 'async';
  img.src = url;
}

// ── instant-preview contexts (no drawing involved) ─────────────────────────────────────────────
/** The instant-preview context for a variant: undefined = not fetched yet, null = none (the tile
 * waits for the server's mockup). */
export const instantContext = (variantId: string): InstantContext | null | undefined => contexts.get(variantId);

export async function prefetchContexts(variantIds: string[]): Promise<void> {
  const want = [...new Set(variantIds)].filter((id) => !contexts.has(id) && !pendingContexts.has(id));
  for (let i = 0; i < want.length; i += 80) {
    const chunk = want.slice(i, i + 80);
    chunk.forEach((id) => pendingContexts.add(id));
    try {
      const res = await fetch('/api/mockup/contexts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ variantIds: chunk }) });
      const body = res.ok ? ((await res.json()) as { contexts?: Record<string, InstantContext | null> }) : {};
      for (const id of chunk) {
        const ctx = body.contexts?.[id] ?? null;
        contexts.set(id, ctx);
        if (ctx) warm(ctx.blankUrl);
      }
    } catch {
      // instant previews are a nicety — the photoreal mockups still come
    } finally {
      chunk.forEach((id) => pendingContexts.delete(id));
      notify();
    }
  }
}
