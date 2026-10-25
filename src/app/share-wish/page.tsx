'use client';

import {
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconDots,
  IconGift,
  IconHome,
  IconLink,
  IconMail,
  IconMessage,
  IconShieldCheck,
  IconSparkles,
} from '@tabler/icons-react';
import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';

// The paper card each state sits on (Scrapbook D12).
const CARD = 'pop-in tape rounded-[22px] border-2 border-cocoa bg-paper p-7 shadow-[0_4px_0_var(--color-cocoa)]';
import { SUBJECT_KEY, toast, useBasket } from '@/lib/store';
import { createWishAction } from '@/app/actions/wish';

type State = 'minting' | 'needsAuth' | 'ready' | 'error' | 'empty' | 'badName';

const SHARE_MSG = 'A little gift list for you 🎁';
const SHARE: { label: string; icon: TablerIconComponent; href: (u: string) => string | null }[] = [
  { label: 'WhatsApp', icon: IconBrandWhatsapp, href: (u) => `https://wa.me/?text=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'Email', icon: IconMail, href: (u) => `mailto:?subject=${encodeURIComponent(SHARE_MSG)}&body=${encodeURIComponent(`${SHARE_MSG}\n\n${u}`)}` },
  { label: 'Text', icon: IconMessage, href: (u) => `sms:?&body=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'More', icon: IconDots, href: () => null },
];

