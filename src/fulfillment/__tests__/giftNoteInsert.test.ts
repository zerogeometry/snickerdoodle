import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { GIFT_NOTE_ARTBOARD, giftNoteInsertKey, giftNoteInsertSlot, planGiftNoteInsert, printableGiftNote, renderGiftNoteInsert } from '@/fulfillment/giftNoteInsert';
import type { InsertQuoteRequest, InsertQuoteShipment } from '@/server/prodigi/orders';

const NOTE = 'happy christmas, Nana — Ada drew this for you!';
const order = (over: Partial<{ isGift: boolean; giftNote: string | null; giftFromName: string | null }> = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  isGift: true,
  giftNote: NOTE,
  giftFromName: null,
  ...over,
});
const quote = { shippingMethod: 'Standard', destinationCountryCode: 'GB', items: [{ sku: 'GLOBAL-CFP-11X14', copies: 1, attributes: { color: 'gold' }, printAreas: ['default'] }] };
const fakeRender = async () => Buffer.from('png');

describe('GIFT_NOTE_INSERT — the switch is OFF unless set to a known slot', () => {
  it('unset / off / empty / anything unknown → off', () => {
    expect(giftNoteInsertSlot({})).toBeNull();
    for (const v of ['', 'off', 'false', '0', 'true', 'on', 'yes', 'flyer', 'packing_slip_color', 'sticker_interior_round']) {
      expect(giftNoteInsertSlot({ GIFT_NOTE_INSERT: v })).toBeNull();
    }
  });
  it('postcard / packing_slip_bw (any case, trimmed) turn it on', () => {
    expect(giftNoteInsertSlot({ GIFT_NOTE_INSERT: 'postcard' })).toBe('postcard');
    expect(giftNoteInsertSlot({ GIFT_NOTE_INSERT: ' Packing_Slip_BW ' })).toBe('packing_slip_bw');
  });
});

describe('printableGiftNote — re-screened at print time, first names only, length-limited', () => {
  it('no note, or not a gift → nothing to print', () => {
    expect(printableGiftNote(order({ giftNote: null }))).toBeNull();
    expect(printableGiftNote(order({ giftNote: '   ' }))).toBeNull();
    expect(printableGiftNote(order({ isGift: false }))).toBeNull();
  });
  it('an abusive note is refused (never printed), whatever slipped past checkout', () => {
    expect(printableGiftNote(order({ giftNote: 'you old bastard' }))).toEqual({ ok: false, why: expect.stringMatching(/screen/) });
  });
  it('capped at 200 characters', () => {
    const r = printableGiftNote(order({ giftNote: 'a'.repeat(500) }));
    expect(r).toMatchObject({ ok: true });
    expect((r as { note: string }).note).toHaveLength(200);
  });
  it('signed with a FIRST NAME only — a surname is dropped', () => {
    expect(printableGiftNote(order({ giftFromName: 'Granny Jo Smith' }))).toEqual({ ok: true, note: NOTE, from: 'Granny' });
    expect(printableGiftNote(order({ giftFromName: '  Maya  ' }))).toEqual({ ok: true, note: NOTE, from: 'Maya' });
  });
  it('a from-name that fails the name screen is left off; the note still prints', () => {
    expect(printableGiftNote(order({ giftFromName: 'shithead' }))).toEqual({ ok: true, note: NOTE, from: null });
    expect(printableGiftNote(order({ giftFromName: 'x@y.com' }))).toEqual({ ok: true, note: NOTE, from: null });
    expect(printableGiftNote(order({ giftFromName: null }))).toEqual({ ok: true, note: NOTE, from: null });
  });
});

