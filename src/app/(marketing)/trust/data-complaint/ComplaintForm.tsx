'use client';

import { IconCircleCheck } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { submitComplaintAction } from '@/app/actions/complaint';

/**
 * The s.164A complaint form. Posts to the rights-request intake (recorded with its due date,
 * acknowledged by email straight away); only shows "we've got it" once that has really happened.
 */
export function ComplaintForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — hidden from people
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitComplaintAction({ name, email, message, website });
      if (res.ok) return setSent(res.ref ?? '');
      setError(
        res.reason === 'invalid'
          ? 'please add your name, a working email, and a few words about what happened'
          : res.reason === 'too-many'
            ? 'we’ve already had a few from this email today — we’re on it, and we’ll be in touch'
            : 'that didn’t send — please try again, or email us instead',
      );
    });
  };

  if (sent !== null) {
    return (
      <div role="status" className="pop-in tape mt-8 rounded-[22px] border-2 border-cocoa bg-leaf-pale p-6 shadow-[0_4px_0_var(--color-cocoa)]">
        <div className="flex items-center gap-2.5">
          <Icon icon={IconCircleCheck} size={24} className="text-green-save" />
          <h2 className="font-display text-xl text-cocoa">Thank you — we&apos;ve got it</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We&apos;ve emailed an acknowledgement to <b className="text-cocoa">{email || 'you'}</b>
          {sent ? (
            <>
              {' '}
              (your reference is <b className="text-cocoa">{sent}</b>)
            </>
          ) : null}
          . A real person handles every one of these, and we&apos;ll keep you posted on the outcome.
        </p>
      </div>
    );
  }

  return (
    <form className="relative mt-8 space-y-4 rounded-[22px] border-2 border-cocoa/15 bg-paper p-5 md:p-6" onSubmit={submit}>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-bold text-cocoa">Your name</span>
        <input
          type="text"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-2.5 text-base text-cocoa placeholder:text-ink-faint focus:border-cocoa"
          placeholder="First and last name"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-bold text-cocoa">Your email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-2.5 text-base text-cocoa placeholder:text-ink-faint focus:border-cocoa"
          placeholder="so we can reply"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-bold text-cocoa">What&apos;s your complaint about?</span>
        <textarea
          name="message"
          rows={6}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-2.5 text-base text-cocoa placeholder:text-ink-faint focus:border-cocoa"
          placeholder="Tell us what happened, in your own words."
        />
      </label>
      {/* honeypot: off-screen + out of the tab order; people never fill it */}
      <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      {error ? (
        <p role="alert" className="border-l-2 border-berry pl-2 text-[13px] font-semibold text-cocoa">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? 'sending…' : 'send complaint'}
      </Button>
    </form>
  );
}
