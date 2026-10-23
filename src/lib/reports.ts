/** Why someone reported a gift link — plain words for the form, the label the reviewer sees. */
export const REPORT_REASONS = [
  { id: 'not-for-me', label: 'I don’t know who sent this, or it wasn’t meant for me' },
  { id: 'inappropriate', label: 'Something here is inappropriate or harmful' },
  { id: 'copyright', label: 'It uses my work, or someone else’s characters or logos' },
  { id: 'other', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** The first label a reported keepsake carries in the review queue. */
export const REPORTED_LABEL = 'reported via a gift link';
