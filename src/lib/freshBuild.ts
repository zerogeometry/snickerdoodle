/**
 * A page left open across an update keeps running the OLD code (founder, 5 Nov: "on mobile I'm still seeing a
 * version of the site where the automatic backgrounds … aren't working"). Phones keep a tab — or the home-screen
 * app — alive in memory for days and resume it as it was; Next only notices a new build when the page asks the
 * server for another page, never on the page already open. So when the parent comes back to the tab, the page asks
 * which build is live (/api/health) and, if it isn't its own, reloads itself onto the new one. The drawing and the
 * basket are kept for the tab (sessionStorage), so a reload loses nothing they'd miss.
 */

/** A real deploy's build tag (e.g. 20261105-1647-b43a436) — never a dev server's or an untagged image's. */
export const isRealBuild = (b: string | null | undefined): b is string => !!b && b !== 'dev' && b !== 'unknown';

/** Is this page's code older (or just other) than what the server now runs? Only ever on two real tags. */
export const isStaleBuild = (mine: string | null | undefined, live: string | null | undefined): boolean =>
  isRealBuild(mine) && isRealBuild(live) && mine !== live;

/**
 * Where a reload could cost the parent something only this page holds: the Studio's edits (in memory until
 * saved) and checkout (a half-filled address). There the page is left alone — the next page they open is the new
 * build anyway (Next reloads a navigation whose build doesn't match).
 */
const HOLDS_UNSAVED_WORK = ['/studio', '/checkout'];
export const canReloadOn = (path: string): boolean => !HOLDS_UNSAVED_WORK.some((p) => path === p || path.startsWith(`${p}/`));

/** Ask at most this often (switching back and forth between apps shouldn't keep asking). */
export const FRESH_CHECK_GAP_MS = 30_000;
