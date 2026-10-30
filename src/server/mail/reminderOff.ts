import { createHmac, timingSafeEqual } from 'node:crypto';
import { claimSecret } from '@/server/uploadClaims';
import { appUrl } from './index';

/**
 * The reminder email's off switch (sweep 04-B10): a link that works WITHOUT signing in, plus the
 * List-Unsubscribe headers mail apps use for their own one-tap "unsubscribe" (RFC 8058). The token
 * is the account id signed with the app secret — unguessable, only ever in that person's own email,
 * and all it can do is turn their reminders OFF.
 */
const sign = (accountId: string) => createHmac('sha256', `reminders-off:${claimSecret()}`).update(accountId).digest('base64url');

export function reminderOffToken(accountId: string): string {
  return `${accountId}.${sign(accountId)}`;
}

/** The account id a token was made for, or null when it's been tampered with. */
export function readReminderOffToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(id));
  return mac.length === want.length && timingSafeEqual(mac, want) ? id : null;
}

export function reminderOffLinks(accountId: string): { page: string; oneClick: string; headers: Record<string, string> } {
  const token = reminderOffToken(accountId);
  const oneClick = appUrl(`/api/reminders/off/${token}`);
  return {
    page: appUrl(`/reminders/off/${token}`),
    oneClick,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}
