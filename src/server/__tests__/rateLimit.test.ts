import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, allow, clientIp, isOver, resetRateLimits } from '@/server/rateLimit';

describe('rate limiter (fixed window, in memory)', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to the limit, then refuses until the window passes', () => {
    const { max, windowMs } = LIMITS['magic-link'];
    const t = 1_000_000;
    for (let i = 0; i < max; i++) expect(allow('magic-link', 'gran@example.test', t)).toBe(true);
    expect(allow('magic-link', 'gran@example.test', t)).toBe(false);
    expect(isOver('magic-link', 'gran@example.test', t)).toBe(true);
    expect(allow('magic-link', 'gran@example.test', t + windowMs)).toBe(true); // fresh window
  });

  it('keeps keys and limits apart', () => {
    const t = 5_000;
    for (let i = 0; i < LIMITS.report.max; i++) allow('report', 'ip-1', t);
    expect(allow('report', 'ip-1', t)).toBe(false);
    expect(allow('report', 'ip-2', t)).toBe(true); // another visitor
    expect(allow('checkout', 'ip-1', t)).toBe(true); // another limit
  });

  it('isOver never counts an attempt (so re-quoting a good promo code never runs out)', () => {
    for (let i = 0; i < 1000; i++) expect(isOver('promo-check', 'ip', 1)).toBe(false);
    expect(allow('promo-check', 'ip', 1)).toBe(true);
  });

  it('outside a request the IP is a neutral placeholder (never throws)', async () => {
    expect(await clientIp()).toBe('unknown');
  });
});

describe('RATE_LIMIT_SCALE', () => {
  beforeEach(() => resetRateLimits());
  it('raises limits by a bounded factor and can never switch them off', () => {
    const prev = process.env.RATE_LIMIT_SCALE;
    try {
      process.env.RATE_LIMIT_SCALE = '3';
      for (let i = 0; i < LIMITS.report.max * 3; i++) expect(allow('report', 'x', 1)).toBe(true);
      expect(allow('report', 'x', 1)).toBe(false);
      resetRateLimits();
      for (const bad of ['0', '-5', 'off', 'Infinity']) {
        process.env.RATE_LIMIT_SCALE = bad;
        resetRateLimits();
        for (let i = 0; i < LIMITS.report.max; i++) allow('report', 'y', 1);
        expect(allow('report', 'y', 1)).toBe(false);
      }
    } finally {
      if (prev === undefined) delete process.env.RATE_LIMIT_SCALE;
      else process.env.RATE_LIMIT_SCALE = prev;
    }
  });
});
