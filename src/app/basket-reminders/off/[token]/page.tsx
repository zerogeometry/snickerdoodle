import { IconBellOff, IconCircleCheck, IconMailX } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { turnBasketRemindersOffByLink } from '@/server/savedBasket';
import { readBasketReminderOffToken } from '@/server/mail/basketReminder';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';

export const metadata: Metadata = { title: 'basket reminders', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The basket reminder email's off switch: no sign-in, one button. Opening the link changes nothing on its
 * own (mail scanners open links too) — the tap does. Mail apps' own "unsubscribe" goes straight to
 * /api/basket-reminders/off/<token>.
 */
export default async function BasketRemindersOffPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const done = (await searchParams).done === '1';
  const valid = readBasketReminderOffToken(token) !== null;

  async function turnOff() {
    'use server';
    const res = await turnBasketRemindersOffByLink(getDb(), token, 'email-link');
    redirect(`/basket-reminders/off/${encodeURIComponent(token)}${res.ok ? '?done=1' : ''}`);
  }

  const look = !valid
    ? { icon: IconMailX, ring: 'bg-berry-pale', tint: 'text-cinnamon', title: 'that link didn’t work', body: 'it may have been copied wrongly. you can turn basket reminders off from your basket instead.' }
    : done
      ? { icon: IconCircleCheck, ring: 'bg-leaf-pale', tint: 'text-green-save', title: 'basket reminders are off ✓', body: 'we won’t email you about things left in your basket. your basket is still saved, just as it was.' }
      : { icon: IconBellOff, ring: 'bg-honey-band', tint: 'text-cocoa', title: 'no more basket reminders?', body: 'we’ll stop emailing you when something’s left in your basket. your basket stays saved on your account.' };

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader />
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${look.ring}`}>
          <Icon icon={look.icon} size={40} className={look.tint} />
        </div>
        <h1 className="mt-5 font-display text-3xl text-cocoa">{look.title}</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">{look.body}</p>
        {valid && !done ? (
          <form action={turnOff} className="mt-7">
            <Button type="submit" size="lg">
              turn basket reminders off
            </Button>
          </form>
        ) : (
          <Button href="/checkout" variant="secondary" size="lg" className="mt-7">
            go to your basket
          </Button>
        )}
      </main>
    </div>
  );
}
