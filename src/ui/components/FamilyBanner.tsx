'use client';

import { IconPhoto, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { toast } from '@/lib/store';
import { useProfileImageUpload } from './useProfileImageUpload';
import { removeProfileImageAction } from '@/app/actions/profile';

/**
 * The family's banner across the top of Home / Family. Members see it (once screened); the parent
 * (owner) can add, change or remove it. With no banner, a member sees nothing extra and the owner
 * gets a small "add a family banner" sticker.
 */
export function FamilyBanner({ url, canEdit, familyName }: { url: string | null; canEdit: boolean; familyName: string }) {
  const router = useRouter();
  const up = useProfileImageUpload('FAMILY_BANNER', () => router.refresh());
  const [pending, startTransition] = useTransition();
  const remove = () =>
    startTransition(async () => {
      const res = await removeProfileImageAction('FAMILY_BANNER');
      toast(res.ok ? 'banner removed — deleted for good' : 'couldn’t remove that — try again');
      if (res.ok) router.refresh();
    });

  if (!url && !canEdit) return null;
  if (!url) {
    return (
      <div className="flex justify-center pt-3">
        {up.input}
        <button
          type="button"
          onClick={up.pick}
          disabled={up.busy}
          className="press inline-flex min-h-11 items-center gap-1.5 rounded-pill border-2 border-dashed border-cocoa/40 px-4 text-xs font-extrabold text-ink-soft hover:border-cocoa hover:text-cocoa disabled:opacity-60"
        >
          <Icon icon={IconPhoto} size={15} /> {up.busy ? 'uploading…' : 'add a family banner'}
        </button>
      </div>
    );
  }
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {up.input}
      <img src={url} alt={`${familyName} banner`} className="aspect-[3/1] max-h-64 w-full object-cover md:rounded-b-[22px]" />
      {canEdit ? (
        <div className="absolute bottom-3 right-3 flex gap-1.5">
          <button type="button" onClick={up.pick} disabled={up.busy} className="press flex min-h-11 items-center gap-1 rounded-pill border-2 border-cocoa bg-paper px-3 text-xs font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] disabled:opacity-60">
            <Icon icon={IconPhoto} size={14} /> {up.busy ? 'uploading…' : 'change banner'}
          </button>
          <button type="button" onClick={remove} disabled={pending} aria-label="remove the family banner" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
            <Icon icon={IconTrash} size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
