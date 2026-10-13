import { IconCheck, IconGift, IconLink, IconShieldCheck, IconUsersPlus } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';
import { ExampleWall } from '@/ui/components/ExampleWall';

export const metadata: Metadata = {
  title: 'gifts',
  description: 'Share a ready-to-buy link so family can treat your little one — guest checkout in a tap, or join the family for 5% off.',
};

const POINTS = [
  'Pick the pieces, share one private link',
  'Family checkout as a guest in under a minute',
  "Or they join the family — 5% off, and they never miss a birthday",
  'Ticked off the list once it’s bought — no doubling up',
];

export default function GiftsPage() {
  return (
    <div className="relative">
      <FloatingDoodles tone="warm" />
      <div className="relative mx-auto max-w-4xl px-6 py-14 md:py-20">
        <div className="text-center">
          <CaveatNote className="pop-in -rotate-2 text-[28px] leading-none">the easiest present, sorted</CaveatNote>
          <h1 className="pop-in mt-2 font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl" style={{ ['--i' as string]: 1 }}>
            Gifts the whole family can give
          </h1>
          <p className="pop-in mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft" style={{ ['--i' as string]: 2 }}>
            Turn a drawing into a present, then share a ready-to-buy link. Grandparents tap it, the cart&apos;s already
            filled, and something lovely is on its way.
          </p>
        </div>

        <div className="mt-12 grid items-center gap-8 md:grid-cols-2">
          <ul className="space-y-3">
            {POINTS.map((p, i) => (
              <li key={p} className="pop-in flex items-start gap-3 rounded-[18px] border-2 border-cocoa/15 bg-paper p-4" style={{ ['--i' as string]: i + 3 }}>
                <span className="sticker mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-pale text-green-save">
                  <Icon icon={IconCheck} size={15} />
                </span>
                <span className="text-sm leading-relaxed text-cocoa">{p}</span>
              </li>
            ))}
          </ul>

          <div className="pop-in tape rounded-[22px] border-2 border-cocoa bg-honey-band p-6 text-center shadow-[0_4px_0_var(--color-cocoa)]" style={{ ['--i' as string]: 4, rotate: '1deg' }}>
            <span className="sticker wiggle mx-auto flex h-14 w-14 -rotate-6 items-center justify-center rounded-full bg-paper text-cinnamon">
              <Icon icon={IconGift} size={26} />
            </span>
            <h2 className="mt-3 font-display text-2xl text-cocoa">A gift list for the big day</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
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

        {/* The main visual: real keepsakes made from children's drawings, taped to the wall. */}
        <section aria-labelledby="gift-examples" className="mt-16">
          <h2 id="gift-examples" className="text-center font-display text-3xl text-cocoa md:text-4xl">
            Little drawings, <span className="text-cinnamon">made real</span>
          </h2>
          <ExampleWall limit={8} className="mt-8" />
        </section>

        <p className="mx-auto mt-12 flex max-w-md items-center justify-center gap-2 text-center text-xs font-semibold text-green-save">
          <Icon icon={IconShieldCheck} size={15} /> Gift links are private, unguessable and never indexed — and you can
          revoke one any time.
        </p>
      </div>
    </div>
  );
}
