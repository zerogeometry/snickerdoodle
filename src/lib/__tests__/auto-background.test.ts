import { describe, expect, it } from 'vitest';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';
import { backgroundOf } from '@/lib/store';
import { toSessionUpload } from '@/lib/uploadSession';
import { AUTO_GROUND_PRODUCT_KEYS, defaultGroundFor } from '@/lib/patterns';
import { nearestGarmentColour } from '@/lib/garments';
import { awaitsBackground, displayGround, FLAT_MIN_GAP, FLAT_PRODUCT_KEYS, garmentDefault, pinLast, resolveDisplayVariant, spaceOutFlatPinned, splitCatalogue } from '@/lib/catalogue-view';

// The founder (5 Nov): the height chart + the repeats default their base colour to the drawing's own background;
// a tee defaults to the colour in Prodigi's range nearest it; the height chart is always the last tile.

/** A w×h RGBA picture: `paper` everywhere, `ink` in the middle (the drawing), `edge` (if given) painted over the
 * outer ring of `edgeFrac` of the pixels. */
function picture(w: number, h: number, paper: [number, number, number, number], opts: { ink?: [number, number, number, number]; edge?: (x: number, y: number) => [number, number, number, number] | null } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inner = x > w * 0.2 && x < w * 0.8 && y > h * 0.2 && y < h * 0.8;
      const c = opts.edge?.(x, y) ?? (inner && opts.ink ? opts.ink : paper);
      data.set(c, (y * w + x) * 4);
    }
  return data;
}

