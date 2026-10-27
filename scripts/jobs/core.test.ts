import { afterEach, describe, expect, it, vi } from 'vitest';
import { JOBS, SCHEDULED, checkBaseUrl, logLine, nextRunAt, onCalendar, parseArgs, runJob, summarise, timerUnit } from './core.mjs';
import { runOnTestSite } from '../../netlify/test-site-jobs.mjs';

const at = (iso: string) => new Date(iso);

describe('nextRunAt', () => {
  it('every-5-minutes lines up with the clock and is strictly after now', () => {
    expect(nextRunAt({ everyMinutes: 5 }, at('2026-10-27T10:02:31Z')).toISOString()).toBe('2026-10-27T10:05:00.000Z');
    expect(nextRunAt({ everyMinutes: 5 }, at('2026-10-27T10:05:00Z')).toISOString()).toBe('2026-10-27T10:10:00.000Z');
  });

  it('refuses a minute step that does not divide the hour (systemd could not match it)', () => {
    expect(() => nextRunAt({ everyMinutes: 7 }, at('2026-10-27T10:00:00Z'))).toThrow(/divide 60/);
  });

  it('daily times are London wall-clock: GMT in winter', () => {
    expect(nextRunAt({ dailyAt: '03:10' }, at('2026-12-01T00:00:00Z')).toISOString()).toBe('2026-12-01T03:10:00.000Z');
  });

  it('daily times are London wall-clock: BST in summer (an hour earlier in UTC)', () => {
    expect(nextRunAt({ dailyAt: '03:10' }, at('2026-07-01T00:00:00Z')).toISOString()).toBe('2026-07-01T02:10:00.000Z');
  });

  it('rolls to tomorrow once today’s time has passed', () => {
    expect(nextRunAt({ dailyAt: '09:05' }, at('2026-12-01T09:05:00Z')).toISOString()).toBe('2026-12-02T09:05:00.000Z');
  });

  it('gets the clocks-change days right', () => {
    // clocks go back 25 Oct 2026 at 02:00 BST → 01:00 GMT
    expect(nextRunAt({ dailyAt: '03:10' }, at('2026-10-24T12:00:00Z')).toISOString()).toBe('2026-10-25T03:10:00.000Z');
    // clocks go forward 29 Mar 2026 at 01:00 GMT → 02:00 BST
    expect(nextRunAt({ dailyAt: '03:10' }, at('2026-03-28T12:00:00Z')).toISOString()).toBe('2026-03-29T02:10:00.000Z');
  });

  it('rejects a malformed time', () => {
    expect(() => nextRunAt({ dailyAt: '3:10' }, new Date())).toThrow(/HH:MM/);
    expect(() => nextRunAt({ dailyAt: '24:00' }, new Date())).toThrow(/HH:MM/);
  });
});

describe('the schedule', () => {
  it('runs the retention purge every day (children’s pictures must not outlive the schedule)', () => {
    expect(JOBS.retention?.schedule).toEqual({ dailyAt: expect.any(String) });
  });

  it('keeps fulfilment frequent and its timeout under its own cadence', () => {
    const job = JOBS.fulfilment!;
    expect(job.schedule).toEqual({ everyMinutes: expect.any(Number) });
    const every = (job.schedule as { everyMinutes: number }).everyMinutes;
    expect(every).toBeLessThanOrEqual(10);
    expect(job.timeoutMs).toBeLessThan(every * 60_000);
  });

  it('never schedules the manual jobs', () => {
    for (const name of ['reapply-erasures', 'seed-catalogue', 'seed-mockups']) expect(SCHEDULED).not.toContain(name);
  });

  it('keeps daily jobs out of the clocks-change hour', () => {
    for (const name of SCHEDULED) {
      const s = JOBS[name]!.schedule!;
      if ('dailyAt' in s) expect(s.dailyAt.startsWith('01:')).toBe(false);
    }
  });

  it('writes systemd timers that start the matching job instance', () => {
    expect(onCalendar({ everyMinutes: 5 })).toBe('*:0/5');
    expect(onCalendar({ dailyAt: '03:10' })).toBe('*-*-* 03:10:00 Europe/London');
    const unit = timerUnit('retention');
    expect(unit).toContain('OnCalendar=*-*-* 03:10:00 Europe/London');
    expect(unit).toContain('Unit=snickerdoodle-job@retention.service');
    expect(unit).toContain('Persistent=true');
    expect(timerUnit('fulfilment')).toContain('Persistent=false');
    expect(() => timerUnit('reapply-erasures')).toThrow(/no schedule/);
  });
});

