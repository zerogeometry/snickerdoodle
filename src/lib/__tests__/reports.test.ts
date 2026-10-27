import { describe, expect, it } from 'vitest';
import { HOME_REPORT_REASONS, REPORTED_FROM_HOME_LABEL, REPORTED_LABEL, isHeldForReview, openReportLabels, openReports } from '@/lib/reports';
import { assetRefOf } from '@/server/assetRef';

const at = '2026-10-26T10:00:00.000Z';
const open = { reason: 'inappropriate', at, via: 'home' as const };
const resolved = { reason: 'other', at, via: 'gift-link' as const, resolvedAt: at, resolution: 'cleared' as const };

/** "Held for review" is derived from the stored report shape — the same way everywhere (src/lib/reports.ts). */
describe('isHeldForReview', () => {
  it('is held while a report is open and the keepsake isn’t CLEAR', () => {
    expect(isHeldForReview({ moderationStatus: 'FLAGGED', moderationDetail: { reports: [open] } })).toBe(true);
    expect(isHeldForReview({ moderationStatus: 'PENDING', moderationDetail: { reports: [open] } })).toBe(true);
    expect(isHeldForReview({ moderationStatus: 'FLAGGED', moderationDetail: { reports: [resolved, open] } })).toBe(true);
  });

  it('is not held once every report is resolved, with no reports, or when CLEAR', () => {
    expect(isHeldForReview({ moderationStatus: 'FLAGGED', moderationDetail: { reports: [resolved] } })).toBe(false);
    expect(isHeldForReview({ moderationStatus: 'FLAGGED', moderationDetail: { labels: ['Suggestive'] } })).toBe(false); // a flag alone gates printing, not viewing
    expect(isHeldForReview({ moderationStatus: 'CLEAR', moderationDetail: { reports: [{ reason: 'other', at }] } })).toBe(false); // cleared before reports were resolved
    expect(isHeldForReview({ moderationStatus: 'FLAGGED', moderationDetail: null })).toBe(false);
    expect(isHeldForReview({ moderationStatus: 'FLAGGED', moderationDetail: { reports: 'nonsense' } })).toBe(false);
  });

  it('a legacy gift-link report (no `via`) counts, and the labels say where each came from', () => {
    const detail = { reports: [{ reason: 'copyright', at }, open, resolved] };
    expect(openReports(detail)).toHaveLength(2);
    expect(openReportLabels(detail)).toEqual([REPORTED_LABEL, expect.stringMatching(/characters or logos/), REPORTED_FROM_HOME_LABEL, expect.stringMatching(/inappropriate/)]);
  });

  it('assetRefOf carries it into what authz judges', () => {
    const row = { id: 'a', familyId: 'f', uploaderAccountId: 'u', controllerAccountId: 'c', visibility: 'FAMILY' as const, moderationStatus: 'FLAGGED' as const };
    expect(assetRefOf({ ...row, moderationDetail: { reports: [open] } })).toMatchObject({ heldForReview: true, ephemeralClaimId: null });
    expect(assetRefOf({ ...row, moderationDetail: { reports: [resolved] } }).heldForReview).toBe(false);
  });

  it('a family member can’t pick the gift-link-only reason', () => {
    expect(HOME_REPORT_REASONS.map((r) => r.id)).not.toContain('not-for-me');
  });
});
