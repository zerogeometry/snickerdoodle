import { IconCamera, IconGift, IconHeart, IconLock, IconSparkles, IconWand } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { FloatingDoodles } from '@/ui/components/FloatingDoodles';
import { ExamplePolaroid } from '@/ui/components/ExamplePolaroid';

export const metadata: Metadata = publicMetadata({
  title: 'how it works',
  description: "Upload a drawing, see it made real on lovely things, and keep the magic in your family's private keepsake home.",
  path: '/how-it-works',
});

const STEPS = [
  {
    icon: IconCamera,
    title: 'Upload or snap it',
    body: "Pop in a drawing or take a photo. It goes straight to a private, UK-based home — never anywhere public, ever.",
  },
  {
    icon: IconWand,
    title: 'Watch it made real',
    body: 'In moments you see the same wonky, wonderful drawing on framed prints, mugs, cushions, jigsaws, blankets and cards.',
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
          <CaveatNote className="pop-in -rotate-2 text-[28px] leading-none">it’s lovely and simple</CaveatNote>
          <h1 className="pop-in mt-2 font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl" style={{ ['--i' as string]: 1 }}>
            How snickerdoodle works
          </h1>
          <p className="pop-in mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft" style={{ ['--i' as string]: 2 }}>
            Three little steps from a kitchen-table masterpiece to something you&apos;ll treasure for years.
          </p>
        </div>

        <ol className="mt-14 grid gap-9 md:grid-cols-3 md:gap-6">
          {STEPS.map((s, i) => (
            // Each step is a taped paper card with a small resting tilt (pop-in on the wrapper so
            // the entrance never fights the card's own tilt).
            <li key={s.title} className="pop-in" style={{ ['--i' as string]: i + 3 }}>
              <div
                className="tape h-full rounded-[18px] border-2 border-cocoa/15 bg-paper p-6 text-center shadow-[0_6px_14px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)]"
                style={{ rotate: i === 1 ? '1deg' : '-1deg', ['--tape' as string]: `color-mix(in srgb, var(--color-${['honey', 'sky', 'berry'][i]}) 80%, transparent)` }}
              >
                <span className="sticker wiggle mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-honey text-cocoa">
                  <Icon icon={s.icon} size={26} />
                </span>
                <p className="mt-4 text-[11px] font-extrabold uppercase tracking-wide text-cinnamon">step {i + 1}</p>
                <h2 className="mt-0.5 font-display text-xl text-cocoa">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
                {i === 1 ? (
                  // The "made real" moment, shown for real: a keepsake made from a child's painting.
                  <ExamplePolaroid slug="family-mug" tilt="2deg" tape="berry" className="mx-auto mt-5 w-40" />
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-[18px] border-2 border-cocoa/15 bg-sky-pale p-5">
            <Icon icon={IconSparkles} size={22} className="mt-0.5 shrink-0 text-cinnamon" />
            <p className="text-sm leading-relaxed text-ink-soft">
              <b className="text-cocoa">A little magic, never a robot.</b> One tap can tidy a smudge, brighten the
              colours, or ready it for a big print — the wonky bits stay, because that&apos;s the good bit.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-[18px] border-2 border-cocoa/15 bg-leaf-pale p-5">
            <Icon icon={IconLock} size={22} className="mt-0.5 shrink-0 text-green-save" />
            <p className="text-sm leading-relaxed text-ink-soft">
              <b className="text-cocoa">Private by default.</b> Every keepsake starts as family-only. You choose who&apos;s
              in your circle and what they see — nothing is ever public.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <Button href="/start-creating" size="lg" attention>
            <Icon icon={IconGift} size={18} /> start creating — it&apos;s free to try
          </Button>
          <p className="text-xs text-ink-soft">No account needed to see the magic.</p>
        </div>
      </div>
    </div>
  );
}
