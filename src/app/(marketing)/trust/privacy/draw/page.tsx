import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Prose } from '@/ui/components/Prose';
import { COMPANY } from '@/lib/company';
import { isTestSite } from '@/lib/siteMode';

const COMPANY_ADDRESS = `${COMPANY.street}, ${COMPANY.city} ${COMPANY.postcode}`;

/** A DRAFT until the founder approves it: shown on the (locked) test site, and on the live site only
 * once `DRAW_PRIVACY_NOTICE=live`. Never in navigation; not indexed while it's a draft. */
const published = () => process.env.DRAW_PRIVACY_NOTICE === 'live';

export const metadata: Metadata = {
  title: 'snickerdoodle draw privacy notice',
  description: 'How Snickerdoodle Draw, our drawing app for children, looks after your family’s information — on the phone, and when a grown-up links it to Snickerdoodle.',
  robots: { index: false, follow: false }, // a draft (founder approves trust pages before they go live)
};

/**
 * The app's own notice (both app stores need a privacy URL; the app links here from its grown-ups'
 * corner). It describes the app with website LINKING and the sync choices
 * (project-office/briefs/DRAW-APP-sync-choices.md, incl. the founder's decisions of 10 Nov) as the
 * website builds them. Anything in [square brackets] is for the founder to fill. App behaviour:
 * snickerdoodle-draw/docs/store/data-safety.md and docs/RELIABILITY.md.
 */
