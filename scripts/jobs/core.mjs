/**
 * The job schedule and the bits of the runner worth testing. No dependencies, no Node-only APIs
 * beyond fetch, so the Netlify test-site functions can share it.
 *
 * Each job is an HTTP route under /api/jobs/*, guarded by `Authorization: Bearer <JOBS_SECRET>`.
 * This file is the ONE place cadences live: scripts/jobs.mjs runs them in a loop or once, and
 * writes the systemd timers for the Lightsail box from the same table.
 */

/** Daily times are London wall-clock. Keep them out of 01:00–02:00 (the clocks-change hour). */
export const TIME_ZONE = 'Europe/London';

/**
 * @typedef {{ everyMinutes: number } | { dailyAt: string }} Schedule
 * @typedef {{
 *   path: string,
 *   schedule: Schedule | null,
 *   timeoutMs: number,
 *   retries: number,
 *   needsSince?: boolean,
 *   skipWhen?: { status: number, bodyIncludes: string },
 *   failWhen?: (body: unknown) => string | null,
 *   about: string,
 * }} Job
 */

const MIN = 60_000;

/** @type {Record<string, Job>} */
export const JOBS = {
  // Renders paid orders, hands READY ones to the printer and polls tracking. Safe to overlap,
  // but the timeout stays under the cadence anyway.
  fulfilment: {
    path: '/api/jobs/fulfilment',
    schedule: { everyMinutes: 5 },
    timeoutMs: 4 * MIN,
    retries: 0,
    about: 'render paid orders, send them to the printer, pick up tracking',
  },
  // Deletes unkept uploads past their window, old audit rows (6 years) and stale keep requests.
  retention: {
    path: '/api/jobs/retention',
    schedule: { dailyAt: '03:10' },
    timeoutMs: 15 * MIN,
    retries: 2,
    about: 'delete what the retention schedule says must go',
  },
  popularity: {
    path: '/api/jobs/popularity',
    schedule: { dailyAt: '03:40' },
    timeoutMs: 5 * MIN,
    retries: 2,
    about: 're-rank the range by recent sales (product counts only)',
  },
  // The printer's CATALOGUE check (metadata only — order tracking is part of fulfilment).
  'prodigi-sync': {
    path: '/api/jobs/prodigi-sync',
    schedule: { dailyAt: '04:05' },
    timeoutMs: 10 * MIN,
    retries: 2,
    skipWhen: { status: 503, bodyIncludes: 'not configured' },
    about: 'check every product we sell still exists at the printer',
  },
  // Morning, so the nudge lands when people read email. Consent + caps live in the planner.
  reminders: {
    path: '/api/jobs/reminders',
    schedule: { dailyAt: '09:05' },
    timeoutMs: 10 * MIN,
    retries: 2,
    about: 'send occasion reminders to parents who asked for them',
  },
  // Manual only: straight after a database restore (infra/README.md, "restore").
  'reapply-erasures': {
    path: '/api/jobs/reapply-erasures',
    schedule: null,
    timeoutMs: 30 * MIN,
    retries: 0,
    needsSince: true,
    failWhen: (body) => {
      const failed = /** @type {{ failed?: unknown }} */ (body ?? {}).failed;
      return Array.isArray(failed) && failed.length > 0 ? `${failed.length} erasure(s) failed — fix and run again` : null;
    },
    about: 'after a restore: delete again everything deleted since the backup',
  },
  'seed-catalogue': {
    path: '/api/jobs/seed-catalogue',
    schedule: null,
    timeoutMs: 5 * MIN,
    retries: 0,
    about: 'load or refresh the product catalogue (once per environment)',
  },
  'seed-mockups': {
    path: '/api/jobs/seed-mockups',
    schedule: null,
    timeoutMs: 30 * MIN,
    retries: 0,
    about: 'author product mockup templates (needs .prodigi-assets on disk)',
  },
};

export const SCHEDULED = Object.keys(JOBS).filter((name) => JOBS[name]?.schedule);

// ── time ──────────────────────────────────────────────────────────────────────────────────

/** @param {string} hhmm */
export function parseHhmm(hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`bad time "${hhmm}" (want HH:MM)`);
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

