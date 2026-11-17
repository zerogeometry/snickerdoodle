'use client';

import { IconFaceId, IconFingerprint, IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { removePasskeyAction } from '@/app/actions/passkey';
import type { PasskeyRow } from '@/lib/passkeys';
import { toast } from '@/lib/store';
import { addPasskeyHere, canUsePasskeys, deviceWord } from '@/ui/passkeyClient';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * "sign in with Face ID" on the account page: each device that can open snickerdoodle without the email (what kind,
 * when added), a remove button for each, and "add" for this device. Removing works at once; the key itself stays in
 * that device's passwords list until they delete it there, but it no longer opens anything here.
 */
/** `canAdd`: signed in here in the last 15 minutes (adding needs that — src/server/passkeys.ts mayAddPasskey). */
export function PasskeysCard({ passkeys, canAdd }: { passkeys: PasskeyRow[]; canAdd: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(passkeys);
  const [busy, setBusy] = useState<string | null>(null);
  const [can, setCan] = useState(false);
  const [word, setWord] = useState('Face ID');
  const [signInFirst, setSignInFirst] = useState(!canAdd);
  useEffect(() => setRows(passkeys), [passkeys]);
  useEffect(() => setSignInFirst(!canAdd), [canAdd]);
  useEffect(() => {
    setCan(canUsePasskeys());
    setWord(deviceWord());
  }, []);

  const add = async () => {
    if (busy) return;
    setBusy('add');
    const res = await addPasskeyHere();
    setBusy(null);
    if (res.ok) {
      setRows((r) => [res.passkey, ...r]);
      toast(`all set — next time, tap “sign in with ${word}”`);
      router.refresh();
    } else if (res.reason === 'already-here') toast('this device can already sign you in');
    else if (res.reason === 'sign-in-again') setSignInFirst(true);
    else if (res.reason !== 'cancelled') toast('that didn’t quite work — try again in a moment');
  };

  const remove = async (p: PasskeyRow) => {
    if (busy) return;
    setBusy(p.id);
    const res = await removePasskeyAction(p.id).catch(() => ({ ok: false }));
    setBusy(null);
    if (res.ok) {
      setRows((r) => r.filter((x) => x.id !== p.id));
      toast('removed — that device will ask for your email next time');
      router.refresh();
    } else toast('couldn’t remove that just now — try again');
  };

  return (
    <section aria-labelledby="passkeys-title" className="pop-in mt-4 rounded-2xl border-2 border-cocoa bg-paper p-4">
      <h2 id="passkeys-title" className="flex items-center gap-2 font-display text-lg text-cocoa">
        <Icon icon={IconFaceId} size={20} className="text-cinnamon" /> sign in with {word}
      </h2>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">
        skip the email on your own phone or computer. it checks it’s you with your face, fingerprint or PIN — and that stays on the device. we never see it.
      </p>
      {rows.length ? (
        <ul className="mt-3 flex flex-col gap-2" aria-label="devices that can sign you in">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl bg-paper-2 px-3 py-2">
              <Icon icon={IconFingerprint} size={20} className="shrink-0 text-cocoa" />
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-cocoa">
                <b>{p.label}</b>
                <span className="block text-[11px] text-ink-faint">
                  added {day(p.addedOn)}
                  {p.lastUsedOn ? ` · last used ${day(p.lastUsedOn)}` : ''}
                </span>
              </span>
              <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => remove(p)} aria-label={`remove ${p.label}, added ${day(p.addedOn)}`}>
                {busy === p.id ? 'removing…' : 'remove'}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-[13px] text-ink-soft">none yet — you sign in with your email.</p>
      )}
      {can && signInFirst ? (
        <p role="status" className="mt-3 rounded-lg bg-honey-band px-2.5 py-1.5 text-[12px] leading-snug text-cocoa">
          to add {word} on this device, sign in again first, so it’s definitely you and not a little one on a signed-in tablet.{' '}
          <Link href="/login?next=/account" className="inline-flex min-h-11 items-center font-extrabold underline underline-offset-2">
            sign in again
          </Link>
        </p>
      ) : can ? (
        <Button variant="secondary" size="md" className="mt-3 w-full" disabled={busy !== null} onClick={add}>
          <Icon icon={IconPlus} size={16} /> {busy === 'add' ? 'setting it up…' : `add ${word} on this device`}
        </Button>
      ) : null}
      {rows.length ? (
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          removing one works straight away. it may still sit in that device’s passwords list — it just won’t open snickerdoodle any more.
        </p>
      ) : null}
    </section>
  );
}