describe('backgroundOf — the paper colour round a drawing', () => {
  it('reads a coloured paper as its colour, whatever is drawn in the middle', () => {
    expect(backgroundOf(picture(120, 90, [243, 216, 120, 255], { ink: [20, 40, 200, 255] }), 120, 90)).toBe('#f3d878');
  });
  it('shrugs off a little noise and a stray mark at the edge (the median)', () => {
    const data = picture(100, 100, [180, 210, 235, 255], { edge: (x, y) => (x < 6 && y < 6 ? [10, 10, 10, 255] : (x + y) % 2 ? [184, 212, 236, 255] : null) });
    expect(backgroundOf(data, 100, 100)).toMatch(/^#b[4-8]d[2-4]e[b-c]$/);
  });
  it('white paper → null (white is already the default)', () => {
    expect(backgroundOf(picture(80, 80, [252, 252, 250, 255], { ink: [200, 0, 0, 255] }), 80, 80)).toBeNull();
  });
  it('a cut-out (a see-through edge) → null', () => {
    expect(backgroundOf(picture(80, 80, [0, 0, 0, 0], { ink: [200, 0, 0, 255] }), 80, 80)).toBeNull();
  });
  it('a busy edge (the drawing runs off the page) → null — no one colour to match', () => {
    const stripes = picture(100, 100, [0, 0, 0, 255], { edge: (x) => (Math.floor(x / 5) % 3 === 0 ? [230, 40, 40, 255] : Math.floor(x / 5) % 3 === 1 ? [40, 200, 60, 255] : [30, 60, 220, 255]) });
    expect(backgroundOf(stripes, 100, 100)).toBeNull();
  });
});

describe('the base colour default — height chart, socks, tea towel, wrapping paper', () => {
  it('those four take the drawing’s background; the rest stay white', () => {
    expect([...AUTO_GROUND_PRODUCT_KEYS].sort()).toEqual(['heightChart', 'socks', 'teaTowel', 'wrappingPaper']);
    for (const k of AUTO_GROUND_PRODUCT_KEYS) expect(defaultGroundFor(k, '#F3D878')).toBe('#f3d878');
    for (const k of ['mug', 'cushion', 'watchStrap', 'kidsTee']) expect(defaultGroundFor(k, '#f3d878')).toBeUndefined();
    expect(defaultGroundFor('socks', null)).toBeUndefined(); // nothing to match → white
    expect(defaultGroundFor('socks', '#ffffff')).toBeUndefined();
  });
  it('the parent’s own pick wins (white included); un-picked follows the drawing', () => {
    expect(displayGround('heightChart', undefined, '#f3d878')).toBe('#f3d878');
    expect(displayGround('heightChart', '#2f5da8', '#f3d878')).toBe('#2f5da8');
    expect(displayGround('heightChart', '#ffffff', '#f3d878')).toBeUndefined(); // they chose white
    expect(displayGround('mug', undefined, '#f3d878')).toBeUndefined();
    expect(displayGround('cushion', '#2f5da8', null)).toBe('#2f5da8'); // a picked base colour still shows on the range
  });
  it('the preview waits (a beat) for the background on the products that follow it — and only those', () => {
    expect(awaitsBackground('socks', { bg: undefined })).toBe(true);
    expect(awaitsBackground('kidsTee', { bg: undefined })).toBe(true);
    expect(awaitsBackground('socks', { bg: null })).toBe(false);
    expect(awaitsBackground('socks', { bg: '#f3d878' })).toBe(false);
    expect(awaitsBackground('mug', { bg: undefined })).toBe(false);
    expect(awaitsBackground('socks', null)).toBe(false);
  });
  it('keeps the measured colour with the drawing across a refresh (and refuses junk)', () => {
    const base = { dataUrl: 'data:image/png;base64,AAAA', name: 'x.png' };
    expect(toSessionUpload({ ...base, bg: '#f3d878' })?.bg).toBe('#f3d878');
    expect(toSessionUpload({ ...base, bg: null })?.bg).toBeNull();
    expect(toSessionUpload({ ...base, bg: 'red' })?.bg).toBeUndefined();
  });
});

const variant = (sku: string, attrs: Record<string, string>, isDefault = false): CatalogueVariant => ({ id: `id-${sku}`, sku, attributes: attrs, pricePence: 1800, isDefault, printWmm: 300, printHmm: 400 });
const product = (key: string, variants: CatalogueVariant[], extra: Partial<CatalogueProduct> = {}): CatalogueProduct => ({
  key, label: key, blurb: null, description: null, specs: {}, category: 'APPAREL', fromPence: 1800,
  sizes: [...new Set(variants.map((v) => v.attributes.size).filter(Boolean))] as string[],
  colours: [...new Set(variants.map((v) => v.attributes.colour).filter(Boolean))] as string[],
  orientations: [], grades: [], finishes: [], variants, popularRank: null, ...extra,
});
const COLOURS = ['white', 'heather grey', 'french navy', 'black', 'caribbean blue', 'royal blue', 'cotton pink', 'bright orange', 'ochre', 'burgundy'];
const tee = product('kidsTee', ['3-4', '5-6'].flatMap((size) => COLOURS.map((c) => variant(`tee-${size}-${c}`, { size, colour: c }, size === '3-4' && c === 'white'))));

describe('the tee’s colour — the nearest in Prodigi’s range', () => {
  it('picks the closest garment colour', () => {
    expect(nearestGarmentColour(COLOURS, '#f6c445')).toBe('ochre'); // honey paper
    expect(nearestGarmentColour(COLOURS, '#f4cdd4')).toBe('cotton pink');
    expect(nearestGarmentColour(COLOURS, '#1e2a4a')).toBe('french navy');
    expect(nearestGarmentColour(COLOURS, '#f4efe2')).toBe('white'); // cream paper
    expect(nearestGarmentColour(COLOURS, '#3aa0c0')).toBe('caribbean blue');
  });
  it('the range tile + quick-add show it in the default size; no background → the plain default', () => {
    expect(resolveDisplayVariant(tee, { bg: '#f4cdd4' }).sku).toBe('tee-3-4-cotton pink');
    expect(garmentDefault(tee, '#1e2a4a')?.sku).toBe('tee-3-4-french navy');
    expect(resolveDisplayVariant(tee, { bg: null }).sku).toBe('tee-3-4-white');
    expect(resolveDisplayVariant(tee).sku).toBe('tee-3-4-white');
  });
  it('a size picked but no colour → that size in the nearest colour; a picked colour always wins', () => {
    expect(resolveDisplayVariant(tee, { bg: '#f4cdd4', selection: { size: '5-6' } }).sku).toBe('tee-5-6-cotton pink');
    expect(resolveDisplayVariant(tee, { bg: '#f4cdd4', selection: { size: '5-6', colour: 'black' } }).sku).toBe('tee-5-6-black');
  });
  it('never touches a product that isn’t a garment', () => {
    const mug = product('mug', [variant('mug', { size: '11oz', colour: 'white' }, true), variant('mug-pink', { size: '11oz', colour: 'pink' })], { category: 'MUG' });
    expect(resolveDisplayVariant(mug, { bg: '#f4cdd4' }).sku).toBe('mug');
  });
});

describe('the height chart is always the last tile', () => {
  it('pinLast moves it to the end and leaves the rest in order', () => {
    expect(pinLast(['christmasBundle', 'heightChart', 'mug', 'socks'])).toEqual(['christmasBundle', 'mug', 'socks', 'heightChart']);
    expect(pinLast(['mug', 'socks'])).toEqual(['mug', 'socks']);
  });
  it('on the popular shelf too — and the flat products still never sit side by side', () => {
    const keys = ['christmasBundle', 'heightChart', 'framedPrint', 'mug', 'jigsaw', 'kidsTee', 'blanket', 'cushion', 'teaTowel', 'card', 'socks', 'wrappingPaper', 'calendar'];
    const list = keys.map((k, i) => product(k, [variant(k, {}, true)], { category: 'MUG', popularRank: i + 1 }));
    const { popular } = splitCatalogue(list, []);
    const out = popular.map((p) => p.key);
    expect(out.at(-1)).toBe('heightChart');
    expect(out[0]).toBe('christmasBundle');
    expect(new Set(out)).toEqual(new Set(keys));
    const flats = out.flatMap((k, i) => (FLAT_PRODUCT_KEYS.has(k) ? [i] : []));
    expect(flats.slice(1).every((at, i) => at - flats[i]! >= FLAT_MIN_GAP)).toBe(true);
  });
  it('steps a non-flat down between a flat and the height chart when the list ends on a flat', () => {
    const order = ['mug', 'jigsaw', 'cushion', 'teaTowel', 'heightChart'].map((key) => ({ key }));
    const out = spaceOutFlatPinned(order).map((p) => p.key);
    expect(out.at(-1)).toBe('heightChart');
    expect(FLAT_PRODUCT_KEYS.has(out.at(-2)!)).toBe(false);
  });
});
