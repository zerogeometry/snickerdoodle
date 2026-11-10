'use client';

import { IconCheck, IconLink, IconLock, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { approveAppLinkAction, declineAppLinkAction, notOwnerAppLinkAction, type ConnectParams } from '@/app/actions/appLink';
import { canConnectWith, EMPTY_CONNECT_SYNC, type ConnectSyncDraft } from '@/lib/drawSync';
import type { ConnectFamily } from '@/server/app/link';
import { DrawSyncSlate } from '@/ui/components/DrawSyncSlate';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';

/**
 * Everything the app can do once linked — the honest list (sign-off checklist G5). The parts that
 * depend on a choice below say so, because a grown-up can change those choices later in the app.
 */
export const CAN = [
  'see your little ones’ first names, to file each drawing under the right one',
  'add a little one (first name only)',
  'send a drawing to your keepsake box when a grown-up taps keep it — and the proud pile or every drawing, if you pick that below',
  'see their birthdays, and change a little one’s name or birthday — only with “first names and birthdays” ticked',
  'back up their drawing days — only with “drawing days” ticked',
  'see, add and change your family calendar’s birthdays and special days (a name and the day and month) — only with “family birthdays” ticked',
  'make a ready-to-buy link for a drawing it sent',
  'delete drawings it sent',
  'open snickerdoodle here when you want to make one real',
  'show your orders, in the grown-ups’ corner',
];
export const CANT = [
  'see the rest of your keepsake box, or your family',
  'bring pictures from here back into the app',
  'see your email address',
  'show prices or a shop to your child',
  'take a payment — that only ever happens here',
];

/**
 * The consent card. What syncs is the grown-up's choice (one slate, nothing picked until they pick —
 * DRAW-APP-sync-choices.md), and what the app can and can't do is spelled out before they say yes
 * (trust shown through control). "connect" stays disabled until a keepsakes option is chosen. The
 * main button sits in the thumb zone on a phone.
 */
export function ConnectCard({ params, email, families, notOwner }: { params: ConnectParams; email: string; families: ConnectFamily[]; notOwner: boolean }) {
  const [familyId, setFamilyId] = useState<string>(families[0]?.id ?? 'new');
  const family = families.find((f) => f.id === familyId);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(families[0]?.children.map((c) => c.id) ?? []));
  const [sync, setSync] = useState<ConnectSyncDraft>({ ...EMPTY_CONNECT_SYNC });
  const ready = canConnectWith(sync);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const pickFamily = (id: string) => {
    setFamilyId(id);
    setTicked(new Set(families.find((f) => f.id === id)?.children.map((c) => c.id) ?? []));
  };
  const toggle = (id: string) =>
    setTicked((t) => {
      const n = new Set(t);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const go = async (run: () => Promise<{ ok: true; url: string } | { ok: false; reason: string }>) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await run();
      if (res.ok) {
        window.location.assign(res.url); // back to the app (an allow-listed address only)
        return;
      }
      setProblem(
        res.reason === 'signed-out'
          ? 'you’ve been signed out — refresh the page to sign in again.'
          : res.reason === 'sync'
            ? 'pick what goes to your keepsake box first.'
            : 'that didn’t work — pop back to the app and tap link again.',
      );
    } catch {
      setProblem('that didn’t work — check your connection and try again.');
    }
    setBusy(false);
  };

  const connect = () => {
    if (!ready) return;
    void go(() => approveAppLinkAction({ params, familyId, childIds: family ? [...ticked] : null, sync }));
  };
  const notNow = () => go(() => declineAppLinkAction({ params }));

  if (notOwner) {
    return (
      <section className="pop-in tape w-full max-w-md rounded-[22px] border-2 border-cocoa bg-paper p-6 shadow-[0_4px_0_var(--color-cocoa)]">
        <CaveatNote className="-rotate-2 text-xl">nearly there</CaveatNote>
        <h1 className="mt-1 font-display text-[26px] leading-tight text-cocoa">ask the grown-up who runs your family</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          only the grown-up who set up your family on snickerdoodle can link the app. ask them to open snickerdoodle draw’s grown-ups’ corner on this phone and tap “link to snickerdoodle”.
        </p>
        <Button size="lg" className="mt-5 w-full" disabled={busy} onClick={() => go(() => notOwnerAppLinkAction({ params }))}>
          back to snickerdoodle draw
        </Button>
        {problem ? <p role="alert" className="mt-2 text-center text-xs font-semibold text-cinnamon">{problem}</p> : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="connect-title" className="pop-in tape w-full max-w-md rounded-[22px] border-2 border-cocoa bg-paper p-6 shadow-[0_4px_0_var(--color-cocoa)]">
      <CaveatNote className="-rotate-2 text-xl">hello, grown-up</CaveatNote>
      <h1 id="connect-title" className="mt-1 flex items-center gap-2 font-display text-[28px] leading-tight text-cocoa">
        <Icon icon={IconLink} size={24} className="text-cinnamon" /> connect snickerdoodle draw?
      </h1>
      <p className="mt-2 text-sm text-ink-soft">
        signed in as <b className="text-cocoa">{email}</b>. drawings from the app can land in your keepsake box, so they’re kept safe — they’re only little once. you choose what goes.
      </p>

      {families.length > 1 ? (
        <fieldset className="mt-5">
          <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">which family?</legend>
          <div className="flex flex-col gap-2">
            {families.map((f) => (
              <label key={f.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] border-2 border-cocoa/20 bg-paper px-3 has-[:checked]:border-cocoa has-[:checked]:bg-honey-band">
                <input type="radio" name="family" value={f.id} checked={familyId === f.id} onChange={() => pickFamily(f.id)} className="h-5 w-5 accent-cta" />
                <span className="text-sm font-bold text-cocoa">{f.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {family && family.children.length > 0 ? (
        <fieldset className="mt-5">
          <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">who draws on this phone?</legend>
          <div className="flex flex-wrap gap-2">
            {family.children.map((c) => (
              <label key={c.id} className="sticker flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-paper px-4 has-[:checked]:bg-leaf-pale">
                <input type="checkbox" checked={ticked.has(c.id)} onChange={() => toggle(c.id)} className="h-5 w-5 accent-cta" />
                <span className="text-sm font-bold text-cocoa">{c.firstName}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">the app only sees the little ones you tick. anyone you add in the app joins this list.</p>
        </fieldset>
      ) : (
        <p className="mt-4 rounded-[14px] bg-honey-band px-3 py-2 text-xs font-semibold text-cocoa">
          {family ? 'no little ones here yet — you can add them (first names only) in the app.' : 'we’ll start your keepsake box now — you can add your little ones (first names only) in the app.'}
        </p>
      )}

      <section aria-labelledby="sync-title" className="mt-6 rounded-[18px] border-2 border-dashed border-cocoa/30 bg-paper-2 p-4">
        <h2 id="sync-title" className="font-display text-lg leading-tight text-cocoa">
          what syncs?
        </h2>
        <p className="mt-0.5 mb-3 text-xs leading-snug text-ink-soft">nothing’s picked until you pick. change any of it later, in the app’s grown-ups’ corner or on your account page.</p>
        <DrawSyncSlate name="connect" value={sync} onChange={setSync} disabled={busy} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">stopping a sync never deletes anything already in your keepsake box — deleting is always its own tap.</p>
      </section>

      <div className="mt-5 grid gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-green-save">once linked, the app can</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {CAN.map((t) => (
              <li key={t} className="flex items-start gap-1.5 text-[13px] leading-snug text-cocoa">
                <Icon icon={IconCheck} size={15} className="mt-0.5 shrink-0 text-green-save" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-cinnamon">it can’t</p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {CANT.map((t) => (
              <li key={t} className="flex items-start gap-1.5 text-[13px] leading-snug text-cocoa">
                <Icon icon={IconX} size={15} className="mt-0.5 shrink-0 text-cinnamon" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
        <Icon icon={IconLock} size={14} className="mt-0.5 shrink-0 text-green-save" />
        only what you choose leaves the phone. disconnect any time, in the app or on your account page — it stops at once.
      </p>
      {problem ? <p role="alert" className="mt-3 text-center text-xs font-semibold text-cinnamon">{problem}</p> : null}

      {/* phone: the buttons sit in the thumb zone; desktop: under the card */}
      <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-40 flex flex-col gap-2 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-6 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none">
        {!ready ? (
          <p id="connect-needs" className="text-center text-xs font-semibold text-ink-soft">
            pick what goes to your keepsake box to connect
          </p>
        ) : null}
        <Button size="lg" className="w-full" disabled={busy || !ready} aria-describedby={ready ? undefined : 'connect-needs'} onClick={connect}>
          {busy ? 'connecting…' : 'connect'}
        </Button>
        <Button variant="ghost" size="md" className="w-full" disabled={busy} onClick={notNow}>
          not now
        </Button>
      </div>
    </section>
  );
}
