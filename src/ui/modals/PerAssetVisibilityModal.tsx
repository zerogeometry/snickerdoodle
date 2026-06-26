'use client';

import { IconHomeHeart, IconLock, IconShieldCheck, IconUser, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { cn } from '@/ui/cn';

type Tier = 'ONLY_ME' | 'FAMILY' | 'EXTENDED';
type Who = { label: string; color: string; textColor?: string };

const OPTIONS: {
  tier: Tier;
  icon: TablerIconComponent;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  who: Who[] | 'lock';
}[] = [
  { tier: 'ONLY_ME', icon: IconLock, iconBg: '#EFE6D6', iconColor: '#7A6A58', title: 'Only me', desc: 'Private to you — no one else sees it', who: 'lock' },
  { tier: 'FAMILY', icon: IconHomeHeart, iconBg: '#FBE4DA', iconColor: '#C8623A', title: 'Family', desc: 'Your core household', who: [{ label: 'J', color: '#93B97C' }, { label: 'M', color: '#84BBD0' }] },
  {
    tier: 'EXTENDED',
    icon: IconUsers,
    iconBg: '#E8F0DF',
    iconColor: '#5C8A3F',
    title: 'Extended family',
    desc: 'Everyone in your circle, incl. grandparents',
    who: [
      { label: 'J', color: '#93B97C' },
      { label: 'M', color: '#84BBD0' },
      { label: 'R', color: '#F2A640', textColor: '#3A2E1E' },
      { label: '+1', color: '#E8786E' },
    ],
  },
];

function WhoStack({ who }: { who: Who[] | 'lock' }) {
  if (who === 'lock') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#EFE6D6] text-[#9C8E7E]">
        <Icon icon={IconUser} size={13} />
      </span>
    );
  }
  return (
    <div className="flex">
      {who.map((w, i) => (
        <span
          key={w.label}
          className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#FFFDF8] font-display text-[10px] font-bold"
          style={{ background: w.color, color: w.textColor ?? '#FFF6E9', marginLeft: i === 0 ? 0 : -6 }}
        >
          {w.label}
        </span>
      ))}
    </div>
  );
}

export function PerAssetVisibilityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tier, setTier] = useState<Tier>('FAMILY');

  const thumb = (
    <span className="flex h-[46px] w-[46px] items-center justify-center rounded-lg bg-[#E2F0F4]">
      <svg viewBox="0 0 50 50" width="30" height="30" aria-hidden>
        <path d="M25 7 C34 16 34 33 30 42 L20 42 C16 33 16 16 25 7 Z" fill="#FFFDF8" stroke="#C8623A" strokeWidth="2.5" />
        <circle cx="25" cy="22" r="4" fill="none" stroke="#84BBD0" strokeWidth="2" />
        <path d="M20 42 L14 48 L18 42 M30 42 L36 48 L32 42" fill="none" stroke="#93B97C" strokeWidth="2" />
      </svg>
    </span>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rocket"
      subtitle="by Olivia · kept Apr 2026"
      headerLeading={thumb}
      footer={
        <Button size="lg" className="w-full" onClick={onClose}>
          done
        </Button>
      }
    >
      <p className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">
        Who can see this keepsake?
      </p>
      <div className="space-y-2.5">
        {OPTIONS.map((o) => {
          const on = tier === o.tier;
          return (
            <button
              key={o.tier}
              type="button"
              onClick={() => setTier(o.tier)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border-[1.5px] p-3 text-left',
                on ? 'border-cinnamon bg-[#FBEFE0]' : 'border-[#EFE6D6]',
              )}
            >
              <span
                className={cn(
                  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                  on ? 'border-cinnamon' : 'border-[#D7C4A6]',
                )}
              >
                {on ? <span className="h-2.5 w-2.5 rounded-full bg-cinnamon" /> : null}
              </span>
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg"
                style={{ background: o.iconBg, color: o.iconColor }}
              >
                <Icon icon={o.icon} size={16} />
              </span>
              <span className="flex-1">
                <span className="block text-[13px] font-bold text-cocoa">{o.title}</span>
                <span className="block text-[11px] text-[#8A7A66]">{o.desc}</span>
              </span>
              <WhoStack who={o.who} />
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-[#9C8E7E]">
        <Icon icon={IconShieldCheck} size={14} className="mt-0.5 shrink-0 text-green-save" />
        <span>
          New keepsakes start as <b>Family</b>. Widen to Extended any time — nothing is ever public.
        </span>
      </p>
    </Modal>
  );
}
