'use client';

import { IconGift, IconHeart, IconLock, IconPlus, IconSparkles, IconUsers, IconWand } from '@tabler/icons-react';
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
import { AddFamilyMemberModal } from '@/ui/modals/AddFamilyMemberModal';
import { CreateGiftLinkModal } from '@/ui/modals/CreateGiftLinkModal';
import { PerAssetVisibilityModal } from '@/ui/modals/PerAssetVisibilityModal';
import { toast } from '@/lib/store';
import { setAssetVisibilityAction } from '@/app/actions/keep';
import type { HomeData, HomeKeepsake } from '@/server/home';
import type { VisibilityTier } from '@/domain/types';

const VIS_LABEL: Record<VisibilityTier, string> = { ONLY_ME: 'Only me', FAMILY: 'Family', EXTENDED: 'Extended' };
const AVATAR_COLORS = ['#C8623A', '#84BBD0', '#E8786E', '#93B97C', '#F2A640'];

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

export function HomeView({ data }: { data: HomeData }) {
  const router = useRouter();
  const [active, setActive] = useState<HomeKeepsake | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
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

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Home" />

      <main id="main" className="flex-1">
        {/* Family header */}
        <div className="bg-honey-band px-6 py-6 text-center">
          <CaveatNote className="text-lg">welcome back, {greetingName}</CaveatNote>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight md:text-3xl">{data.familyName}</h1>
          <p className="mt-1 text-[13px] text-[#9C8772]">
            your family&apos;s private keepsake box · {data.keepsakes.length}{' '}
            {data.keepsakes.length === 1 ? 'keepsake' : 'keepsakes'} kept
          </p>
        </div>

        <div className="mx-auto w-full max-w-5xl">
          {/* Family circle (real members) */}
          <section className="px-6 py-6">
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
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="flex flex-none flex-col items-center text-center"
              >
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#C99B6E] text-cinnamon">
                  <Icon icon={IconPlus} size={20} />
                </span>
                <span className="mt-1.5 text-xs font-bold text-cinnamon">invite</span>
              </button>
            </div>
          </section>

          {/* Keepsakes (real, DB-backed, signed-URL images) */}
          <section className="border-t border-[#EDE2CD] px-6 py-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconHeart} size={18} className="text-cinnamon" /> Your keepsakes
            </p>

            {data.keepsakes.length === 0 ? (
              <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] px-6 py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F3E8D6]">
                  <Icon icon={IconHeart} size={30} className="text-[#C9B79B]" />
                </div>
                <h2 className="mt-4 font-display text-lg font-semibold text-cocoa">Your keepsake box is waiting</h2>
                <p className="mt-1 max-w-xs text-sm text-[#6F6358]">
                  Upload a drawing and keep it here — safe, private, and yours forever.
                </p>
                <Button href="/start-creating" size="lg" className="mt-5">
                  <Icon icon={IconWand} size={16} /> start creating
                </Button>
              </div>
            ) : (
              <>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-[#9C8E7E]">
                  Tap a keepsake to choose who can see it.
                  <Link href="/studio/position" className="font-bold text-cinnamon hover:underline">
                    place one on a product →
                  </Link>
                </p>
                {highlightNew ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#F0CF9C] bg-honey-band px-3 py-2 text-xs text-[#8A6F52]">
                    <Icon icon={IconSparkles} size={14} className="text-cinnamon" /> just added — your newest keepsake&apos;s right here.
                  </div>
                ) : null}
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {data.keepsakes.map((k, idx) => {
                    const isNewest = idx === 0 && highlightNew;
                    return (
                      <div
                        key={k.id}
                        ref={isNewest ? newestRef : undefined}
                        className={isNewest ? 'rounded-2xl ring-4 ring-honey ring-offset-2 ring-offset-oat' : undefined}
                      >
                        <button type="button" onClick={() => setActive(k)} className="block w-full text-left">
                          <KeepsakeTile
                            name="Keepsake"
                            meta={monthLabel(k.createdAtISO)}
                            image={k.imageUrl ?? undefined}
                            badge={VIS_LABEL[k.visibility]}
                          />
                        </button>
                      </div>
                    );
                  })}
                  <Link
                    href="/start-creating"
                    className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#E0A268] bg-[#FCF1E3] text-cinnamon"
                  >
                    <Icon icon={IconPlus} size={22} />
                    <span className="text-xs font-bold">create new</span>
                  </Link>
                </div>
              </>
            )}
          </section>

          {/* Gift list CTA */}
          <section className="border-t border-[#EDE2CD] px-6 py-6">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
              <Icon icon={IconGift} size={18} className="text-cinnamon" /> Share a gift list
            </p>
            <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-[#EFE6D6] bg-[#FBF8F1] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-[#7A6A58]">
                Pick a few keepsakes and share one private link — family check out in a tap.
              </p>
              <Button size="md" className="shrink-0 whitespace-nowrap" onClick={() => setGiftOpen(true)}>
                <Icon icon={IconGift} size={16} /> share a ready-to-buy link
              </Button>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-center gap-2 bg-[#F1E7D4] px-6 py-3.5 text-center text-xs text-green-save">
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
      />
      <AddFamilyMemberModal open={addOpen} onClose={() => setAddOpen(false)} />
      <CreateGiftLinkModal
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        keepsakes={data.keepsakes.map((k) => ({ id: k.id, imageUrl: k.imageUrl }))}
      />
    </div>
  );
}
