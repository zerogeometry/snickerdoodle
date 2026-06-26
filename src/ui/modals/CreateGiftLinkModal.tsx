'use client';

import {
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconDots,
  IconLink,
  IconMail,
  IconMessage,
  IconUsersPlus,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon, type TablerIconComponent } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { Toggle } from '@/ui/primitives/Toggle';
import { cn } from '@/ui/cn';
import { toast } from '@/lib/store';

const INITIAL = [
  { name: "Olivia's storybook", price: '£24', on: true },
  { name: 'Framed "Our house" print', price: '£22', on: true },
  { name: 'Rocket tee', price: '£18', on: false },
];

const LINK = 'snickerdoodle.co.uk/g/olivia-birthday-x7k2';
const SHARE_MSG = "A gift list for Olivia's 6th birthday 🎉";

const SHARE: { label: string; icon: TablerIconComponent; href: (url: string) => string | null }[] = [
  { label: 'WhatsApp', icon: IconBrandWhatsapp, href: (u) => `https://wa.me/?text=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'Email', icon: IconMail, href: (u) => `mailto:?subject=${encodeURIComponent(SHARE_MSG)}&body=${encodeURIComponent(`${SHARE_MSG}\n\n${u}`)}` },
  { label: 'Text', icon: IconMessage, href: (u) => `sms:?&body=${encodeURIComponent(`${SHARE_MSG} ${u}`)}` },
  { label: 'More', icon: IconDots, href: () => null },
];

export function CreateGiftLinkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState(INITIAL);
  const [invite, setInvite] = useState(true);
  const [access, setAccess] = useState('view_buy');
  const [created, setCreated] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullUrl = `https://${LINK}`;
  const selectedCount = items.filter((it) => it.on).length;

  const toggleItem = (i: number) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, on: !it.on } : it)));

  const create = () => {
    if (selectedCount === 0) {
      toast('pick at least one thing to include');
      return;
    }
    setCreated(true);
    toast('your gift link is ready ✦');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast('link copied');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast('press and hold to copy the link');
    }
  };

  const share = async (label: string, href: string | null) => {
    if (label === 'More') {
      if (navigator.share) await navigator.share({ title: SHARE_MSG, url: fullUrl }).catch(() => {});
      else copy();
      return;
    }
    if (href) window.open(href, '_blank', 'noopener');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a gift link"
      subtitle="for Olivia's 6th birthday"
      footer={
        created ? (
          <Button size="lg" className="w-full" onClick={onClose}>
            done
          </Button>
        ) : (
          <Button size="lg" className="w-full" onClick={create}>
            create &amp; share link
          </Button>
        )
      }
    >
      <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">What to include</p>
      <div className="divide-y divide-[#F2EADB]">
        {items.map((it, i) => (
          <button
            key={it.name}
            type="button"
            onClick={() => toggleItem(i)}
            className="flex w-full items-center gap-2.5 py-2 text-left"
          >
            <span
              className={cn(
                'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]',
                it.on ? 'bg-cinnamon text-cta-text' : 'border-[1.5px] border-[#DAC9AE]',
              )}
            >
              {it.on ? <Icon icon={IconCheck} size={12} /> : null}
            </span>
            <span className={cn('flex-1 text-[13px] font-semibold', it.on ? 'text-cocoa' : 'text-[#A89B8C]')}>
              {it.name}
            </span>
            <span className="text-xs text-[#9C8E7E]">{it.price}</span>
          </button>
        ))}
      </div>

      {/* Invite to family */}
      <div className="my-3.5 rounded-xl border border-[#F0CF9C] bg-honey-band p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
            <Icon icon={IconUsersPlus} size={15} className="text-cinnamon" /> Also invite them to join the family
          </span>
          <Toggle on={invite} onChange={setInvite} label="Also invite them to join the family" />
        </div>
        {invite ? (
          <>
            <p className="mt-2 text-[11px] leading-relaxed text-[#8A6F52]">
              They&apos;ll get 5% off, see Olivia&apos;s keepsakes, and never miss a birthday. You decide what they can
              access — and can remove them any time.
            </p>
            <label className="mt-2 flex items-center justify-between rounded-lg border border-[#EAD9BE] bg-white px-3 py-2 text-xs">
              <span className="text-[#5F564C]">They can</span>
              <select
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                className="bg-transparent font-bold text-cocoa outline-none"
              >
                <option value="view">view only</option>
                <option value="view_buy">view &amp; buy</option>
                <option value="contribute">view, buy &amp; add</option>
              </select>
            </label>
          </>
        ) : null}
      </div>

      {/* Link */}
      {created ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-[#E6D8BE] bg-[#F6F0E4] px-3 py-2.5">
            <Icon icon={IconLink} size={15} className="shrink-0 text-[#9C8E7E]" />
            <span className="flex-1 truncate text-xs text-[#6F6358]">{LINK}</span>
            <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-cinnamon">
              <Icon icon={copied ? IconCheck : IconCopy} size={13} /> {copied ? 'copied' : 'copy'}
            </button>
          </div>

          {/* Share */}
          <div className="mt-2.5 grid grid-cols-4 gap-2">
            {SHARE.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => share(s.label, s.href(fullUrl))}
                className="flex flex-col items-center gap-1 rounded-lg border border-[#EFE6D6] bg-[#FBF8F1] py-2 text-[11px] font-semibold text-[#7A6A58] hover:border-honey"
              >
                <Icon icon={s.icon} size={17} className="text-cinnamon" />
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-[#E6D8BE] bg-[#F6F0E4] px-3 py-2.5 text-xs text-[#9C8E7E]">
          <Icon icon={IconLink} size={15} className="shrink-0" />
          Your private, unguessable link appears here once you create it.
        </div>
      )}
    </Modal>
  );
}
