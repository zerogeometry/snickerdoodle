import { describe, expect, it } from 'vitest';
import { GIFT_LINK_PATH, statusForGiftLinkState } from './status';

describe('gift-link HTTP status (CLAUDE.md: deleted source → 410)', () => {
  it('a live link is 200', () => expect(statusForGiftLinkState('active')).toBe(200));
  it('a deleted / pulled-back source, a switched-off link and an expired link are 410 Gone', () => {
    expect(statusForGiftLinkState('gone')).toBe(410);
    expect(statusForGiftLinkState('revoked')).toBe(410);
    expect(statusForGiftLinkState('expired')).toBe(410);
  });
  it('an unknown token is 404', () => expect(statusForGiftLinkState('not-found')).toBe(404));

  it('only a real gift-link path is matched (never a sub-resource like the preview API)', () => {
    expect(GIFT_LINK_PATH.exec('/g/abcDEF_123-xyz')?.[1]).toBe('abcDEF_123-xyz');
    expect(GIFT_LINK_PATH.test('/g/abcDEF_123-xyz/')).toBe(true);
    expect(GIFT_LINK_PATH.test('/g/short')).toBe(false);
    expect(GIFT_LINK_PATH.test('/g/abcdefgh/more')).toBe(false);
    expect(GIFT_LINK_PATH.test('/g/abc%2F..%2Fdefgh')).toBe(false);
  });
});
