import { asc } from 'drizzle-orm';
import { opsStatus } from '@/db/schema';
import type { Reviewer } from '@/authz';
import type { DbHandle } from '../db';
import { assertAdmin } from './today';

/**
 * Site health for the admin app: the latest word from each thing that watches the shop. The box's hourly watchdog
 * (services, disk, backups, certificate, worrying log lines; it posts here), each scheduled job's last run, and the
 * weekly Prodigi check. Names of checks and counts only, never personal data.
 */

/** The scheduled jobs and how often they should run (minutes): a job silent for twice that is "late". */
export const JOB_EVERY: Record<string, { minutes: number; label: string }> = {
  fulfilment: { minutes: 5, label: 'make and send orders' },
  retention: { minutes: 60, label: 'delete what’s past its time' },
  'admin-alerts': { minutes: 5, label: 'urgent team emails' },
  popularity: { minutes: 24 * 60, label: 'most popular order' },
  reminders: { minutes: 24 * 60, label: 'occasion reminders' },
  morning: { minutes: 24 * 60, label: 'the morning email' },
  'prodigi-sync': { minutes: 7 * 24 * 60, label: 'weekly Prodigi check' },
};

export async function recordStatus(db: DbHandle, key: string, ok: boolean, summary: { problems?: string[]; note?: string } = {}, now = new Date()): Promise<void> {
  const clean = { ...summary, problems: (summary.problems ?? []).map((p) => String(p).slice(0, 300)).slice(0, 30) };
  await db.insert(opsStatus).values({ key, ok, summary: clean, checkedAt: now }).onConflictDoUpdate({ target: opsStatus.key, set: { ok, summary: clean, checkedAt: now } });
}

/** A job route's result, recorded (never throws: the record is a nicety, the job's own answer stands). */
export async function recordJobRun(db: DbHandle, name: string, res: Response): Promise<Response> {
  try {
    await recordStatus(db, `job:${name}`, res.ok, res.ok ? {} : { problems: [`answered ${res.status}`] });
  } catch (e) {
    console.error(`[jobs] could not record the ${name} run:`, e instanceof Error ? e.message : 'unknown');
  }
  return res;
}

export interface HealthView {
  build: string;
  checks: { key: string; label: string; ok: boolean; late: boolean; problems: string[]; note: string | null; checkedAt: Date }[];
  missing: string[];
}

export async function healthView(db: DbHandle, reviewer: Reviewer, now = new Date()): Promise<HealthView> {
  assertAdmin(reviewer);
  const rows = await db.select().from(opsStatus).orderBy(asc(opsStatus.key));
  const label = (key: string) => (key === 'watchdog' ? 'the server (watchdog)' : key === 'prodigi-check' ? 'Prodigi’s products match ours' : (JOB_EVERY[key.replace(/^job:/, '')]?.label ?? key));
  const checks = rows.map((r) => {
    const job = r.key.startsWith('job:') ? JOB_EVERY[r.key.slice(4)] : r.key === 'watchdog' ? { minutes: 60 } : null;
    const late = !!job && now.getTime() - r.checkedAt.getTime() > job.minutes * 2 * 60_000 + 10 * 60_000;
    return { key: r.key, label: label(r.key), ok: r.ok, late, problems: Array.isArray(r.summary?.problems) ? r.summary.problems.map(String) : [], note: typeof r.summary?.note === 'string' ? r.summary.note : null, checkedAt: r.checkedAt };
  });
  const seen = new Set(rows.map((r) => r.key));
  const missing = [...Object.keys(JOB_EVERY).map((j) => `job:${j}`), 'watchdog'].filter((k) => !seen.has(k)).map(label);
  return { build: process.env.APP_BUILD || 'dev', checks, missing };
}
