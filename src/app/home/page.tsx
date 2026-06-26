'use client';

import {
  IconGift,
  IconHeart,
  IconHome,
  IconLink,
  IconLock,
  IconPackage,
  IconPlus,
  IconUsers,
  IconWand,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar, type Tab } from '@/ui/components/BottomTabBar';
import { KeepsakeTile } from '@/ui/components/KeepsakeTile';
import { MemberAvatar } from '@/ui/components/MemberAvatar';
import { AddFamilyMemberModal } from '@/ui/modals/AddFamilyMemberModal';
import { CreateGiftLinkModal } from '@/ui/modals/CreateGiftLinkModal';
import { PerAssetVisibilityModal } from '@/ui/modals/PerAssetVisibilityModal';

// ── keepsake doodle thumbnails ───────────────────────────────────────────────
const HouseArt = (
  <svg viewBox="0 0 70 56" width="50" height="40">
    <rect x="16" y="8" width="38" height="40" fill="#FFFDF8" stroke="#F2A640" strokeWidth="5" />
    <rect x="26" y="20" width="18" height="14" fill="none" stroke="#C8623A" strokeWidth="2" />
    <path d="M24 21 L35 13 L46 21" fill="none" stroke="#E8786E" strokeWidth="2" />
  </svg>
);
const RocketArt = (
  <svg viewBox="0 0 70 56" width="34" height="42">
    <path d="M35 6 C45 16 45 34 41 44 L29 44 C25 34 25 16 35 6 Z" fill="#FFFDF8" stroke="#C8623A" strokeWidth="2.5" />
    <circle cx="35" cy="20" r="4" fill="none" stroke="#84BBD0" strokeWidth="2" />
    <path d="M29 44 L23 50 L27 44 M41 44 L47 50 L43 44" fill="none" stroke="#93B97C" strokeWidth="2" />
    <path d="M33 44 q2 6 4 0" fill="none" stroke="#F2A640" strokeWidth="2.5" />
  </svg>
);
const BookArt = (
  <svg viewBox="0 0 70 56" width="36" height="40">
    <rect x="22" y="8" width="28" height="40" rx="2" fill="#FFFDF8" stroke="#C8623A" strokeWidth="2.2" />
    <line x1="28" y1="8" x2="28" y2="48" stroke="#C8623A" strokeWidth="2" />
  </svg>
);
const StarArt = (
  <svg viewBox="0 0 70 56" width="40" height="40">
    <polygon points="35,10 41,26 58,26 44,36 49,52 35,42 21,52 26,36 12,26 29,26" fill="#F2A640" />
  </svg>
);
const SunArt = (
  <svg viewBox="0 0 70 56" width="40" height="40">
    <circle cx="35" cy="28" r="11" fill="#F2A640" />
    <g stroke="#F2A640" strokeWidth="3" strokeLinecap="round">
      <line x1="35" y1="6" x2="35" y2="12" />
      <line x1="35" y1="44" x2="35" y2="50" />
      <line x1="13" y1="28" x2="19" y2="28" />
      <line x1="51" y1="28" x2="57" y2="28" />
      <line x1="20" y1="13" x2="24" y2="17" />
      <line x1="46" y1="39" x2="50" y2="43" />
      <line x1="20" y1="43" x2="24" y2="39" />
      <line x1="46" y1="17" x2="50" y2="13" />
    </g>
  </svg>
);

type Keepsake = { name: string; meta?: string; art: ReactNode; tint: string };

const MEMBERS = [
  { initial: 'O', name: 'Olivia', sub: 'age 5', color: '#C8623A' },
  { initial: 'M', name: 'Max', sub: 'age 8', color: '#84BBD0' },
  { initial: 'S', name: 'Sam', sub: 'you', color: '#E8786E' },
  { initial: 'J', name: 'Jo', sub: 'parent', color: '#93B97C' },
  { initial: 'R', name: 'Rosie', sub: 'grandma', color: '#F2A640', textColor: '#3A2E1E' },
];

const SELECTORS = ['Olivia', 'Max', 'Family'] as const;
type Selector = (typeof SELECTORS)[number];

const KEEPSAKES: Record<Selector, Keepsake[]> = {
  Olivia: [
    { name: 'Our house', meta: 'Mar', art: HouseArt, tint: '#FDF0DC' },
    { name: 'Rocket', meta: 'Apr', art: RocketArt, tint: '#E2F0F4' },
    { name: 'Storybook', meta: '✦', art: BookArt, tint: '#F6E2D6' },
  ],
  Max: [
    { name: 'Spaceship', meta: 'May', art: RocketArt, tint: '#E2F0F4' },
    { name: 'Gold star', meta: 'Mar', art: StarArt, tint: '#FDF0DC' },
  ],
  Family: [
    { name: 'Our house', meta: 'Mar', art: HouseArt, tint: '#FDF0DC' },
    { name: 'Sunshine', meta: 'Jun', art: SunArt, tint: '#E8F0DF' },
    { name: 'Storybook', meta: '✦', art: BookArt, tint: '#F6E2D6' },
  ],
};

const KEPT_COUNT: Record<Selector, string> = {
  Olivia: '23 kept since 2024 — every one still yours.',
  Max: '14 kept since 2024 — every one still yours.',
  Family: '41 kept together — every one still yours.',
};

const TABS: Tab[] = [
  { label: 'Home', href: '/home', icon: IconHome },
  { label: 'Create', href: '/catalogue', icon: IconWand },
  { label: 'Family', href: '/family', icon: IconUsers },
  { label: 'Orders', href: '/orders', icon: IconPackage },
];

