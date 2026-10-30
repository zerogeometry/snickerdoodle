import { appUrl, type MailMessage } from './index';
import { accessWords, circleWords, familyLabel, firstNameOf, RELATIONSHIP_WORDS } from './words';
import type { AccessLevel, Circle, Relationship } from '@/domain/types';
import { withArticle } from '@/lib/articles';

/**
 * The family's "something changed" emails (sweep 04, founder: send them all). Each goes to ONE
 * person — the controlling parent when someone joins; the member themself when they're removed or
 * their circle/access changes. None of them names a child, shows a picture, lists keepsakes, or
 * uses the family's own name (often a surname) — the parent is named by first name only.
 */

/** To the controlling parent: someone accepted their invite. */
export function memberJoinedEmail(input: {
  to: string;
  parentName: string | null;
  joinerName: string | null;
  joinerEmail: string;
  relationship: Relationship;
  circle: Circle;
  accessLevel: AccessLevel;
}): MailMessage {
  const hi = firstNameOf(input.parentName);
  const named = firstNameOf(input.joinerName);
  const who = named ?? input.joinerEmail; // the address the parent invited
  return {
    kind: 'family-joined',
    to: input.to,
    subject: `${who} joined your family keepsake box ✦`,
    text:
      `${hi ? `Hi ${hi},` : 'Hi,'}\n\n` +
      `Good news — ${named ? `${named} (${input.joinerEmail})` : input.joinerEmail} accepted your invite and joined your family as ${withArticle(RELATIONSHIP_WORDS[input.relationship])}.\n\n` +
      `They're ${circleWords(input.circle)}. They can ${accessWords(input.accessLevel)}.\n\n` +
      `You're always in control — change what they can see or do, or remove them, any time:\n${appUrl('/family')}`,
  };
}

/** To the member: the parent took them out of the family. */
export function memberRemovedEmail(input: { to: string; memberName: string | null; ownerName: string | null }): MailMessage {
  const hi = firstNameOf(input.memberName);
  const owner = firstNameOf(input.ownerName);
  return {
    kind: 'family-removed',
    to: input.to,
    subject: `you’re no longer in ${familyLabel(owner)} on snickerdoodle`,
    text:
      `${hi ? `Hi ${hi},` : 'Hi,'}\n\n` +
      `Just so you know — ${owner ?? 'the parent who looks after it'} has taken you out of their family keepsake box, so it won’t show up for you any more.\n\n` +
      `There's nothing you need to do. If you think it's a mistake, it's best to ask them directly.\n\n` +
      `Your own snickerdoodle account is still here, and anything of your own is untouched: ${appUrl('/account')}`,
  };
}

/** To the member: what they see (circle) and/or can do (access) changed. Only sent when something did. */
export function memberAccessChangedEmail(input: {
  to: string;
  memberName: string | null;
  ownerName: string | null;
  circle: Circle;
  accessLevel: AccessLevel;
}): MailMessage {
  const hi = firstNameOf(input.memberName);
  const owner = firstNameOf(input.ownerName);
  return {
    kind: 'family-access-changed',
    to: input.to,
    subject: `a little change to your place in ${familyLabel(owner)}`,
    text:
      `${hi ? `Hi ${hi},` : 'Hi,'}\n\n` +
      `${owner ?? 'The parent who looks after it'} has changed your place in their family keepsake box on snickerdoodle.\n\n` +
      `You're now ${circleWords(input.circle)}, and you can ${accessWords(input.accessLevel)}.\n\n` +
      `Pop in any time: ${appUrl('/home')}`,
  };
}
