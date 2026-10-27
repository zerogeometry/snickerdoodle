'use client';

import { IconMailHeart } from '@tabler/icons-react';
import Link from 'next/link';
import { useId, useState, useTransition } from 'react';
import { joinWaitlistAction } from '@/app/actions/waitlist';
import { WAITLIST_CONSENT_WORDING, normaliseWaitlistEmail } from '@/lib/waitlist';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { TrustLine } from '@/ui/primitives/TrustLine';

/**
 * The "founding families" sign-up (P0 L · PECR). Email only. The marketing tick-box is its own,
 * unticked, specific choice — nothing else rides on it, and there's no terms box bundled in.
 * We only say "check your inbox": whether an address was already on the list is never revealed.
 */
export function WaitlistSignup() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot — hidden from people
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = normaliseWaitlistEmail(email);
    if (!clean) return setError('that email doesn’t look quite right — mind checking it?');
    if (!consent) return setError('tick the box so we know it’s ok to email you — that’s all we need');
    startTransition(async () => {
      const res = await joinWaitlistAction({ email: clean, consent, website });
      if (res.ok) return setSentTo(clean);
      setError(
        res.reason === 'invalid-email'
          ? 'that email doesn’t look quite right — mind checking it?'
          : res.reason === 'needs-consent'
            ? 'tick the box so we know it’s ok to email you — that’s all we need'
            : res.reason === 'too-many'
              ? 'lots of sign-ups from here just now — give it a few minutes and try again'
              : 'that didn’t go through — please try again in a moment',
      );
    });
  };

  if (sentTo) {
    return (
      <div role="status" className="pop-in rounded-[18px] border-2 border-leaf bg-leaf-pale p-5">
        <div className="flex items-center gap-2.5">
          <Icon icon={IconMailHeart} size={24} className="text-green-save" />
          <h3 className="font-display text-xl text-cocoa">nearly there — check your inbox</h3>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We&apos;ve sent a link to <b className="text-cocoa">{sentTo}</b>. Tap it to say yes and you&apos;re in. Nothing
          else lands in your inbox until you do.
        </p>
      </div>
    );
  }

  return (
    <form className="relative space-y-4" onSubmit={submit} noValidate aria-describedby={error ? `${id}-err` : undefined}>
      <label className="block" htmlFor={`${id}-email`}>
        <span className="mb-1.5 block text-[13px] font-bold text-cocoa">Your email</span>
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-2.5 text-base text-cocoa placeholder:text-ink-faint focus:border-cocoa"
          placeholder="you@example.com"
        />
      </label>

      {/* the PECR consent: separate, unticked, and says exactly what they'll get */}
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[14px] border-2 border-dashed border-line bg-paper-2 p-3 text-[13px] leading-relaxed text-cocoa">
        <input
          type="checkbox"
          name="marketing-consent"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-cta"
        />
        <span>{WAITLIST_CONSENT_WORDING}</span>
      </label>

      {/* honeypot: off-screen + out of the tab order; people never fill it */}
      <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>

      {error ? (
        <p id={`${id}-err`} role="alert" className="border-l-2 border-berry pl-2 text-[13px] font-semibold text-cocoa">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button type="submit" size="lg" className="w-full shrink-0 whitespace-nowrap sm:w-auto" disabled={pending}>
          {pending ? 'saving your spot…' : 'save my spot'}
        </Button>
        <TrustLine>
          just your email — nothing about your little ones.{' '}
          <Link href="/trust/privacy" className="text-cinnamon underline">
            privacy
          </Link>
        </TrustLine>
      </div>
    </form>
  );
}
