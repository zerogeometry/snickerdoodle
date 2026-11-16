import type { SyncReport } from './sync';

/**
 * The weekly Prodigi check's email to the team (print-accuracy report, 16 Nov 2026: Prodigi changed the tube
 * socks' print size between two checks, and the job's findings only went to the server log). When a product
 * is missing at Prodigi or a print file no longer matches Prodigi's print area, the support inbox gets a plain
 * list; a clean run sends nothing. Pure — the route sends it.
 */
/** One plain line per product that needs a look (the admin app's health screen shows the same list). */
export function prodigiSpecProblems(report: SyncReport): string[] {
  return report.entries
    .filter((e) => e.status !== 'ok' || e.warnings.length > 0)
    .map((e) => `${e.productKey} · ${e.internalSku} (${e.providerSku}): ${e.status === 'missing' ? 'not found at Prodigi' : e.status === 'error' ? 'could not be checked' : e.warnings.join('; ')}`);
}

export function prodigiSpecAlert(report: SyncReport): { subject: string; text: string } | null {
  const problems = report.entries.filter((e) => e.status !== 'ok' || e.warnings.length > 0);
  if (problems.length === 0) return null;
  const lines = problems.map((e) => {
    const what = e.status === 'missing' ? 'not found at Prodigi' : e.status === 'error' ? 'could not be checked' : e.warnings.join('; ');
    return `- ${e.productKey} · ${e.internalSku} (${e.providerSku}): ${what}`;
  });
  return {
    subject: `[prodigi check] ${problems.length} product${problems.length === 1 ? '' : 's'} need a look`,
    text: [
      'The weekly Prodigi check found something that no longer matches what we send.',
      'A print file that is a different shape from Prodigi’s print area gets cropped or squashed, so look at these before more orders go out:',
      '',
      ...lines,
      '',
      `${report.ok} of ${report.total} variants checked fine.`,
    ].join('\n'),
  };
}
