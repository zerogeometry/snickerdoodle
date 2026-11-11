import { describe, expect, it } from 'vitest';
import { canViewProfileImage, type FamilySeat, type ProfileImageRef, type ProfileViewer } from '../index';
import type { Circle } from '../../domain/types';

const img = (over: Partial<ProfileImageRef> = {}): ProfileImageRef => ({
  kind: 'AVATAR',
  accountId: 'sam',
  familyId: null,
  moderationStatus: 'CLEAR',
  ownerFamilyIds: ['hartley'],
  ...over,
});
const seat = (familyId: string, circle: Circle = 'FAMILY', isOwner = false): FamilySeat => ({ familyId, circle, isOwner });
const who = (accountId: string | null, activeFamilies: FamilySeat[] = []): ProfileViewer => ({ accountId, activeFamilies });
const sees = (i: ProfileImageRef, v: ProfileViewer) => canViewProfileImage(i, v).allowed;

describe('canViewProfileImage — nothing public, circle rules (D27)', () => {
  for (const kind of ['AVATAR', 'ACCOUNT_HEADER'] as const) {
    describe(kind, () => {
      it('the owner always sees their own (even before screening clears it)', () => {
        for (const status of ['PENDING', 'FLAGGED', 'CLEAR']) expect(sees(img({ kind, moderationStatus: status }), who('sam'))).toBe(true);
      });
      it('a home or family member of a shared family sees it once cleared — not before', () => {
        for (const circle of ['HOME', 'FAMILY'] as const) {
          expect(sees(img({ kind }), who('jo', [seat('hartley', circle)]))).toBe(true);
          expect(sees(img({ kind, moderationStatus: 'PENDING' }), who('jo', [seat('hartley', circle)]))).toBe(false);
          expect(sees(img({ kind, moderationStatus: 'FLAGGED' }), who('jo', [seat('hartley', circle)]))).toBe(false);
        }
      });
      it('the family leader sees it (the leader counts as home)', () => {
        expect(sees(img({ kind }), who('lead', [seat('hartley', 'EXTENDED', true)]))).toBe(true);
      });
      it('an EXTENDED relative of the shared family does NOT (they see initials) — no more "shares any family"', () => {
        expect(sees(img({ kind }), who('granny', [seat('hartley', 'EXTENDED')]))).toBe(false);
      });
      it('person to person: an extended seat here + a family seat in an unrelated family still denies', () => {
        expect(sees(img({ kind }), who('granny', [seat('hartley', 'EXTENDED'), seat('bloom', 'HOME')]))).toBe(false);
      });
      it('no family in common → denied (cross-family)', () => {
        expect(sees(img({ kind }), who('blake', [seat('bloom', 'HOME')]))).toBe(false);
      });
      it('signed out → denied', () => {
        expect(sees(img({ kind }), who(null))).toBe(false);
      });
      it('an owner who left every family is visible to nobody else', () => {
        expect(sees(img({ kind, ownerFamilyIds: [] }), who('jo', [seat('hartley', 'HOME')]))).toBe(false);
      });
    });
  }

  describe('FAMILY_BANNER (the family’s own — every active member, as before)', () => {
    const banner = (over: Partial<ProfileImageRef> = {}) => img({ kind: 'FAMILY_BANNER', familyId: 'hartley', ownerFamilyIds: [], ...over });
    it('active members of every circle see it once cleared', () => {
      for (const circle of ['HOME', 'FAMILY', 'EXTENDED'] as const) expect(sees(banner(), who('jo', [seat('hartley', circle)]))).toBe(true);
      expect(sees(banner(), who('rosie', [seat('hartley'), seat('other')]))).toBe(true);
    });
    it('the uploader sees it while pending; other members don’t', () => {
      expect(sees(banner({ moderationStatus: 'PENDING' }), who('sam', [seat('hartley')]))).toBe(true);
      expect(sees(banner({ moderationStatus: 'PENDING' }), who('jo', [seat('hartley')]))).toBe(false);
    });
    it('a removed / left member, another family, or a signed-out visitor → denied', () => {
      expect(sees(banner(), who('mallory', []))).toBe(false);
      expect(sees(banner(), who('blake', [seat('bloom')]))).toBe(false);
      expect(sees(banner(), who(null))).toBe(false);
      expect(sees(banner(), who('sam', []))).toBe(false); // even the uploader, once no longer in it
    });
  });

  it('CSAM-blocked → nobody, not even the owner', () => {
    expect(sees(img({ moderationStatus: 'BLOCKED' }), who('sam', [seat('hartley')]))).toBe(false);
    expect(sees(img({ kind: 'FAMILY_BANNER', familyId: 'hartley', moderationStatus: 'BLOCKED' }), who('sam', [seat('hartley')]))).toBe(false);
  });
});
