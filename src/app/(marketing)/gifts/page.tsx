import { IconCheck, IconGift, IconLink, IconShieldCheck, IconUsersPlus } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';

export const metadata: Metadata = {
  title: 'gifts',
  description: 'Share a ready-to-buy link so family can treat your little one — guest checkout in a tap, or join the family for 5% off.',
};

const POINTS = [
  'Pick the pieces, share one private link',
  'Family checkout as a guest in under a minute',
  "Or they join the family — 5% off, and they never miss a birthday",
  'Gift wrap and a handwritten-style note, prices tucked away',
];

export default function GiftsPage() {
  return (
    <div className="relative">
      <FloatingDoodles tone="warm" />
      <div className="relative mx-auto max-w-4xl px-6 py-14 md:py-20">
        <div className="text-center">
          <CaveatNote className="text-2xl">the easiest present, sorted</CaveatNote>
          <h1 className="mt-1 font-display text-4xl font-semibold leading-tight text-cocoa md:text-5xl">
            Gifts the whole family can give
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[#5F564C]">
            Turn a drawing into a present, then share a ready-to-buy link. Grandparents tap it, the cart&apos;s already
            filled, and something lovely is on its way.
          </p>
        </div>

        <div className="mt-12 grid items-center gap-8 md:grid-cols-2">
          <ul className="space-y-3">
            {POINTS.map((p) => (
              <li key={p} className="flex items-start gap-3 rounded-2xl border border-[#EFE6D6] bg-[#FFFDF8] p-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-meadow text-white">
                  <Icon icon={IconCheck} size={14} />
                </span>
                <span className="text-sm leading-relaxed text-[#46402F]">{p}</span>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border border-[#F0CF9C] bg-honey-band p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-honey bg-[#FFFDF8] text-cinnamon">
              <Icon icon={IconGift} size={26} />
            </span>
            <h2 className="mt-3 font-display text-xl font-semibold text-cocoa">A gift list for the big day</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#7A5B33]">
              Set one up in seconds and share it however you like — WhatsApp, email or text.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button href="/start-creating" size="lg" className="w-full">
                <Icon icon={IconLink} size={18} /> make a gift list
              </Button>
              <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-green-save">
                <Icon icon={IconUsersPlus} size={13} /> join the family for 5% off
              </span>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-10 flex max-w-md items-center justify-center gap-2 text-center text-xs text-green-save">
          <Icon icon={IconShieldCheck} size={15} /> Gift links are private, unguessable and never indexed — and you can
          revoke one any time.
        </p>
      </div>
    </div>
  );
}
