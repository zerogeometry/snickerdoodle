'use client';

import { IconCopy, IconLock, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { PerAssetVisibilityModal, type VisibilityPerson } from '@/ui/modals/PerAssetVisibilityModal';

export type Tier = 'ONLY_ME' | 'FAMILY' | 'EXTENDED';
export const TIER_LABEL: Record<Tier, string> = { ONLY_ME: 'only me', FAMILY: 'family', EXTENDED: 'extended family' };

export interface KeepsakeInfo {
  draft: boolean;
  kept: boolean;
  visibility: Tier;
  canManage: boolean;
  people: VisibilityPerson[];
}

/**
 * The Studio's persistent, quiet "this stays yours" line — and the way in to who-can-see-it and
 * delete-it-for-good. A draft is only ever seen by the person who made it; a kept keepsake shows
 * its circle, and its controlling parent can change it or delete it here (re-checked on the server).
 */
export function KeepsakePill({
  info,
  image,
  onVisibility,
  onDelete,
  onDuplicate,
}: {
  info: KeepsakeInfo | null;
  image?: string;
  onVisibility: (tier: Tier) => Promise<void> | void;
  /** Delete this creation and its source (two taps). */
  onDelete: () => Promise<void> | void;
  /** A copy to try something else on (kept keepsakes, controlling parent only). */
  onDuplicate: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const who = !info ? null : info.draft ? 'just you' : TIER_LABEL[info.visibility];
  const canDelete = !!info && (info.draft || info.canManage);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={who ? `this stays yours — seen by ${who}. who can see it?` : 'this stays yours'}
        className="press flex min-h-11 max-w-full items-center gap-1.5 rounded-pill border-2 border-cocoa/15 bg-paper/95 px-3 text-[11px] font-extrabold text-cocoa shadow-[0_2px_0_var(--color-line)]"
      >
        <Icon icon={IconLock} size={14} className="shrink-0 text-green-save" />
        <span className="truncate">
          this stays yours{who ? <span className="font-bold text-ink-soft"> · {who}</span> : null}
        </span>
      </button>

      {info && info.canManage ? (
        <PerAssetVisibilityModal
          open={open}
          name="this keepsake"
          image={image}
          tier={info.visibility}
          people={info.people}
          onClose={() => setOpen(false)}
          onSave={async (tier) => {
            setOpen(false);
            if (tier !== info.visibility) await onVisibility(tier);
          }}
          onDelete={async () => {
            setOpen(false);
            await onDelete();
          }}
          extra={
            <>
              <button
                type="button"
                onClick={async () => {
                  setOpen(false);
                  await onDuplicate();
                }}
                className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-cocoa hover:underline"
              >
                <Icon icon={IconCopy} size={15} /> make a copy to try something else
              </button>
              <p className="text-[11px] leading-relaxed text-ink-soft">this one stays just as it is. the copy is its own keepsake — delete either any time.</p>
            </>
          }
        />
      ) : (
        <Modal open={open} onClose={() => setOpen(false)} title="this stays yours" subtitle={info?.draft ? 'only you can see it' : info ? `seen by ${who}` : undefined}>
          <p className="text-sm leading-relaxed text-cocoa">
            {info?.draft || !info ? (
              <>only you can see this right now. we use it to make your bits, then it’s gone — unless you keep it. your original is never changed.</>
            ) : (
              <>the parent who keeps it chooses who in the family can see it. nothing is ever public.</>
            )}
          </p>
          <Button size="lg" className="mt-4 w-full" onClick={() => setOpen(false)}>
            got it
          </Button>
          {canDelete ? (
            <DeleteForGood
              open={open}
              label="delete this drawing"
              onDelete={async () => {
                setOpen(false);
                await onDelete();
              }}
            />
          ) : null}
        </Modal>
      )}
    </>
  );
}

/** Two taps to delete for good, with a plain line about what that means. */
function DeleteForGood({ open, label, onDelete }: { open: boolean; label: string; onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (open) setSure(false);
  }, [open]);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <button
        type="button"
        onClick={() => (sure ? onDelete() : setSure(true))}
        className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-cinnamon hover:underline"
      >
        <Icon icon={IconTrash} size={15} /> {sure ? 'tap again to delete for good' : label}
      </button>
      {sure ? <p className="text-[11px] leading-relaxed text-ink-soft">this removes your upload and every edit from our store — it can’t be undone.</p> : null}
    </div>
  );
}
