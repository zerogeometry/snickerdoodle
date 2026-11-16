import { describe, expect, it } from 'vitest';
import { normalisePromoCode } from '@/pricing/promo';
import { buildCodeRow, describeOffer, hundredths, inputFromArgs, normaliseCode, parseWhen, type CodeInput } from '../../../scripts/lib/promo-codes.mjs';

// The one set of rules for MAKING a code (scripts/lib/promo-codes.mjs), shared by the terminal script and the admin
// app's codes screen. Pure: no database. The "same code either way" proof against Postgres is
// src/server/__tests__/adminCodes.int.test.ts.

const NOW = new Date('2026-11-16T12:00:00Z');
const make = (input: CodeInput) => buildCodeRow(input, NOW);
const fields = (input: CodeInput) => {
  const r = make(input);
  return r.ok ? [] : r.problems.map((p) => p.field);
};
const ok = (input: CodeInput) => {
  const r = make(input);
  if (!r.ok) throw new Error(r.problems.map((p) => `${p.field}: ${p.message}`).join('; '));
  return r.row;
};
const args = (...a: string[]) => {
  const p = inputFromArgs(a);
  if (!p.ok) throw new Error(p.message);
  return p.input;
};

describe('the code itself', () => {
  it('is trimmed, upper-cased and has its spaces taken out, exactly as the shop reads it at checkout', () => {
    for (const raw of ['welcome10', '  Welcome 10 ', 'st-marys-y2', 'ABC', 'A'.repeat(32), 'ab', 'x'.repeat(33), 'TEN£OFF', 'hi!', '', 'ÉCOLE10']) {
      const shop = normalisePromoCode(raw);
      const r = make({ code: raw, kind: 'PERCENT', amount: '10' });
      if (shop) expect(r.ok && r.row.code).toBe(shop);
      else expect(r.ok).toBe(false);
    }
    expect(normaliseCode('  Welcome 10 ')).toBe('WELCOME10');
  });

  it('refuses bad code strings, each against the code field', () => {
    for (const code of ['', '  ', 'ab', 'x'.repeat(33), 'TEN£OFF', 'half_off', 'hi!', 'emoji🎄', 'a.b.c', null]) {
      expect(fields({ code, kind: 'PERCENT', amount: '10' })).toEqual(['code']);
    }
  });
});

describe('what it gives', () => {
  it('percent off: 0–50, kept exactly in basis points (never rounded)', () => {
    expect(ok({ code: 'TEN', kind: 'PERCENT', amount: '10' })).toMatchObject({ kind: 'PERCENT', value: 1000 });
    expect(ok({ code: 'TWELVE', kind: 'PERCENT', amount: '12.5%' })).toMatchObject({ value: 1250 });
    expect(ok({ code: 'HALF', kind: 'PERCENT', amount: '50' })).toMatchObject({ value: 5000 });
    for (const amount of ['50.01', '51', '100', '150', '-5', 'ten', '12.345', '', null]) expect(fields({ code: 'BAD', kind: 'PERCENT', amount })).toEqual(['amount']);
  });

  it('0% off only as a partner code that earns commission (a PTA code that only raises money)', () => {
    expect(fields({ code: 'NOTHING', kind: 'PERCENT', amount: '0' })).toEqual(['amount']);
    expect(ok({ code: 'PTA', kind: 'PERCENT', amount: '0', commission: '10', partnerName: 'St Mary’s PTA', partnerType: 'PTA' })).toMatchObject({ value: 0, commissionBps: 1000 });
  });

  it('pounds off: more than £0, at most £100, in pence', () => {
    expect(ok({ code: 'FIVER', kind: 'FIXED', amount: '£5' })).toMatchObject({ kind: 'FIXED', value: 500 });
    expect(ok({ code: 'ODD', kind: 'FIXED', amount: '7.5' })).toMatchObject({ value: 750 });
    for (const amount of ['0', '0.00', '100.01', '500', '-1', '', '5.555']) expect(fields({ code: 'BAD', kind: 'FIXED', amount })).toEqual(['amount']);
  });

  it('a free card always has value 0 (the card’s own price comes off), whatever amount is sent', () => {
    expect(ok({ code: 'CARD', kind: 'FREE_CARD', amount: '99' })).toMatchObject({ kind: 'FREE_CARD', value: 0 });
  });

  it('refuses a kind the shop can’t price', () => {
    for (const kind of ['', 'BOGOF', 'FREE_DELIVERY', null]) expect(fields({ code: 'KIND', kind, amount: '10' })).toEqual(['kind']);
  });
});

