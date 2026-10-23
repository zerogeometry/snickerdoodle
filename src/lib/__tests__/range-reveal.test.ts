import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealPlan } from '@/lib/mockupPrefetch';

/**
 * The range reveal (founder, 23 Oct): the loader waits for the TOP half of the tiles only — the
 * first ones on screen — and the bottom half is asked for straight after.
 */
describe('revealPlan', () => {
  const tiles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, instant: i % 3 === 0 }));

  it('the loader waits for the top half, as shown (an odd one out joins the top)', () => {
    expect(revealPlan(tiles(10), (t) => t.instant).top.map((t) => t.id)).toEqual([0, 1, 2, 3, 4]);
    expect(revealPlan(tiles(7), (t) => t.instant).top.map((t) => t.id)).toEqual([0, 1, 2, 3]);
    expect(revealPlan(tiles(1), (t) => t.instant).top.map((t) => t.id)).toEqual([0]);
    expect(revealPlan([], () => false)).toEqual({ top: [], rest: [], order: [] });
  });

  it('asks for the whole top half before any of the bottom half', () => {
    const { order, top } = revealPlan(tiles(10), (t) => t.instant);
    expect(order).toHaveLength(10);
    const topIds = new Set(top.map((t) => t.id));
    expect(order.slice(0, top.length).every((t) => topIds.has(t.id))).toBe(true);
  });

  it('within each half, tiles with no instant preview go first (they would otherwise sit blank)', () => {
    const { order } = revealPlan(tiles(10), (t) => t.instant);
    // top = 0..4 (0, 3 instant) · rest = 5..9 (6, 9 instant)
    expect(order.map((t) => t.id)).toEqual([1, 2, 4, 0, 3, 5, 7, 8, 6, 9]);
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
