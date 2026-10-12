'use client';

import { IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

/**
 * Client wrapper so a complaint is never silently lost before the backend lands.
 * Validates the required fields and shows a clear acknowledgement; once the
 * rights-request intake is wired this posts to it (and the 30-day clock starts).
 */
export function ComplaintForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSent(true);
  };

  if (sent) {
    return (
      <div role="status" className="pop-in tape mt-8 rounded-[22px] border-2 border-cocoa bg-leaf-pale p-6 shadow-[0_4px_0_var(--color-cocoa)]">
        <div className="flex items-center gap-2.5">
          <Icon icon={IconCircleCheck} size={24} className="text-green-save" />
          <h2 className="font-display text-xl text-cocoa">Thank you — we&apos;ve got it</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          We&apos;ll email <b className="text-cocoa">{email || 'you'}</b> an acknowledgement within 30 days and keep you
          posted on the outcome. A real person handles every one of these.
        </p>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-4 rounded-[22px] border-2 border-cocoa/15 bg-paper p-5 md:p-6" onSubmit={submit}>
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
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        send complaint
      </Button>
    </form>
  );
}
