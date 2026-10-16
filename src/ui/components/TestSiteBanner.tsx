import { isTestSite } from '@/lib/siteMode';

/** On the test site only: a thin, always-there reminder. Static positioning, so it never sits
 * on top of the sticky header or the thumb-zone tab bar. */
export function TestSiteBanner() {
  if (!isTestSite()) return null;
  return (
    <div role="note" className="bg-cocoa px-4 py-1.5 text-center text-xs font-bold text-paper">
      test site — please use test drawings only, never a real child&apos;s. nothing is charged or printed.
    </div>
  );
}
