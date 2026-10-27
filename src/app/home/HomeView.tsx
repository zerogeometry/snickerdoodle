'use client';

import { IconCake, IconGift, IconHeart, IconLock, IconMailForward, IconPencil, IconPlus, IconSparkles, IconUsers, IconWand, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import { KeepsakeTile } from '@/ui/components/KeepsakeTile';
import { MemberAvatar } from '@/ui/components/MemberAvatar';
import { FamilyBanner } from '@/ui/components/FamilyBanner';
import { AddFamilyMemberModal } from '@/ui/modals/AddFamilyMemberModal';
import { CreateGiftLinkModal } from '@/ui/modals/CreateGiftLinkModal';
import { PerAssetVisibilityModal } from '@/ui/modals/PerAssetVisibilityModal';
import { toast } from '@/lib/store';
import { deleteKeepsakeAction, setAssetVisibilityAction } from '@/app/actions/keep';
import { leaveFamilyAction, renameFamilyAction, revokeGiftLinkAction, setMemberCalendarAction, setReminderConsentAction } from '@/app/actions/family';
import { Chip } from '@/ui/primitives/Chip';
import { deleteSavedDesignAction } from '@/app/actions/designs';
import { gbp } from '@/lib/store';
import { exampleBySlug } from '@/lib/examples';
import { Toggle } from '@/ui/primitives/Toggle';
import type { HomeData, HomeKeepsake } from '@/server/home';
import type { VisibilityTier } from '@/domain/types';
import { isChristmasSeason } from '@/lib/season';
import { useNow } from '@/ui/useNow';
import { ReportKeepsake } from '@/ui/components/ReportKeepsake';

const VIS_LABEL: Record<VisibilityTier, string> = { ONLY_ME: 'Only me', FAMILY: 'Family', EXTENDED: 'Extended' };
const AVATAR_COLORS = ['#C8402A', '#2F5DA8', '#7FA65E', '#E8786E', '#8E2A1A']; // Scrapbook stickers (white initials ≥3:1 at this size)

/** The next birthday among the little ones within ~2 months: the gentle "coming up"
 * nudge. Derived only from a date the parent gave us (no profiling). */
function nextBirthday(kids: HomeData['children'], now = new Date()): { name: string; turns: number; inDays: number; label: string } | null {
  let best: { name: string; turns: number; inDays: number; label: string } | null = null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  for (const c of kids) {
    if (!c.birthday) continue;
    const [y, m, d] = c.birthday.split('-').map(Number) as [number, number, number];
    let year = now.getFullYear();
    let at = Date.UTC(year, m - 1, d);
    if (at < today) at = Date.UTC(++year, m - 1, d);
    const inDays = Math.round((at - today) / 86_400_000);
    if (inDays > 60) continue;
    if (!best || inDays < best.inDays) {
      best = { name: c.firstName, turns: year - y, inDays, label: new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) };
    }
  }
  return best;
}

