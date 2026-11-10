import { describe, expect, it } from 'vitest';
import { keepsakeTileActions, keepsakeTileName } from '../keepsakeTileActions';

// The eye + basket on each keepsake at home (founder, 10 Nov) — shown only from server-derived flags.
describe('keepsakeTileActions — which buttons a keepsake gets', () => {
  it('its controller with buy access gets both', () => {
    expect(keepsakeTileActions({ canManage: true, held: false }, true)).toEqual({ whoCanSee: true, makeSomething: true });
  });

  it('someone who can’t manage it never gets "who can see"', () => {
    expect(keepsakeTileActions({ canManage: false, held: false }, true)).toEqual({ whoCanSee: false, makeSomething: true });
    expect(keepsakeTileActions({ canManage: false, held: false }, false).whoCanSee).toBe(false);
  });

  it('a look-only (VIEW) member gets no basket', () => {
    expect(keepsakeTileActions({ canManage: false, held: false }, false)).toEqual({ whoCanSee: false, makeSomething: false });
  });

  it('a keepsake held after a report can’t be made into anything — but its parent can still choose who sees it', () => {
    expect(keepsakeTileActions({ canManage: true, held: true }, true)).toEqual({ whoCanSee: true, makeSomething: false });
  });
});

describe('keepsakeTileName', () => {
  it('uses the child’s first name when filed, else a plain name', () => {
    expect(keepsakeTileName('Mia', 'Oct 12')).toBe('Mia’s keepsake from Oct 12');
    expect(keepsakeTileName(null, 'Oct 12')).toBe('the keepsake from Oct 12');
  });
});
