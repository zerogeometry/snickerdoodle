'use client';

import { IconMail, IconShieldCheck, IconSparkles } from '@tabler/icons-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { rememberKeepAction } from '@/app/actions/keep';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // a guest's "+ keepsake": the drawing to keep once they're signed in
  const [keepId, setKeepId] = useState<string | null>(null);
  useEffect(() => setKeepId(new URLSearchParams(window.location.search).get('keep')), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(false);
    try {
      // Land them back where they were headed (?next), e.g. the guest
      // place→keep→checkout flow. Only internal paths — never an open redirect.
      const raw = new URLSearchParams(window.location.search).get('next');
      const next = raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/home';
      // Auth.js emails (here: logs) a one-tap magic link; identity is verified
      // when they open it. We stay on the page and show the "check your email" state.
      // ask the server to keep the drawing for THIS email (claim-checked) — it finishes on whichever
      // device the link is opened on. Best-effort: sign-in goes ahead regardless.
      if (keepId) await rememberKeepAction(keepId, email.trim()).catch(() => null);
      await signIn('email', { email: email.trim(), redirect: false, callbackUrl: next });
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: '/', label: 'Back to home' }} />

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {sent ? (
            <div role="status" className="pop-in tape rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]">
              <div className="sticker mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-leaf-pale">
                <Icon icon={IconMail} size={30} className="text-green-save" />
              </div>
              <h1 className="mt-4 font-display text-[28px] leading-tight text-cocoa">Check your email</h1>
              <p className="mt-2 text-sm text-ink-soft">
                We&apos;ve sent a magic link to <b className="text-cocoa">{email}</b>. Tap it and you&apos;re in — no
                password to remember.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-4 inline-flex min-h-11 items-center text-xs font-bold text-cinnamon hover:underline"
              >
                use a different email
              </button>
            </div>
          ) : (
            <div className="pop-in tape rounded-[22px] border-2 border-cocoa bg-paper p-7 shadow-[0_4px_0_var(--color-cocoa)]">
              <CaveatNote className="-rotate-2 text-center text-xl">hello there</CaveatNote>
              <h1 className="mt-1 text-center font-display text-[28px] leading-tight text-cocoa">Your keepsake home, one tap away</h1>
              <p className="mt-2 text-center text-sm text-ink-soft">
                New or coming back — pop in your email and we&apos;ll send a one-tap link. No passwords here.
              </p>
              {keepId ? (
                <p className="mt-3 rounded-[14px] bg-leaf-pale px-3 py-2 text-center text-xs font-semibold text-green-save">
                  tap the link and your drawing goes straight into your keepsake box ♥
                </p>
              ) : null}
              <form onSubmit={submit} className="mt-5">
                <label htmlFor="login-email" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-3 text-base text-cocoa placeholder:text-ink-faint focus:border-cocoa"
                />
                <Button type="submit" size="lg" className="mt-3 w-full" disabled={busy}>
                  <Icon icon={IconSparkles} size={16} /> {busy ? 'sending…' : 'email me a magic link'}
                </Button>
                {error ? (
                  <p role="alert" className="mt-2 text-center text-xs font-semibold text-cinnamon">Something went wrong — please try again.</p>
                ) : null}
              </form>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-green-save">
                <Icon icon={IconShieldCheck} size={13} /> Your data is yours. We never sell it, ever.
              </p>
              <p className="mt-3 text-center text-xs text-ink-soft">
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
