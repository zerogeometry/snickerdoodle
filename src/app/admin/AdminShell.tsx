import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { currentReviewer } from '@/server/admin/context';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { MfaGate } from './review/ReviewClient';

/**
 * The admin app's frame (project-office/briefs/ADMIN-APP-plan.md): one nav across every admin screen, phone first
 * (the nav scrolls sideways on a narrow screen), the same Scrapbook look as the rest of the site. Admins only, and
 * two-step login before anything is shown; to anyone else every admin page is "not found".
 */

export type AdminSection = 'today' | 'orders' | 'inbox' | 'week' | 'codes' | 'health' | 'review';

const NAV: { id: AdminSection; label: string; href: string }[] = [
  { id: 'today', label: 'today', href: '/admin' },
  { id: 'orders', label: 'orders', href: '/admin/orders' },
  { id: 'inbox', label: 'inbox', href: '/admin/inbox' },
  { id: 'week', label: 'this week', href: '/admin/week' },
  { id: 'codes', label: 'codes', href: '/admin/codes' },
  { id: 'health', label: 'health', href: '/admin/health' },
  { id: 'review', label: 'review', href: '/admin/review' },
];

export type AdminReviewer = Awaited<ReturnType<typeof currentReviewer>>;

/** The signed-in admin, or "not found" for anyone else (call at the top of an admin page). */
export async function adminOr404(): Promise<AdminReviewer> {
  const r = await currentReviewer();
  if (!r.accountId || !r.isAdmin) notFound();
  return r;
}

export function AdminShell({ section, title, blurb, reviewer, children }: { section: AdminSection; title: string; blurb?: ReactNode; reviewer: AdminReviewer; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader tag="admin" />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-4 md:px-6">
        <nav aria-label="admin" className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
          <ul className="flex w-max gap-2">
            {NAV.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  aria-current={n.id === section ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center rounded-pill border-2 px-4 text-sm font-bold ${n.id === section ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/20 bg-paper text-ink-soft hover:border-cocoa'}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <h1 className="mt-4 font-display text-3xl text-cocoa">{title}</h1>
        {blurb ? <p className="mt-1 max-w-xl text-sm text-ink-soft">{blurb}</p> : null}
        {!reviewer.mfaVerified ? <MfaGate enrolled={reviewer.enrolled} /> : children}
      </main>
    </div>
  );
}

/** A small "nothing here" card, the same everywhere (never a blank space). */
export function AdminEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mt-6 rounded-[20px] border-2 border-dashed border-cocoa/25 bg-paper p-8 text-center text-sm text-ink-soft">
      <p className="font-bold text-cocoa">{title}</p>
      {children ? <p className="mt-1">{children}</p> : null}
    </div>
  );
}

/** One number with its label (the pulse, the week's totals). */
export function AdminStat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-[18px] border-2 border-cocoa/15 bg-paper p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-1 font-display text-2xl ${tone === 'bad' ? 'text-cinnamon' : tone === 'good' ? 'text-green-save' : 'text-cocoa'}`}>{value}</p>
      {note ? <p className="text-xs text-ink-soft">{note}</p> : null}
    </div>
  );
}
