import { IconClockHour4 } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo';
import { Icon } from '@/ui/primitives/Icon';
import { ComplaintForm } from './ComplaintForm';

export const metadata: Metadata = publicMetadata({
  title: 'make a data-protection complaint',
  description: 'Raise a data-protection complaint directly with Snickerdoodle. We acknowledge within 30 days.',
  path: '/trust/data-complaint',
});

// The DUAA s.164A complaints channel: submissions go to the rights-request intake
// (src/server/rights.ts) — recorded with a due date and acknowledged by email on receipt.
export default function DataComplaintPage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="pop-in font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl">
          Make a data-protection complaint
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          If you&apos;re unhappy with how we&apos;ve handled your or your family&apos;s data, tell us here. A real
          person will look into it.
        </p>

        <div className="mt-5 flex items-center gap-2 rounded-[14px] border-2 border-leaf bg-leaf-pale px-4 py-3 text-[13px] text-green-save">
          <Icon icon={IconClockHour4} size={16} className="shrink-0" />
          We&apos;ll acknowledge your complaint within <strong className="mx-1 font-bold">30 days</strong> and keep you
          posted on progress and the outcome.
        </div>

        <ComplaintForm />

        <p className="mt-6 text-[13px] leading-relaxed text-ink-faint">
          Prefer email? Reach us at <a className="text-cinnamon underline" href="mailto:[privacy@snickerdoodle.co.uk]">[privacy@snickerdoodle.co.uk]</a>.
          You also have the right to complain to the Information Commissioner&apos;s Office at ico.org.uk — though
          we&apos;d appreciate the chance to put things right first.
        </p>
      </div>
    </div>
  );
}
