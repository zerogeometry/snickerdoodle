import type { MailMessage } from './index';
import { familyLabel } from './words';
import { formatSignInCode, SIGN_IN_CODE_MINUTES } from '@/lib/signInCode';

/**
 * The sign-in email: a "sign me in" button (founder, 12 Nov 2026: a button, not a massive link) and, under it, the
 * sign-in code to type into the "check your email" card instead (src/auth/signInCode.ts). The plain-text part keeps
 * the link for mail apps that can't show a button.
 *
 * On the way into a family it says whose family, by the inviting parent's first name (and shows as "Sam via
 * snickerdoodle"), so the invitee's second email reads as the next step of an invite they've just opened.
 *
 * Email clients can't read our CSS tokens, so the brand colours are written out here (oat, paper, cocoa, ink-soft,
 * tomato, line — src/app/globals.css @theme) as inline styles, the only thing every mail app understands.
 */
export function signInEmail({ to, url, code, inviter }: { to: string; url: string; code: string; inviter: string | null }): MailMessage {
  const pretty = formatSignInCode(code);
  const signOff = '— the snickerdoodle team';
  const codeLine = `Or type this code on the "check your email" page: ${pretty} (it works for ${SIGN_IN_CODE_MINUTES} minutes).`;
  if (inviter) {
    const family = familyLabel(inviter);
    return {
      kind: 'magic-link',
      to,
      onBehalfOf: inviter,
      subject: `your link to join ${family} on snickerdoodle`,
      text: `Here's your one-tap link to join ${family} keepsake box. It works once, for the next hour:\n${url}\n\n${codeLine}\n\nYou asked for this from the invite ${inviter} sent you. If you didn't, you can safely ignore it.\n\n${signOff}`,
      html: page({
        heading: `join ${family}`,
        intro: `Tap the button to join ${family} keepsake box. It works once, for the next hour.`,
        button: 'join the family',
        url,
        pretty,
        footer: `You asked for this from the invite ${inviter} sent you. If you didn't, you can safely ignore it.`,
      }),
    };
  }
  return {
    kind: 'magic-link',
    to,
    subject: 'your one-tap link to snickerdoodle',
    text: `Here's your one-tap link. It works once, for the next hour:\n${url}\n\n${codeLine}\n\nDidn't ask for this? You can safely ignore it.\n\n${signOff}`,
    html: page({
      heading: 'your one-tap sign-in',
      intro: 'Tap the button and you’re in. It works once, for the next hour. No password to remember.',
      button: 'sign me in',
      url,
      pretty,
      footer: 'Didn’t ask for this? You can safely ignore it.',
    }),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const FONT = "'Bricolage Grotesque', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function page(p: { heading: string; intro: string; button: string; url: string; pretty: string; footer: string }): string {
  const url = esc(p.url);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(p.heading)}</title></head>
<body style="margin:0;padding:0;background:#F8F5E9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F5E9;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#FFFBF2;border:2px solid #2B2118;border-radius:22px;">
<tr><td style="padding:28px 26px 8px;font-family:${FONT};color:#2B2118;">
<p style="margin:0;font-size:15px;font-weight:800;letter-spacing:.2px;color:#A8331F;">snickerdoodle</p>
<h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;font-weight:800;color:#2B2118;">${esc(p.heading)}</h1>
<p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#5A4A3A;">${esc(p.intro)}</p>
</td></tr>
<tr><td align="center" style="padding:20px 26px 6px;">
<a href="${url}" style="display:inline-block;background:#C8402A;color:#ffffff;font-family:${FONT};font-size:17px;font-weight:800;text-decoration:none;padding:15px 30px;border-radius:999px;border:2px solid #2B2118;">${esc(p.button)}</a>
</td></tr>
<tr><td style="padding:18px 26px 4px;font-family:${FONT};color:#5A4A3A;font-size:14px;line-height:1.5;text-align:center;">
or type this code on the &ldquo;check your email&rdquo; page:
</td></tr>
<tr><td align="center" style="padding:6px 26px 4px;">
<p style="margin:0;display:inline-block;background:#F6EEDF;border:2px dashed #D9C7A9;border-radius:14px;padding:10px 18px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:4px;color:#2B2118;">${esc(p.pretty)}</p>
<p style="margin:6px 0 0;font-family:${FONT};font-size:12px;color:#6E5D4B;">the code works for ${SIGN_IN_CODE_MINUTES} minutes</p>
</td></tr>
<tr><td style="padding:20px 26px 26px;font-family:${FONT};font-size:13px;line-height:1.5;color:#6E5D4B;">
${esc(p.footer)}<br><br>&mdash; the snickerdoodle team
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
