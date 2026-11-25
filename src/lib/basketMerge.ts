/**
 * The saved basket and this tab's basket, put together the first time a tab meets the account: what was saved
 * first, in its order; then anything added in this tab before signing in. The same line in both = this tab's
 * version (it's the newer one).
 */
export function mergeBaskets<T extends { id: string }>(saved: readonly T[], here: readonly T[]): T[] {
  const mine = new Map(here.map((l) => [l.id, l]));
  const out = saved.map((l) => mine.get(l.id) ?? l);
  const seen = new Set(out.map((l) => l.id));
  return [...out, ...here.filter((l) => !seen.has(l.id))];
}
