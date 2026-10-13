import { describe, expect, it } from 'vitest';
import { canViewProfileImage, type ProfileImageRef, type ProfileViewer } from '../index';

const img = (over: Partial<ProfileImageRef> = {}): ProfileImageRef => ({
  kind: 'AVATAR',
  accountId: 'sam',
  familyId: null,
  moderationStatus: 'CLEAR',
  ownerFamilyIds: ['hartley'],
  ...over,
});
const who = (accountId: string | null, activeFamilyIds: string[] = []): ProfileViewer => ({ accountId, activeFamilyIds });
const sees = (i: ProfileImageRef, v: ProfileViewer) => canViewProfileImage(i, v).allowed;

describe('canViewProfileImage — nothing public, only your circle', () => {
  for (const kind of ['AVATAR', 'ACCOUNT_HEADER'] as const) {
    describe(kind, () => {
      it('the owner always sees their own (even before screening clears it)', () => {
        for (const status of ['PENDING', 'FLAGGED', 'CLEAR']) expect(sees(img({ kind, moderationStatus: status }), who('sam'))).toBe(true);
      });
      it('someone sharing an ACTIVE family sees it once cleared — not before', () => {
        expect(sees(img({ kind }), who('jo', ['hartley']))).toBe(true);
        expect(sees(img({ kind, moderationStatus: 'PENDING' }), who('jo', ['hartley']))).toBe(false);
        expect(sees(img({ kind, moderationStatus: 'FLAGGED' }), who('jo', ['hartley']))).toBe(false);
      });
      it('no family in common → denied (cross-family)', () => {
        expect(sees(img({ kind }), who('blake', ['bloom']))).toBe(false);
      });
      it('signed out → denied', () => {
        expect(sees(img({ kind }), who(null))).toBe(false);
      });
      it('an owner who left every family is visible to nobody else', () => {
        expect(sees(img({ kind, ownerFamilyIds: [] }), who('jo', ['hartley']))).toBe(false);
      });
    });
  }

  describe('FAMILY_BANNER', () => {
    const banner = (over: Partial<ProfileImageRef> = {}) => img({ kind: 'FAMILY_BANNER', familyId: 'hartley', ownerFamilyIds: [], ...over });
    it('active members see it once cleared', () => {
      expect(sees(banner(), who('jo', ['hartley']))).toBe(true);
      expect(sees(banner(), who('rosie', ['hartley', 'other']))).toBe(true);
    });
    it('the uploader sees it while pending; other members don’t', () => {
      expect(sees(banner({ moderationStatus: 'PENDING' }), who('sam', ['hartley']))).toBe(true);
      expect(sees(banner({ moderationStatus: 'PENDING' }), who('jo', ['hartley']))).toBe(false);
    });
    it('a removed / left member, another family, or a signed-out visitor → denied', () => {
      expect(sees(banner(), who('mallory', []))).toBe(false);
      expect(sees(banner(), who('blake', ['bloom']))).toBe(false);
      expect(sees(banner(), who(null))).toBe(false);
      expect(sees(banner(), who('sam', []))).toBe(false); // even the uploader, once no longer in it
    });
  });

  it('CSAM-blocked → nobody, not even the owner', () => {
    expect(sees(img({ moderationStatus: 'BLOCKED' }), who('sam', ['hartley']))).toBe(false);
    expect(sees(img({ kind: 'FAMILY_BANNER', familyId: 'hartley', moderationStatus: 'BLOCKED' }), who('sam', ['hartley']))).toBe(false);
  });
});
