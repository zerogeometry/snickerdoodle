'use client';

import {
  IconArrowLeft,
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
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
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
    const res = await createWishAction({ assetIds, subject: who || undefined });
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
      <header className="flex items-center gap-3 border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/catalogue" aria-label="Back to the range">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
        </Link>
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">snickerdoodle</Link>
      </header>

      <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10">
        {state === 'minting' ? (
          <div className="rounded-2xl border border-[#EADFC9] bg-white p-8 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#EADFC9] border-t-cinnamon" />
            <p className="mt-4 text-sm text-[#6F6358]">tucking these into your keepsake box…</p>
          </div>
        ) : null}

        {state === 'empty' ? (
          <div className="rounded-2xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-7 text-center">
            <h1 className="font-display text-xl font-semibold text-cocoa">Nothing to share yet</h1>
            <p className="mt-2 text-sm text-[#6F6358]">Add a creation to your basket first, then share it as a ready-to-buy wish.</p>
            <Button size="lg" className="mt-5 w-full" onClick={() => (window.location.href = '/catalogue')}>
              back to the range
            </Button>
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
            <h1 className="font-display text-xl font-semibold text-cocoa">That didn’t work</h1>
            <p className="mt-2 text-sm text-[#6F6358]">We couldn’t make your wish link just now. Give it another go.</p>
            <Button size="lg" className="mt-5 w-full" onClick={() => { ran.current = false; void mint(); }}>
              try again
            </Button>
          </div>
        ) : null}

        {state === 'badName' ? (
          <div className="rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
            <h1 className="font-display text-xl font-semibold text-cocoa">Just a first name, please</h1>
            <p className="mt-2 text-sm text-[#6F6358]">
              We keep little ones safe by storing their <b>first name only</b> — no surnames. Pop back and pick who it’s
              for again.
            </p>
            <Button size="lg" className="mt-5 w-full" onClick={() => (window.location.href = '/catalogue')}>
              back to the range
            </Button>
          </div>
        ) : null}

        {state === 'needsAuth' ? (
          sent ? (
            <div className="rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF1E4]">
                <Icon icon={IconMail} size={30} className="text-green-save" />
              </div>
              <h1 className="mt-4 font-display text-2xl font-semibold text-cocoa">Check your email</h1>
              <p className="mt-2 text-sm text-[#6F6358]">
                Tap the magic link we sent to <b className="text-cocoa">{email}</b> and your wish link will be ready —
                your basket&apos;s saved.
              </p>
              <button type="button" onClick={() => setSent(false)} className="mt-5 text-xs font-bold text-cinnamon hover:underline">
                use a different email
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#EADFC9] bg-white p-7">
              <h1 className="font-display text-2xl font-semibold text-cocoa">
                {subject ? `Let’s save ${subject}’s wish` : 'Let’s save your wish'}
              </h1>
              <p className="mt-2 text-sm text-[#6F6358]">
                A quick sign-up keeps these creations safe in your private keepsake box, and gives you a link family can
                buy from. No passwords — just a one-tap magic link.
              </p>
              <ul className="mt-3 space-y-1.5 text-[13px] text-[#5C5249]">
                {['Your creations, kept safe & private', 'A ready-to-buy link to share', 'Family can join & save 5%'].map((b) => (
                  <li key={b} className="flex items-center gap-2">
                    <Icon icon={IconCheck} size={14} className="text-green-save" /> {b}
                  </li>
                ))}
              </ul>
              <form onSubmit={signUp} className="mt-4">
                <label htmlFor="wish-email" className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Email</label>
                <input
                  id="wish-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-3 text-sm text-cocoa placeholder:text-[#A89B8C]"
                />
                <Button type="submit" size="lg" className="mt-3 w-full" disabled={busy}>
                  <Icon icon={IconSparkles} size={16} /> {busy ? 'sending…' : 'sign up & make my link'}
                </Button>
              </form>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-green-save">
                <Icon icon={IconShieldCheck} size={13} /> Your data is yours. We never sell it, ever.
              </p>
            </div>
          )
        ) : null}

        {state === 'ready' ? (
          <div className="rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#FBEFE0]">
              <Icon icon={IconGift} size={30} className="text-cinnamon" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold text-cocoa">
              {subject ? `${subject}’s wish is ready ✦` : 'Your wish is ready ✦'}
            </h1>
            <p className="mt-2 text-sm text-[#6F6358]">Kept safe in your keepsake box. Share this link and family can buy it as a gift.</p>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#E6D8BE] bg-[#F6F0E4] px-3 py-2.5 text-left">
              <Icon icon={IconLink} size={15} className="shrink-0 text-[#9C8E7E]" />
              <span className="flex-1 truncate text-xs text-[#6F6358]">{fullUrl.replace(/^https?:\/\//, '')}</span>
              <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-cinnamon">
                <Icon icon={copied ? IconCheck : IconCopy} size={13} /> {copied ? 'copied' : 'copy'}
              </button>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {SHARE.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => share(s.label, s.href(fullUrl))}
                  className="flex flex-col items-center gap-1 rounded-lg border border-[#EFE6D6] bg-[#FBF8F1] py-2 text-[11px] font-semibold text-[#7A6A58] hover:border-honey"
                >
                  <Icon icon={s.icon} size={17} className="text-cinnamon" />
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-green-save">
              <Icon icon={IconShieldCheck} size={13} /> Private &amp; unguessable. Revoke it any time from your keepsakes.
            </p>
            <Button variant="secondary" size="lg" className="mt-4 w-full" onClick={() => (window.location.href = '/home?new=1')}>
              <Icon icon={IconHome} size={16} /> see it in your keepsake home
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
