'use client';

import { IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { toast } from '@/lib/store';
import { deleteChildAction, updateChildAction } from '@/app/actions/family';
import { LunarChoice, type LunarValue } from '@/ui/components/LunarChoice';

export interface ManagedChild {
  id: string;
  firstName: string;
  birthdayISO: string | null;
  birthdayLunar?: 'CHINESE' | 'KOREAN' | null;
}

const REASON: Record<string, string> = {
  surname: 'just their first name, please — we never keep a little one’s surname',
  taken: 'you’ve already got a little one with that name',
  birthday: 'that birthday doesn’t look quite right',
  invalid: 'letters only for a first name, please',
  'not-owner': 'only the family’s parent can change this',
};

/**
 * Edit or remove one of the parent's little ones. Removing asks what should happen to their
 * keepsakes: keep them in the family box (unfiled), or delete them for good too.
 */
export function ManageChildModal({ child, onClose }: { child: ManagedChild | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [lunar, setLunar] = useState<LunarValue>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setName(child?.firstName ?? '');
    setBirthday(child?.birthdayISO?.slice(0, 10) ?? '');
    setLunar(child?.birthdayLunar ?? null);
    setError(null);
    setConfirm(false);
  }, [child]);

  if (!child) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const save = () =>
    startTransition(async () => {
      const res = await updateChildAction(child.id, {
        ...(name.trim() !== child.firstName ? { firstName: name.trim() } : {}),
        ...(birthday !== (child.birthdayISO?.slice(0, 10) ?? '') ? { birthday: birthday || null } : {}),
        ...(lunar !== (child.birthdayLunar ?? null) ? { birthdayLunar: lunar } : {}),
      });
      if (!res.ok) return setError(REASON[res.reason ?? 'invalid'] ?? REASON.invalid!);
      toast('saved ✓');
      onClose();
      router.refresh();
    });

  const remove = (alsoDeleteKeepsakes: boolean) =>
    startTransition(async () => {
      const res = await deleteChildAction(child.id, alsoDeleteKeepsakes);
      if (!res.ok && res.reason === 'in-order') return toast(`one of ${child.firstName}’s keepsakes is being made into an order — try again once it’s on its way`);
      if (!res.ok) return toast('couldn’t do that — try again');
      toast(
        alsoDeleteKeepsakes
          ? `${child.firstName} and ${res.keepsakesDeleted === 1 ? 'their keepsake are' : 'their keepsakes are'} gone for good`
          : `${child.firstName} removed — their keepsakes are still in your box`,
      );
      onClose();
      router.refresh();
    });

  return (
    <Modal
      open={!!child}
      onClose={onClose}
      title={child.firstName}
      subtitle="a keepsake subject — never an account"
      footer={
        confirm ? null : (
          <Button size="lg" className="w-full" onClick={save} disabled={pending}>
            {pending ? 'saving…' : 'save'}
          </Button>
        )
      }
    >
      <label className="mb-3 block">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">first name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          maxLength={30}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'manage-child-error' : undefined}
          className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-cocoa"
        />
      </label>
      <label className="mb-1 block">
        <span className="mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">
          birthday <span className="font-normal normal-case">· optional, just for the gentle nudge</span>
        </span>
        <input
          type="date"
          value={birthday}
          onChange={(e) => {
            setBirthday(e.target.value);
            setError(null);
          }}
          className="min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-cocoa"
        />
      </label>
      {birthday ? <LunarChoice value={lunar} onChange={setLunar} /> : null}
      {error ? (
        <p id="manage-child-error" role="alert" className="mt-1.5 border-l-2 border-berry pl-2 text-xs font-semibold text-cocoa">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        {confirm ? (
          <div role="alert" className="rounded-[14px] border-2 border-berry bg-berry-pale p-3.5">
            <p className="text-[13px] font-bold text-cocoa">remove {child.firstName}?</p>
            <p className="mt-1 text-xs text-ink-soft">and what about their keepsakes?</p>
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="secondary" size="sm" className="w-full" onClick={() => remove(false)} disabled={pending}>
                remove, keep their keepsakes
              </Button>
              <Button size="sm" className="w-full" onClick={() => remove(true)} disabled={pending}>
                remove + delete their keepsakes for good
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setConfirm(false)} disabled={pending}>
                never mind
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setConfirm(true)}>
            <Icon icon={IconTrash} size={16} /> remove {child.firstName}
          </Button>
        )}
      </div>
    </Modal>
  );
}
