import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PHONE_MODELS } from '@/lib/phone-cases';
import { cameraFor, drawPhoneCase } from '@/server/print/phoneCaseMockup';
import { traceCaseTemplate } from '@/server/print/phoneCaseTemplate';

describe('drawn phone-case mockups', () => {
  it('the print area on the mockup has the print file’s exact shape, and the layers line up', async () => {
    const m = PHONE_MODELS.find((p) => p.name === 'Galaxy S24 Ultra')!;
    const d = await drawPhoneCase(m.name, 'tough', 'matte');
    const [[x0, y0], [x1], [, y2]] = d.quad as [[number, number], [number, number], [number, number]];
    const quadAspect = ((x1 - x0) * d.W) / ((y2 - y0) * d.H);
    expect(quadAspect).toBeCloseTo(m.tough!.w / m.tough!.h, 2);
    for (const b of [d.blank, d.mask, d.overlay]) {
      const meta = await sharp(b).metadata();
      expect([meta.width, meta.height]).toEqual([d.W, d.H]);
    }
  });
  it('the camera sits where that family of phone has it', () => {
    expect(cameraFor('iPhone 17 Pro Max').shape).toBe('bar'); // the full-width plateau
    expect(cameraFor('iPhone 16').shape).toBe('island');
    expect(cameraFor('Galaxy S25 Ultra')).toMatchObject({ shape: 'slot', lenses: 4 });
    expect(cameraFor('Pixel 9').shape).toBe('pill');
    expect(cameraFor('Pixel 8').shape).toBe('bar');
  });
  it('refuses a phone or grade Prodigi doesn’t make', async () => {
    await expect(drawPhoneCase('Pixel 9', 'snap', 'gloss')).rejects.toThrow(/no snap case/);
    await expect(drawPhoneCase('Nokia 3310', 'tough', 'gloss')).rejects.toThrow();
  });

  it('reads a Prodigi-style template: white case back, grey camera holes, grey bleed — instruction text is not a hole', async () => {
    // a 200×340 artboard like Prodigi's: grey bleed, black-outlined white back, a grey camera
    // cut-out, and some black "instruction text" whose anti-aliased edges are grey-ish
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="340">
      <rect width="200" height="340" fill="rgb(178,178,179)"/>
      <rect x="20" y="20" width="160" height="300" rx="30" fill="#fff" stroke="#000" stroke-width="4"/>
      <rect x="35" y="35" width="50" height="80" rx="25" fill="rgb(178,178,179)" stroke="#000" stroke-width="3"/>
      <text x="40" y="200" font-size="14" fill="#000">iPhone 99 snap case</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const t = await traceCaseTemplate(png, 200, 340);
    expect(t.holeCount).toBe(1); // the camera — not the text
    expect(t.holes[60 * 200 + 60]).toBe(1); // inside the camera cut-out
    expect(t.face[60 * 200 + 60]).toBe(0);
    expect(t.face[250 * 200 + 100]).toBe(1); // the case back
    expect(t.face[5 * 200 + 5]).toBe(0); // the bleed
    expect(t.face[198 * 200 + 60]).toBe(1); // under the text is still case back
    // and it feeds an exact mockup: same layers, print area at the template's aspect
    const d = await drawPhoneCase('iPhone 16', 'snap', 'gloss', t);
    const [[x0, y0], [x1], [, y2]] = d.quad as [[number, number], [number, number], [number, number]];
    expect(((x1 - x0) * d.W) / ((y2 - y0) * d.H)).toBeCloseTo(200 / 340, 2);
  });
});

