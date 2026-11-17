'use client';

import { IconCheck, IconFolderOpen, IconUser } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { cn } from '@/ui/cn';

export interface FilingOption {
  /** null = "not yet filed" */
  id: string | null;
  firstName: string | null;
  /** The viewer is this little one's parent (else filing it here gives THAT parent a say — said plainly). */
  yours: boolean;
}

const STICKERS = ['#C8402A', '#2F5DA8', '#3F6E29', '#8E2A1A']; // white initials ≥4.5:1 on each

/**
 * "whose corner?" (founder, 17 Nov 2026): file a keepsake under one of the little ones — the person button on a
 * keepsake. Shows ONLY the corners the server says this person may file it in (src/authz filingChoicesFor); the
 * server decides again when they save. A bottom sheet on phones, the usual card on desktop.
 */
export function FileKeepsakeModal({
  open,
  onClose,
  image,
  current,
  options,
  canAddLittleOnes,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  image?: string;
  /** its corner now (null = not yet filed) */
  current: string | null;
  options: FilingOption[];
  /** the family leader may add little ones (shown when there are none to file under) */
  canAddLittleOnes: boolean;
  onSave: (childId: string | null) => Promise<boolean>;
}) {
  const [chosen, setChosen] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (open) {
      setChosen(current);
      setFailed(false);
    }
  }, [open, current]);

  const picked = options.find((o) => o.id === chosen);
  const changed = chosen !== current;
  const noCorners = options.every((o) => o.id === null);

  const save = async () => {
    if (!changed || saving) return;
    setSaving(true);
    setFailed(false);
    const ok = await onSave(chosen).catch(() => false);
    setSaving(false);
    if (!ok) setFailed(true);
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title="whose corner?"
      subtitle="file this keepsake with one of your little ones"
      headerLeading={
        image ? (
          <span className="polaroid block w-12 flex-none" style={{ ['--tilt' as string]: '-3deg', padding: '3px 3px 5px' }}>
            <span className="flex aspect-square items-center justify-center overflow-hidden bg-paper-2">
              <img src={image} alt="" className="h-full w-full object-contain" />
            </span>
          </span>
        ) : undefined
      }
      footer={
        noCorners ? undefined : (
          <Button size="lg" className="w-full" onClick={() => void save()} disabled={!changed || saving} aria-busy={saving} data-testid="file-save">
            {saving ? 'filing…' : chosen === null ? 'take it out of the corner' : `file it in ${picked?.firstName ?? 'their'}’s corner`}
          </Button>
        )
      }
    >
      {noCorners ? (
        <div className="rounded-[18px] border-2 border-dashed border-cocoa/20 bg-paper-2 p-5 text-center">
          <Icon icon={IconFolderOpen} size={26} className="mx-auto text-cinnamon" />
          <p className="mt-2 text-sm text-ink-soft">no little ones to file it under yet.</p>
          {canAddLittleOnes ? (
            <Button href="/family" variant="secondary" size="md" className="mt-3">
              add your little ones
            </Button>
          ) : null}
        </div>
      ) : (
        <fieldset>
          <legend className="sr-only">whose corner this keepsake goes in</legend>
          <ul className="grid gap-2 pb-1">
            {options.map((o, i) => {
              const on = chosen === o.id;
              return (
                <li key={o.id ?? 'none'}>
                  <label
                    className={cn(
                      'press flex min-h-14 cursor-pointer items-center gap-3 rounded-[16px] border-2 px-3 py-2 text-[15px] font-bold text-cocoa has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt',
                      on ? 'border-cocoa bg-honey-band shadow-[0_3px_0_var(--color-cocoa)]' : 'border-cocoa/15 bg-paper',
                    )}
                  >
                    <input type="radio" name="corner" className="sr-only" checked={on} onChange={() => setChosen(o.id)} data-testid={`file-option-${o.firstName ?? 'none'}`} />
                    {o.id === null ? (
                      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-2 border-dashed border-cocoa/30 text-ink-faint" aria-hidden>
                        <Icon icon={IconUser} size={16} />
                      </span>
                    ) : (
                      <span
                        className="flex h-9 w-9 flex-none items-center justify-center rounded-full border-2 border-cocoa font-display text-sm text-white"
                        style={{ background: STICKERS[i % STICKERS.length] }}
                        aria-hidden
                      >
                        {o.firstName?.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="flex-1">
                      {o.id === null ? 'not yet filed' : `${o.firstName}’s corner`}
                      {o.id === current ? <span className="ml-1.5 text-xs font-semibold text-ink-faint">· here now</span> : null}
                    </span>
                    {on ? <Icon icon={IconCheck} size={18} className="text-green-save" /> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          {/* trust shown through control: say plainly who gets a say when it goes in someone else's little one's corner */}
          {picked && picked.id !== null && !picked.yours ? (
            <p className="mt-2 rounded-[12px] bg-sky-pale px-3 py-2 text-xs text-cocoa">
              {picked.firstName}’s parent will always see it too, and can keep it more private or take it off. you still choose who else sees it.
            </p>
          ) : null}
          {failed ? (
            <p role="alert" className="mt-2 text-xs font-bold text-cinnamon">
              couldn’t file that just now — try again.
            </p>
          ) : null}
          {!canAddLittleOnes ? null : (
            <Link href="/family" className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-cinnamon">
              add another little one
            </Link>
          )}
        </fieldset>
      )}
    </Modal>
  );
}