function SectionLabel({ icon, children }: { icon: typeof IconHeart; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 font-display text-lg font-semibold text-cocoa">
      <Icon icon={icon} size={18} className="text-cinnamon" />
      {children}
    </p>
  );
}

export default function FamilyHomePage() {
  const [selected, setSelected] = useState<Selector>('Olivia');
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [giftLinkOpen, setGiftLinkOpen] = useState(false);
  const keepsakes = KEEPSAKES[selected];
  const possessive = selected === 'Family' ? 'Family' : `${selected}'s`;

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      {/* Top nav (desktop) */}
      <header className="hidden items-center justify-between border-b border-[#EDE2CD] bg-oat px-6 py-3.5 md:flex">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">
          snickerdoodle
        </Link>
        <nav className="flex items-center gap-5 text-sm text-[#7A6A58]">
          <span className="font-bold text-cinnamon">Home</span>
          <Link href="/catalogue" className="hover:text-cinnamon">
            Create
          </Link>
          <Link href="/family" className="hover:text-cinnamon">
            Family
          </Link>
          <Link href="/orders" className="hover:text-cinnamon">
            Orders
          </Link>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cinnamon font-display text-xs font-bold text-cta-text">
            S
          </span>
        </nav>
      </header>

      <main id="main" className="flex-1">
        {/* Family-branded header */}
        <div className="bg-honey-band px-6 py-6 text-center">
          <CaveatNote className="text-lg">welcome back, Sam</CaveatNote>
          <h1 className="mt-1 font-display text-2xl font-semibold leading-tight md:text-3xl">
            The Hartley Family Keepsake Home
          </h1>
          <p className="mt-1 text-[13px] text-[#9C8772]">your family&apos;s private keepsake box · 41 kept together</p>
        </div>

        <div className="mx-auto w-full max-w-5xl">
          {/* Family circle */}
          <section className="px-6 py-6">
            <SectionLabel icon={IconUsers}>Your family circle</SectionLabel>
            <p className="mt-1 text-xs text-[#9C8E7E]">
              Invite the whole family — even the extended bunch — to share keepsakes and never miss a birthday.
            </p>
            <div className="mt-4 flex gap-5 overflow-x-auto pb-1 sm:grid sm:grid-cols-6 sm:gap-3">
              {MEMBERS.map((m) => (
                <div key={m.name} className="flex-none">
                  <MemberAvatar
                    initial={m.initial}
                    name={m.name}
                    sub={m.sub}
                    color={m.color}
                    textColor={m.textColor}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="flex flex-none flex-col items-center text-center"
              >
                <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full border-[1.5px] border-dashed border-[#C99B6E] text-cinnamon">
                  <Icon icon={IconPlus} size={20} />
                </span>
                <span className="mt-1.5 text-xs font-bold text-cinnamon">invite</span>
              </button>
            </div>
          </section>

          {/* Member selector */}
          <div className="flex gap-2 overflow-x-auto border-b border-[#EDE2CD] px-6 pb-3">
            {SELECTORS.map((s) => (
              <Chip key={s} active={selected === s} onClick={() => setSelected(s)}>
                {s}
              </Chip>
            ))}
          </div>

          {/* Keepsakes */}
          <section className="px-6 py-6">
            <SectionLabel icon={IconHeart}>{possessive} keepsakes</SectionLabel>
            <p className="mt-1 text-xs text-[#9C8E7E]">{KEPT_COUNT[selected]}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {keepsakes.map((k) => (
                <button key={k.name} type="button" onClick={() => setVisibilityOpen(true)} className="block text-left">
                  <KeepsakeTile name={k.name} meta={k.meta} art={k.art} tint={k.tint} />
                </button>
              ))}
              <Link
                href="/studio"
                className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#E0A268] bg-[#FCF1E3] text-cinnamon"
              >
                <Icon icon={IconPlus} size={22} />
                <span className="text-xs font-bold">create new</span>
              </Link>
            </div>
          </section>

          {/* Gift list */}
          <section className="px-6 pb-6">
            <SectionLabel icon={IconGift}>{possessive} gift list</SectionLabel>
            <p className="mt-1 text-xs text-[#9C8E7E]">
              Share one link. Family pick guest checkout or join the family — then just pay.
            </p>
            <div className="mt-4 flex flex-col items-start gap-4 rounded-2xl border border-[#EFE6D6] bg-[#FBF8F1] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-[15px] font-semibold text-cocoa">4 things, ready to send</h3>
                <p className="mt-0.5 text-xs text-[#7A6A58]">
                  They tap your link, the cart&apos;s already filled — checkout in under a minute.
                </p>
              </div>
              <Button size="md" className="shrink-0 whitespace-nowrap" onClick={() => setGiftLinkOpen(true)}>
                <Icon icon={IconLink} size={16} /> share a ready-to-buy link
              </Button>
            </div>
          </section>
        </div>

        {/* Trust footer */}
        <div className="flex items-center justify-center gap-2 bg-[#F1E7D4] px-6 py-3.5 text-center text-xs text-green-save">
          <Icon icon={IconLock} size={15} />
          Private to your family. You choose who&apos;s in your circle and what they can see — change or remove anyone, any time.
        </div>
      </main>

      <BottomTabBar tabs={TABS} active="Home" />

      <PerAssetVisibilityModal open={visibilityOpen} onClose={() => setVisibilityOpen(false)} />
      <AddFamilyMemberModal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} />
      <CreateGiftLinkModal open={giftLinkOpen} onClose={() => setGiftLinkOpen(false)} />
    </div>
  );
}
