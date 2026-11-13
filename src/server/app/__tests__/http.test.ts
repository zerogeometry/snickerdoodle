import { describe, expect, it } from 'vitest';
import nextConfig from '../../../../next.config';
import { APP_UPLOAD_MAX_BYTES } from '@/server/app/api';
import { routeOf } from '@/server/app/http';

/**
 * The two quiet ways "make it real" from Snickerdoodle Draw went wrong on the website side (13 Nov 2026):
 * a refusal left nothing in the server log, and a drawing over 10 MB was cut short by the proxy before
 * the route ever read it. The routes themselves are in src/server/__tests__/drawAppRoutes.int.test.ts.
 */
describe('the app API’s log line names the route, never who or what', () => {
  const route = (method: string, url: string) => routeOf(new Request(url, { method }));

  it('keeps the method and the path’s fixed words', () => {
    expect(route('POST', 'https://snickerdoodle.co.uk/api/app/v1/assets')).toBe('POST /api/app/v1/assets');
    expect(route('POST', 'https://snickerdoodle.co.uk/api/app/v1/checkout-grants')).toBe('POST /api/app/v1/checkout-grants');
    expect(route('PATCH', 'https://snickerdoodle.co.uk/api/app/v1/me/sync')).toBe('PATCH /api/app/v1/me/sync');
    expect(route('POST', 'https://snickerdoodle.co.uk/api/app/v1/token/revoke')).toBe('POST /api/app/v1/token/revoke');
  });

  it('turns every id into :id, and drops the query', () => {
    expect(route('DELETE', 'https://snickerdoodle.co.uk/api/app/v1/assets/0b6e7c1e-8a44-4f0e-9d53-3a2b1c0d9e8f')).toBe('DELETE /api/app/v1/assets/:id');
    expect(route('PUT', 'https://snickerdoodle.co.uk/api/app/v1/artists/0b6e7c1e-8a44-4f0e-9d53-3a2b1c0d9e8f/progress?child=Olivia')).toBe('PUT /api/app/v1/artists/:id/progress');
    expect(route('PATCH', 'https://snickerdoodle.co.uk/api/app/v1/occasions/42')).toBe('PATCH /api/app/v1/occasions/:id');
  });

  it('never repeats something a caller typed into the path', () => {
    const line = route('GET', 'https://snickerdoodle.co.uk/api/app/v1/children/olivia-smith%0A[app-api]%20fake/../sam@example.com');
    expect(line).not.toMatch(/olivia|smith|sam|example|fake|%0A|\n/i);
    expect(line.startsWith('GET /api/app/v1/')).toBe(true);
  });
});

describe('a whole drawing gets through the proxy', () => {
  it('the proxy passes on at least the biggest upload the app API takes (Next’s default would cut it at 10 MB)', () => {
    const limit = nextConfig.experimental?.proxyClientMaxBodySize;
    expect(limit).toBeDefined();
    const size = /^(\d+(?:\.\d+)?)\s*(kb|mb|gb)?$/i.exec(String(limit));
    expect(size, `a size Next understands, not ${String(limit)}`).not.toBeNull();
    const max = Number(size![1]) * 1024 ** ['', 'kb', 'mb', 'gb'].indexOf((size![2] ?? '').toLowerCase());
    // the picture, plus the form around it (the route allows 64 KB of that)
    expect(max).toBeGreaterThanOrEqual(APP_UPLOAD_MAX_BYTES + 64 * 1024);
  });
});
