/**
 * "use camera" on a phone or tablet opens the phone's OWN camera app (founder, 16 Nov 2026) — the
 * familiar one, with its own focus, flash and "use photo / retake" — instead of a camera window in the
 * page. A hidden file input with `capture` does that on iPhone, iPad and Android: the photo comes back
 * as an ordinary picked file, so it takes the SAME road as "upload a drawing" (shrink, EXIF strip and
 * table trim on ingest, the safety check — nothing new).
 *
 * Computers have no camera app (browsers there ignore `capture` and open the file picker), so they keep
 * the in-page webcam window (CameraCapture).
 */
export const NATIVE_CAMERA_INPUT = { type: 'file', accept: 'image/*', capture: 'environment' } as const;

type NavLike = {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
};

/**
 * Is this a phone or tablet — somewhere `capture` opens the camera app? Asked at tap time (never while
 * rendering, so the server and the browser draw the same page). Any one sign is enough: if it's ever
 * wrong on a computer, that computer simply gets its file picker, which is still a fine way in.
 */
export function hasCameraApp(nav: NavLike | undefined = typeof navigator === 'undefined' ? undefined : navigator, touchFirst?: boolean): boolean {
  if (!nav) return false;
  if (nav.userAgentData?.mobile) return true;
  const ua = nav.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS asks for the desktop site and says "Macintosh" — but a Mac has no touch screen
  if (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return true;
  // a finger is the main pointer (a phone or tablet in "desktop site" mode)
  const coarse = touchFirst ?? (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
  return coarse;
}