/** Wall-clock parts of `date` in `timeZone`. */
function zonedParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  /** @type {Record<string, number>} */
  const p = {};
  for (const part of fmt.formatToParts(date)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return { year: p.year ?? 0, month: p.month ?? 1, day: p.day ?? 1, hour: p.hour ?? 0, minute: p.minute ?? 0, second: p.second ?? 0 };
}

/** How far `timeZone` is ahead of UTC at `date`, in ms. */
function offsetMs(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in `timeZone` (day may overflow; Date.UTC handles it). */
function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetMs(new Date(guess), timeZone);
  const second = guess - offsetMs(new Date(first), timeZone);
  return second;
}

/**
 * The next time `schedule` fires strictly after `after`. Every-N-minutes runs line up with the
 * clock (:00, :05, …) like the systemd timer; daily runs are London wall-clock.
 * @param {Schedule} schedule
 * @param {Date} after
 * @param {string} [timeZone]
 */
export function nextRunAt(schedule, after, timeZone = TIME_ZONE) {
  if ('everyMinutes' in schedule) {
    const n = schedule.everyMinutes;
    if (!Number.isInteger(n) || n < 1 || 60 % n !== 0) throw new Error(`everyMinutes must divide 60 (got ${n})`);
    const step = n * MIN;
    return new Date(Math.floor(after.getTime() / step) * step + step);
  }
  const { hour, minute } = parseHhmm(schedule.dailyAt);
  const today = zonedParts(after, timeZone);
  for (let i = 0; i < 3; i++) {
    const t = zonedToUtc(today.year, today.month, today.day + i, hour, minute, timeZone);
    if (t > after.getTime()) return new Date(t);
  }
  throw new Error('no next run found'); // unreachable
}

// ── systemd ───────────────────────────────────────────────────────────────────────────────

/** @param {Schedule} schedule */
export function onCalendar(schedule, timeZone = TIME_ZONE) {
  if ('everyMinutes' in schedule) {
    nextRunAt(schedule, new Date(0)); // validates
    return `*:0/${schedule.everyMinutes}`;
  }
  const { hour, minute } = parseHhmm(schedule.dailyAt);
  return `*-*-* ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00 ${timeZone}`;
}

/** @param {Schedule} schedule */
export function describeSchedule(schedule) {
  if (!schedule) return 'manual';
  return 'everyMinutes' in schedule ? `every ${schedule.everyMinutes} min` : `daily ${schedule.dailyAt} ${TIME_ZONE}`;
}

export const TIMER_PREFIX = 'snickerdoodle-job-';

/** The systemd timer for one scheduled job; it starts the template unit snickerdoodle-job@<name>. */
export function timerUnit(name) {
  const job = JOBS[name];
  if (!job?.schedule) throw new Error(`${name} has no schedule`);
  const daily = 'dailyAt' in job.schedule;
  return [
    '# Written by scripts/jobs.mjs --write-timers. Change the schedule in scripts/jobs/core.mjs.',
    '[Unit]',
    `Description=Snickerdoodle job: ${name} (${describeSchedule(job.schedule)})`,
    '',
    '[Timer]',
    `OnCalendar=${onCalendar(job.schedule)}`,
    // a daily job missed while the box was off runs once when it's back
    `Persistent=${daily ? 'true' : 'false'}`,
    'AccuracySec=30s',
    `Unit=snickerdoodle-job@${name}.service`,
    '',
    '[Install]',
    'WantedBy=timers.target',
    '',
  ].join('\n');
}

// ── calling a job ─────────────────────────────────────────────────────────────────────────

/** Never send the secret in the clear to another machine. */
export function checkBaseUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'JOBS_BASE_URL / APP_URL is not a URL' };
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return { ok: false, reason: 'jobs URL must be https (plain http only for localhost)' };
  }
  return { ok: true, base: url.origin };
}

/**
 * A log-safe summary of a job's response: numbers and booleans kept, lists shown as counts,
 * strings dropped (they could be anything). Two levels deep.
 * @param {unknown} body
 * @returns {unknown}
 */
