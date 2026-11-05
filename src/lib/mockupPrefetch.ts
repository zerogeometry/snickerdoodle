'use client';

/**
 * The catalogue REVEAL: every tile shows the drawing on its product at once, and the server's photos
 * follow in the order the shopper will see them.
 *
 *  1. Product photos + print areas for INSTANT previews (and the plain product photo for tiles the
 *     browser can't draw) are fetched as soon as the range's products are known — they don't depend
 *     on the drawing at all (/api/mockup/contexts).
 *  2. The server's photos are asked for BY POSITION (founder, 5 Nov): the first six tiles the moment
 *     the drawing is stored, then 7–12, 13–18, … in groups of six as the shopper scrolls near them
 *     ({@link revealRange}). A group is only asked for once the one before it has answered, so later
 *     tiles never slow the first six, and no more than {@link LANES} pictures are made at once.
 *  3. Every MockupPreview looks here first; a tile scrolled to later finds its picture waiting (or on
 *     its way). The create page's loader lifts once the first six have PAINTED (instant or photo).
 *
 * Module-level caches, per tab. Signed URLs live 10 minutes on the server; we reuse them for 8.
 */
import type { InstantContext, ProductPhoto } from './instantMockup';

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
/** Tiles per group: the first six hold the loader; the rest are asked for six at a time, as they near. */
export const RANGE_GROUP = 6;
/** Pictures being made at once for this tab (= the server's own compose limit, MAX_CONCURRENT): each
 * is its own request, so a tile swaps in the moment ITS picture is ready, in priority order. */
export const LANES = 3;

const done = new Map<string, { url: string; at: number }>();
const failed = new Set<string>();
// Photos the browser has fully downloaded + decoded (ready to paint at once), and ones it couldn't
// load — together they say when a set of pictures has finished (see whenMockupsSettled).
const loaded = new Set<string>();
const unloadable = new Set<string>();
// Tiles that have PAINTED something real for this key: the instant preview or the server's photo.
const painted = new Set<string>();
const contexts = new Map<string, InstantContext | null>();
const photos = new Map<string, ProductPhoto | null>();
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
/** The prefetch's request for this key — queued or in flight — if any. Resolves once, with the final answer. */
export const pendingMockup = (key: string): Promise<Result> | undefined => tickets.get(key)?.promise;
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
  for (const set of [failed, loaded, unloadable, painted]) for (const k of [...set]) if (k.includes(tag)) set.delete(k);
  for (const k of [...done.keys()]) if (k.includes(tag)) done.delete(k);
  for (const [k, t] of [...tickets]) {
    if (!k.includes(tag)) continue;
    tickets.delete(k);
    orphans.delete(t);
    if (queue.includes(t)) {
      unqueue(t);
      letGo(t);
    } // in flight: let go when it answers (settle)
  }
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
 * failed for good). Returns an unsubscribe.
 */
export function whenMockupsSettled(keys: string[], onSettled: () => void): () => void {
  return whenAll(keys, mockupSettled, onSettled);
}

/** A tile has painted something real for this key — its instant preview or the server's photo. */
export function markPainted(key: string): void {
  if (painted.has(key)) return;
  painted.add(key);
  notify();
}
/** Has a tile painted this key (instant or photo), or is no picture coming for it? */
export const mockupPainted = (key: string): boolean => painted.has(key) || failed.has(key) || unloadable.has(key);

/**
 * Call `onPainted` once every one of these tiles has PAINTED — the drawing on its product on screen,
 * the instant preview or the server's photo (or no picture is coming for it, so it can't hold the
 * loader forever). The create page holds its loader on the first six. Returns an unsubscribe.
 */
export function whenPainted(keys: string[], onPainted: () => void): () => void {
  return whenAll(keys, mockupPainted, onPainted);
}