describe('limits and dates', () => {
  it('minimum spend in pounds, uses as a whole number', () => {
    expect(ok({ code: 'MIN', kind: 'FIXED', amount: '10', minSpend: '60', maxUses: '500' })).toMatchObject({ minSpendPence: 6000, maxRedemptions: 500 });
    expect(fields({ code: 'MIN', kind: 'FIXED', amount: '10', minSpend: '-1' })).toEqual(['minSpend']);
    for (const maxUses of ['0', '-3', '2.5', 'lots', '100001']) expect(fields({ code: 'MAX', kind: 'PERCENT', amount: '10', maxUses })).toEqual(['maxUses']);
  });

  it('a date is a UK day: the code starts / stops at midnight as it begins (GMT or BST)', () => {
    expect(parseWhen('2026-12-24')?.toISOString()).toBe('2026-12-24T00:00:00.000Z');
    expect(parseWhen('2027-06-01')?.toISOString()).toBe('2027-05-31T23:00:00.000Z');
    expect(parseWhen('2026-12-24T18:00:00Z')?.toISOString()).toBe('2026-12-24T18:00:00.000Z');
    for (const bad of ['2026-02-30', '24/12/2026', 'christmas', '2026-13-01', '2026-12-24 18:00']) expect(parseWhen(bad)).toBeNull();
  });

  it('refuses an end before (or at) the start, an end already passed, and dates that aren’t real', () => {
    expect(fields({ code: 'DATES', kind: 'PERCENT', amount: '10', startsOn: '2026-12-01', endsOn: '2026-11-30' })).toEqual(['endsOn']);
    expect(fields({ code: 'DATES', kind: 'PERCENT', amount: '10', startsOn: '2026-12-01', endsOn: '2026-12-01' })).toEqual(['endsOn']);
    expect(fields({ code: 'DATES', kind: 'PERCENT', amount: '10', endsOn: '2026-11-16' })).toEqual(['endsOn']); // midnight this morning: already gone
    expect(fields({ code: 'DATES', kind: 'PERCENT', amount: '10', startsOn: '2026-02-30' })).toEqual(['startsOn']);
    expect(ok({ code: 'DATES', kind: 'PERCENT', amount: '10', startsOn: '2026-12-01', endsOn: '2026-12-24' })).toMatchObject({
      startsAt: new Date('2026-12-01T00:00:00Z'),
      endsAt: new Date('2026-12-24T00:00:00Z'),
    });
  });
});

describe('partners', () => {
  it('commission is 0–30%, and needs a named partner and a type', () => {
    expect(fields({ code: 'C', kind: 'PERCENT', amount: '10', commission: '31', partnerName: 'Sarah', partnerType: 'INFLUENCER' })).toEqual(['code', 'commission']);
    expect(fields({ code: 'COMM', kind: 'PERCENT', amount: '10', commission: '5' })).toEqual(['partnerName', 'partnerType']);
    expect(ok({ code: 'SARAH', kind: 'PERCENT', amount: '10', commission: '5', partnerName: '  Sarah   (Instagram) ', partnerType: 'influencer', partnerEmail: ' Sarah@Example.com ' })).toMatchObject({
      commissionBps: 500,
      partnerName: 'Sarah (Instagram)',
      partnerType: 'INFLUENCER',
      partnerEmail: 'sarah@example.com',
    });
  });

  it('refuses a REFERRAL code (the shop makes those, one per parent) and an unknown type', () => {
    expect(fields({ code: 'REF', kind: 'FIXED', amount: '5', partnerName: 'x', partnerType: 'REFERRAL' })).toEqual(['partnerType']);
    expect(fields({ code: 'REF', kind: 'FIXED', amount: '5', partnerName: 'x', partnerType: 'AFFILIATE' })).toEqual(['partnerType']);
  });

  it('a bad partner email, or a class with no school, is refused', () => {
    expect(fields({ code: 'EMAIL', kind: 'PERCENT', amount: '10', partnerEmail: 'not an email' })).toEqual(['partnerEmail']);
    expect(fields({ code: 'CLASS', kind: 'PERCENT', amount: '10', classLabel: 'Year 2' })).toEqual(['classLabel']);
  });

  it('reports every problem at once', () => {
    expect(fields({ code: 'x', kind: 'PERCENT', amount: '80', maxUses: '0', endsOn: 'soon' })).toEqual(['code', 'amount', 'maxUses', 'endsOn']);
  });
});

