'use client';

import { IconArrowRight, IconHeart, IconHomeHeart } from '@tabler/icons-react';
import Link from 'next/link';
import type { Relationship } from '@/domain/types';
import type { FamilyData } from '@/server/family';
import { Icon } from '@/ui/primitives/Icon';

const ROLE: Record<Relationship, string> = { CHILD: 'little one', PARENT: 'parent', GRANDPARENT: 'grandparent', AUNT_UNCLE: 'aunt / uncle', CLOSE_FRIEND: 'close friend', OTHER: 'family friend' };
const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .8)', 'rgb(232 120 110 / .75)', 'rgb(127 166 94 / .75)'];

/**
 * "My families" (founder, 27 Oct): the OTHER families the viewer belongs to — the grandparent's view of
 * their children's families, say — each a taped card: its banner, its name, where the viewer sits in it,
 * how many keepsakes it shares with them. Their shared dates are already on this page's calendar.
 */
export function MyFamilies({ families }: { families: FamilyData['myFamilies'] }) {
  return (
    <section aria-labelledby="my-families">
      <h2 id="my-families" className="flex items-center gap-2 font-display text-xl font-extrabold text-cocoa">
        <Icon icon={IconHomeHeart} size={20} className="text-cinnamon" /> my families
      </h2>
      <p className="mt-1 text-sm text-ink-soft">the other families you’re part of.</p>
      {families.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {families.map((f, i) => (
            <Link
              key={f.familyId}
              href={`/home?family=${f.familyId}`}
              className="polaroid tape lift pop-in press block"
              style={{ ['--tilt' as string]: `${i % 2 ? 1.2 : -1.2}deg`, ['--tape' as string]: TAPES[i % TAPES.length], ['--i' as string]: i }}
            >
              <span className="flex h-24 w-full items-center justify-center overflow-hidden bg-honey-band">
                {f.bannerUrl ? <img src={f.bannerUrl} alt="" className="h-full w-full object-cover" /> : <span className="font-display text-3xl font-extrabold text-cocoa">{f.name.charAt(0)}</span>}
              </span>
              <span className="mt-2 block px-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-lg font-extrabold text-cocoa">{f.name}</span>
                  <Icon icon={IconArrowRight} size={16} className="shrink-0 text-cinnamon" />
                </span>
                <span className="block text-xs text-ink-soft">
                  you’re {ROLE[f.relationship]} · {f.circle === 'FAMILY' ? 'family circle' : 'extended family'}
                </span>
                <span className="mt-1 block text-xs font-bold text-cocoa">
                  {f.keepsakes} keepsake{f.keepsakes === 1 ? '' : 's'} shared with you{f.seesCalendar ? ' · their dates are on your calendar' : ''}
                </span>
              </span>
            </Link>
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
