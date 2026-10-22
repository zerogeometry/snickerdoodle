'use client';

import { beginGuestUpload, finishGuestUpload, startGuestUpload, type GuestUploadResult } from '@/app/actions/guestUpload';

/**
 * Send a guest's drawing or photo to be stored + screened. With direct uploads on, the bytes go
 * STRAIGHT to the private bucket on a short-lived single-key URL (no app-server size cap), then the
 * server finalises: EXIF strip, CSAM hash-check, moderation — the same gates as before. With them
 * off, the bytes ride in the Server Action body as they always have. The instant local preview is
 * already on screen either way; this only decides where the bytes travel.
 *
 * Never throws: a network/CORS failure comes back as `{ ok: false }` for the caller's toast.
 */
export async function uploadGuestImage(blob: Blob, name: string, opts: { termsAccepted: true }): Promise<GuestUploadResult> {
  try {
    const begin = await beginGuestUpload({ byteSize: blob.size, termsAccepted: opts.termsAccepted });
    if (begin.ok && begin.inline) {
      const fd = new FormData();
      fd.append('image', blob, name);
      fd.append('termsAccepted', 'true');
      return await startGuestUpload(fd);
    }
    if (!begin.ok) return { ok: false, needsTerms: begin.needsTerms, tooMany: begin.tooMany };
    // the signed headers must go exactly as given (content-type + encryption) — the bucket refuses otherwise
    const put = await fetch(begin.url, { method: 'PUT', body: blob, headers: begin.headers });
    if (!put.ok) return { ok: false };
    return await finishGuestUpload(begin.uploadId);
  } catch {
    return { ok: false };
  }
}
