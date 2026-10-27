'use client';

import { IconCheck, IconLock } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setCelebrateAction } from '@/app/actions/family';
import { FESTIVAL_GROUPS } from '@/lib/occasions/catalogue';
import { toast } from '@/lib/store';
import { Icon } from '@/ui/primitives/Icon';

/**
 * "The days we celebrate" (founder, 27 Oct). Opt in per group — the everyday family days and Christmas
 * start on; everything else is the family's own choice. The East Asian festivals sit together with a
 * region each (the customs and, for Korea, the dates differ). Private to the family: a calendar
 * preference only, never used for anything else (special-category data — DPIA, privacy notice).
 */
export function DaysWeCelebrate({ chosen, canEdit }: { chosen: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(new Set(chosen));
  const [pending, start] = useTransition();
  const flip = (id: string) => {
    if (!canEdit) return;
    const next = new Set(on);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOn(next);
    start(async () => {
      const r = await setCelebrateAction([...next]);
      if (!r.ok) {
        setOn(on);
        return void toast('couldn’t change that — try again');
      }
      router.refresh();
    });
  };
  const card = (id: string, name: string, blurb: string, note?: string) => {
    const ticked = on.has(id);
    return (
      <button
        key={id}
        type="button"
        role="checkbox"
        aria-checked={ticked}
        disabled={!canEdit}
        onClick={() => flip(id)}
        className={`flex min-h-14 items-start gap-3 rounded-[16px] border-2 px-3 py-2.5 text-left ${ticked ? 'border-cocoa bg-honey-band' : 'border-cocoa/20 bg-paper'} ${canEdit ? 'press' : 'cursor-default'}`}
      >
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-2 border-cocoa ${ticked ? 'bg-cocoa text-paper' : 'bg-paper'}`}>{ticked ? <Icon icon={IconCheck} size={14} /> : null}</span>
        <span>
          <span className="block text-sm font-extrabold text-cocoa">{name}</span>
          <span className="block text-xs text-ink-soft">{blurb}</span>
          {note ? <span className="mt-0.5 block text-[11px] text-ink-faint">{note}</span> : null}
        </span>
      </button>
    );
  };
  const main = FESTIVAL_GROUPS.filter((g) => !g.family && g.id !== 'buddhist' && g.id !== 'milestones');
  const eastAsian = FESTIVAL_GROUPS.filter((g) => g.family === 'east-asian');
  const buddhist = FESTIVAL_GROUPS.find((g) => g.id === 'buddhist')!;
  const milestones = FESTIVAL_GROUPS.find((g) => g.id === 'milestones')!;
  return (
    <section aria-labelledby="celebrate" className={`rounded-[24px] border-2 border-cocoa/15 bg-paper p-5 ${pending ? 'opacity-80' : ''}`}>
      <h2 id="celebrate" className="font-display text-xl font-extrabold text-cocoa">the days we celebrate</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {canEdit ? 'pick what your family marks — we’ll put them on your calendar and nudge you before each one.' : 'the family lead chooses these — they’re on your calendar here.'}
      </p>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">{main.map((g) => card(g.id, g.name, g.blurb, g.expected ? 'dates can move by a day — we show the expected one' : undefined))}</div>
      <h3 className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">lunar new year & mid-autumn</h3>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-3">{eastAsian.map((g) => card(g.id, g.name, g.blurb))}</div>
      <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
        {card(buddhist.id, buddhist.name, buddhist.blurb)}
        {card(milestones.id, milestones.name, milestones.blurb)}
      </div>
      <p className="mt-4 flex items-start gap-1.5 text-[11px] text-ink-soft">
        <Icon icon={IconLock} size={13} className="mt-px shrink-0 text-green-save" />
        private to your family — only ever used to put these days on your calendar. never for anything else.
      </p>
    </section>
  );
}
