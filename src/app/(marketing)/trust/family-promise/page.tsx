import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo';
import Link from 'next/link';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Prose } from '@/ui/components/Prose';

export const metadata: Metadata = publicMetadata({
  title: 'how we look after your family’s data',
  description: 'The plain-English promise of how Snickerdoodle looks after your family’s drawings, photos and data.',
  path: '/trust/family-promise',
});

export default function FamilyPromisePage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <CaveatNote className="pop-in -rotate-2 text-[28px] leading-none">they&apos;re only little once</CaveatNote>
        <h1 className="pop-in mt-2 font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl" style={{ ['--i' as string]: 1 }}>
          Looking after your family&apos;s magic
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Your child&apos;s drawings, their funny little photos, their name and their birthday — these are about the
          most precious things you could hand anyone. We don&apos;t take that lightly. So here&apos;s exactly how we
          look after them, in plain English. No legalese, no small-print games.
        </p>
      </div>

      <Prose className="mt-10">
        <h3>It&apos;s yours. It stays yours.</h3>
        <p>
          Everything you make on Snickerdoodle belongs to you. We use it to make the lovely things you order — and
          that&apos;s it. We never sell it. We never hand it to other families. It&apos;s your family&apos;s, full stop.
        </p>

        <h3>We don&apos;t keep what we don&apos;t need.</h3>
        <p>
          Once we&apos;ve made your order, we delete the drawing or photo you uploaded — unless you&apos;ve chosen to
          keep it safe in your Keepsake Home. No quiet hoarding of your child&apos;s pictures on some server forever.
        </p>

        <h3>No AI is learning from your child.</h3>
        <p>
          We use clever tools to turn a wobbly drawing into something beautiful. But the companies behind those tools
          are contractually forbidden from keeping your images or using them to teach any AI. Your child&apos;s drawing
          makes <strong>your</strong> product, and nothing else.
        </p>

        <h3>Private is the default.</h3>
        <p>
          Nothing about your child is ever public unless <strong>you</strong> decide to share it. No public profiles,
          no feeds, no surprises. When you share a wishlist with Grandma, only the people with your private link can see
          it — and you can switch it off whenever you like.
        </p>

        <h3>You&apos;re in control. Always.</h3>
        <p>
          See everything we hold, download it, or delete it — any time, in one tap, right from your account. It&apos;s
          your stuff, your rules.
        </p>

        <h3>We&apos;re built for little ones from the ground up.</h3>
        <p>
          Snickerdoodle is for grown-ups to use, but everything about your child gets handled to a higher standard.
          We&apos;ve designed the whole service around the UK&apos;s Children&apos;s Code, which sets out how to look
          after children&apos;s information properly. We didn&apos;t have to. We did it because it&apos;s your kid.
        </p>

        <h3>Something not right? Tell us.</h3>
        <p>
          If you&apos;re ever unhappy with how we&apos;ve looked after your data, tell us at{' '}
          <a href="mailto:[privacy@snickerdoodle.co.uk]">[privacy@snickerdoodle.co.uk]</a> — a real person will get back
          to you. You can always go to the regulator too, but we&apos;d love the chance to put it right first.
        </p>

        <p className="text-[13px] text-ink-faint">
          The plain-English promises here are the friendly face of the proper, boring, important stuff — you can read
          the full <Link href="/trust/privacy">Privacy Notice</Link> any time. They&apos;re only little once.
          We&apos;ll look after the magic.
        </p>
      </Prose>
    </div>
  );
}
