import { describe, expect, it } from 'vitest';
import { definedPrintSpecs } from '@/server/catalogue';
import { assessResolution, minimumDpi, mmToPx, templateGeom, type TemplateGeom, type Transform } from '@/server/print/geometry';
import { ASPECT_TOLERANCE, checkPrintSpec, printFileSize, type ProdigiAreaVariant } from '@/server/print/printFile';
import fixture from './fixtures/prodigi-print-areas.json';

// Every order goes to Prodigi with `sizing: 'fillPrintArea'`: they scale our file to cover THEIR print
// area and crop whatever doesn't fit — silently. So every print file must be exactly Prodigi's
// printAreaSizes for its SKU. The fixture is Prodigi's own data (sandbox GET /v4.0/products/{sku});
// refresh it with scripts/fetch-prodigi-print-areas.ts when a product is added or Prodigi changes one.
type Fixture = { products: Record<string, { printAreas: string[]; variants: ProdigiAreaVariant[] } | null> };
const prodigi = (fixture as Fixture).products;

/** Known mismatches — each must stay HIDDEN until it's fixed (and comes off this list). */
const KNOWN: Record<string, string> = {
  // TODO(before it's on show): Prodigi's GB front area differs by colour and size (3070², 4724²,
  // 3307×4606) — see the TODO on adultHoodie in catalogue.ts.
  adultHoodie: 'GB print area differs by colour + size',
  // 18–24 months white lists two GB routes (2130² and 1500×2010); we design to the smaller one —
  // flagged in the founder's Prodigi email (catalogue.ts babyVariants).
  babyBodysuit: '18–24 months has two GB routes with different print areas',
};

const specs = definedPrintSpecs();
const issueOf = (s: (typeof specs)[number]) =>
  checkPrintSpec({
    productKey: s.productKey,
    prodigiAttrs: s.prodigiAttrs,
    printTo: s.printTo,
    file: printFileSize(s.productKey, s.attributes, s.template),
    prodigi: prodigi[s.prodigiSku]?.variants ?? [], // GB routes only (we only sell in the UK)
  });

describe('print files match Prodigi’s print areas', () => {
  it('the fixture covers every Prodigi SKU in the catalogue (re-run scripts/fetch-prodigi-print-areas.ts if not)', () => {
    const missing = [...new Set(specs.map((s) => s.prodigiSku))].filter((sku) => !prodigi[sku]);
    expect(missing).toEqual([]);
  });

  it('every printed variant’s file is exactly Prodigi’s size for its SKU and variant', () => {
    const wrong = specs.filter((s) => !KNOWN[s.productKey]).flatMap((s) => {
      const issue = issueOf(s);
      return issue ? [`${s.sku} (${s.prodigiSku}): ${issue}`] : [];
    });
    expect(wrong).toEqual([]);
  });

  it('…and the same shape, within 0.5%, on every non-garment product (a garment is checked at half size, same shape)', () => {
    for (const s of specs.filter((x) => !KNOWN[x.productKey])) {
      const file = printFileSize(s.productKey, s.attributes, s.template);
      const area = (prodigi[s.prodigiSku]?.variants ?? []).find((v) => v.printAreaSizes[s.printTo[0]!])?.printAreaSizes[s.printTo[0]!];
      expect(area, s.sku).toBeTruthy();
      expect(Math.abs(file.w / file.h / (area!.w / area!.h) - 1), s.sku).toBeLessThanOrEqual(ASPECT_TOLERANCE);
    }
  });

  it('a known mismatch stays hidden from the shop — and comes off the list once it’s fixed', () => {
    for (const key of Object.keys(KNOWN)) {
      const ofKey = specs.filter((s) => s.productKey === key);
      expect(ofKey.length, key).toBeGreaterThan(0);
      expect(ofKey.some((s) => s.visibleInShop), `${key} is on show with a print-area mismatch`).toBe(false);
      expect(ofKey.some((s) => issueOf(s) !== null), `${key} matches now — take it off KNOWN`).toBe(true);
    }
  });

  it('the products the 27 Oct audit flagged now send Prodigi’s exact file', () => {
    const fileOf = (key: string, match: (a: Record<string, string>) => boolean) => {
      const s = specs.find((x) => x.productKey === key && match(x.attributes))!;
      return printFileSize(s.productKey, s.attributes, s.template);
    };
    expect(fileOf('cushion', (a) => a.size === 'heart')).toEqual({ w: 2008, h: 1725 });
    // the blanket is LANDSCAPE at Prodigi; a portrait blanket's file turns back to it
    expect(fileOf('blanket', (a) => a.size === 'medium' && a.orientation === 'portrait')).toEqual({ w: 5905, h: 3838 });
    expect(fileOf('blanket', (a) => a.size === 'medium' && a.orientation === 'landscape')).toEqual({ w: 5905, h: 3838 });
    expect(fileOf('blanket', (a) => a.size === 'large' && a.orientation === 'portrait')).toEqual({ w: 8740, h: 5787 });
    expect(fileOf('ceramicOrnament', () => true)).toEqual({ w: 885, h: 885 });
    expect(fileOf('framedPrint', (a) => a.size === '18×24″' && a.orientation === 'landscape')).toEqual({ w: 5400, h: 7200 });
    expect(fileOf('framedPrint', (a) => a.size === '24×32″' && a.orientation === 'portrait')).toEqual({ w: 7200, h: 9600 });
    expect(fileOf('sack', () => true)).toEqual({ w: 3779, h: 5905 });
    expect(fileOf('apron', (a) => a.size === 'child')).toEqual({ w: 5850, h: 7500 });
    expect(fileOf('apron', (a) => a.size === 'adult')).toEqual({ w: 7500, h: 10500 });
    // a double-sided cushion is two faces side by side
    expect(fileOf('cushion', (a) => a.size === '22″ square' && a.sides === 'double')).toEqual({ w: 6750, h: 3375 });
  });
});

