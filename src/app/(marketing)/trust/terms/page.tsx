import type { Metadata } from 'next';
import { publicMetadata } from '@/lib/seo';
import Link from 'next/link';
import { Prose } from '@/ui/components/Prose';

export const metadata: Metadata = publicMetadata({
  title: 'terms of service',
  description: 'The terms for using Snickerdoodle — including how we process the drawings you upload.',
  path: '/trust/terms',
});

export default function TermsPage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="pop-in font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl">Terms of Service</h1>
        <p className="sticker mt-3 inline-block -rotate-1 rounded-[12px] bg-honey-band px-3 py-1 text-xs font-bold text-cocoa">Last updated: [date] · A draft for review before publication.</p>
      </div>

      <Prose className="mt-8">
        <h2>The short version</h2>
        <p>
          When you upload a drawing or photo, you let us process it to show you previews and make the things you order.
          Your work stays yours. We delete an upload within 30 days unless you keep it. Please only upload your own
          child&apos;s original art (or art you have the right to use), and be kind. The detail is below.
        </p>

        <h2>1. Who we are, and these terms</h2>
        <p>
          Snickerdoodle is a service operated by <strong>Launch Mode Ltd</strong> ([company number], registered in
          England &amp; Wales, registered office [address]). These terms are the agreement between you and us when you
          use the service. By uploading a drawing or placing an order you accept them. How we handle personal
          information is set out in our <Link href="/trust/privacy">Privacy Notice</Link>.
        </p>

        <h2>2. Uploading a drawing — what you allow us to do</h2>
        <p>
          When you upload an image, you grant us a limited, revocable licence to store and process that image{' '}
          <strong>only</strong> to provide the service to you: to strip location data, run automated safety checks,
          show you previews, apply the edits you choose, and make and deliver anything you order. We don&apos;t claim
          ownership of your work, we don&apos;t sell it, and we don&apos;t let our suppliers keep it or use it to train
          any AI model.
        </p>

        <h2>3. You upload before you sign up (and what happens to it)</h2>
        <p>
          You can upload and preview without an account. When you do, your image is held as a temporary draft and is{' '}
          <strong>automatically deleted within 30 days</strong> unless you choose to keep it in a Keepsake Home (which
          needs an account). Keeping it, or placing an order, is always your choice.
        </p>

        <h2>4. Your promise about what you upload</h2>
        <ul>
          <li>The drawing or photo is your child&apos;s own original work, or you otherwise have the right to use it.</li>
          <li>
            You understand that products featuring someone else&apos;s characters, logos or brands may infringe their
            rights; you&apos;re responsible for what you choose to make, and you agree not to use the service to
            reproduce material you don&apos;t have the right to use.
          </li>
          <li>You won&apos;t upload anything unlawful, harmful, or that isn&apos;t suitable for a children&apos;s product.</li>
        </ul>
        <p>
          We run automated checks on every upload. Where something is flagged, a limited, logged human review may
          follow; genuinely unlawful material is handled under our legal obligations. We may remove content or suspend
          access where these terms are broken, and there is a one-tap report route wherever a creation is shown.
        </p>

        <h2>5. Children</h2>
        <p>
          Snickerdoodle is for adults to use on behalf of their family. Only a parent or guardian may create an account,
          upload a child&apos;s work, invite others, or set who can see what. Children are not account holders. We look
          after children&apos;s data in line with the ICO&apos;s Children&apos;s Code — see the{' '}
          <Link href="/trust/privacy">Privacy Notice</Link> and our{' '}
          <Link href="/trust/family-promise">family promise</Link>.
        </p>

        <h2>6. Orders, prices and delivery</h2>
        <p>
          Prices are shown in pounds sterling and are calculated by us at checkout. Card payments are handled by our
          payment provider — we never see or store your full card details. We&apos;ll confirm your order and let you know
          if we can&apos;t fulfil it. Made-to-order, personalised items are produced specially for you; your statutory
          rights, including for faulty goods, are unaffected.
        </p>

        <h2>7. Your Keepsake Home and sharing</h2>
        <p>
          What you keep is private to you by default. If you invite family or share a ready-to-buy link, you control who
          can see and do what, and you can change or remove that access at any time.
        </p>

        <h2>8. Our service</h2>
        <p>
          We work hard to keep the service running and your work safe, but we provide it &ldquo;as is&rdquo; and
          can&apos;t promise it will always be uninterrupted or error-free. Nothing in these terms limits our liability
          where the law doesn&apos;t allow it (including for death or personal injury caused by our negligence, or for
          fraud).
        </p>

        <h2>9. Changes, and ending the agreement</h2>
        <p>
          We may update these terms; where a change matters we&apos;ll tell you. You can stop using the service and close
          your account at any time. We may suspend or end access if these terms are seriously or repeatedly broken.
        </p>

        <h2>10. Law and contact</h2>
        <p>
          These terms are governed by the law of England &amp; Wales, and the courts of England &amp; Wales have
          jurisdiction. Questions? <a href="mailto:[hello@snickerdoodle.co.uk]">[hello@snickerdoodle.co.uk]</a>.
        </p>

        <p className="text-[13px] text-ink-faint">
          Contact: <a href="mailto:[hello@snickerdoodle.co.uk]">[hello@snickerdoodle.co.uk]</a> · Launch Mode Ltd,
          [address].
        </p>
      </Prose>
    </div>
  );
}
