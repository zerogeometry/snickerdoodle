import { describe, expect, it } from 'vitest';
import { deliveryLine, isTrackedService, planShipments, shippingMethodFor, shipsTracked } from '@/lib/delivery';

describe('delivery copy never claims tracking we don’t buy', () => {
  it('tracked products say tracked; untracked-post products don’t', () => {
    expect(deliveryLine('framedPrint')).toBe('free tracked delivery');
    expect(deliveryLine('teaTowel')).toBe('free tracked delivery');
    // the mug (top-to-bottom coloured range, 28 Nov 2026) goes Royal Mail RM24 from uk5: untracked
    for (const k of ['card', 'cardPack', 'cardPack-packof10', 'wrappingPaper', 'wrappingPaper-5mroll', 'playingCards', 'mug', 'mug-11oz-blue']) {
      expect(shipsTracked(k), k).toBe(false);
      expect(deliveryLine(k)).toBe('free delivery');
    }
  });
  it('a basket is only "tracked" when every line is', () => {
    expect(deliveryLine(['framedPrint', 'teaTowel'])).toBe('free tracked delivery');
    expect(deliveryLine(['framedPrint', 'mug'])).toBe('free delivery');
    expect(deliveryLine(['framedPrint', 'card'])).toBe('free delivery');
    expect(deliveryLine([])).toBe('free tracked delivery');
  });
});

// Founder, 26 Nov 2026: "we can't have it so when we need Express for one product, all the products go Express";
// "only goes as its own Express order if Standard isn't tracked".
describe('how an order goes to Prodigi: the phone case on its own only when its Standard post is untracked', () => {
  const L = (itemId: string, productKey: string) => ({ itemId, productKey });
  const basket = [L('case', 'phoneCase-iphone16pro-tough-matte'), L('mug', 'mug'), L('tee', 'adultTee-l-white')];

  it('untracked on Standard → the case alone by Express; everything else Standard', () => {
    expect(planShipments(basket, false)).toEqual({ main: { itemIds: ['mug', 'tee'], shippingMethod: 'Standard' }, split: { itemIds: ['case'] } });
  });
  it('tracked on Standard → one Standard order, case and all', () => {
    expect(planShipments(basket, true)).toEqual({ main: { itemIds: ['case', 'mug', 'tee'], shippingMethod: 'Standard' }, split: null });
  });
  it('a case on its own: Express only if its Standard is untracked', () => {
    expect(planShipments([L('case', 'phoneCase')], false).main.shippingMethod).toBe('Express');
    expect(planShipments([L('case', 'phoneCase')], true).main.shippingMethod).toBe('Standard');
  });
  it('no case → Standard, as before; a calendar next to an untracked case no longer drags the case to untracked post', () => {
    expect(planShipments([L('mug', 'mug'), L('cal', 'calendar-a4')], false)).toEqual({ main: { itemIds: ['mug', 'cal'], shippingMethod: 'Standard' }, split: null });
    // the mug has no Express at Prodigi (uk5, 28 Nov 2026): never asked for one, even beside a phone case
    expect(shippingMethodFor(['phoneCase', 'mug-11oz-red'])).toBe('Standard');
    expect(planShipments([L('case', 'phoneCase-iphone16pro-tough-matte'), L('mug', 'mug-11oz-red')], false)).toEqual({ main: { itemIds: ['mug'], shippingMethod: 'Standard' }, split: { itemIds: ['case'] } });
    expect(planShipments([L('case', 'phoneCase'), L('cal', 'calendar-a4')], false).split).toEqual({ itemIds: ['case'] });
  });
  it('once the case has gone on its own, a retry keeps the split (never a second case), even if Standard now looks tracked', () => {
    expect(planShipments(basket, true, true).split).toEqual({ itemIds: ['case'] });
  });
  it('tracked services, from Prodigi’s real quotes (26 Nov 2026)', () => {
    expect(isTrackedService({ carrier: 'Royal Mail', service: 'Standard Tracked' })).toBe(true);
    expect(isTrackedService({ carrier: 'Royal Mail', service: 'Royal Mail Tracked 48' })).toBe(true);
    expect(isTrackedService({ carrier: 'FedEx', service: 'FedEx Economy Tracked & Signed' })).toBe(true);
    expect(isTrackedService({ carrier: 'EVRi', service: 'Evri Standard 48' })).toBe(true);
    expect(isTrackedService({ carrier: 'Royal Mail', service: 'Royal Mail RM24' })).toBe(false);
    expect(isTrackedService({ carrier: 'Guernsey Post', service: 'Guernsey Post Standard' })).toBe(false);
    expect(isTrackedService({ carrier: '', service: '' })).toBe(false); // unknown → untracked → Express
  });
  it('the basket says tracked for a phone case now (it always travels tracked)', () => {
    expect(deliveryLine(['phoneCase', 'calendar-a4'])).toBe(deliveryLine(['calendar-a4']));
  });
});
