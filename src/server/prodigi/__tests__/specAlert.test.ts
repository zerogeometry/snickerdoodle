import { describe, expect, it } from 'vitest';
import { prodigiSpecAlert } from '../specAlert';

const entry = (over: Partial<{ internalSku: string; providerSku: string; productKey: string; status: 'ok' | 'missing' | 'error'; warnings: string[] }>) => ({
  internalSku: 'socks-tube', providerSku: 'GLOBAL-TUBE-SOCKS', productKey: 'socks', status: 'ok' as const, warnings: [] as string[], ...over,
});

describe('the weekly Prodigi check emails the team only when something no longer matches', () => {
  it('a clean run sends nothing', () => {
    expect(prodigiSpecAlert({ total: 2, ok: 2, missing: 0, errors: 0, productsEnriched: 1, entries: [entry({}), entry({ internalSku: 'socks' })] })).toBeNull();
  });
  it('a changed print area and a missing SKU are listed by name', () => {
    const a = prodigiSpecAlert({
      total: 3, ok: 1, missing: 1, errors: 0, productsEnriched: 0,
      entries: [
        entry({ warnings: ['print file 6141×5433 is a different shape from Prodigi’s "default" 6141×3543 (53.4%) — Prodigi will crop it'] }),
        entry({ internalSku: 'mug', providerSku: 'H-MUG-11OZ-WBL', productKey: 'mug', status: 'missing' }),
        entry({ internalSku: 'socks', providerSku: 'GLOBAL-ANKLE-SOCKS' }),
      ],
    })!;
    expect(a.subject).toBe('[prodigi check] 2 products need a look');
    expect(a.text).toContain('socks · socks-tube (GLOBAL-TUBE-SOCKS): print file 6141×5433');
    expect(a.text).toContain('mug · mug (H-MUG-11OZ-WBL): not found at Prodigi');
    expect(a.text).not.toContain('GLOBAL-ANKLE-SOCKS');
  });
});
