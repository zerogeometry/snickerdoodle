import { appUrl, type MailMessage } from './index';
import { firstNameOf } from './words';

/**
 * Confirmations for the account's own data rights (sweep 04, founder): a heads-up when a copy of
 * their data is downloaded (so a download they didn't make doesn't go unnoticed), and a note when a
 * deletion they asked for is done. Sent only to the account's own address; no pictures, no
 * child's name, nothing from the data itself.
 */
const SUPPORT = 'support@snickerdoodle.co.uk';

const when = (at: Date) =>
  at.toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function dataExportEmail(input: { to: string; name: string | null; at: Date }): MailMessage {
  const hi = firstNameOf(input.name);
  return {
    kind: 'data-export',
    to: input.to,
    replyTo: SUPPORT,
    subject: 'your snickerdoodle data download',
    text:
      `${hi ? `Hi ${hi},` : 'Hi,'}\n\n` +
      `A copy of everything snickerdoodle holds about you was just downloaded from your account (${when(input.at)}).\n\n` +
      `If that was you, there's nothing more to do — just keep the file somewhere safe, as it has your family's details in it.\n\n` +
      `Wasn't you? Reply to this email and we'll help straight away. Your account: ${appUrl('/account')}`,
  };
}

/** "Delete all my keepsakes" is done. */
export function keepsakesDeletedEmail(input: { to: string; name: string | null; deleted: number }): MailMessage {
  const hi = firstNameOf(input.name);
  const n = input.deleted === 1 ? '1 keepsake' : `${input.deleted} keepsakes`;
  return {
    kind: 'data-deleted',
    to: input.to,
    replyTo: SUPPORT,
    subject: 'your keepsakes have been deleted',
    text:
      `${hi ? `Hi ${hi},` : 'Hi,'}\n\n` +
      `As you asked, we've deleted ${n} — the original pictures and every edit of them — from your keepsake box and our storage. This can't be undone.\n\n` +
      `Your account is still open, so you can start a fresh keepsake box whenever you like: ${appUrl('/start-creating')}\n\n` +
      `Didn't ask for this? Reply to this email and we'll look into it straight away.`,
  };
}

/** The account is closed. Sent to the address it had (captured before it was erased) — the last email we send. */
export function accountClosedEmail(input: { to: string; name: string | null }): MailMessage {
  const hi = firstNameOf(input.name);
  return {
    kind: 'data-deleted',
    to: input.to,
    replyTo: SUPPORT,
    subject: 'your snickerdoodle account is closed',
    text:
      `${hi ? `Hi ${hi},` : 'Hi,'}\n\n` +
      `As you asked, your snickerdoodle account is closed, and your keepsakes and family details have been erased.\n\n` +
      `We keep a bare record of past orders for the accounts, as the law asks — with no address and no pictures.\n\n` +
      `This is the last email you'll get from us. Thank you for keeping the magic with us.`,
  };
}