describe('parseArgs', () => {
  it('defaults to the loop', () => expect(parseArgs([]).mode).toBe('loop'));

  it('reads --once with --since and --print-body', () => {
    expect(parseArgs(['--once', 'reapply-erasures', '--since', '2026-10-26T01:30:00Z', '--print-body'])).toEqual({
      mode: 'once',
      job: 'reapply-erasures',
      since: '2026-10-26T01:30:00Z',
      printBody: true,
    });
  });

  it('reports unknown jobs, bad dates and missing values', () => {
    expect(parseArgs(['--once', 'nope']).error).toMatch(/unknown job/);
    expect(parseArgs(['--once']).error).toMatch(/needs a value/);
    expect(parseArgs(['--once', 'retention', '--since', 'yesterday']).error).toMatch(/not a date/);
    expect(parseArgs(['--frobnicate']).error).toMatch(/unknown option/);
  });
});

describe('checkBaseUrl', () => {
  it('allows https anywhere and plain http only on this machine', () => {
    expect(checkBaseUrl('https://snickerdoodle.co.uk/')).toEqual({ ok: true, base: 'https://snickerdoodle.co.uk' });
    expect(checkBaseUrl('http://127.0.0.1:3000')).toEqual({ ok: true, base: 'http://127.0.0.1:3000' });
    expect(checkBaseUrl('http://localhost:3000').ok).toBe(true);
    expect(checkBaseUrl('http://snickerdoodle.co.uk').ok).toBe(false);
    expect(checkBaseUrl('').ok).toBe(false);
  });
});

describe('summarise + logLine', () => {
  it('keeps counts, turns lists into lengths and drops strings', () => {
    expect(summarise({ purged: 3, ok: true, failed: ['a', 'b'], note: 'Ada, 4', render: { failed: 1, who: 'x' } })).toEqual({
      purged: 3,
      ok: true,
      failed: 2,
      render: { failed: 1 },
    });
  });

  it('never prints the secret', () => {
    expect(logLine({ reason: 'oops s3cr3t-value' }, 's3cr3t-value')).not.toContain('s3cr3t-value');
  });
});

