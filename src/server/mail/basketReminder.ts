import { createHmac, timingSafeEqual } from 'node:crypto';
import { claimSecret } from '@/server/uploadClaims';
import { appUrl, type MailMessage } from './index';
import { firstNameOf } from './words';

/**
 * "You left something in your basket" (founder, 25 Nov 2026): ONE kind nudge, a day after a signed-in
 * shopper leaves things unpaid (src/server/savedBasket.ts decides who and when).
 *
 * What it carries: their first name, the product names and how many — never a child's name, never a
 * picture (a lock screen or a shared inbox shows the subject to anyone nearby, so the subject names nothing).
 * Every one has a real off switch: a link that works without signing in, plus the List-Unsubscribe headers
 * mail apps use for their own one-tap "unsubscribe" (RFC 8058). It is a marketing email under PECR, sent on
 * the soft opt-in (they're a customer, mid-purchase, and told at the basket); the off switch withdraws it.
 */

const sign = (accountId: string) => createHmac('sha256', `basket-reminders-off:${claimSecret()}`).update(accountId).digest('base64url');

export function basketReminderOffToken(accountId: string): string {
  return `${accountId}.${sign(accountId)}`;
}

/** The account id a token was made for, or null when it's been tampered with. */
export function readBasketReminderOffToken(token: string): string | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(id));
  return mac.length === want.length && timingSafeEqual(mac, want) ? id : null;
}

export function basketReminderOffLinks(accountId: string): { page: string; oneClick: string; headers: Record<string, string> } {
  const token = basketReminderOffToken(accountId);
  const oneClick = appUrl(`/api/basket-reminders/off/${token}`);
  return {
    page: appUrl(`/basket-reminders/off/${token}`),
    oneClick,
    headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** How many names the email lists before "and N more". */
const LISTED = 3;

export interface BasketReminderInput {
  accountId: string;
  to: string;
  displayName: string | null;
  /** product names, one per line, in basket order (already in the shop's own words) */
  names: string[];
  /** how many things in all (quantities added up) */
  count: number;
  /** "order by thu 10 dec and it all arrives by christmas" — only in season, only while it's true */
  christmasLine?: string | null;
}

export function basketReminderEmail(p: BasketReminderInput): MailMessage {
  const hello = firstNameOf(p.displayName);
  const off = basketReminderOffLinks(p.accountId);
  const url = appUrl('/checkout');
  const shown = p.names.slice(0, LISTED);
  const more = p.count - shown.length;
  const bullets = [...shown, ...(more > 0 ? [`and ${more} more`] : [])];
  const intro = `Just a friendly little nudge: you left ${p.count === 1 ? 'something lovely' : 'some lovely things'} in your basket.`;
  const safe = `${p.count === 1 ? 'It’s' : 'They’re'} saved on your account, and the drawings haven’t gone anywhere.`;
  const noRush = 'No rush at all. They’re only little once, but your basket will wait.';
  const offLine = 'Don’t want basket reminders? Turn them off here, no need to sign in:';
  return {
    kind: 'basket-reminder',
    to: p.to,
    headers: off.headers,
    subject: 'psst… your basket’s still holding on to something lovely ✦',
    text:
      `${hello ? `Hello ${hello},` : 'Hello,'}\n\n${intro}\n\n` +
      bullets.map((b) => `• ${b}`).join('\n') +
      `\n\n${safe}${p.christmasLine ? ` ${cap(p.christmasLine)}.` : ''}\n\nPick up where you left off: ${url}\n\n${noRush}\n\n— the snickerdoodle team\n\n${offLine} ${off.page}`,
    html: page({ hello, intro, bullets, safe, christmasLine: p.christmasLine ?? null, url, noRush, offLine, offUrl: off.page }),
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const FONT = "'Bricolage Grotesque', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Email clients can't read our CSS tokens: the brand colours are written out (src/app/globals.css @theme), inline. */
function page(p: { hello: string | null; intro: string; bullets: string[]; safe: string; christmasLine: string | null; url: string; noRush: string; offLine: string; offUrl: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>your basket’s waiting</title></head>
<body style="margin:0;padding:0;background:#F8F5E9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F5E9;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#FFFBF2;border:2px solid #2B2118;border-radius:22px;">
<tr><td style="padding:28px 26px 8px;font-family:${FONT};color:#2B2118;">
<p style="margin:0;font-size:15px;font-weight:800;letter-spacing:.2px;color:#A8331F;">snickerdoodle</p>
<h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;font-weight:800;color:#2B2118;">${esc(p.hello ? `${p.hello}, your basket’s waiting` : 'your basket’s waiting')} ✦</h1>
<p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#5A4A3A;">${esc(p.intro)}</p>
</td></tr>
<tr><td style="padding:12px 26px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6EEDF;border:2px dashed #D9C7A9;border-radius:16px;"><tr><td style="padding:12px 16px;font-family:${FONT};font-size:15px;line-height:1.7;color:#2B2118;font-weight:700;">
${p.bullets.map((b) => `&#10022;&nbsp; ${esc(b)}`).join('<br>')}
</td></tr></table>
</td></tr>
<tr><td style="padding:14px 26px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#5A4A3A;">
${esc(p.safe)}${p.christmasLine ? `<br><b style="color:#3F6E29;">${esc(cap(p.christmasLine))}.</b>` : ''}
</td></tr>
<tr><td align="center" style="padding:22px 26px 6px;">
<a href="${esc(p.url)}" style="display:inline-block;background:#C8402A;color:#ffffff;font-family:${FONT};font-size:17px;font-weight:800;text-decoration:none;padding:15px 30px;border-radius:999px;border:2px solid #2B2118;">back to my basket</a>
</td></tr>
<tr><td style="padding:18px 26px 26px;font-family:${FONT};font-size:13px;line-height:1.5;color:#6E5D4B;">
${esc(p.noRush)}<br><br>&mdash; the snickerdoodle team<br><br>
<span style="font-size:12px;">${esc(p.offLine)} <a href="${esc(p.offUrl)}" style="color:#A8331F;">turn them off</a></span>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
