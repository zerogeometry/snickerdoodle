'use client';

import { IconCircleCheck, IconFaceId, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { PASSKEY_NUDGE_DISMISSED_KEY } from '@/lib/passkeys';
import { addPasskeyHere, deviceWord, hasDeviceUnlock, passkeyHere } from '@/ui/passkeyClient';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

function dismissedHere(): boolean {
  try {
    return localStorage.getItem(PASSKEY_NUDGE_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * "skip the email next time?" — the small, optional card just after an email sign-in (founder, 17 Nov 2026). The
 * server decides it's that moment (`offer`: an email sign-in in this browser in the last 15 minutes); this decides the
 * device can do it, hasn't got one already, and wasn't told "not now". Never pushy: one tap to say no, for good.
 */
export function PasskeyNudge({ offer }: { offer: boolean }) {
  const [state, setState] = useState<'hidden' | 'ask' | 'busy' | 'done'>('hidden');
  const [word, setWord] = useState('Face ID');
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!offer || dismissedHere() || passkeyHere()) return;
    let live = true;
    void hasDeviceUnlock().then((can) => {
      if (!live || !can) return;
      setWord(deviceWord());
      setState('ask');
    });
    return () => {
      live = false;
    };
  }, [offer]);

  if (state === 'hidden') return null;

  const notNow = () => {
    try {
      localStorage.setItem(PASSKEY_NUDGE_DISMISSED_KEY, '1');
    } catch {
      // private mode: it simply won't ask again this visit
    }
    setState('hidden');
  };

  const yes = async () => {
    setState('busy');
    setProblem(null);
    const res = await addPasskeyHere();
    if (res.ok || res.reason === 'already-here') {
      setState('done');
      return;
    }
    setState('ask');
    if (res.reason === 'sign-in-again') setProblem('it’s been a little while since you signed in, so add it from your account page after signing in again.');
    else if (res.reason !== 'cancelled') setProblem('that didn’t quite work. try again, or skip it — your email always works.');
  };

  return (
    <section aria-labelledby="passkey-nudge-title" className="pop-in tape relative mx-auto mt-5 w-[calc(100%-3rem)] max-w-md rounded-[22px] border-2 border-cocoa bg-paper p-5 shadow-[0_4px_0_var(--color-cocoa)]">
      {state === 'done' ? (
        <div role="status" className="flex items-start gap-3">
          <span className="sticker flex h-12 w-12 shrink-0 -rotate-6 items-center justify-center rounded-full bg-leaf-pale">
            <Icon icon={IconCircleCheck} size={24} className="text-green-save" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="passkey-nudge-title" className="font-display text-lg leading-tight text-cocoa">
              all set
            </h2>
            <p className="mt-1 text-sm text-ink-soft">next time, just tap “sign in with {word}”. no email needed.</p>
          </div>
          <button type="button" onClick={() => setState('hidden')} aria-label="close" className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-honey-band">
            <Icon icon={IconX} size={18} />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="sticker flex h-12 w-12 shrink-0 -rotate-6 items-center justify-center rounded-full bg-honey-band">
              <Icon icon={IconFaceId} size={24} className="text-cocoa" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="passkey-nudge-title" className="font-display text-lg leading-tight text-cocoa">
                skip the email next time?
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                use {word} to pop straight back in on this device. it stays on your device — we never see your face or fingerprint.
              </p>
            </div>
          </div>
          {problem ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-cinnamon">
              {problem}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
            <Button type="button" size="md" className="w-full sm:w-auto" onClick={yes} disabled={state === 'busy'}>
              <Icon icon={IconFaceId} size={16} /> {state === 'busy' ? 'setting it up…' : `use ${word}`}
            </Button>
            <Button type="button" variant="ghost" size="md" className="w-full sm:w-auto" onClick={notNow}>
              not now
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
