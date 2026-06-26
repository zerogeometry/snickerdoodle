import { IconHeart, IconLock, IconSparkles } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';

export const metadata: Metadata = {
  title: 'our story',
  description: "Why we built snickerdoodle — to keep the magic of childhood drawings, and frame the wonky bits in gold.",
};

export default function OurStoryPage() {
  return (
    <div className="relative">
      <FloatingDoodles tone="warm" />
      <div className="relative mx-auto max-w-2xl px-6 py-14 md:py-20">
        <div className="text-center">
          <CaveatNote className="text-2xl">hello from us</CaveatNote>
          <h1 className="mt-1 font-display text-4xl font-semibold leading-tight text-cocoa md:text-5xl">
            They&apos;re only little once
          </h1>
        </div>

        <div className="mt-10 space-y-5 text-[16px] leading-relaxed text-[#5F564C]">
          <p>
            It started with a fridge door. One of those drawings — all wobbly roof and a sun in the wrong corner — that
            you can&apos;t quite bring yourself to recycle. So it stayed up, curling at the edges, until it didn&apos;t.
          </p>
          <p>
            We thought: what if the wonky bits could be kept properly? Not tidied into something a grown-up would draw,
            but <b className="text-cocoa">framed in gold exactly as they are</b> — on a mug for Grandad, a tee for the
            holidays, a storybook where your little one is the hero.
          </p>
          <p>
            So we built snickerdoodle: a warm, private home for the magic, that grows with the child. Because childhood
            goes quietly, and then all at once.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-[#EFE6D6] bg-[#FFFDF8] p-5">
            <Icon icon={IconLock} size={22} className="mt-0.5 shrink-0 text-green-save" />
            <p className="text-sm leading-relaxed text-[#5F564C]">
              <b className="text-cocoa">Trust isn&apos;t a feature, it&apos;s the whole point.</b> Children&apos;s drawings
              are precious and personal, so everything is private by default, held safely in the UK, and always yours to
              download or delete.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-[#EFE6D6] bg-[#FFFDF8] p-5">
            <Icon icon={IconSparkles} size={22} className="mt-0.5 shrink-0 text-cinnamon" />
            <p className="text-sm leading-relaxed text-[#5F564C]">
              <b className="text-cocoa">We keep the magic.</b> A gentle hand to tidy or brighten, never a redraw — the
              original is sacred, and always recoverable.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Button href="/start-creating" size="lg">
            <Icon icon={IconHeart} size={18} /> keep the magic
          </Button>
        </div>
      </div>
    </div>
  );
}
