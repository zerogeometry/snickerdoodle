'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { addOccasionAction, addOccasionToFamilyAction, deleteOccasionAction, updateOccasionAction } from '@/app/actions/family';
import type { Circle, OccasionWhose } from '@/domain/types';
import { toast } from '@/lib/store';
import type { FamilyChild, FamilyMember, FamilyOccasion } from '@/server/family';
import { Button } from '@/ui/primitives/Button';
import { Modal } from '@/ui/primitives/Modal';
import { LunarChoice, type LunarValue } from '@/ui/components/LunarChoice';

/**
 * Add / change an occasion (founder, 27 Oct; "whose day is it?" — D27, 10 Nov 2026): a birthday, an anniversary,
 * a milestone or anything else, on the calendar or a lunar one. Name + date only.
 *
 *  - "mine / ours" (the leader, partner, the family's own little ones): shared at home, home + family, or everyone.
 *  - "someone else's" (a brother-in-law, a friend): kept to home — the wider choices aren't offered at all, because
 *    it's their day to share, not ours. (The server holds it there too.)
 *  - `mode="own"`: someone adding THEIR OWN day to a family they've joined — no "whose", it's theirs, and who sees it
 *    is their own choice.
 *  - Changing someone else's addition as the family lead: only more private, or take it off.
 */
type Kind = FamilyOccasion['kind'];
const KINDS: { v: Kind; label: string }[] = [
  { v: 'BIRTHDAY', label: 'birthday' },
  { v: 'ANNIVERSARY', label: 'anniversary' },
  { v: 'MILESTONE', label: 'milestone' },
  { v: 'OTHER', label: 'something else' },
];
const SHARES: { v: Circle; label: string }[] = [
  { v: 'HOME', label: 'home only' },
  { v: 'FAMILY', label: 'home + family' },
  { v: 'EXTENDED', label: 'everyone (+ extended)' },
];
const RANK: Record<Circle, number> = { HOME: 0, FAMILY: 1, EXTENDED: 2 };
const REASONS: Record<string, string> = {
  invalid: 'give it a name (and pick who it’s for from the list)',
  words: 'some of those words can’t go on the calendar — try different ones',
  date: 'that date doesn’t look quite right',
  'lunar-needs-year': 'a lunar date needs the year it happened, so we can find the same lunar day each year',
  'not-allowed': 'you can’t change this one — ask whoever added it',
};
const chip = (on: boolean) =>
  `press min-h-11 rounded-pill border-2 px-3.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45 ${on ? 'border-cocoa bg-cocoa text-paper' : 'border-cocoa/25 bg-paper text-cocoa'}`;