function whenAll(keys: string[], test: (k: string) => boolean, then: () => void): () => void {
  let fired = false;
  const check = () => {
    if (fired || !keys.every(test)) return;
    fired = true;
    unsubscribe();
    then();
  };
  const unsubscribe = subscribeMockups(check);
  check();
  return unsubscribe;
}

/** The range in groups of {@link RANGE_GROUP}, as shown (group 0 = the first six). */
export function rangeGroups<T>(tiles: T[], size = RANGE_GROUP): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < tiles.length; i += size) out.push(tiles.slice(i, i + size));
  return out;
}

/** Within a group, tiles with no instant preview are asked for first — they're the ones still showing
 * the plain product photo. */
export function blankFirst<T>(xs: T[], hasInstant: (r: T) => boolean): T[] {
  return [...xs.filter((r) => !hasInstant(r)), ...xs.filter(hasInstant)];
}

// ── The request queue ──────────────────────────────────────────────────────────────────────────
/** A photo whose request hiccuped (a slow / timed-out request) is asked for again, after a pause, up
 * to this many tries in all — and anything waiting on it keeps waiting meanwhile (founder, 23 Oct: "the
 * loading animation disappears before the catalogue appears"). Only after the last try does it stop
 * waiting (the tile then retries itself when shown). */
const MAX_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 1200;
/** One-off asks (not part of a range) — never gated, served after any range group. */
const AD_HOC = Number.MAX_SAFE_INTEGER;

interface Ticket {
  key: string;
  req: MockupRequest;
  /** its range group (0 = the first six) — or AD_HOC */
  group: number;
  /** order within the queue (blank-first within a group) */
  seq: number;
  attempt: number;
  promise: Promise<Result>;
  resolve: (r: Result) => void;
  /** the range that queued it (dropped tickets wait a beat to be adopted by the next one); a group
   * beyond its `allowed` waits, queued, until the range lets it go */
  owner: { allowed: number } | null;
}
const tickets = new Map<string, Ticket>(); // queued, in flight, or waiting to retry
const queue: Ticket[] = [];
const flying = new Set<Ticket>();
let seq = 0;

function newTicket(req: MockupRequest, key: string, group: number, owner: Ticket['owner']): Ticket {
  let resolve!: (r: Result) => void;
  const promise = new Promise<Result>((ok) => (resolve = ok));
  const t: Ticket = { key, req, group, seq: ++seq, attempt: 1, promise, resolve, owner };
  tickets.set(key, t);
  return t;
}
function unqueue(t: Ticket) {
  const i = queue.indexOf(t);
  if (i >= 0) queue.splice(i, 1);
}
const wanted = (r: MockupRequest, k = mockupKey(r)) => !cachedMockup(k) && !failed.has(k);

/** The next ticket allowed to go: the highest-priority one, unless an earlier group is still being made
 * (a group goes only once the one before has answered) or its range is holding it — one-off asks fill
 * any idle lane. */
function nextTicket(): Ticket | undefined {
  queue.sort((a, b) => a.group - b.group || a.seq - b.seq);
  let earliestFlying = AD_HOC;
  for (const t of flying) if (t.group < earliestFlying) earliestFlying = t.group;
  const head = queue[0];
  if (head && (head.group === AD_HOC || (head.group <= earliestFlying && head.group <= (head.owner?.allowed ?? AD_HOC)))) return head;
  return queue.find((t) => t.group === AD_HOC);
}

function pump() {
  while (flying.size < LANES) {
    const t = nextTicket();
    if (!t) return;
    unqueue(t);
    flying.add(t);
    void runOne(t.req).then((r) => {
      flying.delete(t);
      settle(t, r);
      pump();
    });
  }
}

/** Anyone waiting on a ticket that's gone (a re-saved design, a dropped plan) asks again themselves. */
const letGo = (t: Ticket) => t.resolve({ ok: false, fallback: true, transient: true });

