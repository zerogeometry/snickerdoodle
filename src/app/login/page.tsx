'use client';

import { IconArrowLeft, IconMail, IconShieldCheck, IconSparkles } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center gap-3 border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" aria-label="Back to home">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
        </Link>
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">
          snickerdoodle
        </Link>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF1E4]">
                <Icon icon={IconMail} size={30} className="text-green-save" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-semibold text-cocoa">Check your email</h1>
              <p className="mt-2 text-sm text-[#6F6358]">
                We&apos;ve sent a magic link to <b className="text-cocoa">{email}</b>. Tap it and you&apos;re in — no
                password to remember.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-5 text-xs font-bold text-cinnamon hover:underline"
              >
                use a different email
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#EADFC9] bg-white p-7">
              <CaveatNote className="text-center text-lg">welcome back</CaveatNote>
              <h1 className="mt-1 text-center font-display text-2xl font-semibold text-cocoa">Log in to your keepsake home</h1>
              <p className="mt-2 text-center text-sm text-[#6F6358]">
                Pop in your email and we&apos;ll send a one-tap link. No passwords here.
              </p>
              <form onSubmit={submit} className="mt-5">
                <label htmlFor="login-email" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-3 text-sm text-cocoa placeholder:text-[#A89B8C]"
                />
                <Button type="submit" size="lg" className="mt-3 w-full">
                  <Icon icon={IconSparkles} size={16} /> email me a magic link
                </Button>
              </form>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-green-save">
                <Icon icon={IconShieldCheck} size={13} /> Your data is yours. We never sell it, ever.
              </p>
              <p className="mt-3 text-center text-xs text-[#7A6A58]">
                New here?{' '}
                <Link href="/start-creating" className="font-bold text-cinnamon">
                  start creating
                </Link>{' '}
                — no account needed.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
