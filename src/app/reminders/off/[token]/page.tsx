import { IconBellOff, IconCircleCheck, IconMailX } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { turnRemindersOffByLink } from '@/server/reminders';
import { readReminderOffToken } from '@/server/mail/reminderOff';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';

export const metadata: Metadata = { title: 'birthday reminders', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * The reminder email's off switch (sweep 04-B10): no sign-in, one button. Opening the link changes
 * nothing on its own (mail scanners open links too) — the tap does. Mail apps' own "unsubscribe"
 * goes straight to /api/reminders/off/<token>.
 */
export default async function RemindersOffPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const done = (await searchParams).done === '1';
  const valid = readReminderOffToken(token) !== null;

  async function turnOff() {
    'use server';
    const res = await turnRemindersOffByLink(getDb(), token, 'email-link');
    redirect(`/reminders/off/${encodeURIComponent(token)}${res.ok ? '?done=1' : ''}`);
  }

  const look = !valid
    ? { icon: IconMailX, ring: 'bg-berry-pale', tint: 'text-cinnamon', title: 'that link didn’t work', body: 'it may have been copied wrongly. you can turn reminders off from your family page instead.' }
    : done
      ? { icon: IconCircleCheck, ring: 'bg-leaf-pale', tint: 'text-green-save', title: 'reminders are off ✓', body: 'no more birthday nudges by email. changed your mind? turn them back on any time from your family page.' }
      : { icon: IconBellOff, ring: 'bg-honey-band', tint: 'text-cocoa', title: 'stop the birthday reminders?', body: 'we’ll stop emailing you about birthdays and occasions coming up. your family calendar stays just as it is.' };

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
              turn reminders off
            </Button>
          </form>
        ) : (
          <Button href="/family" variant="secondary" size="lg" className="mt-7">
            go to your family page
          </Button>
        )}
      </main>
    </div>
  );
}
