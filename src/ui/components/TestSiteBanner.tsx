import { isPrivateLive, isTestSite } from '@/lib/siteMode';

/** On the test site and the private live site: a thin, always-there reminder. Static positioning,
 * so it never sits on top of the sticky header or the thumb-zone tab bar. */
export function TestSiteBanner() {
  if (isPrivateLive()) {
    return (
      <div role="note" className="bg-cocoa px-4 py-1.5 text-center text-xs font-bold text-paper">
        private preview — orders here are real: real payments, really printed and posted.
      </div>
    );
  }
  if (!isTestSite()) return null;
  return (
    <div role="note" className="bg-cocoa px-4 py-1.5 text-center text-xs font-bold text-paper">
      test site — please use test drawings only, never a real child&apos;s. nothing is charged or printed.
    </div>
  );
}
