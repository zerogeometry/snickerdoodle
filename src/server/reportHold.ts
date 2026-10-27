/**
 * The report verdict kept in `assets.moderation_detail.report` beside `original` / `design`
 * (see src/server/reports.ts). Dependency-free so the authz ref builder can read it.
 */
export interface ReportVerdict {
  status: 'FLAGGED' | 'CLEAR';
  labels: string[];
  reports: { reason: string; via: 'gift-link' | 'home'; at: string }[];
}

/** The unresolved report on this keepsake, if any. */
export function openReport(detail: unknown): ReportVerdict | null {
  const r = (detail as { report?: ReportVerdict } | null)?.report;
  return r && r.status === 'FLAGGED' ? r : null;
}
