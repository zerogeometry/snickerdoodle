import { describe, expect, it } from 'vitest';
import { betterSize, type SizeQuality } from '@/lib/size-suggest';

const FRAMES = ['11×14″', '12×16″', '18×24″', '24×32″'];
const q = (effectiveDpi: number, softUpClose: boolean, decision: SizeQuality['decision'] = 'UPSCALE'): SizeQuality => ({ effectiveDpi, softUpClose, decision });

describe('the customize page’s one-tap size fix', () => {
  // 02-B8 (sweep 29 Oct): a 2000 px drawing at 11×14″ (≈143 dpi, soft up close) was told "crisp right up
  // close at 18×24″" (£90) — only because big frames are judged at 150 dpi; it really gets ≈83 dpi there.
  it('02-B8: never offers a bigger, dearer size that only "passes" on a lower gate dpi', () => {
    const at: Record<string, SizeQuality> = { '11×14″': q(143, true), '12×16″': q(125, true), '18×24″': q(83, false), '24×32″': q(62, true) };
    expect(betterSize(FRAMES, (s) => at[s] ?? null, at['11×14″']!, (a) => !a.softUpClose)).toBeNull();
  });

  it('offers the largest size that is REALLY sharper (more real detail), so in practice a smaller one', () => {
    const at: Record<string, SizeQuality> = { '8×10″': q(240, false, 'OK'), '11×14″': q(143, true), '18×24″': q(83, false) };
    expect(betterSize(['8×10″', '11×14″', '18×24″'], (s) => at[s] ?? null, at['11×14″']!, (a) => !a.softUpClose)).toBe('8×10″');
  });

  it('blocked: offers the biggest size that prints at all — never one with less detail', () => {
    const at: Record<string, SizeQuality> = { '11×14″': q(260, false, 'OK'), '12×16″': q(180, true), '18×24″': q(70, false, 'BLOCK'), '24×32″': q(52, false, 'UPSCALE') };
    expect(betterSize(FRAMES, (s) => at[s] ?? null, at['18×24″']!, (a) => a.decision !== 'BLOCK')).toBe('12×16″');
  });

  // 02-B2 (sweep 29 Oct): a small drawing on an iPhone 17 case offered "make it iPhone 13 mini".
  it('02-B2: a phone case (sizes are phone models) is never offered another size', () => {
    const at = (s: string) => (s === 'iPhone 13 mini' ? q(400, false, 'OK') : q(60, false, 'BLOCK'));
    expect(betterSize(['iPhone 13 mini', 'iPhone 17'], at, q(60, false, 'BLOCK'), (a) => a.decision !== 'BLOCK', { sizeIsModel: true })).toBeNull();
    expect(betterSize(['iPhone 13 mini', 'iPhone 17'], at, q(60, false, 'BLOCK'), (a) => a.decision !== 'BLOCK')).toBe('iPhone 13 mini'); // (what it did)
  });
});
