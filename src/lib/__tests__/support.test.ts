import { describe, expect, it } from 'vitest';
import { FAQ } from '@/lib/faq';
import { searchFaq } from '@/lib/faqSearch';
import { REPORT_REASONS } from '@/lib/reports';
import { HELLO_EMAIL, SUPPORT_EMAIL, SUPPORT_TOPICS, cleanOrderRef, supportTopic } from '@/lib/support';

const faqIds = new Set(FAQ.flatMap((s) => s.items.map((i) => i.id)));

describe('help topics', () => {
  it('every topic has a unique id and points only at answers that exist', () => {
    expect(new Set(SUPPORT_TOPICS.map((t) => t.id)).size).toBe(SUPPORT_TOPICS.length);
    for (const t of SUPPORT_TOPICS) for (const id of t.suggest) expect(faqIds.has(id), `${t.id} → ${id}`).toBe(true);
  });

  it('the order topics ask for an order reference; the others do not', () => {
    expect(SUPPORT_TOPICS.filter((t) => t.order).map((t) => t.id)).toEqual(['order-where', 'order-change', 'order-problem']);
  });

  it('only a known topic id resolves', () => {
    expect(supportTopic('order-change')?.label).toMatch(/change/i);
    expect(supportTopic('nope')).toBeUndefined();
    expect(supportTopic(undefined)).toBeUndefined();
  });

  it('uses the Snickerdoodle addresses', () => {
    expect(HELLO_EMAIL).toBe('hello@snickerdoodle.co.uk');
    expect(SUPPORT_EMAIL).toBe('support@snickerdoodle.co.uk');
  });

  it('report reasons are unique', () => {
    expect(new Set(REPORT_REASONS.map((r) => r.id)).size).toBe(REPORT_REASONS.length);
  });
});

describe('cleanOrderRef', () => {
  it('tidies what people type', () => {
    expect(cleanOrderRef(' snk-123456 ')).toBe('SNK-123456');
    expect(cleanOrderRef('SNK 123 456')).toBe('SNK123456');
  });
  it('refuses junk', () => {
    expect(cleanOrderRef('')).toBeNull();
    expect(cleanOrderRef('ab')).toBeNull();
    expect(cleanOrderRef('<script>')).toBeNull();
    expect(cleanOrderRef('x'.repeat(40))).toBeNull();
    expect(cleanOrderRef(42)).toBeNull();
  });
});

describe('searchFaq', () => {
  const top = (q: string) => searchFaq(q)[0]?.item.id;

  it('finds the answer people mean, in their words', () => {
    expect(top('refund')).toBe('returns');
    expect(top('how much is delivery')).toBe('delivery-cost');
    expect(top('change my order')).toBe('change-order');
    expect(top('delete my data')).toBeDefined();
  });

  it('nothing for nothing', () => {
    expect(searchFaq('')).toEqual([]);
    expect(searchFaq('the and of')).toEqual([]);
    expect(searchFaq('zzqxv')).toEqual([]);
  });

  it('returns at most the limit, best first', () => {
    const hits = searchFaq('gift link family', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < hits.length; i++) expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
  });
});
