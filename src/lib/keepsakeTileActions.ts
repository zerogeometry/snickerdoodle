/**
 * The two little buttons on a keepsake at home (founder, 10 Nov): the eye ("who can see") and the
 * basket ("make something with it"). Both come from server-derived flags — the client never decides
 * who may change visibility or buy; the server checks again on every action.
 *
 * - who can see: only whoever controls the keepsake (canManage, from src/authz). Everyone else can't
 *   change it, so they don't get the button.
 * - make something: anyone the family lets order (canBuy: VIEW_BUY / CONTRIBUTE — VIEW is look-only),
 *   and never while a report is holding the keepsake (it's never printed meanwhile, D8).
 */
export function keepsakeTileActions(k: { canManage: boolean; held: boolean }, canBuy: boolean): { whoCanSee: boolean; makeSomething: boolean } {
  return { whoCanSee: k.canManage, makeSomething: canBuy && !k.held };
}

/** What a keepsake is called in its buttons' labels — the child's first name when it's filed, never a surname. */
export function keepsakeTileName(childFirstName: string | null | undefined, when: string): string {
  return childFirstName ? `${childFirstName}’s keepsake from ${when}` : `the keepsake from ${when}`;
}
