import { IconLock, IconLogout, IconUser } from '@tabler/icons-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { SignOutForm } from '@/ui/components/SignOutForm';
import { getCurrentAccount } from '@/server/session';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import { AccountActions } from './AccountActions';
import { ReferralCard } from './ReferralCard';
import { ProfileCard } from './ProfileCard';
import { profileImagesFor } from '@/server/profile';
import { getDb } from '@/db/client';
import { getCreditBalance, getOrCreateReferralCode } from '@/server/referrals';

export default async function AccountPage() {
  // Auth-gated server-side: a guest is sent to log in.
  const account = await getCurrentAccount();
  if (!account) redirect('/login');

  const displayName = account.name ?? account.email.split('@')[0] ?? account.email;
  const db = getDb();
  const [referralCode, creditPence, pictures] = await Promise.all([
    getOrCreateReferralCode(db, account),
    getCreditBalance(db, account.id),
    profileImagesFor(db, account.id, [account.id]),
  ]);
  const mine = pictures.get(account.id);
  const initial = (account.name ?? account.email).charAt(0).toUpperCase();

  async function logout() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Account" />

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-6 py-6">
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-cocoa">
          <Icon icon={IconUser} size={22} className="text-cinnamon" /> Your account
        </h1>

        {/* Profile — header, picture, name (what your family sees) + email (only you) */}
        <ProfileCard profile={{ name: displayName, email: account.email, initial, avatarUrl: mine?.avatarUrl ?? null, headerUrl: mine?.headerUrl ?? null }} />

        <ReferralCard code={referralCode} creditPence={creditPence} />

        {/* Your data — see / download / delete (trust-critical; one-tap per CLAUDE.md) */}
        <section className="mt-4">
          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">Your data, your rules</p>
          <AccountActions />
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-faint">
            <Icon icon={IconLock} size={14} className="mt-0.5 shrink-0 text-green-save" />
            Originals are sacred — your untouched upload is always recoverable, and deletable on demand.
          </p>
        </section>

        <SignOutForm action={logout}>
          <Button type="submit" variant="secondary" size="lg" className="mt-5 w-full">
            <Icon icon={IconLogout} size={16} /> log out
          </Button>
        </SignOutForm>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Questions about your data?{' '}
          <Link href="/trust/privacy" className="font-bold text-cinnamon">
            read our privacy promise
          </Link>
          .
        </p>
      </main>

      <BottomTabBar tabs={APP_TABS} active="Home" />
    </div>
  );
}
