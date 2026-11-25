import { describe, expect, it } from 'vitest';
import { isNeverCheckedHold, MAX_RECHECKS, NEVER_CHECKED_LABELS } from '../index';
import { removeOnlyReason } from '@/lib/reviewReasons';

/** Founder, 25 Nov 2026: which holds get today's checks, and what the review page says about the rest. */
describe('which holds are "never checked"', () => {
  it('only FLAGGED holds whose every reason is "no check gave an answer"', () => {
    for (const l of NEVER_CHECKED_LABELS) expect(isNeverCheckedHold('FLAGGED', { labels: [l] })).toBe(true);
    expect(isNeverCheckedHold('FLAGGED', { labels: ['screening-not-configured', 'classifier-error'] })).toBe(true);
  });
  it('never a real flag, a report, a mix, an empty or missing reason, or anything not FLAGGED', () => {
    expect(isNeverCheckedHold('FLAGGED', { labels: ['Explicit'] })).toBe(false);
    expect(isNeverCheckedHold('FLAGGED', { labels: ['classifier-error', 'drawn-words'] })).toBe(false);
    expect(isNeverCheckedHold('FLAGGED', { labels: ['screening-not-configured'], reports: [{}] })).toBe(false);
    expect(isNeverCheckedHold('FLAGGED', { labels: ['hash-check-unavailable'] })).toBe(false);
    expect(isNeverCheckedHold('FLAGGED', { labels: [] })).toBe(false);
    expect(isNeverCheckedHold('FLAGGED', null)).toBe(false);
    for (const s of ['BLOCKED', 'CLEAR', 'PENDING']) expect(isNeverCheckedHold(s, { labels: ['screening-not-configured'] })).toBe(false);
  });
  it('gives up after MAX_RECHECKS tries', () => {
    expect(isNeverCheckedHold('FLAGGED', { labels: ['classifier-error'], rechecks: MAX_RECHECKS - 1 })).toBe(true);
    expect(isNeverCheckedHold('FLAGGED', { labels: ['classifier-error'], rechecks: MAX_RECHECKS })).toBe(false);
  });
});

describe('the review page says the real reason', () => {
  it('a never-checked hold is not called nudity', () => {
    const r = removeOnlyReason(['screening-not-configured']);
    expect(r).toMatch(/before the safety checks were switched on/);
    expect(r).toMatch(/checked again automatically/);
    expect(r).not.toMatch(/nudity|sexual/);
    expect(removeOnlyReason(['classifier-error'])).toMatch(/couldn’t read it/);
  });
  it('the hash check failing, and a real flag, each say so', () => {
    expect(removeOnlyReason(['hash-check-unavailable'])).toMatch(/known abuse images couldn’t run/);
    expect(removeOnlyReason(['Explicit'])).toMatch(/flagged it for the reason above/);
  });
});
