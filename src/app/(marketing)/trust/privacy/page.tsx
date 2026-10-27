import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/ui/components/Prose';
import { COMPANY } from '@/lib/company';

const COMPANY_ADDRESS = `${COMPANY.street}, ${COMPANY.city} ${COMPANY.postcode}`;

export const metadata: Metadata = {
  title: 'privacy notice',
  description: 'How Snickerdoodle (Launch Mode Ltd) collects, uses and looks after your personal information.',
};

export default function PrivacyNoticePage() {
  return (
    <div className="px-6 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="pop-in font-display text-[40px] leading-[1.02] text-cocoa md:text-6xl">Privacy Notice</h1>
        <p className="sticker mt-3 inline-block -rotate-1 rounded-[12px] bg-honey-band px-3 py-1 text-xs font-bold text-cocoa">Last updated: [date] · A draft for review before publication.</p>
      </div>

      <Prose className="mt-8">
        <h2>The short version</h2>
        <p>
          Everything you make on Snickerdoodle is yours. We use your child&apos;s drawings and photos to make the things
          you order, we don&apos;t sell your data, we don&apos;t let anyone train AI on it, and we delete what we
          don&apos;t need. You can see and delete anything, any time. The full detail is below.
        </p>

        <h2>1. Who we are</h2>
        <p>
          Snickerdoodle is a service operated by <strong>Launch Mode Ltd</strong> (company number {COMPANY.companyNumber}, registered in
          England &amp; Wales, registered office {COMPANY_ADDRESS}). We are the &ldquo;data controller&rdquo; for the personal
          information described here. You can reach us at <a href="mailto:hello@snickerdoodle.co.uk">hello@snickerdoodle.co.uk</a>.
          We are registered with the Information Commissioner&apos;s Office (ICO), registration number [ICO number].
        </p>

        <h2>2. The information we collect</h2>
        <ul>
          <li><strong>Your account details</strong> — your name, email, and a securely hashed password.</li>
          <li><strong>Your child&apos;s details</strong> — a first name and birthday/age, if you choose to add them.</li>
          <li><strong>Your creations</strong> — the drawings and photos you upload, and the designs we make from them.</li>
          <li><strong>Your orders</strong> — what you bought, your delivery address, and a secure payment token (we never see or store your full card details).</li>
          <li><strong>Your preferences</strong> — your marketing and reminder choices.</li>
          <li><strong>Our news list</strong> — just your email address, if you ask to hear about new things first (nothing about your children, ever).</li>
          <li><strong>Wishlists and shares</strong> — the wishlists you create and the private links you share with family.</li>
          <li><strong>Messages you send us</strong> — what you tell us through our help page (and any order reference), plus the email address we reply to.</li>
          <li><strong>Basic technical data</strong> — device and cookie data, for security and to keep the site working.</li>
        </ul>

        <h2>3. Why we use it, and our legal basis</h2>
        <ul>
          <li><strong>To make and deliver what you order</strong>, including processing your child&apos;s drawing or photo into the product. <em>Legal basis: performance of our contract with you.</em></li>
          <li><strong>To run your account and your Keepsake Home.</strong> <em>Legal basis: contract.</em></li>
          <li><strong>To send you marketing or birthday reminders</strong> — only if you&apos;ve opted in. <em>Legal basis: your consent.</em> You can withdraw it any time.</li>
          <li><strong>To keep the service secure and prevent fraud.</strong> <em>Legal basis: our legitimate interests.</em></li>
          <li><strong>To meet legal obligations</strong> — e.g. keeping order records for tax. <em>Legal basis: legal obligation.</em></li>
        </ul>

        <h2>4. Children&apos;s information — how we look after it</h2>
        <p>
          Snickerdoodle is for grown-ups to use, but it&apos;s built entirely around children&apos;s drawings and
          photos, so we hold children&apos;s data to a higher standard than the law&apos;s minimum. We have chosen to
          design the service in line with the ICO&apos;s Children&apos;s Code. In practice: privacy is the default;
          we collect as little as possible; we never profile children or use their data for behavioural advertising;
          and you can see and delete anything about your child, any time, in one place.
        </p>

        <h2>5. Artificial intelligence, in plain terms</h2>
        <p>
          <strong>Right now, we don&apos;t use generative AI at all.</strong> The little &ldquo;magic&rdquo; touches —
          lifting the background off a drawing, tidying it up, making it big enough to print — run on our own
          servers in London, so no outside company ever sees your image to do them.
        </p>
        <p>
          If we ever add anything generative, we&apos;ll update this notice first. Any provider we used would be
          contractually forbidden from keeping your images or using them to train any AI model, would only ever be
          sent the one picture needed, and nothing it made would be shown or printed without our safety checks. We
          don&apos;t make any decision about you by automated means that has a legal or similarly significant effect.
        </p>

        <h2>6. Who we share it with</h2>
        <p>
          We don&apos;t sell your data, and we never share it with other Snickerdoodle families. We use a small number
          of trusted suppliers to run the service, each bound by a contract that limits them to our instructions and
          only sees what it needs to do its job:
        </p>
        <ul>
          <li><strong>Amazon Web Services</strong> (London, UK) — hosts the website and our database, and keeps the drawings and photos you upload in private, encrypted storage. When we switch on automatic image safety checks, those run with Amazon in London too.</li>
          <li><strong>Stripe</strong> — takes your payment. Your card details go straight to Stripe; we never see or store them.</li>
          <li><strong>Prodigi</strong> — prints your order and delivers it. They get the print file for what you ordered and the delivery address.</li>
          <li><strong>Resend</strong> (Ireland, EU) — sends the site&apos;s emails, like your sign-in links, order updates and gift requests.</li>
          <li><strong>Google Workspace</strong> — our own mailboxes (support@ and hello@), so a message you send us, and our reply, is kept there.</li>
        </ul>
        <p>If we add or change a supplier, we&apos;ll update this list.</p>

        <h2>7. Sending data outside the UK</h2>
        <p>
          Some suppliers may process data outside the UK. Where they do, we make sure it&apos;s protected by an approved
          safeguard (such as the UK&apos;s international data transfer agreement or a recognised data bridge), and we
          assess that the protection is not materially lower than UK standards — with extra care for children&apos;s data.
        </p>

        <h2>8. How long we keep it</h2>
        <ul>
          <li><strong>Drawings and photos you upload:</strong> only as long as we need them to make and send your order, plus 30 days after it&apos;s sent in case anything needs reprinting — then we delete them, <strong>unless</strong> you choose to keep them in your Keepsake Home (we ask after you order).</li>
          <li><strong>Keepsake Home items:</strong> for as long as you want them. Delete any time.</li>
          <li><strong>Profile pictures, profile headers and family banners:</strong> until you change or remove them, or close your account. Only people in your family can see them, and we strip location data from every one.</li>
          <li><strong>Order records:</strong> six years, because tax law requires it.</li>
          <li><strong>Messages you send us through the help page:</strong> two years after we receive them, so we can look back if an order needs it — then deleted.</li>
          <li><strong>Account data:</strong> until you close your account.</li>
          <li><strong>Marketing choices:</strong> until you change them.</li>
          <li><strong>Our news list:</strong> if you never tap the confirmation link, we delete your email after 30 days. Once you&apos;ve confirmed, until you unsubscribe — after that we keep only a note of your address and that you said no, so we never email you by mistake.</li>
          <li><strong>Backups:</strong> when we delete something it&apos;s gone from our live systems straight away, and from our backups within 14 days. Backups are only ever used to recover from a fault — never for anything else — and if we ever restore one, we re-apply every deletion made since.</li>
          <li><strong>A record of what we did:</strong> a minimal log of actions — for example &ldquo;a keepsake was deleted&rdquo; — with no names, pictures or words in it, kept for six years so we can show we did what we said.</li>
        </ul>

        <h2>9. Your rights</h2>
        <p>
          You can ask us to give you a copy of your data; correct it; delete it; restrict or object to how we use it; or
          give it to you in a portable form. You can withdraw consent for marketing or reminders at any time. We&apos;ll
          respond within the legal timeframe — though we may pause the clock if we need to confirm your identity or
          clarify your request.
        </p>

        <h2>10. Complaints</h2>
        <p>
          If you&apos;re unhappy with how we&apos;ve handled your data, you can <strong>complain directly to us</strong>{' '}
          using our <Link href="/trust/data-complaint">complaint form</Link> — we&apos;ll acknowledge it within 30 days
          and keep you posted. You also have the right to complain to the <strong>Information Commissioner&apos;s
          Office</strong> at ico.org.uk, though we&apos;d appreciate the chance to put things right first.
        </p>

        <h2>11. Cookies</h2>
        <p>
          We use a small number of cookies to keep the site secure and working, and (only with your agreement) to
          understand how it&apos;s used. You can manage non-essential cookies any time via our{' '}
          <Link href="/trust/cookies">cookie settings</Link>.
        </p>

        <h2>12. Changes to this notice</h2>
        <p>
          If we change how we use your data, we&apos;ll update this notice and, where it matters, tell you directly.
        </p>

        <p className="text-[13px] text-ink-faint">
          Contact: <a href="mailto:hello@snickerdoodle.co.uk">hello@snickerdoodle.co.uk</a> · Launch Mode Ltd,
          {COMPANY_ADDRESS} · ICO registration [number].
        </p>
      </Prose>
    </div>
  );
}
