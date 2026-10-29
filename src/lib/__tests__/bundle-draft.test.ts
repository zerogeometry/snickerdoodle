import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, resetSlot, setSlot, slotView, specOf, withLooks, type Draft } from '@/lib/bundle-draft';

// The bundle builder's slot state (founder, 29 Oct: thumbnails vanished; Studio edits didn't come back).
const TREE = { assetId: 'tree' };
const SNOW = { assetId: 'snow' };
const pics: Record<string, string> = { tree: 'u:tree', 'tree|cut': 'u:tree-cut', snow: 'u:snow', 'snow|design': 'u:snow-design', 'snow2|design': 'u:snow2-design' };
const pictureOf = (a: { assetId: string; sourceObjectId?: string | null }) => pics[a.sourceObjectId ? `${a.assetId}|${a.sourceObjectId}` : a.assetId] ?? null;
const view = (d: Draft) => ({
  placemat: slotView(d, 'placemat', pictureOf),
  coaster: slotView(d, 'coaster', pictureOf),
  orn: Array.from({ length: d.size }, (_, i) => slotView(d, { ornament: i }, pictureOf)),
});

describe('bundle slots — add → edit → replace → undo stay consistent', () => {
  it('the whole sequence: thumbnails, the picture’s spec and the order always agree', () => {
    // add: the placemats' drawing → every piece shows it
    let d: Draft = setSlot({ ...EMPTY_DRAFT, size: 4 }, 'placemat', TREE);
    expect(view(d).orn.map((v) => [v.url, v.own, v.state])).toEqual(Array(4).fill(['u:tree', false, 'ready']));
    expect(specOf(d)!.ornaments).toEqual([TREE, TREE, TREE, TREE]);

    // add: ornament 2 gets its own drawing
    d = setSlot(d, { ornament: 1 }, SNOW);
    expect(view(d).orn[1]).toMatchObject({ url: 'u:snow', own: true, state: 'ready' });
    expect(specOf(d)!.ornaments[1]).toEqual(SNOW);

    // edit: the snowman is edited in the Studio (its look is now its design) → only the slot holding it changes
    d = withLooks(d, (id) => (id === 'snow' ? 'design' : undefined));
    expect(view(d).orn[1]).toMatchObject({ url: 'u:snow-design', own: true });
    expect(view(d).placemat.url).toBe('u:tree'); // untouched
    expect(specOf(d)!.ornaments[1]).toEqual({ assetId: 'snow', sourceObjectId: 'design' });

    // replace: the Studio made a NEW keepsake for ornament 2 → it replaces just that slot
    d = setSlot(d, { ornament: 1 }, { assetId: 'snow2', sourceObjectId: 'design' });
    expect(view(d).orn[1]).toMatchObject({ url: 'u:snow2-design', own: true });
    expect(view(d).orn.filter((v) => v.own)).toHaveLength(1);

    // undo: ornament 2 goes back to the placemats' drawing
    d = resetSlot(d, { ornament: 1 });
    expect(view(d).orn.map((v) => [v.url, v.own])).toEqual(Array(4).fill(['u:tree', false]));
    expect(specOf(d)!.ornaments).toEqual([TREE, TREE, TREE, TREE]);
    // never an empty "+" while there's a drawing; never "its own" without one
    for (const v of [view(d).placemat, view(d).coaster, ...view(d).orn]) expect(v.state).not.toBe('empty');
  });

  it('a removed background on the placemats’ drawing reaches every slot showing it — and putting it back undoes it', () => {
    let d = setSlot(setSlot({ ...EMPTY_DRAFT, size: 2 }, 'placemat', TREE), 'coaster', SNOW);
    d = withLooks(d, (id) => (id === 'tree' ? 'cut' : undefined));
    expect([view(d).placemat.url, view(d).coaster.url, view(d).orn[0]!.url]).toEqual(['u:tree-cut', 'u:snow', 'u:tree-cut']);
    d = withLooks(d, () => undefined);
    expect([view(d).placemat.url, view(d).orn[0]!.url]).toEqual(['u:tree', 'u:tree']);
  });

  it('an unknown look leaves the slot alone; no change returns the same draft', () => {
    const d = setSlot({ ...EMPTY_DRAFT }, 'placemat', { assetId: 'tree', sourceObjectId: 'cut' });
    expect(withLooks(d, () => false)).toBe(d);
    expect(withLooks(d, () => 'cut')).toBe(d);
  });

  it('the keepsake box reloading (a drawing not in the list for a moment) never strips a slot’s edited look', () => {
    const d = setSlot(setSlot({ ...EMPTY_DRAFT, size: 2 }, 'placemat', TREE), { ornament: 0 }, { assetId: 'snow', sourceObjectId: 'design' });
    // the list holds only the drawing in progress while the box reloads: the snowman is "unknown", not "plain"
    const during = withLooks(d, (id) => (id === 'tree' ? undefined : false));
    expect(during).toBe(d);
    expect(slotView(during, { ornament: 0 }, pictureOf)).toMatchObject({ url: 'u:snow-design', own: true });
  });

  it('a drawing whose picture isn’t loaded yet shows a skeleton, not a "+"', () => {
    const d = setSlot({ ...EMPTY_DRAFT }, 'placemat', { assetId: 'new-upload' });
    expect(slotView(d, 'placemat', pictureOf)).toMatchObject({ state: 'loading', url: null });
    expect(slotView(EMPTY_DRAFT, 'placemat', pictureOf).state).toBe('empty');
  });
});
