'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { addOccasionAction, deleteOccasionAction, updateOccasionAction } from '@/app/actions/family';
import { toast } from '@/lib/store';
import type { FamilyChild, FamilyMember, FamilyOccasion } from '@/server/family';
import { Button } from '@/ui/primitives/Button';
import { Modal } from '@/ui/primitives/Modal';
import { LunarChoice, type LunarValue } from '@/ui/components/LunarChoice';

/**
 * Add / change an occasion (founder, 27 Oct): a birthday, an anniversary, a milestone or anything else —
 * for someone in the family or not ("granny and grandad's anniversary"), on the calendar or a lunar one.
 * Seen by the Family circle by default; widen it to the Extended family if you like. Name + date only.
 */
type Kind = FamilyOccasion['kind'];
const KINDS: { v: Kind; label: string }[] = [
  { v: 'BIRTHDAY', label: 'birthday' },
  { v: 'ANNIVERSARY', label: 'anniversary' },
  { v: 'MILESTONE', label: 'milestone' },
  { v: 'OTHER', label: 'something else' },
];
const REASONS: Record<string, string> = {
  invalid: 'give it a name (and pick who it’s for from the list)',
  words: 'some of those words can’t go on the calendar — try different ones',
  date: 'that date doesn’t look quite right',
  'lunar-needs-year': 'a lunar date needs the year it happened, so we can find the same lunar day each year',
  'not-allowed': 'you can’t change this one — ask the family lead',
};
const chip = (on: boolean) => `press min-h-11 rounded-pill border-2 px-3.5 text-xs font-bold ${on ? 'border-cocoa bg-cocoa text-paper' : 'border-cocoa/25 bg-paper text-cocoa'}`;

export function OccasionSheet({
  open,
  onClose,
  editing,
  kids,
  members,
}: {
  open: boolean;
  onClose: () => void;
  /** the occasion being changed (null = a new one) */
  editing: FamilyOccasion | null;
  kids: FamilyChild[];
  members: FamilyMember[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('BIRTHDAY');
  const [date, setDate] = useState('');
  const [noYear, setNoYear] = useState(false);
  const [lunar, setLunar] = useState<LunarValue>(null);
  const [who, setWho] = useState('');
  const [wide, setWide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const yearless = editing?.date.startsWith('--') ?? false;
    setTitle(editing?.title ?? '');
    setKind(editing?.kind ?? 'BIRTHDAY');
    setDate(editing ? (yearless ? `2000${editing.date.slice(1)}` : editing.date) : '');
    setNoYear(yearless);
    setLunar(editing?.lunar ?? null);
    setWho(editing?.childId ? `c:${editing.childId}` : editing?.memberAccountId ? `m:${editing.memberAccountId}` : '');
    setWide(editing?.shareCircle === 'EXTENDED');
    setError(null);
  }, [open, editing]);

  const save = () =>
    start(async () => {
      if (!title.trim()) return setError(REASONS.invalid!);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError(REASONS.date!);
      const input = {
        title,
        kind,
        date: noYear ? `-${date.slice(4)}` : date,
        lunar: noYear ? null : lunar,
        childId: who.startsWith('c:') ? who.slice(2) : null,
        memberAccountId: who.startsWith('m:') ? who.slice(2) : null,
        shareCircle: wide ? ('EXTENDED' as const) : ('FAMILY' as const),
      };
      const r = editing ? await updateOccasionAction(editing.id, input) : await addOccasionAction(input);
      if (!r.ok) return setError(REASONS[r.reason] ?? REASONS.invalid!);
      toast(editing ? 'saved ✓' : 'on the calendar ✓');
      onClose();
      router.refresh();
    });
  const remove = () =>
    start(async () => {
      if (!editing) return;
      const r = await deleteOccasionAction(editing.id);
      if (!r.ok) return setError(REASONS['not-allowed']!);
      toast('taken off the calendar');
      onClose();
      router.refresh();
    });

  const field = 'min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-cocoa';
  const lab = 'mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'change this occasion' : 'add an occasion'}
      subtitle="birthdays, anniversaries, anything worth remembering"
      footer={
        <div className="flex gap-2">
          {editing?.canChange ? (
            <Button variant="secondary" size="md" className="flex-1" onClick={remove} disabled={pending}>
              take it off
            </Button>
          ) : null}
          <Button size="md" className="flex-1" onClick={save} disabled={pending}>
            {pending ? 'saving…' : editing ? 'save' : 'add to the calendar'}
          </Button>
        </div>
      }
    >
      <label className="mb-3 block">
        <span className={lab}>what is it</span>
        <input value={title} maxLength={60} onChange={(e) => { setTitle(e.target.value); setError(null); }} placeholder="Granny & grandad’s anniversary" className={field} />
      </label>
      <fieldset className="mb-3">
        <legend className={lab}>kind</legend>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k.v} type="button" aria-pressed={kind === k.v} onClick={() => setKind(k.v)} className={chip(kind === k.v)}>
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="mb-1 block">
        <span className={lab}>the date it happened {noYear ? '' : '(or happens)'}</span>
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} className={field} />
      </label>
      <label className="mb-3 flex min-h-11 items-center gap-2 text-xs font-bold text-cocoa">
        <input type="checkbox" checked={noYear} onChange={(e) => setNoYear(e.target.checked)} className="h-5 w-5 accent-[var(--color-cta)]" />
        I don’t know the year
      </label>
      {!noYear ? <LunarChoice value={lunar} onChange={setLunar} label="this date follows" /> : null}
      <label className="mb-3 mt-3 block">
        <span className={lab}>who it’s for · optional</span>
        <select value={who} onChange={(e) => setWho(e.target.value)} className={field}>
          <option value="">someone not on snickerdoodle (or nobody in particular)</option>
          {kids.map((k) => (
            <option key={k.id} value={`c:${k.id}`}>
              {k.firstName}
            </option>
          ))}
          {members.map((m) => (
            <option key={m.accountId} value={`m:${m.accountId}`}>
              {m.isYou ? `${m.name} (you)` : m.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className={lab}>who sees it</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={!wide} onClick={() => setWide(false)} className={chip(!wide)}>
            family circle
          </button>
          <button type="button" aria-pressed={wide} onClick={() => setWide(true)} className={chip(wide)}>
            family + extended
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-soft">only people you’ve shared the calendar with — just the name and the date, never a picture. anyone who’s turned nudges on hears a month and two weeks before.</p>
      </fieldset>
      {error ? (
        <p role="alert" className="mt-3 border-l-2 border-berry pl-2 text-xs font-semibold text-cocoa">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
