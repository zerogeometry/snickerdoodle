'use client';

import { IconArrowRight, IconCake, IconHeart, IconHomeHeart, IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import type { Relationship } from '@/domain/types';
import type { FamilyData, FamilyOccasion } from '@/server/family';
import { Icon } from '@/ui/primitives/Icon';

const ROLE: Record<Relationship, string> = { CHILD: 'little one', PARENT: 'parent', ADULT_CHILD: 'grown-up child', GRANDPARENT: 'grandparent', AUNT_UNCLE: 'aunt / uncle', CLOSE_FRIEND: 'close friend', OTHER: 'family friend' };
const CIRCLE_NAME = { HOME: 'home', FAMILY: 'family circle', EXTENDED: 'extended family' } as const;
const SHARE_NAME = { HOME: 'home sees it', FAMILY: 'home + family see it', EXTENDED: 'everyone sees it' } as const;
const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .8)', 'rgb(232 120 110 / .75)', 'rgb(127 166 94 / .75)'];

/**
 * "My families" (founder, 27 Oct): the OTHER families the viewer belongs to — the grandparent's view of
 * their children's families, say — each a taped card: its banner, its name, where the viewer sits in it,
 * how many keepsakes it shares with them. Their shared dates are already on this page's calendar.
 * D27: and the days THEY added to that family's calendar (their own birthday…) — theirs to add, change and share.
 */
export function MyFamilies({
  families,
  onAddDay,
  onEditDay,
}: {
  families: FamilyData['myFamilies'];
  /** add a day to that family's calendar: their own, or (a home member who can add) the household's */
  onAddDay?: (f: FamilyData['myFamilies'][number]) => void;
  onEditDay?: (f: FamilyData['myFamilies'][number], day: FamilyOccasion) => void;
}) {
  return (
    <section aria-labelledby="my-families">
      <h2 id="my-families" className="flex items-center gap-2 font-display text-xl font-extrabold text-cocoa">
        <Icon icon={IconHomeHeart} size={20} className="text-cinnamon" /> my families
      </h2>
      <p className="mt-1 text-sm text-ink-soft">the other families you’re part of.</p>
      {families.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {families.map((f, i) => (
            <div
              key={f.familyId}
              className="polaroid tape pop-in"
              style={{ ['--tilt' as string]: `${i % 2 ? 1.2 : -1.2}deg`, ['--tape' as string]: TAPES[i % TAPES.length], ['--i' as string]: i }}
            >
            <Link href={`/home?family=${f.familyId}`} className="press block">
              <span className="flex h-24 w-full items-center justify-center overflow-hidden bg-honey-band">
                {f.bannerUrl ? <img src={f.bannerUrl} alt="" className="h-full w-full object-cover" /> : <span className="font-display text-3xl font-extrabold text-cocoa">{f.name.charAt(0)}</span>}
              </span>
              <span className="mt-2 block px-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-lg font-extrabold text-cocoa">{f.name}</span>
                  <Icon icon={IconArrowRight} size={16} className="shrink-0 text-cinnamon" />
                </span>
                <span className="block text-xs text-ink-soft">
                  you’re {ROLE[f.relationship]} · {CIRCLE_NAME[f.circle]}
                </span>
                <span className="mt-1 block text-xs font-bold text-cocoa">
                  {f.keepsakes} keepsake{f.keepsakes === 1 ? '' : 's'} shared with you{f.seesCalendar ? ' · their dates are on your calendar' : ''}
                </span>
              </span>
            </Link>
            {onAddDay ? (
              <div className="mt-2 border-t border-dashed border-cocoa/20 px-1 pt-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">your days on their calendar</p>
                {f.myDays.length ? (
                  <ul className="mt-1 space-y-1">
                    {f.myDays.map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => onEditDay?.(f, d)} className="flex min-h-11 w-full items-center gap-2 text-left text-xs text-cocoa">
                          <Icon icon={IconCake} size={14} className="shrink-0 text-cinnamon" />
                          <span className="min-w-0 flex-1 truncate font-bold">{d.title}</span>
                          <span className="shrink-0 text-ink-soft">{SHARE_NAME[d.shareCircle]}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" onClick={() => onAddDay(f)} className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-bold text-cinnamon">
                  <Icon icon={IconPlus} size={14} /> {f.canAddHousehold ? 'add a day' : 'add your birthday'}
                </button>
              </div>
            ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[16px] border-2 border-dashed border-cocoa/20 bg-paper p-4 text-center text-sm text-ink-soft">
          when another family invites you — your parents’, a sister’s, a cousin’s — they’ll show up here.
        </p>
      )}
    </section>
  );
}

/** The newest keepsakes, small — a little strip that leads to the keepsake box. */
export function RecentlyKept({ items }: { items: FamilyData['recentlyKept'] }) {
  return (
    <section aria-labelledby="recently-kept">
      <h2 id="recently-kept" className="flex items-center gap-2 font-display text-xl font-extrabold text-cocoa">
        <Icon icon={IconHeart} size={20} className="text-cinnamon" /> recently kept
      </h2>
      {items.length ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {items.map((k, i) => (
              <Link key={k.id} href="/home" aria-label="open your keepsake box" className="polaroid lift pop-in block !p-1.5" style={{ ['--tilt' as string]: `${i % 2 ? 2 : -2}deg`, ['--i' as string]: i }}>
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden bg-paper-2">{k.thumbUrl ? <img src={k.thumbUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}</span>
              </Link>
            ))}
          </div>
          <Link href="/home" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-cinnamon">
            see the whole keepsake box <Icon icon={IconArrowRight} size={14} />
          </Link>
        </>
      ) : (
        <p className="mt-3 rounded-[16px] border-2 border-dashed border-cocoa/20 bg-paper p-4 text-center text-sm text-ink-soft">nothing kept yet — keep a drawing and it’ll land here.</p>
      )}
    </section>
  );
}
