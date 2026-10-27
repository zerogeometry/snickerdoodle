'use client';

import { IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import { FamilyBanner } from '@/ui/components/FamilyBanner';
import { AddFamilyMemberModal, type Rel } from '@/ui/modals/AddFamilyMemberModal';
import { ManageChildModal, type ManagedChild } from '@/ui/modals/ManageChildModal';
import { ManageMemberModal, type ManagedMember } from '@/ui/modals/ManageMemberModal';
import type { FamilyData, FamilyOccasion } from '@/server/family';
import type { CalendarEvent } from '@/server/occasions';
import { ComingUp } from './ComingUp';
import { DaysWeCelebrate } from './DaysWeCelebrate';
import { FamilyCalendar } from './FamilyCalendar';
import { FamilyPinboard } from './FamilyPinboard';
import { MyFamilies, RecentlyKept } from './MyFamiliesAndKept';
import { OccasionSheet } from './OccasionSheet';

/**
 * The Family page (founder's mockup, 27 Oct). Left: your family circles (the pinboard), my families,
 * the days we celebrate. Right: coming up, the calendar, recently kept. Everything a leader needs to
 * look after the family — and be a little proud of it.
 */
export function FamilyView({ data }: { data: FamilyData }) {
  const [adding, setAdding] = useState<Rel | null>(null);
  const [managing, setManaging] = useState<ManagedMember | null>(null);
  const [managingChild, setManagingChild] = useState<ManagedChild | null>(null);
  const [occasion, setOccasion] = useState<{ open: boolean; editing: FamilyOccasion | null }>({ open: false, editing: null });
  const owner = data.viewerIsOwner;
  const today = new Date().toISOString().slice(0, 10);

  // an event the viewer may change opens its occasion
  const editFor = (e: CalendarEvent) => {
    const o = e.occasionId ? data.occasions.find((x) => x.id === e.occasionId) : undefined;
    return o?.canChange ? () => setOccasion({ open: true, editing: o }) : undefined;
  };

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Family" />

      <main id="main" className="flex-1">
        {data.bannerUrl ? <FamilyBanner url={data.bannerUrl} canEdit={owner} familyName={data.familyName} /> : null}
        <div className="bg-honey-band px-6 py-7 text-center">
          <CaveatNote className="pop-in -rotate-2 text-xl">the whole gang</CaveatNote>
          <h1 className="pop-in mt-1 font-display text-[30px] leading-tight md:text-4xl" style={{ ['--i' as string]: 1 }}>
            {data.familyName}
          </h1>
          <p className="pop-in mt-1 text-[13px] text-ink-soft" style={{ ['--i' as string]: 2 }}>
            {data.stats.people} in your circle · you decide who sees what
          </p>
          {!data.bannerUrl && owner ? <FamilyBanner url={null} canEdit familyName={data.familyName} /> : null}
        </div>

        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] 2xl:max-w-[1600px]">
          <div className="min-w-0 space-y-8">
            <FamilyPinboard
              data={data}
              onManageMember={(m) => setManaging(m)}
              onManageChild={(c) => setManagingChild(c)}
              onAdd={(rel) => setAdding(rel)}
            />
            <MyFamilies families={data.myFamilies} />
            <DaysWeCelebrate chosen={data.celebrate} canEdit={data.viewer.canSetCelebrate} />
          </div>
          <div className="min-w-0 space-y-8">
            {data.viewer.seesCalendar ? (
              <>
                <ComingUp
                  events={data.calendar}
                  today={today}
                  remindersOn={data.viewer.remindersOn}
                  canAdd={data.viewer.canAddOccasion}
                  onAdd={() => setOccasion({ open: true, editing: null })}
                  editFor={editFor}
                />
                <FamilyCalendar events={data.calendar} from={data.calendarFrom} today={today} remindersOn={data.viewer.remindersOn} editFor={editFor} />
              </>
            ) : (
              <p className="rounded-[16px] border-2 border-dashed border-cocoa/20 bg-paper p-4 text-center text-sm text-ink-soft">the family lead hasn’t shared the calendar with you yet.</p>
            )}
            <RecentlyKept items={data.recentlyKept} />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 bg-leaf-pale px-6 py-3.5 text-center text-xs font-semibold text-green-save">
          <Icon icon={IconLock} size={15} />
          You&apos;re the controller. Children are keepsake subjects, never account holders — and you can change or remove anyone, any time.
        </div>
      </main>

      <BottomTabBar tabs={APP_TABS} active="Family" />
      <AddFamilyMemberModal open={adding !== null} onClose={() => setAdding(null)} initialRel={adding ?? 'Grandparent'} />
      <ManageMemberModal member={managing} onClose={() => setManaging(null)} />
      <ManageChildModal child={managingChild} onClose={() => setManagingChild(null)} />
      <OccasionSheet open={occasion.open} editing={occasion.editing} onClose={() => setOccasion({ open: false, editing: null })} kids={data.children} members={data.members} />
    </div>
  );
}
