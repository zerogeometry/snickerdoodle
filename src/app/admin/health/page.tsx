import type { Metadata } from 'next';
import { IconAlertTriangle, IconCircleCheck, IconClockExclamation } from '@tabler/icons-react';
import { getDb } from '@/db/client';
import { healthView } from '@/server/admin/health';
import { waited } from '@/server/admin/needs';
import { Icon } from '@/ui/primitives/Icon';
import { AdminShell, adminOr404, type AdminReviewer } from '../AdminShell';

export const metadata: Metadata = { title: 'health · admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Site health: the server's hourly check, each scheduled job's last run, and the weekly Prodigi check. */
export default async function HealthPage() {
  const r = await adminOr404();
  return (
    <AdminShell section="health" title="health" blurb="The server checks itself every hour; each scheduled job reports when it runs. A problem here also goes on Today and is emailed." reviewer={r}>
      <Health reviewer={r} />
    </AdminShell>
  );
}

async function Health({ reviewer }: { reviewer: AdminReviewer }) {
  const h = await healthView(getDb(), reviewer);
  const now = new Date();
  const bad = h.checks.filter((c) => !c.ok || c.late);
  return (
    <>
      <div className={`mt-5 flex items-center gap-3 rounded-[20px] border-2 p-4 ${bad.length ? 'border-cta bg-paper' : 'border-green-save bg-paper'}`}>
        <Icon icon={bad.length ? IconAlertTriangle : IconCircleCheck} size={28} className={bad.length ? 'text-cinnamon' : 'text-green-save'} />
        <div>
          <p className="font-display text-xl text-cocoa">{bad.length ? `${bad.length} thing${bad.length === 1 ? '' : 's'} need${bad.length === 1 ? 's' : ''} a look` : 'all well'}</p>
          <p className="text-xs text-ink-soft">running build {h.build}</p>
        </div>
      </div>
      <ul className="mt-4 divide-y-2 divide-cocoa/10 overflow-hidden rounded-[20px] border-2 border-cocoa/15 bg-paper" aria-label="checks">
        {h.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-4 py-3">
            <Icon icon={!c.ok ? IconAlertTriangle : c.late ? IconClockExclamation : IconCircleCheck} size={20} className={!c.ok || c.late ? 'mt-0.5 text-cinnamon' : 'mt-0.5 text-green-save'} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-cocoa">{c.label}</p>
              <p className="text-xs text-ink-soft">
                {!c.ok ? 'problem' : c.late ? 'hasn’t reported for a while' : 'fine'} · checked {waited(c.checkedAt, now)} ago{c.note ? ` · ${c.note}` : ''}
              </p>
              {c.problems.length ? (
                <ul className="mt-1 list-disc pl-5 text-sm text-cinnamon">
                  {c.problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {h.missing.length ? <p className="mt-3 text-xs text-ink-faint">Not reported yet: {h.missing.join(', ')}. They appear after their first run.</p> : null}
    </>
  );
}