function settle(t: Ticket, res: Result) {
  if (tickets.get(t.key) !== t) return letGo(t); // forgotten meanwhile (a re-saved design): not this picture
  if (res.ok) {
    done.set(t.key, { url: res.url, at: Date.now() });
    preload(t.key, res.url);
  } else if (!res.needsAuth && !res.transient) {
    failed.add(t.key);
  } else if (!res.needsAuth && t.attempt < MAX_ATTEMPTS) {
    // try again after a pause (a lone compose finishes well inside a host's request time limit)
    setTimeout(() => {
      if (tickets.get(t.key) !== t) return letGo(t);
      const got = cachedMockup(t.key);
      if (got) return finish(t, { ok: true, url: got }); // a tile got it meanwhile
      t.attempt++;
      queue.push(t);
      pump();
    }, RETRY_PAUSE_MS * t.attempt);
    return; // not settled yet — whoever waits on it keeps waiting
  } else {
    unloadable.add(t.key); // out of tries: the tile retries itself when shown; nothing waits on it
  }
  finish(t, res);
}
function finish(t: Ticket, res: Result) {
  tickets.delete(t.key);
  t.resolve(res);
  notify();
}

async function runOne(r: MockupRequest): Promise<Result> {
  const transient: Result = { ok: false, fallback: true, transient: true }; // a network hiccup / timeout
  try {
    const res = await fetch('/api/mockup/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            assetId: r.assetId,
            variantId: r.variantId,
            transform: r.transform ?? { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 },
            size: r.size,
            sourceObjectId: r.sourceObjectId ?? undefined,
            view: r.view ?? undefined,
            fill: r.fill ?? undefined,
            ground: r.ground ?? undefined,
            spanHalf: r.spanHalf ?? undefined,
          },
        ],
      }),
    });
    if (!res.ok) return transient;
    return ((await res.json()) as { results?: Result[] }).results?.[0] ?? transient;
  } catch {
    return transient;
  }
}

/** Ask for these mockups now (one-off: not part of a range), in the order given. Anything already done
 * or on its way is skipped. Fire-and-forget; tiles pick results up from here. */
export function prefetchMockups(reqs: MockupRequest[]): void {
  for (const r of reqs) {
    const k = mockupKey(r);
    if (!wanted(r, k) || tickets.has(k)) continue;
    queue.push(newTicket(r, k, AD_HOC, null));
  }
  pump();
}

export interface RangeReveal {
  /** Plan groups 0…`group`: queued at once (a tile finds its picture on the way), SENT only up to what
   * {@link RangeReveal.allow} lets go — each once the group before has answered. */
  want(group: number): void;
  /** Let groups 0…`group` be sent (group 0 always is). */
  allow(group: number): void;
  /** This range is gone (a new drawing, a new edit, the page left): drop what it queued but hasn't sent. */
  stop(): void;
}

// tickets a stopped range had queued: the next range (the same drawing re-planned — its background
// colour measured, a pick added) adopts the ones it still wants; the rest are let go a beat later
const orphans = new Set<Ticket>();
function sweepOrphans() {
  for (const t of orphans) {
    orphans.delete(t);
    if (tickets.get(t.key) === t) tickets.delete(t.key);
    letGo(t);
  }
}

/**
 * Plan a range's server photos by POSITION: `groups` are its tiles in groups of six, as shown (each
 * tile's requests — the family set tile has two). Group 0 is asked for at once; later groups once
 * planned ({@link RangeReveal.want}) AND let go ({@link RangeReveal.allow} — the create page: when the
 * first six have painted and the range shows). Within a group, tiles with no instant preview go first.
 * A group's requests go only after the group before has answered.
 */
