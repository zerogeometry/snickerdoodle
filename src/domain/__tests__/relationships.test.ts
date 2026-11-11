import { describe, expect, it } from 'vitest';
import { circleAllowedFor, circlesFor, defaultCircleFor, HOME_RELATIONSHIPS } from '../relationships';
import { RELATIONSHIPS } from '../types';
import { joinCard, JOIN_CONSENT_VERSION } from '@/lib/joinConsent';

describe('relationships and circles (D27)', () => {
  it('home is only ever a parent / co-parent or a grown-up child', () => {
    expect([...HOME_RELATIONSHIPS].sort()).toEqual(['ADULT_CHILD', 'PARENT']);
    for (const r of RELATIONSHIPS) expect(circleAllowedFor(r, 'HOME')).toBe(r === 'PARENT' || r === 'ADULT_CHILD');
  });

  it('defaults: parent and grown-up child → home; everyone else → extended', () => {
    expect(defaultCircleFor('PARENT')).toBe('HOME');
    expect(defaultCircleFor('ADULT_CHILD')).toBe('HOME');
    for (const r of ['GRANDPARENT', 'AUNT_UNCLE', 'CLOSE_FRIEND', 'OTHER'] as const) expect(defaultCircleFor(r)).toBe('EXTENDED');
  });

  it('every default is a circle that relationship may have; a little one may have none (never invited)', () => {
    for (const r of RELATIONSHIPS) {
      if (r === 'CHILD') expect(circlesFor(r)).toEqual([]);
      else expect(circlesFor(r)).toContain(defaultCircleFor(r));
    }
  });

  it('anyone invitable can be put in family or extended', () => {
    for (const r of RELATIONSHIPS.filter((x) => x !== 'CHILD')) {
      expect(circleAllowedFor(r, 'FAMILY')).toBe(true);
      expect(circleAllowedFor(r, 'EXTENDED')).toBe(true);
    }
  });
});

describe('the join card’s words (the joiner’s yes)', () => {
  it('joining home: they accept the leader looks after the family’s keepsakes and details', () => {
    const c = joinCard('HOME', 'Sam', 'Sam’s family');
    expect(c.heading).toBe('join Sam’s home');
    expect(c.consent).toMatch(/happy for Sam to look after the family’s keepsakes and details/);
    expect(c.consent).toMatch(/anything you add stays yours to share/);
    expect(c.consent).toMatch(/leave any time/);
    expect(c.button).toBe('yes, join the home');
    expect(joinCard('HOME', 'Sam', null, { moving: true }).button).toBe('yes, move into the home');
  });

  it('joining family / extended: says what they’ll see and who looks after things; warm, lowercase', () => {
    const f = joinCard('FAMILY', 'Sam', 'Sam’s family');
    expect(f.heading).toBe('join Sam’s family');
    expect(f.sees).toMatch(/family circle/);
    expect(joinCard('EXTENDED', null, null).sees).toMatch(/the family lead shares with the extended family/);
    for (const c of [f, joinCard('EXTENDED', 'Sam', null)]) {
      expect(c.consent).toMatch(/you choose who sees/);
      expect(c.button).toBe('yes, join the family');
    }
  });

  it('the version is set (stored with every yes)', () => expect(JOIN_CONSENT_VERSION).toMatch(/^join-\d{4}-\d{2}-\d{2}$/));
});
