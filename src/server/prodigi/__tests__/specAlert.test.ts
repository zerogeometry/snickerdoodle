import { describe, expect, it } from 'vitest';
import { prodigiSpecAlert, prodigiSpecFindings, prodigiSpecProblems } from '../specAlert';

const entry = (over: Partial<{ internalSku: string; providerSku: string; productKey: string; status: 'ok' | 'missing' | 'error'; warnings: string[]; onSale: boolean }>) => ({
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
    expect(a.subject).toBe('[prodigi check] 2 products on sale need a look');
    expect(a.text).toContain('socks · socks-tube (GLOBAL-TUBE-SOCKS): print file 6141×5433');
    expect(a.text).toContain('mug · mug (H-MUG-11OZ-WBL): not found at Prodigi');
    expect(a.text).not.toContain('GLOBAL-ANKLE-SOCKS');
  });
});

describe('…and a product hidden from the shop never buries the one on sale (23 Nov: 46 hoodie lines)', () => {
  const hoodie = (n: number) => entry({ internalSku: `adultHoodie-${n}`, providerSku: 'HOOD-SS-STSU812', productKey: 'adultHoodie', onSale: false, warnings: ['Prodigi’s "front" print area differs between its routes'] });
  const report = (entries: ReturnType<typeof entry>[]) => ({ total: entries.length, ok: entries.length, missing: 0, errors: 0, productsEnriched: 0, entries });

  it('hidden-only findings send no email, and the health screen stays green', () => {
    const r = report([hoodie(1), hoodie(2), entry({})]);
    expect(prodigiSpecAlert(r)).toBeNull();
    expect(prodigiSpecFindings(r).onSale).toEqual([]);
    expect(prodigiSpecProblems(r)).toHaveLength(2);
    expect(prodigiSpecProblems(r)[0]).toContain("hidden from the shop, so it can't be ordered");
  });

  it('an on-sale finding is listed first, the hidden ones only counted at the bottom', () => {
    const sock = entry({ onSale: true, warnings: ['print file 6141×3543 is a different shape from Prodigi’s "default" 3543×6141 (200.4%) — Prodigi will crop it'] });
    const a = prodigiSpecAlert(report([hoodie(1), sock, hoodie(2)]))!;
    expect(a.subject).toBe('[prodigi check] 1 product on sale needs a look');
    expect(a.text).toContain('- socks · socks-tube (GLOBAL-TUBE-SOCKS): print file 6141×3543');
    expect(a.text).not.toContain('- adultHoodie');
    expect(a.text).toContain('(2 more on products hidden from the shop, which can\'t be ordered: adultHoodie.');
    expect(prodigiSpecProblems(report([hoodie(1), sock]))[0]).toContain('socks · socks-tube');
  });

  it('a product whose shop status is unknown counts as on sale (the safe side)', () => {
    expect(prodigiSpecAlert(report([entry({ warnings: ['x'] })]))).not.toBeNull();
  });
});
