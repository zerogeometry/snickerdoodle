import { IconClockHour4 } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';

export const metadata: Metadata = {
  title: 'make a data-protection complaint',
  description: 'Raise a data-protection complaint directly with Snickerdoodle. We acknowledge within 30 days.',
};

// The DUAA s.164A complaints channel. Submissions are wired to the rights-request
// intake (the trust-spine backend) once auth + persistence land; the 30-day
// acknowledgement workflow runs from there.
export default function DataComplaintPage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
          Make a data-protection complaint
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-[#5F564C]">
          If you&apos;re unhappy with how we&apos;ve handled your or your family&apos;s data, tell us here. A real
          person will look into it.
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#EAF1E4] px-4 py-3 text-[13px] text-green-save">
          <Icon icon={IconClockHour4} size={16} className="shrink-0" />
          We&apos;ll acknowledge your complaint within <strong className="mx-1 font-bold">30 days</strong> and keep you
          posted on progress and the outcome.
        </div>

        <form className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-cocoa">Your name</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              className="w-full rounded-xl border border-[#E0C7A8] bg-[#FFFDF8] px-3.5 py-2.5 text-sm text-cocoa placeholder:text-[#A89B8C]"
              placeholder="First and last name"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-cocoa">Your email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              className="w-full rounded-xl border border-[#E0C7A8] bg-[#FFFDF8] px-3.5 py-2.5 text-sm text-cocoa placeholder:text-[#A89B8C]"
              placeholder="so we can reply"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-cocoa">What&apos;s your complaint about?</span>
            <textarea
              name="message"
              rows={6}
              className="w-full rounded-xl border border-[#E0C7A8] bg-[#FFFDF8] px-3.5 py-2.5 text-sm text-cocoa placeholder:text-[#A89B8C]"
              placeholder="Tell us what happened, in your own words."
            />
          </label>
          <Button size="lg" className="w-full sm:w-auto">
            send complaint
          </Button>
        </form>

        <p className="mt-6 text-[13px] leading-relaxed text-[#9C8E7E]">
          Prefer email? Reach us at <a className="text-cinnamon underline" href="mailto:[privacy@snickerdoodle.co.uk]">[privacy@snickerdoodle.co.uk]</a>.
          You also have the right to complain to the Information Commissioner&apos;s Office at ico.org.uk — though
          we&apos;d appreciate the chance to put things right first.
        </p>
      </div>
    </div>
  );
}
