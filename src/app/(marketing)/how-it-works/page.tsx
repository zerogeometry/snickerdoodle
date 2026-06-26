import { IconCamera, IconGift, IconHeart, IconLock, IconSparkles, IconWand } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';

export const metadata: Metadata = {
  title: 'how it works',
  description: "Upload a drawing, see it made real on lovely things, and keep the magic in your family's private keepsake home.",
};

const STEPS = [
  {
    icon: IconCamera,
    title: 'Upload or snap it',
    body: "Pop in a drawing or take a photo. It goes straight to a private, UK-based home — never anywhere public, ever.",
  },
  {
    icon: IconWand,
    title: 'Watch it made real',
    body: 'In moments you see the same wonky, wonderful drawing on cards, prints, mugs, tees and a storybook they star in.',
  },
  {
    icon: IconHeart,
    title: 'Keep & share the magic',
    body: 'Keep favourites in your family keepsake home, and share a ready-to-buy link so grandparents can treat them too.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="relative">
      <FloatingDoodles tone="warm" />
      <div className="relative mx-auto max-w-4xl px-6 py-14 md:py-20">
        <div className="text-center">
          <CaveatNote className="text-2xl">it’s lovely and simple</CaveatNote>
          <h1 className="mt-1 font-display text-4xl font-semibold leading-tight text-cocoa md:text-5xl">
            How snickerdoodle works
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-[#5F564C]">
            Three little steps from a kitchen-table masterpiece to something you&apos;ll treasure for years.
          </p>
        </div>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-[#EFE6D6] bg-[#FFFDF8] p-6 text-center shadow-[0_2px_8px_rgba(46,39,35,.05)]">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-honey-band text-cinnamon">
                <Icon icon={s.icon} size={26} />
              </span>
              <p className="mt-3 font-hand text-lg text-cinnamon">step {i + 1}</p>
              <h2 className="font-display text-xl font-semibold text-cocoa">{s.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#5F564C]">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-2xl border border-[#EFE6D6] bg-[#FFFDF8] p-5">
            <Icon icon={IconSparkles} size={22} className="mt-0.5 shrink-0 text-cinnamon" />
            <p className="text-sm leading-relaxed text-[#5F564C]">
              <b className="text-cocoa">A little magic, never a robot.</b> One tap can tidy a smudge, brighten the
              colours, or ready it for a big print — the wonky bits stay, because that&apos;s the good bit.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-[#EFE6D6] bg-[#FFFDF8] p-5">
            <Icon icon={IconLock} size={22} className="mt-0.5 shrink-0 text-green-save" />
            <p className="text-sm leading-relaxed text-[#5F564C]">
              <b className="text-cocoa">Private by default.</b> Every keepsake starts as family-only. You choose who&apos;s
              in your circle and what they see — nothing is ever public.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Button href="/start-creating" size="lg">
            <Icon icon={IconGift} size={18} /> start creating — it&apos;s free to try
          </Button>
          <p className="text-xs text-[#7A6A58]">No account needed to see the magic.</p>
        </div>
      </div>
    </div>
  );
}
