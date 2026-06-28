'use client';

import { IconCalendarHeart, IconLock, IconPlus, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import { MemberAvatar } from '@/ui/components/MemberAvatar';
import { AddFamilyMemberModal } from '@/ui/modals/AddFamilyMemberModal';
import type { AccessLevel } from '@/domain/types';
import type { FamilyData } from '@/server/family';

const AVATAR_COLORS = ['#C8623A', '#84BBD0', '#E8786E', '#93B97C', '#F2A640'];

const ACCESS_LABEL: Record<AccessLevel, string> = {
  VIEW: 'view',
  VIEW_BUY: 'view & buy',
  CONTRIBUTE: 'view, buy & add',
};

// "14 Mar" → the next upcoming occurrence, for the gentle-nudge list.
function nextBirthday(iso: string): { label: string; when: string; sortKey: number } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const next = new Date(now.getFullYear(), d.getMonth(), d.getDate());
  if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
  const days = Math.round((next.getTime() - now.getTime()) / 86_400_000);
  const when = days === 0 ? 'today 🎉' : days === 1 ? 'tomorrow' : days < 14 ? `in ${days} days` : days < 60 ? `in ${Math.round(days / 7)} weeks` : `in ${Math.round(days / 30)} months`;
  return { label: next.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }), when, sortKey: days };
}

export function FamilyView({ data }: { data: FamilyData }) {
  const [addOpen, setAddOpen] = useState(false);

  // Children (keepsake subjects) lead; then the people in the circle.
  const peopleCount = data.members.length + data.children.length;
  const occasions = data.children
    .map((c) => ({ child: c, b: c.birthdayISO ? nextBirthday(c.birthdayISO) : null }))
    .filter((o): o is { child: typeof o.child; b: NonNullable<typeof o.b> } => o.b !== null)
    .sort((a, b) => a.b.sortKey - b.b.sortKey);

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Family" />

      <main id="main" className="flex-1">
        <div className="bg-honey-band px-6 py-6 text-center">
          <CaveatNote className="text-lg">the whole gang</CaveatNote>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight md:text-3xl">{data.familyName}</h1>
          <p className="mt-1 text-[13px] text-[#9C8772]">{peopleCount} in your circle · you decide who sees what</p>
        </div>

        <div className="mx-auto w-full max-w-4xl px-6">
          {/* Members + keepsake subjects */}
          <section className="py-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconUsers} size={18} className="text-cinnamon" /> Members
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.children.map((c, i) => (
                <div key={`c-${c.id}`} className="flex items-center gap-3 rounded-2xl border border-[#EFE6D6] bg-white p-3">
                  <MemberAvatar initial={c.firstName.charAt(0).toUpperCase()} name="" color={AVATAR_COLORS[i % AVATAR_COLORS.length]!} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-cocoa">{c.firstName}</div>
                    <div className="truncate text-[11px] text-[#9C8E7E]">little one</div>
                    <span className="mt-1 inline-block rounded-full bg-[#EFE6D6] px-2 py-0.5 text-[10px] font-bold text-[#7A6A58]">keepsake subject</span>
                  </div>
                </div>
              ))}
              {data.members.map((m, i) => (
                <div key={m.accountId} className="flex items-center gap-3 rounded-2xl border border-[#EFE6D6] bg-white p-3">
                  <MemberAvatar
                    initial={m.initial}
                    name=""
                    color={AVATAR_COLORS[(i + data.children.length) % AVATAR_COLORS.length]!}
                  />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-cocoa">{m.isYou ? `${m.name} (you)` : m.name}</div>
                    <div className="truncate text-[11px] text-[#9C8E7E]">{m.isOwner ? 'owner' : ACCESS_LABEL[m.accessLevel]}</div>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        m.circle === 'FAMILY' ? 'bg-[#FBE4DA] text-cinnamon' : 'bg-[#E8F0DF] text-green-save'
                      }`}
                    >
                      {m.circle === 'FAMILY' ? 'Family' : 'Extended'}
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
              <Icon icon={IconCalendarHeart} size={18} className="text-cinnamon" /> Birthdays &amp; occasions
            </p>
            {occasions.length > 0 ? (
              <>
                <p className="mt-1 text-xs text-[#9C8E7E]">We&apos;ll give you a gentle nudge before each one.</p>
                <div className="mt-4 space-y-2.5">
                  {occasions.map((o) => (
                    <div key={o.child.id} className="flex items-center gap-3.5 rounded-2xl border border-[#EFE6D6] bg-white p-3.5">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-honey bg-[#FFFDF8] leading-none">
                        <span className="text-[10px] font-bold text-cinnamon">{o.b.label.split(' ')[1]?.toUpperCase() ?? ''}</span>
                        <span className="font-display text-base font-semibold text-cocoa">{o.b.label.split(' ')[0]}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-cocoa">{o.child.firstName}&apos;s birthday</div>
                        <div className="text-[11px] text-[#9C8E7E]">{o.b.when}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-4 text-center text-xs text-[#7A6A58]">
                Add a birthday to a little one and we&apos;ll nudge you before each special day.
              </div>
            )}
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
