import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { hasCameraApp, NATIVE_CAMERA_INPUT } from '../nativeCamera';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const LINUX_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

describe('"use camera": the phone’s own camera app on phones and tablets', () => {
  it('the hidden input asks for the rear camera, pictures only', () => {
    const html = renderToStaticMarkup(createElement('input', { ...NATIVE_CAMERA_INPUT, className: 'hidden' }));
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('capture="environment"');
  });

  it.each([
    ['iPhone', { userAgent: IPHONE, maxTouchPoints: 5 }],
    ['iPad (asks for the desktop site)', { userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 }],
    ['Android phone', { userAgent: ANDROID_PHONE, maxTouchPoints: 5 }],
    ['Android tablet', { userAgent: ANDROID_TABLET, maxTouchPoints: 10 }],
    ['a browser that says "mobile"', { userAgent: LINUX_DESKTOP, userAgentData: { mobile: true } }],
  ])('%s → camera app', (_, nav) => {
    expect(hasCameraApp(nav, false)).toBe(true);
  });

  it('a phone in "desktop site" mode (finger is the main pointer) → camera app', () => {
    expect(hasCameraApp({ userAgent: LINUX_DESKTOP, maxTouchPoints: 5 }, true)).toBe(true);
  });

  it.each([
    ['Windows', { userAgent: WINDOWS, maxTouchPoints: 0 }],
    ['a Windows touch laptop (mouse/trackpad first)', { userAgent: WINDOWS, maxTouchPoints: 10 }],
    ['a Mac', { userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 }],
    ['Linux', { userAgent: LINUX_DESKTOP }],
  ])('%s → keeps the in-page webcam', (_, nav) => {
    expect(hasCameraApp(nav, false)).toBe(false);
  });

  it('no browser at all (server render) → never claims a camera app', () => {
    expect(hasCameraApp(undefined)).toBe(false);
  });
});
