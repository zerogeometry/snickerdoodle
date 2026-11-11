'use client';

import { IconUserMinus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { Toggle } from '@/ui/primitives/Toggle';
import { toast } from '@/lib/store';
import { removeMemberAction, setMemberAccessAction, setMemberCalendarAction } from '@/app/actions/family';
import type { AccessLevel, Circle, Relationship } from '@/domain/types';
import { circlesFor } from '@/domain/relationships';

export interface ManagedMember {
  accountId: string;
  name: string;
  circle: Circle;
  accessLevel: AccessLevel;
  seesOccasions: boolean;
  /** decides which circles they may be in (home: a parent or grown-up child — D27) */
  relationship: Relationship;
  /** they've been asked into home and haven't said yes yet */
  homeAsked?: boolean;
}

const CIRCLES: { value: Circle; label: string; hint: string }[] = [
  { value: 'HOME', label: 'Home', hint: 'sees home, family + extended keepsakes' },
  { value: 'FAMILY', label: 'Family', hint: 'sees family + extended keepsakes' },
  { value: 'EXTENDED', label: 'Extended', hint: 'sees only what you mark extended' },
];
const ACCESS: { value: AccessLevel; label: string }[] = [
  { value: 'VIEW', label: 'view' },
  { value: 'VIEW_BUY', label: 'view & buy' },
  { value: 'CONTRIBUTE', label: 'view, buy & add' },
];

/**
 * The parent's controls for one member, as a bottom sheet: what they can SEE (circle), what they
 * can DO (access), whether they see the family calendar, and removing them. Each change saves on
 * tap and takes effect on their very next page — trust shown through control.
 */
export function ManageMemberModal({ member, onClose }: { member: ManagedMember | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ManagedMember | null>(member);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => {
    setState(member);
    setConfirmRemove(false);
  }, [member]);

  if (!state) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const first = state.name.split(' ')[0] ?? state.name;

  const change = (patch: { circle?: Circle; accessLevel?: AccessLevel }) => {
    const before = state;
    setState({ ...state, ...patch });
    startTransition(async () => {
      const res = await setMemberAccessAction(state.accountId, patch);
      if (!res.ok) {
        setState(before);
        return toast('couldn’t change that — try again');
      }
      // into home waits for THEIR yes (D27): nothing changes until they tap the link we've emailed them
      if (res.homeAsked) {
        setState({ ...before, ...(patch.accessLevel ? { accessLevel: patch.accessLevel } : {}), homeAsked: true });
        toast(`we’ve asked ${first} — they move into home once they say yes`);
        return router.refresh();
      }
      toast(`saved — ${first} sees the change straight away`);
      router.refresh();
    });
  };

  const calendar = (on: boolean) => {
    setState({ ...state, seesOccasions: on });
    startTransition(async () => {
      const res = await setMemberCalendarAction(state.accountId, on);
      if (!res.ok) {
        setState({ ...state, seesOccasions: !on });
        return toast('couldn’t change that — try again');
      }
      router.refresh();
    });
  };

  const remove = () =>
    startTransition(async () => {
      const res = await removeMemberAction(state.accountId);
      if (!res.ok) return toast('couldn’t remove them — try again');
      toast(`${first} has been removed from the family`);
      onClose();
      router.refresh();
    });

  return (
    <Modal open={!!member} onClose={onClose} title={state.name} subtitle="you decide what they see and do">
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">what they can see</legend>
        <div className="flex flex-wrap gap-1.5">
          {CIRCLES.filter((c) => circlesFor(state.relationship).includes(c.value)).map((c) => (
            <Chip key={c.value} active={state.circle === c.value} disabled={pending} onClick={() => state.circle !== c.value && change({ circle: c.value })}>
              {c.label}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">{CIRCLES.find((c) => c.value === state.circle)?.hint}</p>
        {state.homeAsked && state.circle !== 'HOME' ? (
          <p role="status" className="mt-1.5 text-xs font-semibold text-cinnamon">asked into home — waiting for {first} to say yes</p>
        ) : null}
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">what they can do</legend>
        <div className="flex flex-wrap gap-1.5">
          {ACCESS.map((a) => (
            <Chip key={a.value} active={state.accessLevel === a.value} disabled={pending} onClick={() => state.accessLevel !== a.value && change({ accessLevel: a.value })}>
              {a.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2.5">
        <span className="text-xs text-cocoa">
          <b>family calendar</b>
          <span className="block text-[11px] text-ink-soft">your little ones&apos; birthdays + gentle nudges</span>
        </span>
        <Toggle on={state.seesOccasions} onChange={calendar} label={`${first} sees the family calendar`} />
      </div>

      {confirmRemove ? (
        <div role="alert" className="rounded-[14px] border-2 border-berry bg-berry-pale p-3.5">
          <p className="text-[13px] font-bold text-cocoa">remove {first} from the family?</p>
          <p className="mt-1 text-xs text-ink-soft">they lose access straight away and are signed out. you can always invite them again.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirmRemove(false)} disabled={pending}>
              keep them
            </Button>
            <Button size="sm" className="flex-1" onClick={remove} disabled={pending}>
              {pending ? 'removing…' : 'yes, remove'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setConfirmRemove(true)}>
          <Icon icon={IconUserMinus} size={16} /> remove from family
        </Button>
      )}
    </Modal>
  );
}
