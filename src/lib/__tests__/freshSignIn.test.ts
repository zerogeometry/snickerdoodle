import { describe, expect, it } from 'vitest';
import { FRESH_SIGN_IN_MS, isFreshSignIn } from '@/lib/freshSignIn';

describe('a fresh sign-in (A-63: widening what the Draw app sends)', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  it('counts a sign-in up to 15 minutes old', () => {
    expect(isFreshSignIn(new Date(now.getTime() - 60_000), now)).toBe(true);
    expect(isFreshSignIn(new Date(now.getTime() - FRESH_SIGN_IN_MS), now)).toBe(true);
  });
  it('not one older than that, or none at all', () => {
    expect(isFreshSignIn(new Date(now.getTime() - FRESH_SIGN_IN_MS - 1), now)).toBe(false);
    expect(isFreshSignIn(null, now)).toBe(false);
    expect(isFreshSignIn(undefined, now)).toBe(false);
  });
  it('not one from the future (a clock that is badly off)', () => {
    expect(isFreshSignIn(new Date(now.getTime() + 5 * 60_000), now)).toBe(false);
  });
});
