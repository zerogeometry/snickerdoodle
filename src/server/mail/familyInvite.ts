import { containsAbusiveText } from '@/server/textSafety';
import { appUrl, type MailMessage } from './index';
import { familyLabel, firstNameOf } from './words';

/**
 * The family invite (and its resend). Says who it's from — the inviting parent's FIRST NAME only (no
 * surname, and not the family's name, which is often one) — so it never reads like a stranger's
 * email (sweep 04-B11). The sender shows as "Sam via snickerdoodle" in the inbox for the same reason.
 * The greeting uses the first name the parent typed in the invite sheet, screened.
 *
 * Joining takes a second email (the one-tap sign-in link that proves the address is theirs), so this
 * one says so — an expected email is far less likely to be ignored or binned. Plain text, our own
 * domain for every link, no tracking, a sign-off and a way to reach a person.
 */
export function familyInviteEmail(input: {
  to: string;
  token: string;
  inviterName: string | null;
  inviteeName?: string | null;
  resend?: boolean;
}): MailMessage {
  const from = firstNameOf(input.inviterName);
  const typed = firstNameOf(input.inviteeName);
  const hi = typed && !containsAbusiveText(typed) ? `Hi ${typed},` : 'Hi there,';
  const where = `${from ? 'their' : 'a'} family’s private keepsake box on snickerdoodle`;
  const who = from ? `${from} has invited you to join` : 'You’ve been invited to join';
  return {
    kind: 'family-invite',
    to: input.to.trim().toLowerCase(),
    onBehalfOf: from,
    subject: `${input.resend ? 'a little reminder: ' : ''}${from ? `${from} invited you to their` : 'you’re invited to a'} family keepsake box`,
    text:
      `${hi}\n\n` +
      `${who} ${where}, where the little ones’ drawings are kept safe.\n\n` +
      `Tap to join (it's just for you, and lasts 14 days):\n${appUrl(`/join/${input.token}`)}\n\n` +
      `To check it's really you, we'll then email you a one-tap sign-in link — no password needed.\n\n` +
      `Nothing is ever public — only the family you join can see what's inside.\n` +
      `Not expecting this? You can ignore it — nothing happens unless you tap the link.\n\n` +
      `— the snickerdoodle team, on behalf of ${from ? familyLabel(from) : 'the family who invited you'}\n` +
      `Questions? Just reply — it comes straight to us.`,
  };
}
