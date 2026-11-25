import { describe, expect, it } from 'vitest';
import { cleanBasketLines, drawingIdsOf, isReminderDue, MAX_LINES, REMIND_AFTER_MS, REMIND_AGAIN_AFTER_MS, sameJson, STALE_AFTER_MS } from '../savedBasket';
import { basketReminderEmail, readBasketReminderOffToken } from '../mail/basketReminder';
import { mergeBaskets } from '@/lib/basketMerge';

/** Founder, 25 Nov 2026: the basket remembered on the account, and its one kind reminder. */
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const line = (id: string, extra: Record<string, unknown> = {}) => ({ id, product: 'mug', qty: 1, pricePence: 1800, ...extra });

describe('what a saved basket may hold', () => {
  it('takes the shop’s lines; refuses junk, silly quantities and too much', () => {
    expect(cleanBasketLines([line('a'), line('b', { qty: 3, sku: 'mug-blue' })])).toHaveLength(2);
    expect(cleanBasketLines([])).toEqual([]);
    for (const bad of [null, 'x', {}, [null], [line('')], [line('a', { qty: 0 })], [line('a', { qty: 100 })], [line('a', { qty: 1.5 })], [line('a', { product: 'mug; drop' })], [line('a', { pricePence: -1 })]]) {
      expect(cleanBasketLines(bad)).toBeNull();
    }
    expect(cleanBasketLines(Array.from({ length: MAX_LINES + 1 }, (_, i) => line(`l${i}`)))).toBeNull();
    expect(cleanBasketLines([line('a', { blob: 'x'.repeat(250_000) })])).toBeNull();
  });
  it('finds every drawing a line uses — its artwork, a pack’s cards, a calendar’s pages', () => {
    expect(drawingIdsOf(line('a', { artwork: { assetId: A } }))).toEqual([A]);
    expect(drawingIdsOf(line('p', { cards: [{ assetId: A }, { assetId: B }, { assetId: A }] })).sort()).toEqual([A, B]);
    expect(drawingIdsOf(line('c', { artwork: { assetId: A }, pages: [{ assetId: B }] })).sort()).toEqual([A, B]);
    expect(drawingIdsOf(line('x', { artwork: { assetId: 'not-an-id' } }))).toEqual([]);
  });
  it('the same basket is the same whatever order its keys come back in', () => {
    expect(sameJson([{ a: 1, b: { c: 2, d: 3 } }], [{ b: { d: 3, c: 2 }, a: 1 }])).toBe(true);
    expect(sameJson([{ a: 1 }], [{ a: 2 }])).toBe(false);
    expect(sameJson([line('a'), line('b')], [line('b'), line('a')])).toBe(false); // the order of LINES matters
  });
});

describe('putting a tab’s basket together with the saved one', () => {
  it('saved first in its order, then what this tab added; the same line → this tab’s version', () => {
    const saved = [line('mug'), line('sock', { qty: 1 })];
    const here = [line('sock', { qty: 2 }), line('tee')];
    expect(mergeBaskets(saved, here)).toEqual([line('mug'), line('sock', { qty: 2 }), line('tee')]);
    expect(mergeBaskets([], here)).toEqual(here);
    expect(mergeBaskets(saved, [])).toEqual(saved);
  });
});

describe('when the reminder is due', () => {
  const now = new Date('2026-12-01T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const base = { lineCount: 2, updatedAt: ago(REMIND_AFTER_MS + 1000), remindedAt: null, optedOut: false, paidSince: false };
  it('a day after the basket last changed — not before, not for a stale one', () => {
    expect(isReminderDue(base, now)).toBe(true);
    expect(isReminderDue({ ...base, updatedAt: ago(REMIND_AFTER_MS - 1000) }, now)).toBe(false);
    expect(isReminderDue({ ...base, updatedAt: ago(STALE_AFTER_MS + 1000) }, now)).toBe(false);
  });
  it('never: an empty basket, a "no thanks", or a basket they’ve paid for', () => {
    expect(isReminderDue({ ...base, lineCount: 0 }, now)).toBe(false);
    expect(isReminderDue({ ...base, optedOut: true }, now)).toBe(false);
    expect(isReminderDue({ ...base, paidSince: true }, now)).toBe(false);
  });
  it('once per basket; a changed basket can earn another, but never within a week', () => {
    expect(isReminderDue({ ...base, remindedAt: ago(1000) }, now)).toBe(false); // reminded after its last change
    expect(isReminderDue({ ...base, updatedAt: ago(2 * REMIND_AFTER_MS), remindedAt: ago(3 * REMIND_AFTER_MS) }, now)).toBe(false);
    expect(isReminderDue({ ...base, updatedAt: ago(2 * REMIND_AFTER_MS), remindedAt: ago(REMIND_AGAIN_AFTER_MS + 1000) }, now)).toBe(true);
  });
});

describe('the reminder email', () => {
  const m = basketReminderEmail({ accountId: A, to: 'sam@example.test', displayName: 'Sam Hartley', names: ['doodle mug', 'doodle socks', 'doodle cushion', 'doodle tee'], count: 5, christmasLine: 'order by thu 10 dec and it all arrives by christmas' });
  it('first name only; the subject names nobody; lists three then "and N more"', () => {
    expect(m.kind).toBe('basket-reminder');
    expect(m.text).toMatch(/^Hello Sam,/);
    expect(m.text).not.toMatch(/Hartley/);
    expect(m.subject).not.toMatch(/sam/i);
    expect(m.text).toContain('• doodle mug\n• doodle socks\n• doodle cushion\n• and 2 more');
    expect(m.text).toContain('Order by thu 10 dec and it all arrives by christmas.');
  });
  it('kind, not pushy: no "hurry", no "last chance", no "AI"', () => {
    expect(`${m.subject} ${m.text}`).not.toMatch(/hurry|last chance|don’t miss|act now|\bAI\b/i);
  });
  it('a real off switch — a signed link for this account only, and the one-tap unsubscribe headers', () => {
    const page = /basket-reminders\/off\/(\S+)/.exec(m.text)![1]!;
    expect(readBasketReminderOffToken(page)).toBe(A);
    expect(readBasketReminderOffToken(page.replace(A, B))).toBeNull();
    expect(m.headers).toMatchObject({ 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
  });
  it('escapes everything in the HTML version, and shows no picture', () => {
    const odd = basketReminderEmail({ accountId: A, to: 'x@example.test', displayName: null, names: ['<script>'], count: 1 });
    expect(odd.html).not.toContain('<script>');
    expect(odd.html).not.toMatch(/<img/i);
    expect(odd.text).toMatch(/^Hello,/);
  });
});