describe('the DPI gate doesn’t get stricter now the big frames and the sack are made at Prodigi’s 300dpi', () => {
  // The templates they had before (150dpi, a 3mm bleed) — what a shopper's drawing was judged against.
  const before = (wMm: number, hMm: number): TemplateGeom => ({ printWidthPx: mmToPx(wMm, 150), printHeightPx: mmToPx(hMm, 150), bleedMm: 3, requiredDpi: 150 });
  const cases: Array<{ name: string; key: string; match: (a: Record<string, string>) => boolean; old: TemplateGeom }> = [
    { name: '18×24″ frame', key: 'framedPrint', match: (a) => a.size === '18×24″' && a.orientation === 'portrait' && a.colour === 'gold', old: before(457, 610) },
    { name: '18×24″ frame, landscape', key: 'framedPrint', match: (a) => a.size === '18×24″' && a.orientation === 'landscape' && a.colour === 'gold', old: before(610, 457) },
    { name: '24×32″ frame', key: 'framedPrint', match: (a) => a.size === '24×32″' && a.orientation === 'portrait' && a.colour === 'gold', old: before(610, 813) },
    { name: 'christmas sack', key: 'sack', match: () => true, old: before(320, 500) },
  ];
  const rank = { OK: 0, UPSCALE: 1, BLOCK: 3 } as const;
  const severity = (a: ReturnType<typeof assessResolution>) => rank[a.decision] + (a.decision === 'UPSCALE' && a.softUpClose ? 1 : 0);
  const placements: Transform[] = [
    { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }, // fit (the default)
    { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 }, // fill
    { scale: 2, offsetX: 0.5, offsetY: -0.3, rotationDeg: 90 }, // zoomed in, turned
  ];

  for (const c of cases) {
    const now = () => definedPrintSpecs().find((s) => s.productKey === c.key && c.match(s.attributes))!.template;

    it(`${c.name}: the file is made at 300dpi but judged at 150, with the same BLOCK floor`, () => {
      const t = now();
      expect(t.requiredDpi).toBe(300);
      expect(t.gateDpi).toBe(150);
      expect(minimumDpi(t)).toBe(minimumDpi(c.old));
    });

    it(`${c.name}: no drawing gets a worse verdict than it did before (BLOCK, soft or enhance)`, () => {
      const t = now();
      for (const tf of placements) {
        for (let w = 120; w <= 6000; w += 40) {
          for (const aspect of [0.6, 0.75, 1, 1.33, 1.8]) {
            const src = { width: w, height: Math.round(w / aspect) };
            const was = assessResolution(c.old, src, tf);
            const is = assessResolution(t, src, tf);
            expect(severity(is), `${w}×${src.height} ${JSON.stringify(tf)}: was ${was.decision}${was.softUpClose ? ' (soft)' : ''}, now ${is.decision}`).toBeLessThanOrEqual(severity(was));
            if (is.decision === 'BLOCK') expect(was.decision).toBe('BLOCK');
          }
        }
      }
    });

    it(`${c.name}: “print-ready” still means 150dpi`, () => {
      const t = now();
      const a = assessResolution(t, { width: 10000, height: 10000 }, placements[0]!);
      expect(a.decision).toBe('OK');
      expect(a.requiredDpi).toBe(150);
    });
  }

  it('templateGeom reads the gate dpi from min_source_width_px, and leaves an ordinary template alone', () => {
    expect(templateGeom({ printWidthPx: 5400, printHeightPx: 7200, bleedMm: 0, requiredDpi: 300, minSourceWidthPx: 2700 }).gateDpi).toBe(150);
    expect(templateGeom({ printWidthPx: 3307, printHeightPx: 4192, bleedMm: 0, requiredDpi: 300, minSourceWidthPx: 3307 })).toEqual({ printWidthPx: 3307, printHeightPx: 4192, bleedMm: 0, requiredDpi: 300 });
  });
});
