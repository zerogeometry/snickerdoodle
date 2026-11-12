'use client';

import { IconMail, IconShieldCheck, IconSparkles } from '@tabler/icons-react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { rememberKeepAction } from '@/app/actions/keep';
import { localPath } from '@/lib/siteMode';
import { normalizeSignInCode, SIGN_IN_CODE_MINUTES } from '@/lib/signInCode';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';

/** The last code typed in this tab (sessionStorage: this tab only, gone when it closes), so a typo can come back to
 * the code box. Ignored after the code's own 15 minutes. */
type CodeTry = { email: string; search: string; at: number };
const CODE_TRY_KEY = 'sd-sign-in-code-try';

function saveCodeTry(t: CodeTry) {
  try {
    sessionStorage.setItem(CODE_TRY_KEY, JSON.stringify(t));
  } catch {
    // private mode: a typo just means starting again
  }
}

function readCodeTry(): CodeTry | null {
  try {
    const raw = sessionStorage.getItem(CODE_TRY_KEY);
    sessionStorage.removeItem(CODE_TRY_KEY); // one use: a later dead link in this tab gets the usual note
    if (!raw) return null;
    const t = JSON.parse(raw) as CodeTry;
    if (typeof t.email !== 'string' || typeof t.search !== 'string' || Date.now() - t.at > SIGN_IN_CODE_MINUTES * 60_000) return null;
    return { ...t, search: t.search.startsWith('?') || t.search === '' ? t.search : '' };
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // the code from the email, typed here instead of tapping the button (src/auth/signInCode.ts)
  const [code, setCode] = useState('');
  const [codeProblem, setCodeProblem] = useState<'shape' | 'wrong' | null>(null);
  // back from a used / run-out / mistyped link or code, or too many tries (Auth.js's error page is this page)
  const [comeBack, setComeBack] = useState<string | null>(null);
  // a guest's "+ keepsake": the drawing to keep once they're signed in
  const [keepId, setKeepId] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    // A code that didn't match comes back here as ?error=Verification. If it was typed in this tab in the last few
    // minutes, put them straight back on the code box (same email, same ?next, e.g. the Draw app's connect page)
    // rather than making them start again. Kept in this tab only, never in the address.
    const tried = readCodeTry();
    if (q.get('error') === 'Verification' && tried) {
      window.history.replaceState(null, '', `/login${tried.search}`);
      setKeepId(new URLSearchParams(tried.search).get('keep'));
      setEmail(tried.email);
      setSent(true);
      setCodeProblem('wrong');
      return;
    }
    setKeepId(q.get('keep'));
    setComeBack(q.get('error'));
  }, []);

  // Where to land afterwards (?next): only internal paths, never an open redirect.
  const nextPath = () => localPath(new URLSearchParams(window.location.search).get('next')) ?? '/home';

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const typed = normalizeSignInCode(code);
    if (!typed) {
      setCodeProblem('shape');
      return;
    }
    saveCodeTry({ email, search: window.location.search, at: Date.now() });
    // Auth.js's own email check, the same one the button in the email opens: single use, this email only.
    const q = new URLSearchParams({ callbackUrl: nextPath(), token: typed, email: email.trim().toLowerCase() });
    // a full page load on purpose: this is Auth.js's route, which sets the session cookie and redirects
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/auth/callback/email?${q}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(false);
    try {
      // Land them back where they were headed (?next), e.g. the guest
      // place→keep→checkout flow. Only internal paths — never an open redirect.
      const next = nextPath();
      // Auth.js emails (here: logs) a one-tap magic link; identity is verified
      // when they open it. We stay on the page and show the "check your email" state.
      // ask the server to keep the drawing for THIS email (claim-checked) — it finishes only back in
      // THIS browser, which holds the drawing's upload claim (never by email alone, 07-B5).
      // Best-effort: sign-in goes ahead regardless.
      if (keepId) await rememberKeepAction(keepId, email.trim()).catch(() => null);
      const res = await signIn('email', { email: email.trim(), redirect: false, callbackUrl: next });
      // a refused send (e.g. too many links in a row) must not claim "check your email"
      if (res?.error) {
        setError(true);
        return;
      }
      setComeBack(null);
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
                We&apos;ve sent a magic link to <b className="text-cocoa">{email}</b>. Tap the button in it and you&apos;re
                in, or type the code from the email here.
              </p>
              <form onSubmit={submitCode} className="mt-4 text-left">
                <label htmlFor="login-code" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
                  the code from the email
                </label>
                <input
                  id="login-code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setCodeProblem(null);
                  }}
                  placeholder="K7MP-42QX"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  maxLength={12}
                  aria-invalid={!!codeProblem}
                  aria-describedby="login-code-help"
                  className="min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-3 text-center font-mono text-xl tracking-[0.2em] text-cocoa placeholder:text-ink-faint/60 focus:border-cocoa"
                />
                <p id="login-code-help" className={`mt-1.5 text-center text-xs ${codeProblem ? 'font-semibold text-cinnamon' : 'text-ink-soft'}`} role={codeProblem ? 'alert' : undefined}>
                  {codeProblem === 'wrong'
                    ? 'that code didn’t match, or it has run out. check it against the email and try again.'
                    : codeProblem === 'shape'
                      ? 'that doesn’t look quite right. it’s 8 letters and numbers, like K7MP-42QX.'
                      : `it works for ${SIGN_IN_CODE_MINUTES} minutes`}
                </p>
                <Button type="submit" size="lg" className="mt-3 w-full">
                  sign me in
                </Button>
              </form>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setCode('');
                }}
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
              {comeBack ? (
                <p role="alert" className="mt-3 rounded-[14px] bg-honey-band px-3 py-2 text-center text-xs font-semibold text-cocoa">
                  {comeBack === 'TooManyTries'
                    ? 'lots of tries in a row, so we’ve paused signing in for a little while. give it 15 minutes and ask for a fresh email.'
                    : comeBack === 'Verification'
                      ? 'that link or code has been used already, has run out, or didn’t match. pop your email in for a fresh one.'
                      : 'something went wonky signing you in. pop your email in and we’ll send a fresh one.'}
                </p>
              ) : null}
              {keepId ? (
                <p className="mt-3 rounded-[14px] bg-leaf-pale px-3 py-2 text-center text-xs font-semibold text-green-save">
                  open the link on this device and your drawing goes straight into your keepsake box ♥
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
                  <p role="alert" className="mt-2 text-center text-xs font-semibold text-cinnamon">we couldn’t send a link just now — give it a few minutes and try again.</p>
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