export function revealRange(groups: MockupRequest[][], hasInstant: (r: MockupRequest) => boolean, allowed = Number.MAX_SAFE_INTEGER): RangeReveal {
  const owner = { allowed: Math.max(0, allowed) };
  let upTo = -1;
  let stopped = false;
  const mine = new Set<Ticket>();
  const range: RangeReveal = {
    want(group) {
      if (stopped) return;
      for (let g = upTo + 1; g <= Math.min(group, groups.length - 1); g++) {
        for (const r of blankFirst(groups[g]!, hasInstant)) {
          const k = mockupKey(r);
          if (!wanted(r, k)) continue;
          const had = tickets.get(k);
          if (had) {
            if (orphans.delete(had)) {
              // the previous plan's ticket, not sent yet: take it over in this position
              had.owner = owner;
              had.group = g;
              had.seq = ++seq;
              queue.push(had);
              mine.add(had);
            } else if (had.group > g && queue.includes(had)) {
              had.group = g; // asked for one-off, now on screen: move it up
            }
            continue;
          }
          const t = newTicket(r, k, g, owner);
          queue.push(t);
          mine.add(t);
        }
        upTo = g;
      }
      pump();
    },
    allow(group) {
      if (stopped || group <= owner.allowed) return;
      owner.allowed = group;
      pump();
    },
    stop() {
      stopped = true;
      for (const t of mine) {
        if (!queue.includes(t)) continue; // sent already (or done): let it finish
        unqueue(t);
        t.owner = null;
        orphans.add(t);
      }
      mine.clear();
      setTimeout(sweepOrphans, 0);
    },
  };
  range.want(0);
  return range;
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
    // a dropped download: one more go before nothing waits on it
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

// ── instant-preview contexts + product photos (no drawing involved) ─────────────────────────────
const contextKey = (variantId: string, view?: string | null) => `${variantId}|${view ?? ''}`;

/** The instant-preview context for a variant: undefined = not fetched yet, null = none (the tile
 * waits for the server's mockup, showing the product photo meanwhile). Only the primary view is drawn. */
export const instantContext = (variantId: string): InstantContext | null | undefined => contexts.get(contextKey(variantId));
/** The plain product photo a tile the browser can't draw shows while its picture is made (null = none). */
export const productPhoto = (variantId: string, view?: string | null): ProductPhoto | null | undefined => photos.get(contextKey(variantId, view));

export async function prefetchContexts(items: Array<string | { variantId: string; view?: string | null }>): Promise<void> {
  const all = items.map((i) => (typeof i === 'string' ? { variantId: i, view: null } : { variantId: i.variantId, view: i.view ?? null }));
  const seen = new Set<string>();
  const want = all.filter((i) => {
    const k = contextKey(i.variantId, i.view);
    if (seen.has(k) || contexts.has(k) || pendingContexts.has(k)) return false;
    seen.add(k);
    return true;
  });
  // one request per view (a variant can be asked for on its own photo and on an alternate view)
  const chunks: (typeof want)[] = [];
  for (const i of want) {
    const c = chunks.find((x) => x.length < 80 && !x.some((y) => y.variantId === i.variantId));
    if (c) c.push(i);
    else chunks.push([i]);
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      chunk.forEach((i) => pendingContexts.add(contextKey(i.variantId, i.view)));
      try {
        const views = Object.fromEntries(chunk.filter((i) => i.view).map((i) => [i.variantId, i.view!]));
        const res = await fetch('/api/mockup/contexts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ variantIds: chunk.map((i) => i.variantId), ...(Object.keys(views).length ? { views } : {}) }),
        });
        const body = res.ok ? ((await res.json()) as { contexts?: Record<string, InstantContext | null>; photos?: Record<string, ProductPhoto | null> }) : {};
        for (const i of chunk) {
          const k = contextKey(i.variantId, i.view);
          const ctx = body.contexts?.[i.variantId] ?? null;
          const photo = body.photos?.[i.variantId] ?? null;
          contexts.set(k, ctx);
          photos.set(k, photo);
          if (ctx) warm(ctx.blankUrl);
          if (photo) warm(photo.url);
        }
      } catch {
        // instant previews are a nicety — the photoreal mockups still come
      } finally {
        chunk.forEach((i) => pendingContexts.delete(contextKey(i.variantId, i.view)));
        notify();
      }
    }),
  );
}
