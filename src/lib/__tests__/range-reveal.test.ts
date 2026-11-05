import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankFirst, rangeGroups, RANGE_GROUP } from '@/lib/mockupPrefetch';

/**
 * The range reveal (founder, 5 Nov): the first SIX tiles hold the loader, and the rest are asked for
 * six at a time, by position, as the shopper scrolls near them.
 */
describe('rangeGroups / blankFirst', () => {
  const tiles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, instant: i % 3 === 0 }));

  it('groups the range in sixes, as shown (group 0 = the first six)', () => {
    expect(RANGE_GROUP).toBe(6);
    expect(rangeGroups(tiles(14)).map((g) => g.map((t) => t.id))).toEqual([[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11], [12, 13]]);
    expect(rangeGroups(tiles(6))).toHaveLength(1);
    expect(rangeGroups([])).toEqual([]);
  });

  it('within a group, tiles with no instant preview go first (they show only the product photo meanwhile)', () => {
    expect(blankFirst(tiles(6), (t) => t.instant).map((t) => t.id)).toEqual([1, 2, 4, 5, 0, 3]);
  });
});

const req = (n: number) => ({ assetId: 'a1', variantId: `v${n}`, size: 'thumb' as const, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } });
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = '';
  decode = () => Promise.resolve();
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

describe('revealRange — the server is asked by position', () => {
  // each request takes 100 ms; the log says which variant was asked for, and when
  let log: { v: string; at: number; done?: number }[] = [];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    log = [];
    vi.stubGlobal('window', { Image: FakeImage });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        const items = JSON.parse(init.body).items as { variantId: string }[];
        const entry = { v: items.map((i) => i.variantId).join(','), at: Date.now() };
        log.push(entry);
        await new Promise((ok) => setTimeout(ok, 100));
        (entry as { done?: number }).done = Date.now();
        return { ok: true, json: async () => ({ results: items.map((i) => ({ ok: true, url: `https://x/${i.variantId}.webp` })) }) };
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const groupsOf = (n: number) => {
    const all = Array.from({ length: n }, (_, i) => req(i));
    return [all.slice(0, 6), all.slice(6, 12), all.slice(12, 18)];
  };

  it('asks for the first six at once — one picture per request, three at a time — and nothing else until asked', async () => {
    const m = await import('@/lib/mockupPrefetch');
    m.revealRange(groupsOf(18), () => false);
    await vi.advanceTimersByTimeAsync(0);
    expect(log.map((l) => l.v)).toEqual(['v0', 'v1', 'v2']); // LANES at once
    await vi.advanceTimersByTimeAsync(1000);
    expect(log.map((l) => l.v)).toEqual(['v0', 'v1', 'v2', 'v3', 'v4', 'v5']); // the rest wait to be scrolled near
  });

  it('within the first six, tiles with no instant preview are asked for first', async () => {
    const m = await import('@/lib/mockupPrefetch');
    m.revealRange(groupsOf(6), (r) => r.variantId === 'v0' || r.variantId === 'v1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(log.map((l) => l.v)).toEqual(['v2', 'v3', 'v4', 'v5', 'v0', 'v1']);
  });

  it('a later group never starts before the group before it has answered — even when asked for straight away', async () => {
    const m = await import('@/lib/mockupPrefetch');
    const range = m.revealRange(groupsOf(18), () => false);
    range.want(2); // e.g. a fast fling to the bottom
    await vi.advanceTimersByTimeAsync(2000);
    expect(log.map((l) => l.v)).toEqual(Array.from({ length: 18 }, (_, i) => `v${i}`));
    const lastOf = (from: number, to: number) => Math.max(...log.slice(from, to).map((l) => l.done!));
    const firstOf = (from: number, to: number) => Math.min(...log.slice(from, to).map((l) => l.at));
    expect(firstOf(6, 12)).toBeGreaterThanOrEqual(lastOf(0, 6)); // 7–12 only once 1–6 have all answered
    expect(firstOf(12, 18)).toBeGreaterThanOrEqual(lastOf(6, 12));
  });

  it('the loader waits for the first six to PAINT — an instant preview counts, a stored photo alone does not', async () => {
    const m = await import('@/lib/mockupPrefetch');
    const groups = groupsOf(12);
    const ready = vi.fn();
    m.whenPainted(groups[0]!.map(m.mockupKey), ready);
    m.revealRange(groups, () => false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ready).not.toHaveBeenCalled(); // every photo arrived, but none has been painted on a tile yet
    groups[0]!.slice(0, 5).forEach((r) => m.markPainted(m.mockupKey(r)));
    expect(ready).not.toHaveBeenCalled();
    m.markPainted(m.mockupKey(groups[0]![5]!)); // the sixth tile's instant preview paints
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('a tile with no picture coming (no template) never holds the loader', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ ok: false, fallback: true }] }) })));
    const m = await import('@/lib/mockupPrefetch');
    const ready = vi.fn();
    m.whenPainted([m.mockupKey(req(0))], ready);
    m.revealRange([[req(0)]], () => false);
    await vi.advanceTimersByTimeAsync(100);
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it('a tile waits on the planned request (pendingMockup) rather than asking twice — even before its group is sent', async () => {
    const m = await import('@/lib/mockupPrefetch');
    const range = m.revealRange(groupsOf(12), () => false);
    range.want(1);
    const later = m.pendingMockup(m.mockupKey(req(9)));
    expect(later).toBeDefined(); // queued behind the first six already
    await vi.advanceTimersByTimeAsync(2000);
    await expect(later).resolves.toEqual({ ok: true, url: 'https://x/v9.webp' });
    expect(log.filter((l) => l.v === 'v9')).toHaveLength(1);
  });

  it('a re-planned range (the background colour measured) takes over what the old plan had queued — nothing is asked twice', async () => {
    const m = await import('@/lib/mockupPrefetch');
    const a = m.revealRange(groupsOf(12), () => false);
    a.want(1);
    a.stop();
    const b = m.revealRange(groupsOf(12), () => false);
    b.want(1);
    await vi.advanceTimersByTimeAsync(2000);
    const asked = log.map((l) => l.v);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked).toHaveLength(12);
  });
});

