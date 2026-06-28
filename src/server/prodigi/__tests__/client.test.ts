import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProduct, isProdigiConfigured, ProdigiError } from '../client';

const ORIG = {
  key: process.env.PRODIGI_API_KEY,
  base: process.env.PRODIGI_BASE_URL,
};
const realFetch = global.fetch;

function setEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  global.fetch = realFetch;
  setEnv('PRODIGI_API_KEY', ORIG.key);
  setEnv('PRODIGI_BASE_URL', ORIG.base);
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn(
    async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe('prodigi client', () => {
  it('isProdigiConfigured reflects the API key', () => {
    process.env.PRODIGI_API_KEY = 'k';
    expect(isProdigiConfigured()).toBe(true);
    delete process.env.PRODIGI_API_KEY;
    expect(isProdigiConfigured()).toBe(false);
  });

  it('getProduct sends the API key + encoded SKU path, returns the product on 200', async () => {
    process.env.PRODIGI_API_KEY = 'secret-key';
    process.env.PRODIGI_BASE_URL = 'https://api.example.com/v4.0';
    const spy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ outcome: 'Ok', product: { sku: 'X', description: 'd', attributes: {}, printAreas: {}, variants: [] } }),
          { status: 200 },
        ),
    );
    global.fetch = spy as unknown as typeof fetch;

    const p = await getProduct('GLOBAL CFPM/A4');
    expect(p?.sku).toBe('X');
    const call = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.example.com/v4.0/products/GLOBAL%20CFPM%2FA4');
    expect(call[1].headers).toMatchObject({ 'X-API-Key': 'secret-key' });
  });

  it('getProduct returns null on 404 (so the sync can flag, not throw)', async () => {
    process.env.PRODIGI_API_KEY = 'k';
    mockFetch(404, { outcome: 'NotFound' });
    expect(await getProduct('NOPE')).toBeNull();
  });

  it('getProduct throws ProdigiError on a non-404 failure', async () => {
    process.env.PRODIGI_API_KEY = 'k';
    mockFetch(500, 'oops');
    await expect(getProduct('X')).rejects.toBeInstanceOf(ProdigiError);
  });

  it('getProduct throws when no key is configured', async () => {
    delete process.env.PRODIGI_API_KEY;
    await expect(getProduct('X')).rejects.toBeInstanceOf(ProdigiError);
  });
});
