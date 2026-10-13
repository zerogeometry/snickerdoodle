'use client';

import { IconDoorExit, IconDownload } from '@tabler/icons-react';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { toast } from '@/lib/store';
import { closeMyAccountAction, closurePreviewAction } from '@/app/actions/data';
import type { ClosurePreview } from '@/server/accountClosure';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Closing an account, said plainly before anything happens: exactly what goes, what (anonymised)
 * stays, and — when other people are in the family — the choice to hand it to one of them so the
 * family and the little ones' keepsakes carry on. Two taps to confirm; nothing is pre-chosen.
 */
export function CloseAccountModal({ open, onClose, onDownload }: { open: boolean; onClose: () => void; onDownload: () => void }) {
  const [preview, setPreview] = useState<ClosurePreview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<'handover' | 'close' | null>(null);
  const [heir, setHeir] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setLoadFailed(false);
    setMode(null);
    setHeir(null);
    setArmed(false);
    closurePreviewAction()
      .then((p) => (p ? setPreview(p) : setLoadFailed(true)))
      .catch(() => setLoadFailed(true));
  }, [open]);

  const family = preview?.ownedFamilies[0] ?? null; // a parent owns one family
  const canHandOver = !!family && family.members.length > 0;
  const needsChoice = canHandOver && (mode === null || (mode === 'handover' && !heir));
  const blocked = !preview || preview.inFlightOrders > 0 || needsChoice;

  const confirm = () => {
    if (!armed) return setArmed(true);
    startTransition(async () => {
      const res = await closeMyAccountAction(mode === 'handover' && family && heir ? { familyId: family.familyId, newOwnerAccountId: heir } : null);
      if (!res.ok) {
        setArmed(false);
        return toast(
          res.reason === 'order-in-flight'
            ? 'we’re still making an order for you — you can close your account once it’s on its way'
            : 'couldn’t close it just now — try again',
        );
      }
      toast('your account is closed');
      window.location.assign('/');
    });
  };

  const heirName = family?.members.find((m) => m.accountId === heir)?.name;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="close your account"
      subtitle="here’s exactly what happens — nothing changes until you confirm"
      footer={
        preview && preview.inFlightOrders === 0 ? (
          <div className="flex flex-col gap-2">
            {armed ? (
              <p role="alert" className="text-center text-xs font-bold text-cocoa">
                last check — this can’t be undone.
              </p>
            ) : null}
            <Button size="lg" className="w-full" onClick={confirm} disabled={blocked || pending}>
              <Icon icon={IconDoorExit} size={16} /> {pending ? 'closing…' : armed ? 'yes, close my account for good' : 'close my account'}
            </Button>
          </div>
        ) : null
      }
    >
      {loadFailed ? (
        <p role="alert" className="text-sm text-cocoa">couldn’t load the details just now — close this and try again.</p>
      ) : !preview ? (
        <div role="status" aria-label="loading" className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded-full bg-paper-2" style={{ width: `${90 - i * 15}%` }} />
          ))}
        </div>
      ) : preview.inFlightOrders > 0 ? (
        <p className="rounded-[14px] border-2 border-honey bg-honey-band p-3.5 text-sm text-cocoa">
          we’re still making {plural(preview.inFlightOrders, 'order')} for you. you can close your account once{' '}
          {preview.inFlightOrders === 1 ? 'it’s' : 'they’re'} on {preview.inFlightOrders === 1 ? 'its' : 'their'} way — we need your drawings to print{' '}
          {preview.inFlightOrders === 1 ? 'it' : 'them'}.
        </p>
      ) : (
        <div className="space-y-4 text-[13px] leading-relaxed text-ink-soft">
          <button type="button" onClick={onDownload} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-paper-2 px-3 text-left text-xs font-bold text-cocoa">
            <Icon icon={IconDownload} size={16} className="text-cinnamon" /> want a copy first? download your data
          </button>

          {family ? (
            canHandOver ? (
              <fieldset>
                <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">what happens to {family.name}?</legend>
                <div className="flex flex-col gap-2">
                  <label className={`flex cursor-pointer gap-2.5 rounded-[14px] border-2 p-3 ${mode === 'handover' ? 'border-cocoa bg-paper' : 'border-line bg-paper-2'}`}>
                    <input type="radio" name="family-fate" className="mt-1" checked={mode === 'handover'} onChange={() => setMode('handover')} />
                    <span>
                      <b className="block text-cocoa">hand it to someone, so it carries on</b>
                      they become the family&apos;s parent: the little ones, their keepsakes and everyone you invited stay together.
                      {family.privateKeepsakes > 0 ? ` the ${plural(family.privateKeepsakes, 'keepsake')} you kept “only me” ${family.privateKeepsakes === 1 ? 'is' : 'are'} deleted — they were only ever yours.` : ''}
                    </span>
                  </label>
                  {mode === 'handover' ? (
                    <div className="flex flex-wrap gap-1.5 pl-3" role="group" aria-label="who takes over">
                      {family.members.map((m) => (
                        <Chip key={m.accountId} active={heir === m.accountId} onClick={() => setHeir(m.accountId)}>
                          {m.name}
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                  {mode === 'handover' && heirName ? (
                    <p className="pl-3 text-xs">we&apos;ll email {heirName} to let them know they&apos;re now looking after {family.name}.</p>
                  ) : null}
                  <label className={`flex cursor-pointer gap-2.5 rounded-[14px] border-2 p-3 ${mode === 'close' ? 'border-cocoa bg-paper' : 'border-line bg-paper-2'}`}>
                    <input type="radio" name="family-fate" className="mt-1" checked={mode === 'close'} onChange={() => setMode('close')} />
                    <span>
                      <b className="block text-cocoa">close the family too</b>
                      all {plural(family.keepsakes, 'keepsake')} and {plural(family.littleOnes, 'little one')} are deleted, with every invite and gift list,
                      and the {plural(family.members.length, 'person', 'people')} you invited lose access straight away.
                    </span>
                  </label>
                </div>
              </fieldset>
            ) : (
              <p>
                <b className="text-cocoa">{family.name}</b> closes with your account: all {plural(family.keepsakes, 'keepsake')} and{' '}
                {plural(family.littleOnes, 'little one')} are deleted — the image files themselves, not just hidden — with any invites and gift lists.
              </p>
            )
          ) : null}

          <ul className="list-disc space-y-1.5 pl-5">
            {preview.otherFamilies > 0 ? (
              <li>
                you leave the {plural(preview.otherFamilies, 'other family', 'other families')} you&apos;re in
                {preview.ownUploadsElsewhere > 0 ? `, and the ${plural(preview.ownUploadsElsewhere, 'keepsake')} you added there ${preview.ownUploadsElsewhere === 1 ? 'is' : 'are'} deleted` : ''}.
              </li>
            ) : null}
            <li>your saved designs, credit, birthday nudges and email preferences are deleted.</li>
            {preview.orders > 0 ? (
              <li>
                we keep the money side of your {plural(preview.orders, 'past order')} — what was bought and paid, for our accounts — with your name, email and
                address removed.
              </li>
            ) : null}
            <li>you&apos;re signed out everywhere, and this account can&apos;t be used again.</li>
            <li>
              <b className="text-cocoa">this can&apos;t be undone.</b>
            </li>
          </ul>
        </div>
      )}
    </Modal>
  );
}
