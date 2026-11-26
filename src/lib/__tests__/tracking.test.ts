import { describe, expect, it } from 'vitest';
import { parcelsOf, trackedParcels } from '../tracking';
import { trackingLines } from '@/server/orderEmails';

describe('parcelsOf — every parcel of an order (founder, 26 Nov 2026)', () => {
  it('nothing known → no parcels', () => {
    expect(parcelsOf(null)).toEqual([]);
    expect(parcelsOf({})).toEqual([]);
  });

  it('an older order with one shipment stored → that one parcel', () => {
    expect(parcelsOf({ carrier: 'Royal Mail', number: 'AB1', url: null })).toEqual([{ carrier: 'Royal Mail', number: 'AB1', url: null }]);
  });

  it('the parcel list wins over the single last shipment, and the same tracking number twice is one parcel', () => {
    const t = {
      carrier: 'DPD',
      number: 'D2',
      url: 'https://t/d2',
      parcels: [
        { carrier: 'Royal Mail', number: 'R1', url: 'https://t/r1' },
        { carrier: 'DPD', number: 'D2', url: 'https://t/d2' },
        { carrier: 'DPD', number: 'D2', url: 'https://t/d2' },
        { carrier: 'Royal Mail', number: null, url: null },
      ],
    };
    expect(parcelsOf(t).map((p) => p.number)).toEqual(['R1', 'D2', null]);
    expect(trackedParcels(t).map((p) => p.number)).toEqual(['R1', 'D2']);
  });
});

describe('the "on its way" email names every parcel', () => {
  it('one tracked parcel → the one link, as before', () => {
    expect(trackingLines({ parcels: [{ carrier: 'Royal Mail', number: 'R1', url: 'https://t/r1' }] })).toBe('Track it here: https://t/r1');
  });

  it('no tracking → standard post, as before', () => {
    expect(trackingLines(null)).toMatch(/standard post, so there’s no tracking/);
  });

  it('several parcels → says so, and lists each one, untracked ones included', () => {
    const text = trackingLines({
      parcels: [
        { carrier: 'Royal Mail', number: 'R1', url: 'https://t/r1' },
        { carrier: 'DPD', number: 'D2', url: null },
        { carrier: 'Royal Mail', number: null, url: null },
      ],
    });
    expect(text.split('\n')).toEqual([
      'It’s coming in 3 parcels, as each part was made in its own workshop, so they may not arrive on the same day:',
      '  parcel 1: track it here: https://t/r1',
      '  parcel 2: tracking number with DPD: D2',
      '  parcel 3: standard post, so no tracking',
    ]);
  });
});
