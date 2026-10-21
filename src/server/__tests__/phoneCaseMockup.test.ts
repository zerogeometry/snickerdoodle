import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { PHONE_MODELS } from '@/lib/phone-cases';
import { cameraFor, drawPhoneCase } from '@/server/print/phoneCaseMockup';

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
});