describe('catalogueCache', () => {
  const load = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    load.mockReset();
    vi.doMock('@/app/actions/catalogue', () => ({ loadCatalogueAction: load }));
  });
  afterEach(() => vi.doUnmock('@/app/actions/catalogue'));

  it('customize opens from the range page’s copy, and refreshes it behind', async () => {
    const { cachedCatalogue, fetchCatalogue, loadCatalogueCached } = await import('@/lib/catalogueCache');
    expect(cachedCatalogue()).toBeNull();
    load.mockResolvedValueOnce([{ key: 'mug' }]);
    await fetchCatalogue(); // the range page
    expect(cachedCatalogue()).toEqual([{ key: 'mug' }]);

    load.mockResolvedValueOnce([{ key: 'mug' }, { key: 'tee' }]);
    const shown = await loadCatalogueCached(); // customize: the copy, at once …
    expect(shown).toEqual([{ key: 'mug' }]);
    expect(load).toHaveBeenCalledTimes(2); // … with a refresh started behind it
    await vi.waitFor(() => expect(cachedCatalogue()).toEqual([{ key: 'mug' }, { key: 'tee' }]));
  });

  it('an old copy is not used on its own: the page waits for the current list', async () => {
    const { fetchCatalogue, loadCatalogueCached } = await import('@/lib/catalogueCache');
    load.mockResolvedValueOnce([{ key: 'mug' }]);
    await fetchCatalogue();
    load.mockResolvedValueOnce([{ key: 'tee' }]);
    expect(await loadCatalogueCached(false, Date.now() + 6 * 60_000)).toEqual([{ key: 'tee' }]);
  });

  it('two pages asking at once share one request; the curation list is kept apart', async () => {
    const { fetchCatalogue, cachedCatalogue } = await import('@/lib/catalogueCache');
    load.mockResolvedValue([{ key: 'mug' }]);
    await Promise.all([fetchCatalogue(), fetchCatalogue()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(cachedCatalogue(true)).toBeNull();
  });
});