describe('planGiftNoteInsert — the payload with the switch OFF and ON', () => {
  it('OFF: no branding, nothing recorded, nothing rendered, stored or quoted', async () => {
    const store = vi.fn(async () => 'https://x');
    const quoteInserts = vi.fn(async () => [] as InsertQuoteShipment[]);
    const render = vi.fn(fakeRender);
    const plan = await planGiftNoteInsert({ slot: null, order: order(), quote, quoteInserts, store, render });
    expect(plan).toEqual({ record: null });
    expect(store).not.toHaveBeenCalled();
    expect(quoteInserts).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('ON but no note: nothing to do, nothing recorded', async () => {
    const store = vi.fn(async () => 'https://x');
    expect(await planGiftNoteInsert({ slot: 'postcard', order: order({ giftNote: null }), quote, store, render: fakeRender })).toEqual({ record: null });
    expect(store).not.toHaveBeenCalled();
  });

  it('ON, every lab prints it: branding.<slot>.url is the stored file; the quote asks by NAME only', async () => {
    const seen: InsertQuoteRequest[] = [];
    const store = vi.fn(async (key: string) => `https://signed.example/${key}?sig=1`);
    const render = vi.fn(fakeRender);
    const plan = await planGiftNoteInsert({
      slot: 'postcard',
      order: order({ giftFromName: 'Granny Jo' }),
      quote,
      quoteInserts: async (req) => (seen.push(req), [{ lab: 'prodigi_gb3', brandingItems: ['postcard'] }]),
      store,
      render,
      now: new Date('2026-12-01T10:00:00Z'),
    });
    expect(plan.branding).toEqual({ postcard: { url: `https://signed.example/${giftNoteInsertKey(order().id)}?sig=1` } });
    expect(plan.record).toEqual({ slot: 'postcard', status: 'sent', labs: [{ lab: 'prodigi_gb3', prints: true }], at: '2026-12-01T10:00:00.000Z' });
    expect(render).toHaveBeenCalledWith('postcard', { note: NOTE, from: 'Granny' });
    // the quote carries the order's lines + the insert NAME — never the note, never a file URL
    expect(seen).toEqual([{ ...quote, inserts: ['postcard'] }]);
    expect(JSON.stringify(seen)).not.toContain('Nana');
    // and the record holds no note text
    expect(JSON.stringify(plan.record)).not.toContain('Nana');
  });

  it('ON, one lab can’t: still sent (Prodigi leaves it out of THAT parcel), recorded as partly + which lab', async () => {
    const plan = await planGiftNoteInsert({
      slot: 'postcard',
      order: order(),
      quote,
      quoteInserts: async () => [
        { lab: 'prodigi_gb3', brandingItems: ['postcard'] },
        { lab: 'uk9', brandingItems: [] },
      ],
      store: async () => 'https://x',
      render: fakeRender,
    });
    expect(plan.branding).toEqual({ postcard: { url: 'https://x' } });
    expect(plan.record).toMatchObject({ status: 'partly', why: expect.stringContaining('uk9'), labs: [{ lab: 'prodigi_gb3', prints: true }, { lab: 'uk9', prints: false }] });
  });

  it('ON, no lab prints it: skipped with the reason — nothing rendered or stored, no branding', async () => {
    const store = vi.fn(async () => 'https://x');
    const render = vi.fn(fakeRender);
    const plan = await planGiftNoteInsert({ slot: 'postcard', order: order(), quote, quoteInserts: async () => [{ lab: 'uk9', brandingItems: [] }], store, render });
    expect(plan.branding).toBeUndefined();
    expect(plan.record).toMatchObject({ slot: 'postcard', status: 'skipped', why: expect.stringMatching(/no lab .* prints a postcard \(uk9\)/) });
    expect(store).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it('ON, the note fails the screen: skipped, nothing rendered', async () => {
    const render = vi.fn(fakeRender);
    const plan = await planGiftNoteInsert({ slot: 'postcard', order: order({ giftNote: 'piss off' }), quote, store: async () => 'https://x', render });
    expect(plan.branding).toBeUndefined();
    expect(plan.record).toMatchObject({ status: 'skipped', why: expect.stringMatching(/screen/) });
    expect(render).not.toHaveBeenCalled();
  });

  it('ON, the quote fails: sent anyway (a lab that can’t just leaves it out), and that is recorded', async () => {
    const plan = await planGiftNoteInsert({
      slot: 'packing_slip_bw',
      order: order(),
      quote,
      quoteInserts: async () => {
        throw new Error('HTTP 503');
      },
      store: async () => 'https://x',
      render: fakeRender,
    });
    expect(plan.branding).toEqual({ packing_slip_bw: { url: 'https://x' } });
    expect(plan.record).toMatchObject({ slot: 'packing_slip_bw', status: 'sent', why: expect.stringMatching(/couldn’t check/) });
    expect(plan.record!.labs).toBeUndefined();
  });

  it('ON, the render or upload breaks: skipped with the reason — never throws', async () => {
    const plan = await planGiftNoteInsert({
      slot: 'postcard',
      order: order(),
      quote,
      quoteInserts: async () => [{ lab: 'prodigi_gb3', brandingItems: ['postcard'] }],
      store: async () => {
        throw new Error('bucket down');
      },
      render: fakeRender,
    });
    expect(plan.branding).toBeUndefined();
    expect(plan.record).toMatchObject({ status: 'skipped', why: expect.stringContaining('bucket down') });
  });
});

describe('renderGiftNoteInsert — print-ready at the slot’s size', () => {
  it('postcard: A6 at 300dpi', async () => {
    const png = await renderGiftNoteInsert('postcard', { note: NOTE, from: 'Granny' });
    const m = await sharp(png).metadata();
    expect([m.width, m.height]).toEqual([GIFT_NOTE_ARTBOARD.postcard.widthPx, GIFT_NOTE_ARTBOARD.postcard.heightPx]);
    expect(m.density).toBe(300);
  });
  it('B&W slip: A4 at 300dpi, greyscale', async () => {
    const png = await renderGiftNoteInsert('packing_slip_bw', { note: 'x'.repeat(200), from: null });
    const m = await sharp(png).metadata();
    expect([m.width, m.height]).toEqual([GIFT_NOTE_ARTBOARD.packing_slip_bw.widthPx, GIFT_NOTE_ARTBOARD.packing_slip_bw.heightPx]);
    expect(m.channels).toBeLessThanOrEqual(2); // grey (+ alpha at most)
  });
});
