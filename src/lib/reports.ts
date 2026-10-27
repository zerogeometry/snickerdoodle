/** Why someone reported a gift link — plain words for the form, the label the reviewer sees. */
export const REPORT_REASONS = [
  { id: 'not-for-me', label: 'I don’t know who sent this, or it wasn’t meant for me' },
  { id: 'inappropriate', label: 'Something here is inappropriate or harmful' },
  { id: 'copyright', label: 'It uses my work, or someone else’s characters or logos' },
  { id: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** The reasons a family member can give from the Keepsake Home ("wasn't meant for me" is a gift-link thing). */
export const HOME_REPORT_REASONS = REPORT_REASONS.filter((r) => r.id !== 'not-for-me');

/** The first label a reported keepsake carries in the review queue. */
export const REPORTED_LABEL = 'reported via a gift link';
/** …and the same, when a family member reported it from the Keepsake Home. */
export const REPORTED_FROM_HOME_LABEL = 'reported from the keepsake home';

/**
 * One report, as kept in `assets.moderation_detail.reports` (src/server/contentReports.ts). Ids and
 * the reason only — never the reporter's note, email or identity. A reviewer's CLEAR stamps
 * `resolvedAt`, which is what lets the keepsake be seen again.
 */
export interface StoredReport {
  reason: string;
  at: string;
  /** absent on reports made before Home reports existed — those all came from a gift link */
  via?: 'gift-link' | 'home';
  giftLinkId?: string;
  resolvedAt?: string;
  resolution?: 'cleared';
}

/** Every report on this keepsake, whatever its state. Tolerates any stored shape. */
export function storedReports(detail: unknown): StoredReport[] {
  const r = (detail as { reports?: unknown } | null | undefined)?.reports;
  return Array.isArray(r) ? r.filter((x): x is StoredReport => !!x && typeof x === 'object' && typeof (x as StoredReport).reason === 'string') : [];
}

/** The reports a reviewer hasn't decided yet. */
export function openReports(detail: unknown): StoredReport[] {
  return storedReports(detail).filter((r) => !r.resolvedAt);
}

/**
 * HELD FOR REVIEW (founder decision 2026-10-26): a keepsake someone reported is hidden from
 * relatives — only its uploader/controller sees it — until a reviewer decides. Held = an unresolved
 * report on a keepsake that isn't CLEAR. Every moderation write keeps a reported keepsake FLAGGED
 * while a report is open (src/server/moderation), and only the reviewer's CLEAR resolves it
 * (src/server/admin/review.ts). The status condition keeps keepsakes cleared before reports carried
 * `resolvedAt` from vanishing out of the review queue's reach.
 */
export function isHeldForReview(row: { moderationStatus: string; moderationDetail: unknown }): boolean {
  return row.moderationStatus !== 'CLEAR' && openReports(row.moderationDetail).length > 0;
}

/** What the reviewer sees for the open reports: where they came from, then why. */
export function openReportLabels(detail: unknown): string[] {
  const labels: string[] = [];
  for (const r of openReports(detail)) {
    labels.push(r.via === 'home' ? REPORTED_FROM_HOME_LABEL : REPORTED_LABEL);
    labels.push(REPORT_REASONS.find((x) => x.id === r.reason)?.label ?? r.reason);
  }
  return [...new Set(labels)];
}
