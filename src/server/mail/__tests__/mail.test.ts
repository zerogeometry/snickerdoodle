import { describe, expect, it } from 'vitest';
import { appUrl, resolveMailer } from '../index';

describe('mail port', () => {
  it('defaults to the console adapter outside production', () => {
    expect(() => resolveMailer({ NODE_ENV: 'development' })).not.toThrow();
  });
  it('production with no provider is a hard error, never a silent drop', () => {
    expect(() => resolveMailer({ NODE_ENV: 'production' })).toThrow(/MAIL_PROVIDER/);
  });
  it('an unknown provider is a hard error', () => {
    expect(() => resolveMailer({ MAIL_PROVIDER: 'carrier-pigeon', NODE_ENV: 'development' })).toThrow(/no adapter/);
  });
  it('appUrl builds absolute links from APP_URL (no hard-coded host)', () => {
    expect(appUrl('/join/abc', { APP_URL: 'https://snickerdoodle.co.uk/' })).toBe('https://snickerdoodle.co.uk/join/abc');
    expect(appUrl('g/x', { APP_URL: 'http://localhost:3007' })).toBe('http://localhost:3007/g/x');
  });
});
