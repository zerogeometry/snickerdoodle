import type { SyncEntry, SyncReport } from './sync';

/**
 * The weekly Prodigi check's email to the team (print-accuracy report, 16 Nov 2026: Prodigi changed the tube
 * socks' print size between two checks, and the job's findings only went to the server log). When a product
 * ON SALE is missing at Prodigi or its print file no longer matches Prodigi's print area, the support inbox
 * gets a plain list; a clean run sends nothing. A product hidden from the shop can't be ordered, so its known
 * differences (the adult hoodie, the 18–24m bodysuit) are only counted at the bottom — they'd otherwise bury
 * the one line that matters (23 Nov: 46 hoodie lines hid the tube socks). Pure — the route sends it.
 */
const needsALook = (e: SyncEntry) => e.status !== 'ok' || e.warnings.length > 0;
/** Unknown counts as on sale — the safe side. */
const onSale = (e: SyncEntry) => e.onSale !== false;
const what = (e: SyncEntry) => (e.status === 'missing' ? 'not found at Prodigi' : e.status === 'error' ? 'could not be checked' : e.warnings.join('; '));
const line = (e: SyncEntry) => `${e.productKey} · ${e.internalSku} (${e.providerSku}): ${what(e)}`;

/** The problems on products people can buy, and those on hidden products (nothing can be ordered). */
export function prodigiSpecFindings(report: SyncReport): { onSale: string[]; hidden: string[] } {
  const all = report.entries.filter(needsALook);
  return { onSale: all.filter(onSale).map(line), hidden: all.filter((e) => !onSale(e)).map(line) };
}

/** One plain line per product that needs a look (the admin app's health screen): on-sale ones first. */
export function prodigiSpecProblems(report: SyncReport): string[] {
  const f = prodigiSpecFindings(report);
  return [...f.onSale, ...f.hidden.map((l) => `${l} (hidden from the shop, so it can't be ordered)`)];
}

export function prodigiSpecAlert(report: SyncReport): { subject: string; text: string } | null {
  const { onSale: problems, hidden } = prodigiSpecFindings(report);
  if (problems.length === 0) return null;
  const hiddenProducts = [...new Set(report.entries.filter((e) => needsALook(e) && !onSale(e)).map((e) => e.productKey))];
  return {
    subject: `[prodigi check] ${problems.length} product${problems.length === 1 ? '' : 's'} on sale need${problems.length === 1 ? 's' : ''} a look`,
    text: [
      'The weekly Prodigi check found something that no longer matches what we send.',
      'A print file that is a different shape from Prodigi’s print area gets cropped or squashed, so look at these before more orders go out:',
      '',
      ...problems.map((l) => `- ${l}`),
      '',
      `${report.ok} of ${report.total} variants checked fine.`,
      ...(hidden.length
        ? [`(${hidden.length} more on products hidden from the shop, which can't be ordered: ${hiddenProducts.join(', ')}. They're on the admin health screen.)`]
        : []),
    ].join('\n'),
  };
}
