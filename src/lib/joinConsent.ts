import type { Circle } from '@/domain/types';

/**
 * The joiner's "yes" on the join card (D27, founder 10 Nov 2026). Joining no longer happens silently: the card says
 * who looks after the family's keepsakes and details, and that what you add stays yours to share. For HOME the
 * joiner accepts that the family leader is responsible for them (the controller) — founder: "anyone who joins the
 * nuclear family (husband, wife, adult children) is consenting to the family leader being responsible."
 *
 * The version is stored on the membership with the moment they said yes. Change the words → bump the version.
 */
export const JOIN_CONSENT_VERSION = 'join-2026-11-10';

export interface JoinCard {
  heading: string;
  /** what they'll see */
  sees: string;
  /** the consent line itself */
  consent: string;
  button: string;
}

const CIRCLE_NAME: Record<Circle, string> = { HOME: 'home', FAMILY: 'family circle', EXTENDED: 'extended family' };

/**
 * The card's words. `leader` is the family leader's first name (or "the family lead"), `family` the family's name as
 * relatives know it (or null).
 */
export function joinCard(circle: Circle, leader: string | null, family: string | null, opts: { moving?: boolean } = {}): JoinCard {
  const who = leader?.trim() || 'the family lead';
  if (circle === 'HOME') {
    return {
      heading: leader?.trim() ? `join ${leader.trim()}’s home` : 'join the home',
      sees: 'home is the closest circle: you’ll see what’s shared with home, family and extended.',
      consent: `by joining, you’re happy for ${who} to look after the family’s keepsakes and details (they’re the grown-up responsible for them). anything you add stays yours to share, or not. you can leave any time.`,
      button: opts.moving ? 'yes, move into the home' : 'yes, join the home',
    };
  }
  return {
    heading: family ? `join ${family}` : 'join the family',
    sees: `you’ll see the keepsakes ${who} shares with the ${CIRCLE_NAME[circle]}.`,
    consent: `${who} looks after the family’s keepsakes and details. anything you add, you choose who sees. you can leave any time.`,
    button: 'yes, join the family',
  };
}
