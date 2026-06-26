'use client';

import { IconCalendarHeart, IconLock, IconPlus, IconShieldCheck, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import { MemberAvatar } from '@/ui/components/MemberAvatar';
import { AddFamilyMemberModal } from '@/ui/modals/AddFamilyMemberModal';
import { useFamily } from '@/lib/store';

const BASE_MEMBERS = [
  { initial: 'O', name: 'Olivia', sub: 'age 5 · little one', color: '#C8623A', circle: 'subject' },
  { initial: 'M', name: 'Max', sub: 'age 8 · little one', color: '#84BBD0', circle: 'subject' },
  { initial: 'S', name: 'Sam', sub: 'you · owner', color: '#E8786E', circle: 'Family' },
  { initial: 'J', name: 'Jo', sub: 'parent · view, buy & add', color: '#93B97C', circle: 'Family' },
  { initial: 'R', name: 'Rosie', sub: 'grandma · view & buy', color: '#F2A640', textColor: '#3A2E1E', circle: 'Extended' },
];

const OCCASIONS = [
  { mon: 'JUL', day: '14', who: "Olivia's birthday", when: 'in 3 weeks' },
  { mon: 'SEP', day: '02', who: "Max's birthday", when: 'in 10 weeks' },
  { mon: 'DEC', day: '25', who: 'Christmas', when: 'this year' },
];

export default function FamilyPage() {
  const [addOpen, setAddOpen] = useState(false);
  const added = useFamily((s) => s.members);
  const members = [...BASE_MEMBERS, ...added.map((m) => ({ ...m, circle: 'Extended' as const }))];

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Family" />

      <main id="main" className="flex-1">
        <div className="bg-honey-band px-6 py-6 text-center">
          <CaveatNote className="text-lg">the whole gang</CaveatNote>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight md:text-3xl">Your family circle</h1>
          <p className="mt-1 text-[13px] text-[#9C8772]">{members.length} people · you decide who sees what</p>
        </div>

        <div className="mx-auto w-full max-w-4xl px-6">
          {/* Members */}
          <section className="py-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconUsers} size={18} className="text-cinnamon" /> Members
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {members.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center gap-3 rounded-2xl border border-[#EFE6D6] bg-white p-3"
                >
                  <MemberAvatar initial={m.initial} name="" color={m.color} textColor={m.textColor} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-cocoa">{m.name}</div>
                    <div className="truncate text-[11px] text-[#9C8E7E]">{m.sub}</div>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        m.circle === 'Family'
                          ? 'bg-[#FBE4DA] text-cinnamon'
                          : m.circle === 'Extended'
                            ? 'bg-[#E8F0DF] text-green-save'
                            : 'bg-[#EFE6D6] text-[#7A6A58]'
                      }`}
                    >
                      {m.circle === 'subject' ? 'keepsake subject' : m.circle}
                    </span>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-[#E0A268] bg-[#FCF1E3] text-cinnamon"
              >
                <Icon icon={IconPlus} size={22} />
                <span className="text-xs font-bold">add or invite</span>
              </button>
            </div>
          </section>

          {/* Occasions */}
          <section className="pb-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconCalendarHeart} size={18} className="text-cinnamon" /> Birthdays & occasions
            </p>
            <p className="mt-1 text-xs text-[#9C8E7E]">We&apos;ll give you a gentle nudge before each one.</p>
            <div className="mt-4 space-y-2.5">
              {OCCASIONS.map((o) => (
                <div key={o.who} className="flex items-center gap-3.5 rounded-2xl border border-[#EFE6D6] bg-white p-3.5">
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-honey bg-[#FFFDF8] leading-none">
                    <span className="text-[10px] font-bold text-cinnamon">{o.mon}</span>
                    <span className="font-display text-base font-semibold text-cocoa">{o.day}</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-bold text-cocoa">{o.who}</div>
                    <div className="text-[11px] text-[#9C8E7E]">{o.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-center gap-2 bg-[#F1E7D4] px-6 py-3.5 text-center text-xs text-green-save">
          <Icon icon={IconLock} size={15} />
          You&apos;re the controller. Children are keepsake subjects, never account holders — and you can change or remove
          anyone, any time.
        </div>
      </main>

      <BottomTabBar tabs={APP_TABS} active="Family" />
      <AddFamilyMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