export function OccasionSheet({
  open,
  onClose,
  editing,
  kids,
  members,
  familyId = null,
  familyName = null,
  mode = 'household',
  selfAccountId = null,
}: {
  open: boolean;
  onClose: () => void;
  /** the occasion being changed (null = a new one) */
  editing: FamilyOccasion | null;
  kids: FamilyChild[];
  members: FamilyMember[];
  /** another family's calendar (one the viewer joined); null = their own */
  familyId?: string | null;
  familyName?: string | null;
  /** 'own' = the viewer's own day in someone else's family */
  mode?: 'household' | 'own';
  selfAccountId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Kind>('BIRTHDAY');
  const [date, setDate] = useState('');
  const [noYear, setNoYear] = useState(false);
  const [lunar, setLunar] = useState<LunarValue>(null);
  const [who, setWho] = useState('');
  const [whose, setWhose] = useState<OccasionWhose>('OURS');
  const [share, setShare] = useState<Circle>('FAMILY');
  const [error, setError] = useState<string | null>(null);
  const own = mode === 'own';
  // the family lead changing someone else's addition: only narrower, the details stay theirs
  const leaderOnly = editing?.editRole === 'leader';
  useEffect(() => {
    if (!open) return;
    const yearless = editing?.date.startsWith('--') ?? false;
    setTitle(editing?.title ?? '');
    setKind(editing?.kind ?? 'BIRTHDAY');
    setDate(editing ? (yearless ? `2000${editing.date.slice(1)}` : editing.date) : '');
    setNoYear(yearless);
    setLunar(editing?.lunar ?? null);
    setWho(editing?.childId ? `c:${editing.childId}` : editing?.memberAccountId ? `m:${editing.memberAccountId}` : '');
    setWhose(editing?.whose ?? 'OURS');
    setShare(editing?.shareCircle ?? 'FAMILY');
    setError(null);
  }, [open, editing]);

  const someoneElse = !own && whose === 'SOMEONE_ELSE';
  const shareShown: Circle = someoneElse ? 'HOME' : share;
  // what the lead may still pick on someone else's day: as now, or narrower
  const shareLocked = (c: Circle) => someoneElse ? c !== 'HOME' : leaderOnly && editing ? RANK[c] > RANK[editing.shareCircle] : false;

  const save = () =>
    start(async () => {
      if (!title.trim()) return setError(REASONS.invalid!);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError(REASONS.date!);
      const input = {
        title,
        kind,
        date: noYear ? `-${date.slice(4)}` : date,
        lunar: noYear ? null : lunar,
        childId: own || someoneElse ? null : who.startsWith('c:') ? who.slice(2) : null,
        // their own day is theirs: always "for" them; someone else's isn't anyone's here
        memberAccountId: own ? selfAccountId : someoneElse ? null : who.startsWith('m:') ? who.slice(2) : null,
        whose: own ? ('OURS' as const) : whose,
        shareCircle: shareShown,
      };
      const r = editing
        ? await updateOccasionAction(editing.id, input)
        : familyId
          ? await addOccasionToFamilyAction(familyId, input)
          : await addOccasionAction(input);
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

  const field = 'min-h-11 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-cocoa disabled:opacity-60';
  const lab = 'mb-1.5 block text-[11px] font-extrabold uppercase tracking-wide text-ink-faint';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'change this occasion' : own ? `add your day${familyName ? ` to ${familyName}’s calendar` : ''}` : 'add an occasion'}
      subtitle={own ? 'your birthday, or a day of yours worth remembering — you choose who sees it' : 'birthdays, anniversaries, anything worth remembering'}
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
      {leaderOnly ? (
        <p className="mb-3 rounded-lg border-2 border-dashed border-cocoa/20 bg-paper-2 px-3 py-2 text-xs text-cocoa">
          someone else added this one. you can keep it closer to home, or take it off — the rest is theirs.
        </p>
      ) : null}
      {!own && !leaderOnly ? (
        <fieldset className="mb-3">
          <legend className={lab}>whose day is it?</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={whose === 'OURS'} onClick={() => setWhose('OURS')} className={chip(whose === 'OURS')}>
              mine / ours
            </button>
            <button type="button" aria-pressed={whose === 'SOMEONE_ELSE'} onClick={() => setWhose('SOMEONE_ELSE')} className={chip(whose === 'SOMEONE_ELSE')}>
              someone else’s
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-ink-soft">
            {someoneElse
              ? 'kept to your home. it’s their day to share, not ours.'
              : 'yours, your partner’s or your little ones’ — our anniversary, a baby shower, a first day at school.'}
          </p>
        </fieldset>
      ) : null}
      <label className="mb-3 block">
        <span className={lab}>what is it</span>
        <input
          value={title}
          maxLength={60}
          disabled={leaderOnly}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          placeholder={own ? 'my birthday' : someoneElse ? 'Uncle Joe’s birthday' : 'our anniversary'}
          className={field}
        />
      </label>
      <fieldset className="mb-3" disabled={leaderOnly}>
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
        <input
          type="date"
          value={date}
          disabled={leaderOnly}
          onChange={(e) => {
            setDate(e.target.value);
            setError(null);
          }}
          className={field}
        />
      </label>
      {!leaderOnly ? (
        <label className="mb-3 flex min-h-11 items-center gap-2 text-xs font-bold text-cocoa">
          <input type="checkbox" checked={noYear} onChange={(e) => setNoYear(e.target.checked)} className="h-5 w-5 accent-[var(--color-cta)]" />
          I don’t know the year
        </label>
      ) : null}
      {!noYear && !leaderOnly ? <LunarChoice value={lunar} onChange={setLunar} label="this date follows" /> : null}
      {!own && !leaderOnly && !someoneElse ? (
        <label className="mb-3 mt-3 block">
          <span className={lab}>who it’s for · optional</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} className={field}>
            <option value="">nobody in particular</option>
            {kids.map((k) => (
              <option key={k.id} value={`c:${k.id}`}>
                {k.firstName}
              </option>
            ))}
            {members
              .filter((m) => m.isYou || m.isOwner || m.circle === 'HOME')
              .map((m) => (
                <option key={m.accountId} value={`m:${m.accountId}`}>
                  {m.isYou ? `${m.name} (you)` : m.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <fieldset className="mt-3">
        <legend className={lab}>{own ? 'who sees your day' : 'who sees it'}</legend>
        <div className="flex flex-wrap gap-2">
          {SHARES.map((c) => (
            <button key={c.v} type="button" aria-pressed={shareShown === c.v} disabled={shareLocked(c.v)} onClick={() => setShare(c.v)} className={chip(shareShown === c.v)}>
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-soft">
          only people the calendar is shared with. beyond home it’s just the name, the day and the month — never the year or a picture. anyone who’s turned nudges on hears a month and two weeks before.
        </p>
      </fieldset>
      {error ? (
        <p role="alert" className="mt-3 border-l-2 border-berry pl-2 text-xs font-semibold text-cocoa">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