describe('the terminal script’s options', () => {
  it('needs exactly one of --percent, --pounds, --free-card', () => {
    expect(inputFromArgs(['X1']).ok).toBe(false);
    expect(inputFromArgs(['X1', '--percent', '10', '--pounds', '5']).ok).toBe(false);
    expect(inputFromArgs(['X1', '--free-card', '--percent', '10']).ok).toBe(false);
  });

  it('every example in the script’s header makes the row it always made', () => {
    const NO = { minSpendPence: 0, partnerName: null, partnerType: null, partnerEmail: null, commissionBps: 0, classLabel: null, firstOrderOnly: false, startsAt: null, endsAt: null, maxRedemptions: null };
    expect(ok(args('WELCOME10', '--percent', '10'))).toEqual({ ...NO, code: 'WELCOME10', kind: 'PERCENT', value: 1000 });
    expect(ok(args('TENOFF', '--pounds', '10', '--min', '60'))).toEqual({ ...NO, code: 'TENOFF', kind: 'FIXED', value: 1000, minSpendPence: 6000 });
    expect(ok(args('SARAHMAKES', '--percent', '10', '--commission', '5', '--partner', 'Sarah (Instagram)', '--type', 'INFLUENCER', '--partner-email', 'sarah@example.com'))).toEqual({
      ...NO,
      code: 'SARAHMAKES',
      kind: 'PERCENT',
      value: 1000,
      commissionBps: 500,
      partnerName: 'Sarah (Instagram)',
      partnerType: 'INFLUENCER',
      partnerEmail: 'sarah@example.com',
    });
    expect(ok(args('FIRSTCARD', '--free-card', '--max', '500'))).toEqual({ ...NO, code: 'FIRSTCARD', kind: 'FREE_CARD', value: 0, maxRedemptions: 500 });
    expect(ok(args('STMARYSPTA', '--percent', '0', '--commission', '10', '--partner', "St Mary's PTA", '--type', 'PTA'))).toEqual({
      ...NO,
      code: 'STMARYSPTA',
      kind: 'PERCENT',
      value: 0,
      commissionBps: 1000,
      partnerName: "St Mary's PTA",
      partnerType: 'PTA',
    });
    expect(ok(args('STMARYS-Y2', '--percent', '0', '--commission', '10', '--partner', "St Mary's PTA", '--type', 'PTA', '--class', 'Year 2'))).toMatchObject({ classLabel: 'Year 2' });
    expect(ok(args('XMAS', '--percent', '15', '--ends', '2026-12-24', '--starts', '2026-11-20', '--max', '500', '--min', '15', '--first-order'))).toEqual({
      ...NO,
      code: 'XMAS',
      kind: 'PERCENT',
      value: 1500,
      minSpendPence: 1500,
      firstOrderOnly: true,
      startsAt: new Date('2026-11-20T00:00:00Z'),
      endsAt: new Date('2026-12-24T00:00:00Z'),
      maxRedemptions: 500,
    });
  });
});

describe('small helpers', () => {
  it('hundredths reads pounds and percents without rounding', () => {
    expect(hundredths('5')).toBe(500);
    expect(hundredths('£5.5')).toBe(550);
    expect(hundredths('12.50%')).toBe(1250);
    for (const bad of ['', '5.555', '1e3', '-1', 'five', '5,00']) expect(hundredths(bad)).toBeNaN();
  });

  it('describes an offer in words', () => {
    expect(describeOffer({ kind: 'PERCENT', value: 1000 })).toBe('10% off');
    expect(describeOffer({ kind: 'PERCENT', value: 0 })).toBe('no discount');
    expect(describeOffer({ kind: 'FIXED', value: 500 })).toBe('£5.00 off');
    expect(describeOffer({ kind: 'FREE_CARD', value: 0 })).toBe('one card free');
  });
});
