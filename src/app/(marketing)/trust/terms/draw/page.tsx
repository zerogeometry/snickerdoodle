import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/ui/components/Prose';
import { COMPANY } from '@/lib/company';

const COMPANY_ADDRESS = `${COMPANY.street}, ${COMPANY.city} ${COMPANY.postcode}`;

export const metadata: Metadata = {
  title: 'snickerdoodle draw terms',
  description: 'The terms for using Snickerdoodle Draw, our free drawing app for children.',
};

/**
 * The app's own terms. Google Play's "Terms of Service URL" must apply specifically to the app (founder, 17 Nov
 * 2026), and the website's /trust/terms only covers uploading and ordering. Kept short and in step with the
 * app's privacy notice (/trust/privacy/draw) and its store answers (snickerdoodle-draw/docs/store/*). Anything a
 * grown-up sends to their account from the app falls under the website's terms, which this page links to.
 */
export default function DrawTermsPage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="pop-in font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl">Snickerdoodle Draw: Terms</h1>
        <p className="sticker mt-3 inline-block -rotate-1 rounded-[12px] bg-honey-band px-3 py-1 text-xs font-bold text-cocoa">Last updated: 17 November 2026</p>
      </div>

      <Prose className="mt-8">
        <h2>The short version</h2>
        <p>
          Snickerdoodle Draw is free. There are no adverts and nothing to buy inside it. Your child&apos;s drawings are
          theirs, and they stay on your phone or tablet unless a grown-up chooses to send some to your Snickerdoodle
          account. The lessons, pictures and voices in the app are ours, for your family to enjoy. The detail is below.
        </p>

        <h2>1. Who we are, and these terms</h2>
        <p>
          Snickerdoodle Draw is made by <strong>Launch Mode Ltd</strong>, trading as Snickerdoodle (company number{' '}
          {COMPANY.companyNumber}, registered in England &amp; Wales, registered office {COMPANY_ADDRESS}). These terms are
          the agreement between you and us when your family uses the app. By installing or using it, you accept them.
          How the app handles information is set out in its own{' '}
          <Link href="/trust/privacy/draw">privacy notice</Link>.
        </p>
        <p>
          If you link the app to a Snickerdoodle account, anything it sends there (and anything you make real or order)
          is covered by our website&apos;s <Link href="/trust/terms">Terms of Service</Link> as well.
        </p>

        <h2>2. Who it&apos;s for</h2>
        <p>
          The app is made for children to draw in. The grown-up who installs it, a parent or guardian, is the one
          agreeing to these terms on the family&apos;s behalf. Children don&apos;t have accounts and never need to sign
          up. Anything for grown-ups (settings, linking, deleting, and links out of the app) sits behind the
          phone&apos;s own unlock or a grown-up PIN.
        </p>

        <h2>3. Free, with no adverts and nothing to buy</h2>
        <p>
          The app costs nothing. It has no adverts, no in-app purchases and no prices. If a grown-up wants to turn a
          drawing into a card, a mug or a print, that happens on our website, behind the grown-up gate, under the
          website&apos;s terms.
        </p>

        <h2>4. Your drawings are yours</h2>
        <p>
          Everything your child draws in the app belongs to them, including drawings made by following one of our
          lessons. We don&apos;t claim any rights in them. Drawings stay on your device, and we can&apos;t see them.
        </p>
        <p>
          If a grown-up links the app and sends drawings to your keepsake box, you give us permission to store and
          process them only to provide the service, exactly as with a website upload (section 2 of our{' '}
          <Link href="/trust/terms">Terms of Service</Link>). You can delete them at any time.
        </p>

        <h2>5. The app itself is ours</h2>
        <p>
          The lessons, step pictures, characters, voices and the app&apos;s design belong to us (or to people who
          have let us use them). We give your family a personal, non-commercial right to use the app on your own phones
          and tablets. Please don&apos;t copy, resell or take apart the app or its lessons.
        </p>

        <h2>6. Updates and changes</h2>
        <p>
          The app can update itself over the internet, so fixes and new lessons arrive without a trip to the app store.
          We may add, change or retire lessons and features from time to time. If a change matters to how the app
          handles information, we&apos;ll update the privacy notice first and show a note in the grown-ups&apos; corner.
        </p>

        <h2>7. Looking after your drawings</h2>
        <p>
          Because drawings live on your device, they go if the app is deleted, the device is reset or lost, or a
          grown-up deletes them in the grown-ups&apos; corner, and we can&apos;t get them back. Your phone&apos;s own
          backup may keep a copy. Drawings already sent to your keepsake box stay there until you delete them.
        </p>

        <h2>8. Something wrong?</h2>
        <p>
          Use &ldquo;report a problem&rdquo; in the grown-ups&apos; corner, or email{' '}
          <a href="mailto:hello@snickerdoodle.co.uk">hello@snickerdoodle.co.uk</a>. Our{' '}
          <Link href="/help">help page</Link> has answers to common questions.
        </p>

        <h2>9. Our app</h2>
        <p>
          We work hard to keep the app working well, but it&apos;s free and provided &ldquo;as is&rdquo;, so we
          can&apos;t promise it will always be error-free or work on every device. Nothing in these terms limits our
          liability where the law doesn&apos;t allow it (including for death or personal injury caused by our negligence,
          or for fraud), and your legal rights are unaffected.
        </p>

        <h2>10. The app stores</h2>
        <p>
          You get the app from the Apple App Store or Google Play, and their own terms apply to the download as well.
          These terms are between you and us: Apple and Google aren&apos;t responsible for the app or its content, and
          any questions or claims about it come to us.
        </p>

        <h2>11. Ending, changes, law and contact</h2>
        <p>
          You can stop using the app at any time by deleting it, and unlink it from your account whenever you like. We
          may update these terms; if a change matters we&apos;ll update the date above and tell you in the app. These
          terms are governed by the law of England &amp; Wales, and the courts of England &amp; Wales have jurisdiction.
        </p>

        <p className="text-[13px] text-ink-faint">
          Contact: <a href="mailto:hello@snickerdoodle.co.uk">hello@snickerdoodle.co.uk</a> · Launch Mode Ltd,{' '}
          {COMPANY_ADDRESS}.
        </p>
      </Prose>
    </div>
  );
}