export default function ShareWishPage() {
  const [state, setState] = useState<State>('minting');
  const [url, setUrl] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ran = useRef(false);

  const fullUrl = url ? `${typeof window !== 'undefined' ? window.location.origin : ''}${url}` : '';

  const mint = useCallback(async () => {
    // Read the basket fresh from the (persisted) store — the page may mount before
    // sessionStorage hydration completes, so the subscription value can lag.
    const items = useBasket.getState().items;
    const assetIds = [...new Set(items.map((i) => i.artwork?.assetId).filter((x): x is string => !!x))];
    if (assetIds.length === 0) {
      setState('empty');
      return;
    }
    const who = (() => {
      try {
        return sessionStorage.getItem(SUBJECT_KEY) ?? '';
      } catch {
        return '';
      }
    })();
    setSubject(who);
    setState('minting');
    // Guard against a hung server — fall to the error state rather than spin forever.
    const res = await Promise.race([
      createWishAction({ assetIds, subject: who || undefined }),
      new Promise<{ ok: boolean; needsAuth?: boolean; url?: string; reason?: 'name' }>((resolve) =>
        setTimeout(() => resolve({ ok: false }), 15000),
      ),
    ]).catch(() => ({ ok: false }) as { ok: boolean; needsAuth?: boolean; url?: string; reason?: 'name' });
    if (res.needsAuth) {
      setState('needsAuth');
      return;
    }
    if (res.reason === 'name') {
      setState('badName'); // server rejected the child's name (surname / abuse)
      return;
    }
    if (res.ok && res.url) {
      setUrl(res.url);
      setState('ready');
      try {
        sessionStorage.removeItem(SUBJECT_KEY); // consumed — don't leak into a later flow
      } catch {
        // ignore
      }
      return;
    }
    setState('error');
  }, []);

  // Mint once on load, but only AFTER the persisted basket has hydrated (else we'd
  // read an empty basket and show "nothing to share"). After the magic-link sign-up
  // returns here, this re-runs (fresh page load) now signed-in, so it completes.
  useEffect(() => {
    const run = () => {
      if (ran.current) return;
      ran.current = true;
      void mint();
    };
    if (useBasket.persist.hasHydrated()) {
      run();
      return;
    }
    const unsub = useBasket.persist.onFinishHydration(run);
    return unsub;
  }, [mint]);

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await signIn('email', { email: email.trim(), redirect: false, callbackUrl: '/share-wish' });
      setSent(true);
    } catch {
      toast('something went wrong — try again');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast('link copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('press and hold to copy the link');
    }
  };

  const share = async (label: string, href: string | null) => {
    if (label === 'More') {
      if (navigator.share) await navigator.share({ title: SHARE_MSG, url: fullUrl }).catch(() => {});
      else void copy();
      return;
    }
    if (href) window.open(href, '_blank', 'noopener');
  };

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: '/catalogue', label: 'Back to the range' }} />

      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        {state === 'minting' ? (
          // Loading: a gently pulsing gift sticker on its card — never a bare spinner.
          <div role="status" className={`${CARD} text-center`}>
            <div className="sticker mx-auto flex h-16 w-16 -rotate-6 animate-pulse items-center justify-center rounded-full bg-honey">
              <Icon icon={IconGift} size={30} className="text-cocoa" />
            </div>
            <p className="mt-4 text-sm text-ink-soft">tucking these into your keepsake box…</p>
            <div className="mx-auto mt-4 h-11 w-full animate-pulse rounded-[14px] bg-paper-2" aria-hidden />
          </div>
        ) : null}

        {state === 'empty' ? (
          <div className="pop-in rounded-[22px] border-2 border-dashed border-cocoa/25 bg-paper p-7 text-center">
            <h1 className="font-display text-2xl leading-tight text-cocoa">Nothing to share yet</h1>
            <p className="mt-2 text-sm text-ink-soft">Add a creation to your basket first, then share it as a ready-to-buy wish.</p>
            {/* a full page load, as before the Next 16 upgrade (fresh range, fresh basket state) */}
            {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
            <Button size="lg" className="mt-5 w-full" onClick={() => (window.location.href = '/catalogue')}>
              back to the range
            </Button>
          </div>
        ) : null}

        {state === 'error' ? (
          <div role="alert" className={`${CARD} text-center`}>
            <h1 className="font-display text-2xl leading-tight text-cocoa">That didn’t work</h1>
            <p className="mt-2 text-sm text-ink-soft">We couldn’t make your wish link just now. Give it another go.</p>
            <Button size="lg" className="mt-5 w-full" onClick={() => { ran.current = false; void mint(); }}>
              try again
            </Button>
          </div>
        ) : null}

        {state === 'badName' ? (
          <div className={`${CARD} text-center`}>
            <h1 className="font-display text-2xl leading-tight text-cocoa">Just a first name, please</h1>
            <p className="mt-2 text-sm text-ink-soft">
              We keep little ones safe by storing their <b>first name only</b> — no surnames. Pop back and pick who it’s
              for again.
            </p>
            {/* a full page load, as before the Next 16 upgrade (fresh range, fresh basket state) */}
            {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
            <Button size="lg" className="mt-5 w-full" onClick={() => (window.location.href = '/catalogue')}>
              back to the range
            </Button>
          </div>
        ) : null}

        {state === 'needsAuth' ? (
          sent ? (
            <div role="status" className={`${CARD} text-center`}>
              <div className="sticker mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-leaf-pale">
                <Icon icon={IconMail} size={30} className="text-green-save" />
              </div>
              <h1 className="mt-4 font-display text-[28px] leading-tight text-cocoa">Check your email</h1>
              <p className="mt-2 text-sm text-ink-soft">
                Tap the magic link we sent to <b className="text-cocoa">{email}</b> and your wish link will be ready —
                your basket&apos;s saved.
              </p>
              <button type="button" onClick={() => setSent(false)} className="mt-4 inline-flex min-h-11 items-center text-xs font-bold text-cinnamon hover:underline">
                use a different email
              </button>
            </div>
          ) : (
            <div className={CARD}>
              <h1 className="font-display text-[28px] leading-tight text-cocoa">
                {subject ? `Let’s save ${subject}’s wish` : 'Let’s save your wish'}
              </h1>
              <p className="mt-2 text-sm text-ink-soft">
                A quick sign-up keeps these creations safe in your private keepsake box, and gives you a link family can
                buy from. No passwords — just a one-tap magic link.
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px] text-ink-soft">
                {['Your creations, kept safe & private', 'A ready-to-buy link to share', 'Family can join & save 5%'].map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <Icon icon={IconCheck} size={14} className="text-green-save" /> {b}
                  </li>
                ))}
              </ul>
              <form onSubmit={signUp} className="mt-4">
                <label htmlFor="wish-email" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Email</label>
                <input
                  id="wish-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="min-h-12 w-full rounded-[14px] border-2 border-cocoa/25 bg-paper px-3.5 py-3 text-base text-cocoa placeholder:text-ink-faint focus:border-cocoa"
                />
                <Button type="submit" size="lg" className="mt-3 w-full" disabled={busy}>
                  <Icon icon={IconSparkles} size={16} /> {busy ? 'sending…' : 'sign up & make my link'}
                </Button>
              </form>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-green-save">
                <Icon icon={IconShieldCheck} size={13} /> Your data is yours. We never sell it, ever.
              </p>
            </div>
          )
        ) : null}

        {state === 'ready' ? (
          <div role="status" className={`${CARD} text-center`}>
            <div className="sticker wiggle mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-honey">
              <Icon icon={IconGift} size={30} className="text-cocoa" />
            </div>
            <h1 className="mt-4 font-display text-[28px] leading-tight text-cocoa">
              {subject ? `${subject}’s wish is ready ✦` : 'Your wish is ready ✦'}
            </h1>
            <p className="mt-2 text-sm text-ink-soft">Kept safe in your keepsake box. Share this link and family can buy it as a gift.</p>

            <div className="mt-4 flex items-center gap-2 rounded-[14px] border-2 border-dashed border-cocoa/25 bg-paper-2 py-1 pl-3 pr-1 text-left">
              <Icon icon={IconLink} size={15} className="shrink-0 text-ink-soft" />
              <span className="flex-1 truncate text-xs text-ink-soft">{fullUrl.replace(/^https?:\/\//, '')}</span>
              <button type="button" onClick={copy} className="press flex min-h-11 shrink-0 items-center gap-1 rounded-[12px] border-2 border-cocoa bg-paper px-3 text-xs font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
                <Icon icon={copied ? IconCheck : IconCopy} size={13} /> {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {SHARE.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => share(s.label, s.href(fullUrl))}
                  className="press flex min-h-14 flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-cocoa/20 bg-paper py-2 text-[11px] font-bold text-cocoa hover:border-cocoa"
                >
                  <Icon icon={s.icon} size={17} className="text-cinnamon" />
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-green-save">
              <Icon icon={IconShieldCheck} size={13} /> Private &amp; unguessable. Revoke it any time from your keepsakes.
            </p>
            {/* a full page load, as before the Next 16 upgrade (the keepsake home re-reads the server) */}
            {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
            <Button variant="secondary" size="lg" className="mt-4 w-full" onClick={() => (window.location.href = '/home?new=1')}>
              <Icon icon={IconHome} size={16} /> see it in your keepsake home
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