describe('runJob', () => {
  const base = 'http://127.0.0.1:3000';
  const secret = 'test-secret';
  const reply = (status: number, body: unknown) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

  it('POSTs to the route with the bearer secret', async () => {
    let seen: { url: string; init?: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen = { url, init };
      return new Response('{"purged":2}', { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runJob({ name: 'retention', base, secret, fetchImpl });
    expect(r.outcome).toBe('ok');
    expect(seen!.url).toBe('http://127.0.0.1:3000/api/jobs/retention');
    expect(seen!.init?.method).toBe('POST');
    expect((seen!.init?.headers as Record<string, string>).authorization).toBe('Bearer test-secret');
  });

  it('passes ?since for the restore replay, and refuses to run it without one', async () => {
    let url = '';
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response('{"entries":0,"failed":[]}', { status: 200 });
    }) as unknown as typeof fetch;
    expect((await runJob({ name: 'reapply-erasures', base, secret, fetchImpl })).outcome).toBe('failed');
    const r = await runJob({ name: 'reapply-erasures', base, secret, since: '2026-10-26T01:30:00Z', fetchImpl });
    expect(r.outcome).toBe('ok');
    expect(url).toBe('http://127.0.0.1:3000/api/jobs/reapply-erasures?since=2026-10-26T01%3A30%3A00Z');
  });

  it('treats failed erasures as a failure even though the app answered 200', async () => {
    const r = await runJob({ name: 'reapply-erasures', base, secret, since: '2026-10-26T01:30:00Z', fetchImpl: reply(200, { failed: [{ id: 'x' }] }) as unknown as typeof fetch });
    expect(r.outcome).toBe('failed');
    expect(r.reason).toMatch(/1 erasure/);
  });

  it('skips the printer catalogue check when the printer isn’t set up yet', async () => {
    const r = await runJob({ name: 'prodigi-sync', base, secret, fetchImpl: reply(503, 'prodigi not configured (PRODIGI_API_KEY unset)') as unknown as typeof fetch });
    expect(r.outcome).toBe('skipped');
  });

  it('fails clearly on a wrong secret, without retrying', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response('unauthorized', { status: 401 });
    }) as unknown as typeof fetch;
    const r = await runJob({ name: 'retention', base, secret, fetchImpl, retryDelayMs: 0 });
    expect(r).toMatchObject({ outcome: 'failed', status: 401, attempts: 1 });
    expect(r.reason).toMatch(/JOBS_SECRET/);
    expect(calls).toBe(1);
  });

  it('retries a daily job while the app is restarting, then succeeds', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      if (calls === 2) return new Response('bad gateway', { status: 502 });
      return new Response('{"planned":0,"sent":0}', { status: 200 });
    }) as unknown as typeof fetch;
    const r = await runJob({ name: 'reminders', base, secret, fetchImpl, retryDelayMs: 0 });
    expect(r).toMatchObject({ outcome: 'ok', attempts: 3 });
  });

  it('does not retry the 5-minute fulfilment tick (the next tick will)', async () => {
    const r = await runJob({ name: 'fulfilment', base, secret, fetchImpl: reply(502, 'bad gateway') as unknown as typeof fetch, retryDelayMs: 0 });
    expect(r).toMatchObject({ outcome: 'failed', attempts: 1 });
  });

  it('reports a job error (500) as failed', async () => {
    const r = await runJob({ name: 'fulfilment', base, secret, fetchImpl: reply(500, { errors: ['render: boom'] }) as unknown as typeof fetch });
    expect(r).toMatchObject({ outcome: 'failed', status: 500 });
  });

  it('never lets the secret into an error reason', async () => {
    const fetchImpl = (async () => {
      throw new Error(`exploded with ${secret}`);
    }) as unknown as typeof fetch;
    const r = await runJob({ name: 'fulfilment', base, secret, fetchImpl });
    expect(r.reason).not.toContain(secret);
  });

  it('takes a shorter timeout and no retries when asked (the Netlify functions)', async () => {
    let calls = 0;
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      calls++;
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
    }) as unknown as typeof fetch;
    const r = await runJob({ name: 'retention', base, secret, fetchImpl, timeoutMs: 20, retries: 0 });
    expect(r).toMatchObject({ outcome: 'failed', attempts: 1 });
    expect(r.reason).toMatch(/no answer within/);
    expect(calls).toBe(1);
  });

  it('refuses to run without a secret', async () => {
    const r = await runJob({ name: 'retention', base, secret: '', fetchImpl: reply(200, {}) as unknown as typeof fetch });
    expect(r).toMatchObject({ outcome: 'failed', reason: 'JOBS_SECRET is not set' });
  });
});

describe('the Netlify test-site scheduler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does nothing at all unless SITE_MODE=test', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const res = await runOnTestSite(['retention'], { APP_URL: 'https://snickerdoodle.co.uk', JOBS_SECRET: 'x' });
    expect(await res.text()).toBe('not the test site');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('runs the named jobs against the test site and reports failures', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      urls.push(u);
      return u.endsWith('/retention') ? new Response('{"purged":0}', { status: 200 }) : new Response('nope', { status: 500 });
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await runOnTestSite(['retention', 'popularity'], { SITE_MODE: 'test', APP_URL: 'https://test.example.app', JOBS_SECRET: 'x' });
    expect(urls.sort()).toEqual(['https://test.example.app/api/jobs/popularity', 'https://test.example.app/api/jobs/retention']);
    expect(res.status).toBe(500);
  });
});