function whenLabel(inDays: number): string {
  if (inDays === 0) return 'today!';
  if (inDays === 1) return 'tomorrow';
  return 'in ' + inDays + ' days';
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

export function HomeView({ data }: { data: HomeData }) {
  const router = useRouter();
  const [active, setActive] = useState<HomeKeepsake | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const nowForSeason = useNow();
  const christmasNow = nowForSeason !== null && isChristmasSeason(nowForSeason); // D24 seasonal copy
  const [highlightNew, setHighlightNew] = useState(false);
  const newestRef = useRef<HTMLDivElement>(null);

  // Arriving from a just-completed checkout / share (…/home?new=1): spotlight the
  // newest keepsake (it's first — loadHome orders desc by createdAt) and scroll to
  // it, then clean the URL so a refresh doesn't re-trigger.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('new') !== '1') return;
    setHighlightNew(true);
    // scrollIntoView's `behavior` is a DOM API, NOT governed by the CSS reduced-motion
    // rule — honour the preference explicitly (NN7).
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const t = setTimeout(() => newestRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }), 250);
    window.history.replaceState({}, '', '/home');
    return () => clearTimeout(t);
  }, []);

  // Let the spotlight fade on its own so it never lingers as un-dismissable clutter.
  useEffect(() => {
    if (!highlightNew) return;
    const t = setTimeout(() => setHighlightNew(false), 8000);
    return () => clearTimeout(t);
  }, [highlightNew]);

  const greetingName = data.account.name ?? data.account.email.split('@')[0];
  const others = data.members.filter((m) => !m.isYou).map((m) => ({ initial: m.initial, circle: m.circle }));
  const comingUp = nextBirthday(data.children);
  const [remindersOn, setRemindersOn] = useState(data.remindersOn);
  const toggleReminders = async (on: boolean) => {
    setRemindersOn(on);
    const res = await setReminderConsentAction(on);
    if (!res.ok) {
      setRemindersOn(!on);
      return toast('couldn’t change that — try again');
    }
    toast(on ? 'we’ll send a gentle nudge before birthdays' : 'birthday nudges are off');
  };
  const relatives = data.members.filter((m) => !m.isOwner);
  const removeDesign = async (id: string) => {
    const res = await deleteSavedDesignAction(id);
    toast(res.ok ? 'removed from saved' : 'couldn’t remove that');
    if (res.ok) router.refresh();
  };
  const toggleCalendar = async (accountId: string, name: string, on: boolean) => {
    const res = await setMemberCalendarAction(accountId, on);
    if (!res.ok) return toast('couldn’t change that — try again');
    toast(on ? `${name} can see the family calendar` : `${name} no longer sees birthdays`);
    router.refresh();
  };
  // Switching a gift request off asks once first (it stops working for everyone holding the link).
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const revokeList = async (id: string) => {
    const res = await revokeGiftLinkAction(id);
    setConfirmRevoke(null);
    if (!res.ok) return toast('couldn’t switch that off — try again');
    toast('switched off — that link no longer works');
    router.refresh();
  };
  const [confirmLeave, setConfirmLeave] = useState(false);
  const leave = async () => {
    const res = await leaveFamilyAction(data.familyId);
    if (!res.ok) return toast('couldn’t do that — try again');
    toast(`you’ve left ${data.familyName}`);
    router.push('/home');
    router.refresh();
  };
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(data.familyName);

  const saveName = async () => {
    const res = await renameFamilyAction(newName);
    if (!res.ok) return toast('a name between 2 and 40 letters, please');
    setRenaming(false);
    toast('family name updated');
    router.refresh();
  };

  const saveVisibility = async (tier: VisibilityTier) => {
    if (!active) return;
    const res = await setAssetVisibilityAction(active.id, tier);
    setActive(null);
    if (res.ok) {
      toast(`visibility set to ${VIS_LABEL[tier].toLowerCase()}`);
      router.refresh(); // re-fetch the server data so the badge updates
    } else {
      toast('couldn’t change that');
    }
  };

  const deleteActive = async () => {
    if (!active) return;
    const res = await deleteKeepsakeAction(active.id);
    setActive(null);
    if (res.ok) {
      toast('keepsake deleted — gone for good');
      router.refresh();
    } else {
      toast('couldn’t delete that');
    }
  };

  // Group keepsakes into each child's corner; whatever isn't filed under a child
  // falls into a final catch-all (which also holds the "create new" tile).
  const newestId = data.keepsakes[0]?.id ?? null;
  const childGroups = data.children
    .map((c) => ({ child: c, items: data.keepsakes.filter((k) => k.childSubjectId === c.id) }))
    .filter((g) => g.items.length > 0);
  const filedIds = new Set(childGroups.flatMap((g) => g.items.map((k) => k.id)));
  const unfiled = data.keepsakes.filter((k) => !filedIds.has(k.id));

  const renderTile = (k: HomeKeepsake, i: number) => {
    const isNewest = k.id === newestId && highlightNew;
    return (
      <div
        key={k.id}
        ref={isNewest ? newestRef : undefined}
        className={isNewest ? 'rounded-2xl ring-4 ring-honey ring-offset-2 ring-offset-oat' : undefined}
      >
        {k.canManage ? (
          <button type="button" onClick={() => setActive(k)} className="block w-full text-left" aria-label={k.held ? 'being checked after a report — choose who can see this keepsake' : 'choose who can see this keepsake'}>
            {/* held after a report: only this parent sees it meanwhile (D8) */}
            <KeepsakeTile index={i} name="Keepsake" meta={monthLabel(k.createdAtISO)} image={(k.thumbUrl ?? k.imageUrl) ?? undefined} badge={k.held ? 'being checked' : VIS_LABEL[k.visibility]} />
          </button>
        ) : (
          <>
            <KeepsakeTile index={i} name="Keepsake" meta={monthLabel(k.createdAtISO)} image={(k.thumbUrl ?? k.imageUrl) ?? undefined} />
            {k.canReport ? <ReportKeepsake assetId={k.id} /> : null}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Home" />

      <main id="main" className="flex-1">
        {/* Family header — the family's banner (if any) above the welcome */}
        {data.bannerUrl ? <FamilyBanner url={data.bannerUrl} canEdit={data.isOwner} familyName={data.familyName} /> : null}
        <div className="bg-honey-band px-6 py-6 text-center">
          <CaveatNote className="text-lg">welcome back, {greetingName}</CaveatNote>
          {renaming ? (
            <form
              className="mx-auto mt-1 flex max-w-xs items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void saveName();
              }}
            >
              <label className="sr-only" htmlFor="family-name">
                family name
              </label>
              <input
                id="family-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={40}
                autoFocus
                className="min-h-[44px] flex-1 rounded-lg border border-line bg-paper px-3 text-center font-display text-lg text-cocoa"
              />
              <Button type="submit" size="md">
                save
              </Button>
            </form>
          ) : (
            <h1 className="mt-1 font-display text-2xl font-semibold leading-tight md:text-3xl">
              {data.familyName}
              {data.isOwner ? (
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  className="ml-1 inline-flex h-11 w-11 items-center justify-center rounded-full align-middle text-ink-faint hover:text-cinnamon"
                  aria-label="rename your family"
                >
                  <Icon icon={IconPencil} size={16} />
                </button>
              ) : null}
            </h1>
          )}
          {data.families.length > 1 ? (
            <nav aria-label="your families" className="mt-3 flex flex-wrap justify-center gap-1.5">
              {data.families.map((f) => (
                <Link
                  key={f.familyId}
                  href={'/home?family=' + f.familyId}
                  aria-current={f.familyId === data.familyId ? 'page' : undefined}
                  className={
                    f.familyId === data.familyId
                      ? 'inline-flex min-h-[44px] items-center rounded-full bg-cta px-4 text-xs font-bold text-cta-text'
                      : 'inline-flex min-h-[44px] items-center rounded-full border border-line bg-paper px-4 text-xs font-bold text-cocoa'
                  }
                >
                  {f.name}
                </Link>
              ))}
            </nav>
          ) : null}
          {!data.bannerUrl && data.isOwner ? <FamilyBanner url={null} canEdit familyName={data.familyName} /> : null}
          <p className="mt-1 text-[13px] text-ink-faint">
            your family&apos;s private keepsake box · {data.keepsakes.length}{' '}
            {data.keepsakes.length === 1 ? 'keepsake' : 'keepsakes'} kept
          </p>
        </div>

        <div className="mx-auto w-full max-w-5xl">
          {/* Family circle (real members) */}
          <section style={{ ['--i' as string]: 1 }} className="pop-in px-6 py-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconUsers} size={18} className="text-cinnamon" /> Your family circle
            </p>
            <div className="mt-4 flex gap-5 overflow-x-auto pb-1 sm:flex-wrap sm:gap-3">
              {data.members.map((m, i) => (
                <div key={m.accountId} className="flex-none">
                  <MemberAvatar
                    initial={m.initial}
                    name={m.isYou ? `${m.name} (you)` : m.name}
                    sub={m.isOwner ? 'owner' : m.circle === 'FAMILY' ? 'family' : 'extended'}
                    color={AVATAR_COLORS[i % AVATAR_COLORS.length]!}
                    imageUrl={m.avatarUrl}
                  />
                </div>
              ))}
              {data.pendingInvites.map((inv) => (
                <div key={inv.id} className="flex w-[72px] flex-none flex-col items-center text-center" title={inv.email}>
                  <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.5px] border-dashed border-line bg-paper-2 text-ink-faint">
                    <Icon icon={IconMailForward} size={18} />
                  </span>
                  <span className="mt-1.5 w-full truncate text-xs font-bold text-cocoa">{inv.email.split('@')[0]}</span>
                  <span className="text-[11px] text-ink-soft">invited</span>
                </div>
              ))}
              {data.isOwner ? (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex flex-none flex-col items-center text-center"
                >
                  <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.5px] border-dashed border-tomato text-cinnamon">
                    <Icon icon={IconPlus} size={20} />
                  </span>
                  <span className="mt-1.5 text-xs font-bold text-cinnamon">add</span>
                </button>
              ) : null}
            </div>
            {data.children.length > 0 ? (
              <div className="mt-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">your little ones</p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {data.children.map((c) => (
                    <li key={c.id} className="inline-flex min-h-[32px] items-center rounded-full bg-honey-band px-3 text-xs font-bold text-cocoa">
                      {c.firstName}
                    </li>
                  ))}
                </ul>
                {data.isOwner && relatives.length > 0 && data.children.some((c) => c.birthday) ? (
                  <div className="mt-3">
                    <p className="text-[11px] text-ink-soft">family calendar shared with — tap to change</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="who sees the family calendar">
                      {relatives.map((m) => (
                        <Chip
                          key={m.accountId}
                          active={m.seesOccasions}
                          aria-pressed={m.seesOccasions}
                          onClick={() => toggleCalendar(m.accountId, m.name, !m.seesOccasions)}
                        >
                          {m.name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
                {data.children.some((c) => c.birthday) ? (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-paper-2 px-3 py-2.5">
                    <span className="text-xs text-cocoa">
                      <b>birthday nudges by email</b>
                      <span className="block text-[11px] text-ink-soft">one gentle note a few weeks before — never more than one a week</span>
                    </span>
                    <Toggle on={remindersOn} onChange={toggleReminders} label="birthday nudges by email" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {comingUp ? (
            <section style={{ ['--i' as string]: 2 }} className="pop-in border-t border-line px-6 py-6">
              <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
                <Icon icon={IconCake} size={18} className="text-cinnamon" /> Coming up
              </p>
              <div className="mt-3 flex flex-col items-start gap-3 rounded-2xl border border-sunshine bg-honey-band p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-cocoa">
                  <b>{comingUp.name}</b> turns {comingUp.turns} on {comingUp.label}
                  <span className="text-ink-soft"> · {whenLabel(comingUp.inDays)}</span>
                </p>
                <Button href="/start-creating" size="md" className="shrink-0 whitespace-nowrap">
                  <Icon icon={IconWand} size={16} /> make something
                </Button>
              </div>
            </section>
          ) : null}

          {/* Keepsakes (real, DB-backed, signed-URL images) */}
          <section style={{ ['--i' as string]: 3 }} className="pop-in border-t border-line px-6 py-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconHeart} size={18} className="text-cinnamon" /> Your keepsakes
            </p>

            {data.keepsakes.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-paper-2 px-6 py-12 text-center">
<div className="flex items-end justify-center gap-3" aria-hidden>
                  {['family-mug', 'rainbow-heart-cushion', 'puppy-card'].map((slug, i) => {
                    const e = exampleBySlug(slug);
                    return (
                      <div key={slug} className="polaroid pop-in w-24" style={{ ['--tilt' as string]: i === 1 ? '2deg' : '-3deg', ['--i' as string]: i, padding: '5px 5px 7px' }}>
                        <div className="flex aspect-square items-center justify-center bg-paper-2 p-1">
                          <img src={e.src} alt="" width={e.width} height={e.height} loading="lazy" decoding="async" className="max-h-full max-w-full object-contain" />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <h2 className="mt-4 font-display text-lg font-semibold text-cocoa">Your keepsake box is waiting</h2>
                <p className="mt-1 max-w-xs text-sm text-ink-soft">
                  Upload a drawing and keep it here — safe, private, and yours forever.
                </p>
                <Button href="/start-creating" size="lg" className="mt-5">
                  <Icon icon={IconWand} size={16} /> start creating
                </Button>
              </div>
            ) : (
              <>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
                  {data.isOwner ? 'Tap a keepsake to choose who can see it.' : 'Shared with you by the family.'}
                  <Link href="/studio/position" className="font-bold text-cinnamon hover:underline">
                    place one on a product →
                  </Link>
                </p>
                {highlightNew ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-sunshine bg-honey-band px-3 py-2 text-xs text-ink-faint">
                    <Icon icon={IconSparkles} size={14} className="text-cinnamon" /> just added — your newest keepsake&apos;s right here.
                  </div>
                ) : null}

                {/* Each little one's corner — the home grows with the child */}
                {childGroups.map((g) => (
                  <div key={g.child.id} className="mt-5">
                    <p className="mb-2 flex items-baseline gap-2 font-display text-base font-semibold text-cocoa">
                      {g.child.firstName}&apos;s corner
                      <span className="text-xs font-normal text-ink-faint">
                        {g.items.length} {g.items.length === 1 ? 'keepsake' : 'keepsakes'}
                      </span>
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-7 pt-2 sm:grid-cols-3 md:grid-cols-4">{g.items.map(renderTile)}</div>
                  </div>
                ))}

                <div className="mt-5">
                  {childGroups.length > 0 && unfiled.length > 0 ? (
                    <p className="mb-2 font-display text-base font-semibold text-cocoa">Not yet filed</p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-7 pt-2 sm:grid-cols-3 md:grid-cols-4">
                    {unfiled.map(renderTile)}
                    <Link
                      href="/start-creating"
                      className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-tomato bg-paper-2 text-cinnamon"
                    >
                      <Icon icon={IconPlus} size={22} />
                      <span className="text-xs font-bold">create new</span>
                    </Link>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Saved for later — "+ Keepsake" designs (a drawing on an exact product) */}
          {data.savedDesigns.length > 0 ? (
            <section className="pop-in border-t border-line px-6 py-6">
              <p className="flex items-center gap-2 font-display text-lg text-cocoa">
                <Icon icon={IconHeart} size={18} className="text-cinnamon" /> Saved for later
              </p>
              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-7 pt-2 sm:grid-cols-3 md:grid-cols-4">
                {data.savedDesigns.map((d, i) => (
                  <li key={d.id} className="relative">
                    <KeepsakeTile index={i} name={d.label} image={d.imageUrl ?? undefined} meta={gbp(d.pricePence)} />
                    <button
                      type="button"
                      onClick={() => removeDesign(d.id)}
                      aria-label={`remove ${d.label} from saved`}
                      className="press absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa"
                    >
                      <Icon icon={IconX} size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Gift requests: the parent asks; relatives buy from what's shared */}
          {data.isOwner ? (
          <section style={{ ['--i' as string]: 4 }} className="pop-in border-t border-line px-6 py-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconGift} size={18} className="text-cinnamon" /> Gift requests
            </p>
            <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-line bg-paper-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-ink-soft">
                {christmasNow ? <b className="block text-cocoa">christmas sorted: send it to the grandparents.</b> : null}
                Pick anything you&apos;ve saved and send it to family — they check out in a tap, and it ticks itself off.
              </p>
              <Button size="md" className="shrink-0 whitespace-nowrap" onClick={() => setGiftOpen(true)}>
                <Icon icon={IconGift} size={16} /> create a gift request
              </Button>
            </div>

            {/* Your gift lists — the list keeps tabs; who bought what is for your eyes only */}
            {data.giftLists.map((gl, li) => {
              const boughtCount = gl.items.filter((it) => it.bought).length;
              return (
                <div key={gl.id} className="pop-in mt-4 rounded-2xl border-2 border-cocoa bg-paper p-4" style={{ ['--i' as string]: li }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-extrabold text-cocoa">
                      gift request · {new Date(gl.createdAtISO).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {gl.status === 'ACTIVE' ? `${boughtCount} of ${gl.items.length} bought` : gl.status === 'REVOKED' ? 'switched off' : 'expired'}
                    </p>
                  </div>
                  <ul className="mt-4 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4">
                    {gl.items.map((it, i) => (
                      <li key={it.assetId + it.label} className="relative">
                        <div className="polaroid" style={{ ['--tilt' as string]: i % 2 ? '2deg' : '-2deg', padding: '5px 5px 7px' }}>
                          <div className="flex aspect-square items-center justify-center overflow-hidden bg-paper-2">
                            {it.imageUrl ? <img src={it.imageUrl} alt="" className="h-full w-full object-contain" /> : null}
                          </div>
                          <p className="mt-1 truncate text-[11px] font-bold text-cocoa">{it.label}</p>
                        </div>
                        {it.bought ? (
                          <span
                            className="pop-in wiggle relative z-10 -mt-3 block w-fit max-w-full rounded-xl border-2 border-cocoa bg-honey px-2 py-0.5 text-center text-[11px] font-extrabold leading-tight text-cocoa shadow-[0_2px_0_var(--color-cocoa)]"
                            style={{ rotate: '-4deg', ['--i' as string]: i + 2, marginInline: 'auto' }}
                          >
                            from {it.boughtBy} ✓
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {gl.status === 'ACTIVE' ? (
                    confirmRevoke === gl.id ? (
                      <div role="alert" className="mt-4 flex flex-col gap-2 rounded-xl border-2 border-berry bg-berry-pale p-3 sm:flex-row sm:items-center">
                        <p className="flex-1 text-xs text-cocoa">switch this link off? anyone holding it won&apos;t be able to open it any more.</p>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="sm" onClick={() => setConfirmRevoke(null)}>
                            keep it
                          </Button>
                          <Button size="sm" onClick={() => revokeList(gl.id)}>
                            switch off
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(gl.id)}
                        className="mt-3 inline-flex min-h-11 items-center px-1 text-xs font-bold text-ink-soft underline hover:text-cinnamon"
                      >
                        switch this link off
                      </button>
                    )
                  ) : null}
                </div>
              );
            })}
          </section>
          ) : null}
        </div>

        {!data.isOwner ? (
          <div className="mx-auto w-full max-w-5xl px-6 pb-6 text-center">
            {confirmLeave ? (
              <div role="alert" className="mx-auto max-w-sm rounded-xl border-2 border-berry bg-berry-pale p-3.5 text-left">
                <p className="text-[13px] font-bold text-cocoa">leave {data.familyName}?</p>
                <p className="mt-1 text-xs text-ink-soft">you&apos;ll stop seeing their keepsakes straight away. they can invite you again.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setConfirmLeave(false)}>
                    stay
                  </Button>
                  <Button size="sm" className="flex-1" onClick={leave}>
                    yes, leave
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmLeave(true)} className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-ink-soft underline hover:text-cinnamon">
                leave this family
              </button>
            )}
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-2 bg-paper-2 px-6 py-3.5 text-center text-xs text-green-save">
          <Icon icon={IconLock} size={15} />
          Private to your family. You choose who&apos;s in your circle and what they can see — change or remove anyone, any
          time.
        </div>
      </main>

      <BottomTabBar tabs={APP_TABS} active="Home" />

      <PerAssetVisibilityModal
        open={!!active}
        name="Keepsake"
        image={active?.imageUrl ?? undefined}
        tier={active?.visibility ?? 'FAMILY'}
        onClose={() => setActive(null)}
        onSave={saveVisibility}
        onDelete={deleteActive}
        people={others}
      />
      <AddFamilyMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
      <CreateGiftLinkModal
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        keepsakes={data.keepsakes.map((k) => ({ id: k.id, imageUrl: k.thumbUrl ?? k.imageUrl }))}
        designs={data.savedDesigns.map((d) => ({ id: d.id, label: d.label, pricePence: d.pricePence, imageUrl: d.imageUrl }))}
        recipients={data.members.filter((m) => !m.isYou).map((m) => ({ accountId: m.accountId, name: m.name }))}
      />
    </div>
  );
}