export default function DrawPrivacyNoticePage() {
  if (!published() && !isTestSite()) notFound();
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="pop-in font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl">Snickerdoodle Draw: Privacy Notice</h1>
        <p className="sticker mt-3 inline-block -rotate-1 rounded-[12px] bg-honey-band px-3 py-1 text-xs font-bold text-cocoa">Last updated: [date] · A draft for review before publication.</p>
      </div>

      <Prose className="mt-8">
        <h2>The short version</h2>
        <p>
          Snickerdoodle Draw is a drawing app for children aged 3 to 12. On its own, your child&apos;s drawings, name and
          progress <strong>stay on your family&apos;s phone or tablet</strong>. Children don&apos;t have accounts, and there
          are no adverts, no tracking and no in-app purchases. If a grown-up <strong>links</strong> the app to their
          Snickerdoodle account, only what that grown-up chooses is shared with it, and they can change or stop that at
          any time.
        </p>

        <h2>If you&apos;re a child reading this</h2>
        <p>
          Your drawings live on this phone or tablet. The grown-ups in your family can look at your drawings and your
          proud pile in the grown-ups&apos; corner. If your grown-up has linked the app to Snickerdoodle, some of your
          drawings may also go to your family&apos;s private keepsake box on our website, where only your family can see
          them. Your grown-up decides which ones.
        </p>

        <h2>1. Who we are</h2>
        <p>
          Snickerdoodle Draw is made by <strong>Launch Mode Ltd</strong>, trading as Snickerdoodle (company number{' '}
          {COMPANY.companyNumber}, registered in England &amp; Wales, registered office {COMPANY_ADDRESS}). We are the
          &ldquo;data controller&rdquo; for the information described here. You can reach us at{' '}
          <a href="mailto:hello@snickerdoodle.co.uk">hello@snickerdoodle.co.uk</a>. This notice covers the app. Our website
          has its own <Link href="/trust/privacy">privacy notice</Link>, which covers anything that reaches your
          Snickerdoodle account.
        </p>

        <h2>2. What stays on your device</h2>
        <ul>
          <li><strong>Each artist&apos;s details</strong>: a first name (never a surname), age group, drawing buddy and, if you add one, a birthday.</li>
          <li><strong>Drawings</strong>, and photos of drawings made on paper. The app keeps only the tidied-up picture, and the tidying happens on the phone.</li>
          <li><strong>Progress</strong>: drawing days, weeks in a row, lessons done, stickers and ranks.</li>
          <li><strong>Family birthdays and special days</strong> you add in the grown-ups&apos; corner, so the app can suggest drawing something for someone.</li>
          <li><strong>Settings</strong>, including the grown-up PIN, which is kept in the phone&apos;s own secure storage.</li>
        </ul>
        <p>
          Unless you link the app (section 6), none of this is sent to us. The app asks for the camera and photos only so
          a grown-up or child can snap a drawing made on paper. The microphone is blocked. Reminders are set on the phone
          itself: we don&apos;t send push messages.
        </p>
        <p>
          You can delete a drawing or an artist in the grown-ups&apos; corner, or delete everything on the device at once.
          Uninstalling the app removes it all too. Deleting on the phone doesn&apos;t delete a copy already in your
          keepsake box (see section 7). If your phone&apos;s own backup (Google or iCloud) is on, the phone may include the
          app&apos;s data in it. That backup is between you and Google or Apple, not us.
        </p>

        <h2>3. What always leaves your device</h2>
        <ul>
          <li>
            <strong>Checking for app updates (always).</strong> So fixes and new lessons can arrive without a trip to the
            app store, the app regularly asks our update service whether a newer version is ready. Each check sends the
            app&apos;s version and a <strong>random install number</strong> made when the app was installed. It isn&apos;t
            linked to your name, your child or any account, and like any internet request the service sees your IP
            address. We use it only to deliver updates and to count how many devices use the app.{' '}
            <em>Legal basis: our legitimate interests in keeping the app working and safe.</em>
          </li>
          <li>
            <strong>Crash reports (only if you switch them on).</strong> In the grown-ups&apos; corner you can choose to
            send anonymous crash reports to help us fix bugs. A report says what went wrong and where in the app, plus
            the app version, the operating system, on iPhone and iPad the device model, the app&apos;s language and the
            age group (for example &ldquo;6–8&rdquo;). It <strong>never</strong> includes names, drawings, birthdays,
            anything typed, or your IP address. Reports are kept for [number] days, and you can switch them off at any
            time. The &ldquo;report a problem&rdquo; button sends the app&apos;s recent problem notes once, only when you
            tap it. <em>Legal basis: your consent.</em>
          </li>
        </ul>
        <p>No advertising, no analytics, no third-party tracking, no sign-in for children, no in-app purchases.</p>

        <h2>4. Children&apos;s information</h2>
        <p>
          This app is used by children, so we follow the ICO&apos;s Children&apos;s Code (the Age Appropriate Design Code)
          in full. In practice:
        </p>
        <ul>
          <li>privacy is high by default: crash reports stay off, and when you link the app nothing is chosen for you;</li>
          <li>we collect as little as possible: first names only, never a surname, and never a year for a relative&apos;s birthday;</li>
          <li>there are no nudges to share or buy, and no prices or shop anywhere in the app;</li>
          <li>weekly drawing runs celebrate and never pressure, and a grown-up can switch them off;</li>
          <li>
            anything for grown-ups (settings, linking, deleting, links out of the app) sits behind the phone&apos;s own
            unlock (fingerprint, face or passcode) or a grown-up PIN.
          </li>
        </ul>

        <h2>5. Who helps us</h2>
        <p>Two suppliers process data for the app, each under a contract that limits them to our instructions:</p>
        <ul>
          <li><strong>Expo</strong> (650 Industries, Inc., USA) runs the update service: the install number, app version and IP address of each check.</li>
          <li><strong>Sentry</strong> (Functional Software, Inc.) receives crash reports, only if you&apos;ve switched them on. We&apos;ve turned off IP address storage.</li>
        </ul>
        <p>
          Where a supplier processes data outside the UK, we make sure it&apos;s protected by an approved safeguard (such
          as the UK&apos;s international data transfer agreement or a recognised data bridge). Anything sent to your
          Snickerdoodle account is handled by the website&apos;s own suppliers, listed in its{' '}
          <Link href="/trust/privacy">privacy notice</Link>, and kept in the UK.
        </p>

        <h2>6. Linking the app to your Snickerdoodle account</h2>
        <p>
          A grown-up can link the app from the grown-ups&apos; corner. They sign in to snickerdoodle.co.uk in the
          phone&apos;s browser; only the grown-up who runs the family on Snickerdoodle can link. They choose which of
          their little ones the phone is for, and then <strong>what syncs</strong>. Nothing is picked for you: the
          link can&apos;t be made until you&apos;ve chosen what happens to drawings.
        </p>
        <ul>
          <li>
            <strong>Drawings to your keepsake box</strong> (you choose one):
            <ul>
              <li><strong>nothing automatic</strong>: a drawing is sent only when a grown-up taps &ldquo;keep it&rdquo;, &ldquo;make it real&rdquo; or &ldquo;share a ready-to-buy link&rdquo; on it;</li>
              <li><strong>the proud pile only</strong>: also every drawing starred into the proud pile, whoever stars it, your child included;</li>
              <li><strong>all drawings</strong>: every drawing saved in the app.</li>
            </ul>
            Each drawing goes with the website&apos;s id for the child it&apos;s by, the day it was made, and whether it
            was drawn on screen or on paper. Nothing else about it.
          </li>
          <li>
            <strong>First names and birthdays</strong> (unticked unless you tick it): your little ones&apos; first names and
            birthdays are kept the same in the app and on the website, both ways.
          </li>
          <li>
            <strong>Drawing days</strong> (unticked unless you tick it): each little one&apos;s drawing days, rest weeks,
            best run and lessons done are backed up to your account, so a new phone can pick them up.
          </li>
          <li>
            <strong>Family birthdays and special days</strong> (unticked unless you tick it): the app&apos;s list and your
            family calendar on the website become one list: a name, what they are to you if you add it, birthday or
            special day, and the day and month. Never a year.
          </li>
        </ul>
        <p>Once linked, whatever you choose, the app can also:</p>
        <ul>
          <li>see your little ones&apos; first names, to file each drawing under the right one, and add a little one (first name only);</li>
          <li>make a ready-to-buy link for a drawing it sent, or open our website when you want to make one real;</li>
          <li>delete a drawing it sent;</li>
          <li>show your orders (a reference, the date and where it&apos;s got to) in the grown-ups&apos; corner.</li>
        </ul>
        <p>
          It can&apos;t see the rest of your keepsake box or your family, it can&apos;t see your email address, it never
          shows prices, and it can&apos;t take a payment. Pictures from the website never come back into the app.
        </p>
        <p>
          <em>Legal basis: [to confirm — e.g. our contract with you to keep your family&apos;s keepsakes, with the
          choices above as your instructions].</em>
        </p>

        <h2>7. On the website, and changing your mind</h2>
        <ul>
          <li>
            A drawing sent from the app is treated exactly like one you upload on the website: it&apos;s kept in private,
            encrypted storage in the UK, with any hidden photo details (like location) removed, and it goes through the
            same automatic safety checks. Until they&apos;re done, only you can see it, and it can&apos;t be shared or
            printed. After that, your family on Snickerdoodle can see it in your keepsake box.
          </li>
          <li>
            You can change what syncs at any time. In the app&apos;s grown-ups&apos; corner you can send less or stop; to
            send more, use your account page on snickerdoodle.co.uk, which can change every choice. Stopping a sync never
            deletes anything already sent.
          </li>
          <li>
            To delete what the app sent: delete one drawing from the app, or use <strong>&ldquo;remove everything draw
            sent&rdquo;</strong> on your account page (a drawing in an order that isn&apos;t made yet stays until it&apos;s
            on its way). The backed-up drawing days can be deleted there too, and are deleted anyway if no phone has
            backed them up for a year.
          </li>
          <li>
            <strong>Disconnect</strong> a phone on your account page, or unlink it in the app, and it stops at once. A
            linked phone that isn&apos;t used for 90 days is disconnected by itself. Drawings already in your keepsake box
            stay there until you delete them; the drawings on the phone stay on the phone.
          </li>
        </ul>

        <h2>8. Your rights</h2>
        <p>
          You can ask us for a copy of your data, or ask us to correct or delete it. If you&apos;ve linked the app,
          what it sent is part of your Snickerdoodle account: the account page&apos;s data download includes your linked
          phones, their sync choices and any backed-up drawing days, and the website&apos;s{' '}
          <Link href="/trust/privacy">privacy notice</Link> explains the rest. What stays on the phone we can&apos;t reach,
          so delete that on the phone. For a crash report, tell us roughly when it was sent and we&apos;ll delete it.
        </p>

        <h2>9. Complaints</h2>
        <p>
          If you&apos;re unhappy with how we&apos;ve handled your data, you can <strong>complain directly to us</strong>{' '}
          using our <Link href="/trust/data-complaint">complaint form</Link>. You also have the right to complain to the{' '}
          <strong>Information Commissioner&apos;s Office</strong> at ico.org.uk, though we&apos;d appreciate the chance to
          put things right first.
        </p>

        <h2>10. Changes to this notice</h2>
        <p>
          If we change how the app handles information, we&apos;ll update this page and the date above. For anything
          important, we&apos;ll also show a note in the grown-ups&apos; corner.
        </p>

        <p className="text-[13px] text-ink-faint">
          Contact: <a href="mailto:hello@snickerdoodle.co.uk">hello@snickerdoodle.co.uk</a> · Launch Mode Ltd,{' '}
          {COMPANY_ADDRESS} · ICO registration [number].
        </p>
      </Prose>
    </div>
  );
}
