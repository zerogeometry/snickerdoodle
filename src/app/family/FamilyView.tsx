'use client';

import { IconCalendarHeart, IconChevronRight, IconLock, IconMailForward, IconPlus, IconUsers } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import { MemberAvatar } from '@/ui/components/MemberAvatar';
import { AddFamilyMemberModal } from '@/ui/modals/AddFamilyMemberModal';
import { ManageChildModal, type ManagedChild } from '@/ui/modals/ManageChildModal';
import { ManageMemberModal, type ManagedMember } from '@/ui/modals/ManageMemberModal';
import { revokeInviteAction } from '@/app/actions/family';
import { toast } from '@/lib/store';
import type { AccessLevel } from '@/domain/types';
import type { FamilyData } from '@/server/family';

// Scrapbook sticker colours, from the tokens (white initials ≥3:1 at this size).
const AVATAR_COLORS = ['var(--color-tomato)', 'var(--color-cobalt)', 'var(--color-green-save)', 'var(--color-cta-deep)', 'var(--color-cobalt-deep)'];

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
  const [managing, setManaging] = useState<ManagedMember | null>(null);
  const [managingChild, setManagingChild] = useState<ManagedChild | null>(null);
  const [cancelling, startCancel] = useTransition();
  const router = useRouter();
  const owner = data.viewerIsOwner;
  const cancelInvite = (id: string, email: string) =>
    startCancel(async () => {
      const res = await revokeInviteAction(id);
      if (!res.ok) return toast('couldn’t cancel that — try again');
      toast(`invite to ${email.split('@')[0]} cancelled — the link no longer works`);
      router.refresh();
    });

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
        <div className="bg-honey-band px-6 py-7 text-center">
          <CaveatNote className="pop-in -rotate-2 text-xl">the whole gang</CaveatNote>
          <h1 className="pop-in mt-1 font-display text-[30px] leading-tight md:text-4xl" style={{ ['--i' as string]: 1 }}>{data.familyName}</h1>
          <p className="pop-in mt-1 text-[13px] text-ink-soft" style={{ ['--i' as string]: 2 }}>{peopleCount} in your circle · you decide who sees what</p>
        </div>

        <div className="mx-auto w-full max-w-4xl px-6">
          {/* Members + keepsake subjects */}
          <section className="py-6">
            <h2 className="flex items-center gap-2 font-display text-xl text-cocoa">
              <Icon icon={IconUsers} size={20} className="text-cinnamon" /> Members
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {data.children.map((c, i) => {
                const body = (
                  <>
                    <MemberAvatar initial={c.firstName.charAt(0).toUpperCase()} name="" color={AVATAR_COLORS[i % AVATAR_COLORS.length]!} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-cocoa">{c.firstName}</div>
                      <div className="truncate text-[11px] text-ink-soft">little one</div>
                      <span className="sticker mt-1.5 inline-block -rotate-2 whitespace-nowrap rounded-pill bg-honey px-2 py-0.5 text-[10px] font-extrabold text-cocoa">keepsake subject</span>
                    </div>
                    {owner ? <Icon icon={IconChevronRight} size={14} className="absolute right-2 top-2 text-ink-faint" /> : null}
                  </>
                );
                const cls = 'pop-in relative flex items-center gap-3 rounded-[18px] border-2 border-cocoa/15 bg-paper p-3 text-left';
                return owner ? (
                  <button key={`c-${c.id}`} type="button" onClick={() => setManagingChild(c)} aria-label={`edit or remove ${c.firstName}`} className={`${cls} press`} style={{ ['--i' as string]: i }}>
                    {body}
                  </button>
                ) : (
                  <div key={`c-${c.id}`} className={cls} style={{ ['--i' as string]: i }}>
                    {body}
                  </div>
                );
              })}
              {data.members.map((m, i) => {
                const manageable = owner && !m.isOwner && !m.isYou;
                const body = (
                  <>
                    <MemberAvatar initial={m.initial} name="" color={AVATAR_COLORS[(i + data.children.length) % AVATAR_COLORS.length]!} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-cocoa">{m.isYou ? `${m.name} (you)` : m.name}</div>
                      <div className="truncate text-[11px] text-ink-soft">{m.isOwner ? 'owner' : ACCESS_LABEL[m.accessLevel]}</div>
                      <span
                        className={`sticker mt-1.5 inline-block rounded-pill px-2 py-0.5 text-[10px] font-extrabold text-cocoa ${
                          m.circle === 'FAMILY' ? 'rotate-2 bg-berry-pale' : '-rotate-2 bg-leaf-pale'
                        }`}
                      >
                        {m.circle === 'FAMILY' ? 'Family' : 'Extended'}
                      </span>
                    </div>
                    {manageable ? <Icon icon={IconChevronRight} size={14} className="absolute right-2 top-2 text-ink-faint" /> : null}
                  </>
                );
                const cls = 'pop-in relative flex items-center gap-3 rounded-[18px] border-2 border-cocoa/15 bg-paper p-3 text-left';
                const style = { ['--i' as string]: i + data.children.length };
                return manageable ? (
                  <button key={m.accountId} type="button" onClick={() => setManaging(m)} aria-label={`manage ${m.name}`} className={`${cls} press`} style={style}>
                    {body}
                  </button>
                ) : (
                  <div key={m.accountId} className={cls} style={style}>
                    {body}
                  </div>
                );
              })}
              {data.pendingInvites.map((inv, i) => (
                <div key={inv.id} className="pop-in flex items-center gap-3 rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper-2 p-3" style={{ ['--i' as string]: i + data.children.length + data.members.length }}>
                  <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-line bg-paper text-ink-faint">
                    <Icon icon={IconMailForward} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-cocoa">{inv.email.split('@')[0]}</div>
                    <div className="text-[11px] text-ink-soft">invited · {inv.circle === 'FAMILY' ? 'family' : 'extended'}</div>
                    <button
                      type="button"
                      onClick={() => cancelInvite(inv.id, inv.email)}
                      disabled={cancelling}
                      aria-label={`cancel the invite to ${inv.email}`}
                      className="-ml-1 inline-flex min-h-11 items-center px-1 text-[12px] font-bold text-cinnamon underline disabled:opacity-60"
                    >
                      cancel invite
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="press flex min-h-[78px] flex-col items-center justify-center gap-1.5 rounded-[18px] border-2 border-dashed border-tomato bg-paper-2 text-cinnamon"
              >
                <Icon icon={IconPlus} size={22} />
                <span className="text-xs font-bold">add or invite</span>
              </button>
            </div>
          </section>

          {/* Occasions */}
          <section className="pb-6">
            <h2 className="flex items-center gap-2 font-display text-xl text-cocoa">
              <Icon icon={IconCalendarHeart} size={20} className="text-cinnamon" /> Birthdays &amp; occasions
            </h2>
            {occasions.length > 0 ? (
              <>
                <p className="mt-1 text-xs text-ink-soft">We&apos;ll give you a gentle nudge before each one.</p>
                <div className="mt-4 space-y-2.5">
                  {occasions.map((o, i) => (
                    <div key={o.child.id} className="pop-in flex items-center gap-3.5 rounded-[18px] border-2 border-cocoa/15 bg-paper p-3.5" style={{ ['--i' as string]: i }}>
                      <div className="sticker flex h-12 w-12 shrink-0 -rotate-3 flex-col items-center justify-center rounded-[12px] bg-honey-band leading-none">
                        <span className="text-[10px] font-extrabold text-cinnamon">{o.b.label.split(' ')[1]?.toUpperCase() ?? ''}</span>
                        <span className="font-display text-lg text-cocoa">{o.b.label.split(' ')[0]}</span>
                      </div>
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-cocoa">{o.child.firstName}&apos;s birthday</div>
                        <div className="text-[11px] text-ink-soft">{o.b.when}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-5 text-center text-sm text-ink-soft">
                Add a birthday to a little one and we&apos;ll nudge you before each special day.
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-center gap-2 bg-leaf-pale px-6 py-3.5 text-center text-xs font-semibold text-green-save">
          <Icon icon={IconLock} size={15} />
          You&apos;re the controller. Children are keepsake subjects, never account holders — and you can change or remove
          anyone, any time.
        </div>
      </main>

      <BottomTabBar tabs={APP_TABS} active="Family" />
      <AddFamilyMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ManageMemberModal member={managing} onClose={() => setManaging(null)} />
      <ManageChildModal child={managingChild} onClose={() => setManagingChild(null)} />
    </div>
  );
}
