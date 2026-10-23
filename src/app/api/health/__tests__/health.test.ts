import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();
vi.mock('@/db/client', () => ({ getDb: () => ({ execute }) }));

const { GET } = await import('../route');
const { POST: render } = await import('../render/route');

describe('GET /api/health', () => {
  beforeEach(() => {
    execute.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.APP_BUILD;
  });

  it('is 200 with the running build when the database answers', async () => {
    process.env.APP_BUILD = '2026-10-22-abc1234';
    execute.mockResolvedValue([{ '?column?': 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, db: 'ok', build: '2026-10-22-abc1234' });
  });

  it('is 503 when the database is down, and never says why to the caller', async () => {
    execute.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2'));
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, db: 'down', build: 'dev' });
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.5|hunter2|ECONNREFUSED/);
  });
});

describe('POST /api/health/render', () => {
  beforeEach(() => {
    process.env.JOBS_SECRET = 'test-jobs-secret-of-a-decent-length';
  });
  afterEach(() => {
    delete process.env.JOBS_SECRET;
  });
  const call = (auth?: string) =>
    render(new Request('http://box/api/health/render', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

  it('refuses without the jobs secret (it is CPU work)', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
  });

  it('draws one mockup from the brand-safe example painting with the real native libraries', async () => {
    const res = await call('Bearer test-jobs-secret-of-a-decent-length');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.format).toBe('webp');
    expect(body.width).toBeGreaterThan(0);
    expect(body.height).toBeGreaterThan(0);
  }, 30_000);
});
