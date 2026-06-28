import { describe, expect, it } from 'vitest';
import { startGuestUpload } from '@/app/actions/guestUpload';

// The terms gate is the lawful-basis precondition: without recorded acceptance, the
// action MUST refuse before it ingests anything. These reject paths return before any
// DB/storage/cookie work, so they're deterministic without infrastructure. The
// success path (acceptance → termsAcceptedAt + version recorded on the asset) is
// covered by guestUpload.int.test.

const form = (entries: [string, string | File][]) => {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
};
const png = new File([new Uint8Array([1, 2, 3, 4])], 'd.png', { type: 'image/png' });

describe('startGuestUpload — terms gate (lawful-basis precondition)', () => {
  it('refuses with needsTerms when acceptance is missing — before any ingest', async () => {
    expect(await startGuestUpload(form([['image', png]]))).toEqual({ ok: false, needsTerms: true });
  });

  it('refuses when termsAccepted is not exactly "true" (no near-miss bypass)', async () => {
    expect(await startGuestUpload(form([['termsAccepted', 'false'], ['image', png]]))).toEqual({ ok: false, needsTerms: true });
    expect(await startGuestUpload(form([['termsAccepted', 'TRUE'], ['image', png]]))).toEqual({ ok: false, needsTerms: true });
    expect(await startGuestUpload(form([['termsAccepted', '1'], ['image', png]]))).toEqual({ ok: false, needsTerms: true });
  });

  it('once accepted, the gate passes — a missing file is then refused (not a terms bypass)', async () => {
    expect(await startGuestUpload(form([['termsAccepted', 'true']]))).toEqual({ ok: false });
  });
});
