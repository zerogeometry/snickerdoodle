#!/usr/bin/env node
/**
 * The job runner: calls the /api/jobs/* routes on their schedule, or one of them once.
 *
 *   npm run jobs                                   run the schedule until stopped (Ctrl+C)
 *   npm run jobs -- --once retention               one job, then exit (0 ok, 1 failed, 2 usage)
 *   npm run jobs -- --once reapply-erasures --since 2026-10-26T01:30:00Z --print-body
 *   npm run jobs -- --list                         show the jobs and when they run
 *   node scripts/jobs.mjs --write-timers <dir>     write the systemd timers (the Lightsail box)
 *
 * Reads JOBS_BASE_URL (else APP_URL) and JOBS_SECRET from the environment (and .env locally).
 * Logs one JSON line per event to stdout. The secret is never printed.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { JOBS, SCHEDULED, TIMER_PREFIX, checkBaseUrl, describeSchedule, logLine, nextRunAt, parseArgs, runJob, summarise, timerUnit } from './jobs/core.mjs';

const args = parseArgs(process.argv.slice(2));
const secret = process.env.JOBS_SECRET ?? '';
const log = (fields) => console.log(logLine({ level: 'info', ...fields }, secret));

function usage(code) {
  console.log(`usage:
  npm run jobs                              run the schedule until stopped
  npm run jobs -- --once <job> [--since <ISO time>] [--print-body]
  npm run jobs -- --list
  node scripts/jobs.mjs --write-timers <dir>`);
  process.exit(code);
}

if (args.error) {
  console.error(args.error);
  usage(2);
}
if (args.mode === 'help') usage(0);

if (args.mode === 'list') {
  for (const [name, job] of Object.entries(JOBS)) console.log(`${name.padEnd(18)} ${describeSchedule(job.schedule).padEnd(28)} ${job.about}`);
  process.exit(0);
}

if (args.mode === 'write-timers') {
  const dir = path.resolve(args.dir ?? '');
  mkdirSync(dir, { recursive: true });
  // drop timers for jobs that no longer exist, then write the current set
  for (const f of readdirSync(dir)) if (f.startsWith(TIMER_PREFIX) && f.endsWith('.timer')) rmSync(path.join(dir, f));
  for (const name of SCHEDULED) writeFileSync(path.join(dir, `${TIMER_PREFIX}${name}.timer`), timerUnit(name));
  console.log(SCHEDULED.map((n) => `${TIMER_PREFIX}${n}.timer`).join('\n'));
  process.exit(0);
}

const target = checkBaseUrl(process.env.JOBS_BASE_URL || process.env.APP_URL || '');
if (!target.ok) {
  console.error(logLine({ level: 'error', event: 'config', reason: target.reason }));
  process.exit(2);
}
if (!secret) {
  console.error(logLine({ level: 'error', event: 'config', reason: 'JOBS_SECRET is not set' }));
  process.exit(2);
}

async function runAndLog(name, since) {
  log({ job: name, event: 'start' });
  const r = await runJob({ name, base: target.base, secret, since, log: (f) => log(f) });
  log({
    level: r.outcome === 'failed' ? 'error' : r.outcome === 'skipped' ? 'warn' : 'info',
    job: name,
    event: r.outcome,
    status: r.status,
    ms: r.ms,
    attempts: r.attempts,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.body !== null ? { summary: summarise(r.body) } : {}),
  });
  return r;
}

if (args.mode === 'once') {
  const r = await runAndLog(args.job, args.since);
  // the full answer, only when asked (e.g. which erasures failed after a restore)
  if (args.printBody && r.body !== null) console.log(JSON.stringify(r.body, null, 2));
  process.exit(r.outcome === 'failed' ? 1 : 0);
}

// ── loop: each scheduled job on its own timer, never two copies of one job at once ─────────
const running = new Set();
const timers = new Map();
let stopping = false;

function plan(name) {
  if (stopping) return;
  const at = nextRunAt(JOBS[name].schedule, new Date());
  timers.set(
    name,
    setTimeout(async () => {
      if (running.has(name)) {
        log({ level: 'warn', job: name, event: 'skipped', reason: 'previous run still going' });
      } else {
        running.add(name);
        await runAndLog(name).finally(() => running.delete(name));
      }
      plan(name);
    }, at.getTime() - Date.now()),
  );
  log({ job: name, event: 'planned', at: at.toISOString() });
}

function stop(signal) {
  stopping = true;
  for (const t of timers.values()) clearTimeout(t);
  log({ event: 'stopping', signal, stillRunning: [...running] });
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

log({ event: 'scheduler-up', base: target.base, jobs: SCHEDULED });
for (const name of SCHEDULED) plan(name);