export function summarise(body, depth = 0) {
  if (typeof body === 'number' || typeof body === 'boolean') return body;
  if (Array.isArray(body)) return body.length;
  if (body === null || typeof body !== 'object' || depth > 1) return undefined;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    const s = summarise(v, depth + 1);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

/** @param {string} text @param {string} secret */
export function redact(text, secret) {
  return secret ? text.split(secret).join('[redacted]') : text;
}

const RETRYABLE = new Set([502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * POST one job. Never throws. Retries only when the request never reached a working app
 * (connection refused, 502/503/504) — never after a timeout, so a slow job isn't doubled up.
 * @param {{ name: string, base: string, secret: string, since?: string, fetchImpl?: typeof fetch,
 *   retryDelayMs?: number, now?: () => number, log?: (line: Record<string, unknown>) => void }} opts
 */
export async function runJob(opts) {
  const { name, base, secret, since, fetchImpl = fetch, retryDelayMs = 30_000, now = Date.now, log = () => {} } = opts;
  const job = JOBS[name];
  if (!job) return { outcome: 'failed', status: null, reason: `unknown job "${name}"`, body: null };
  if (!secret) return { outcome: 'failed', status: null, reason: 'JOBS_SECRET is not set', body: null };
  if (job.needsSince && !since) return { outcome: 'failed', status: null, reason: `${name} needs --since <ISO time the backup was taken>`, body: null };
  const url = `${base}${job.path}${since ? `?since=${encodeURIComponent(since)}` : ''}`;
  const started = now();

  for (let attempt = 1; ; attempt++) {
    /** @type {{ outcome: 'ok'|'skipped'|'failed', status: number|null, reason: string|null, body: unknown, retryable?: boolean }} */
    let result;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}`, 'user-agent': 'snickerdoodle-jobs' },
        signal: AbortSignal.timeout(job.timeoutMs),
      });
      const text = await res.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      if (job.skipWhen && res.status === job.skipWhen.status && text.includes(job.skipWhen.bodyIncludes)) {
        result = { outcome: 'skipped', status: res.status, reason: job.skipWhen.bodyIncludes, body };
      } else if (!res.ok) {
        const reason = res.status === 401 ? 'unauthorised — JOBS_SECRET differs from the app' : `HTTP ${res.status}`;
        result = { outcome: 'failed', status: res.status, reason, body, retryable: RETRYABLE.has(res.status) };
      } else {
        const why = job.failWhen?.(body) ?? null;
        result = why ? { outcome: 'failed', status: res.status, reason: why, body } : { outcome: 'ok', status: res.status, reason: null, body };
      }
    } catch (e) {
      const err = /** @type {Error & { cause?: { code?: string } }} */ (e);
      const timedOut = err.name === 'TimeoutError' || err.name === 'AbortError';
      const reason = timedOut ? `no answer within ${Math.round(job.timeoutMs / 1000)}s` : redact(`${err.message}${err.cause?.code ? ` (${err.cause.code})` : ''}`, secret);
      result = { outcome: 'failed', status: null, reason, body: null, retryable: !timedOut };
    }
    const { retryable, ...rest } = result;
    if (rest.outcome === 'failed' && retryable && attempt <= job.retries) {
      log({ level: 'warn', job: name, event: 'retry', attempt, reason: rest.reason });
      await sleep(retryDelayMs);
      continue;
    }
    return { ...rest, attempts: attempt, ms: now() - started };
  }
}

/** One structured log line (JSON), never containing the secret. */
export function logLine(fields, secret = '') {
  return redact(JSON.stringify({ ts: new Date().toISOString(), ...fields }), secret);
}

// ── command line ──────────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} argv
 * @returns {{ mode: 'loop'|'once'|'list'|'write-timers'|'help', job?: string, since?: string, dir?: string, printBody: boolean, error?: string }}
 */
export function parseArgs(argv) {
  /** @type {ReturnType<typeof parseArgs>} */
  const out = { mode: 'loop', printBody: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) out.error = `${a} needs a value`;
      return v;
    };
    if (a === '--once') {
      out.mode = 'once';
      out.job = next();
    } else if (a === '--since') out.since = next();
    else if (a === '--print-body') out.printBody = true;
    else if (a === '--list') out.mode = 'list';
    else if (a === '--write-timers') {
      out.mode = 'write-timers';
      out.dir = next();
    } else if (a === '--help' || a === '-h') out.mode = 'help';
    else out.error = `unknown option ${a}`;
  }
  if (out.mode === 'once' && out.job && !JOBS[out.job]) out.error = `unknown job "${out.job}" (try --list)`;
  if (out.since && Number.isNaN(new Date(out.since).getTime())) out.error = `--since "${out.since}" is not a date/time`;
  return out;
}
