/**
 * The little buttons on a keepsake at home: the person ("whose corner" — founder, 17 Nov), the eye ("who can
 * see") and the basket ("make something with it" — 10 Nov). All come from server-derived flags — the client
 * never decides who may file, change visibility or buy; the server checks again on every action.
 *
 * - whose corner: only when src/authz says this person may file it (whoever added it; or, once it's in their
 *   child's corner, that child's parent) — `filing` is null for everyone else.
 *
 * - who can see: only whoever controls the keepsake (canManage, from src/authz). Everyone else can't
 *   change it, so they don't get the button.
 * - make something: anyone the family lets order (canBuy: VIEW_BUY / CONTRIBUTE — VIEW is look-only),
 *   and never while a report is holding the keepsake (it's never printed meanwhile, D8).
 */
export function keepsakeTileActions(
  k: { canManage: boolean; held: boolean; filing?: { childIds: string[]; canUnfile: boolean } | null },
  canBuy: boolean,
): { fileIt: boolean; whoCanSee: boolean; makeSomething: boolean } {
  return { fileIt: !!k.filing, whoCanSee: k.canManage, makeSomething: canBuy && !k.held };
}

/** What a keepsake is called in its buttons' labels — the child's first name when it's filed, never a surname. */
export function keepsakeTileName(childFirstName: string | null | undefined, when: string): string {
  return childFirstName ? `${childFirstName}’s keepsake from ${when}` : `the keepsake from ${when}`;
}
