import { describe, expect, it } from 'vitest';
import { memberName } from '../memberName';
import { firstNameOf } from '../mail/words';

describe('memberName (04-B9: relatives never see each other’s email handle)', () => {
  const granny = { displayName: null, email: 'jane.smith@example.test' };

  it('a relative sees what they are to the family, never the email’s first part', () => {
    expect(memberName(granny, 'GRANDPARENT', { byThemself: false, byParent: false })).toBe('grandparent');
    expect(memberName(granny, 'AUNT_UNCLE', { byThemself: false, byParent: false })).toBe('aunt or uncle');
    expect(memberName(granny, 'OTHER', { byThemself: false, byParent: false })).not.toContain('smith');
  });

  it('the parent who invited that address, and the person themself, still see it', () => {
    expect(memberName(granny, 'GRANDPARENT', { byThemself: false, byParent: true })).toBe('jane.smith');
    expect(memberName(granny, 'GRANDPARENT', { byThemself: true, byParent: false })).toBe('jane.smith');
  });

  it('a name they set themselves is used for everyone', () => {
    expect(memberName({ displayName: ' Nana ', email: granny.email }, 'GRANDPARENT', { byThemself: false, byParent: false })).toBe('Nana');
  });
});

describe('firstNameOf (emails name people by first name only)', () => {
  it.each([
    ['Sam Hartley', 'Sam'],
    ['  Bea  ', 'Bea'],
    ['Zoë-Anne Smith', 'Zoë-Anne'],
    [null, null],
    ['', null],
    ['e2e-parent-123@example.test', null],
  ])('%s → %s', (input, want) => expect(firstNameOf(input)).toBe(want));
});
