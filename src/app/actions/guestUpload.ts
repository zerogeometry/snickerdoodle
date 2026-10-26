'use server';

import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { ingestEphemeralUpload } from '@/server/ingest';
import sharp from 'sharp';
import { getStorageObjectGrant, resolveAssetViewer } from '@/server/assets';
import { trimTableOnUpload } from '@/server/magic';
import { RETENTION_DAYS } from '@/server/retention';
import { ImageTooLargeError, MAX_UPLOAD_BYTES } from '@/storage';
import { clientIp, LIMITS, rateLimit } from '@/server/rateLimit';
import { UPLOAD_CLAIM_COOKIE, appendClaim, signClaims, verifyClaims } from '@/server/uploadClaims';
import {
  TICKET_TTL_SECONDS,
  UPLOAD_TICKET_COOKIE,
  appendTicket,
  directUploadsEnabled,
  finaliseGuestUpload,
  mintGuestUpload,
  signTickets,
  verifyTickets,
  withoutTicket,
} from '@/server/directUpload';

/** The terms version a guest accepts at the upload moment. Bump on any change so
 * the recorded consent always points at the exact terms that were shown. */
const TERMS_VERSION = '2026-06-26';

/** `trimmed`: the photo showed the sheet on a table, and it's been trimmed to the sheet (src/ml/sheetCrop.ts) —
 * its object (what products are made from), a short-lived link, and the trimmed drawing for the page. */
export type GuestUploadResult = {
  ok: boolean;
  assetId?: string;
  needsTerms?: boolean;
  blocked?: boolean;
  tooMany?: boolean;
  trimmed?: { sourceObjectId: string; url: string; dataUrl: string; aspect: number };
};

/**
 * TRIM THE TABLE, as part of the upload (founder, 26 Oct) — so the catalogue's very first mockups are made
 * from the trimmed drawing. Best-effort: anything going wrong just leaves the photo as uploaded.
 */
async function trimmedFor(assetId: string, claimId: string, original?: Buffer): Promise<GuestUploadResult['trimmed']> {
  try {
    const db = getDb();
    const t = await trimTableOnUpload(db, assetId, original);
    if (!t) return undefined;
    // the link through the same gate as every read: this browser's claim (granted this request)
    const jar = await cookies();
    const viewer = await resolveAssetViewer(db, assetId, null, [...verifyClaims(jar.get(UPLOAD_CLAIM_COOKIE)?.value), claimId]);
    const grant = await getStorageObjectGrant(db, t.objectId, viewer, 600);
    const img = sharp(t.buffer);
    const meta = await img.metadata();
    // the page's own copy (on screen + the Studio's editing copy, which works at ≤1600px): 2400px is
    // plenty, and a fraction of the bytes to send back (products are made from the stored copy)
    const jpeg = await img.resize(2400, 2400, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    return { sourceObjectId: t.objectId, url: grant.url, dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`, aspect: (meta.width ?? 1) / (meta.height ?? 1) };
  } catch (e) {
    console.warn('[upload] trim skipped:', (e as Error).message);
    return undefined;
  }
}

/** Hand this browser the single-use claim for its new draft (signed, httpOnly). */
async function grantClaim(claimId: string): Promise<void> {
  const jar = await cookies();
  const claims = verifyClaims(jar.get(UPLOAD_CLAIM_COOKIE)?.value);
  jar.set(UPLOAD_CLAIM_COOKIE, signClaims(appendClaim(claims, claimId)), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RETENTION_DAYS * 86_400,
  });
}

async function setTickets(value: string): Promise<void> {
  const jar = await cookies();
  jar.set(UPLOAD_TICKET_COOKIE, value, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TICKET_TTL_SECONDS,
  });
}

/**
 * Start a PRE-ACCOUNT upload (the no-account-wall wow flow). The guest accepts
 * the terms at the upload moment (the lawful basis), the bytes are EXIF-stripped,
 * content-safety-checked and stored as an ephemeral claim-scoped draft, and the
 * single-use claim is handed back in a signed httpOnly cookie so the same browser
 * can preview / place / clean-edges it — and only it.
 *
 * The bytes ride in the request body here, so serverless hosts cap the size (Netlify 6MB). Used
 * while direct uploads are off; with them on, see {@link beginGuestUpload}.
 */
export async function startGuestUpload(formData: FormData): Promise<GuestUploadResult> {
  if (formData.get('termsAccepted') !== 'true') return { ok: false, needsTerms: true };
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { ok: false };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false }; // 25MB guard

  // anonymous uploads cost storage + a safety check each: limited per device (generous for families)
  if (!(await rateLimit(getDb(), { ...LIMITS.guestUploadPerIp, caller: await clientIp() })).ok) return { ok: false, tooMany: true };

  const db = getDb();
  const buffer = Buffer.from(await file.arrayBuffer());
  let ingested: Awaited<ReturnType<typeof ingestEphemeralUpload>>;
  try {
    ingested = await ingestEphemeralUpload(db, { buffer, kind: 'DRAWING', termsVersion: TERMS_VERSION });
  } catch (e) {
    if (e instanceof ImageTooLargeError) return { ok: false }; // a decompression bomb, or not an image
    throw e;
  }
  const { assetId, claimId, moderationStatus } = ingested;
  // BLOCKED (CSAM) content is preserved server-side per the runbook but NEVER
  // surfaced — don't hand back a claim, so it can't be viewed or ordered.
  if (moderationStatus === 'BLOCKED') return { ok: false, blocked: true };

  await grantClaim(claimId);
  return { ok: true, assetId, trimmed: await trimmedFor(assetId, claimId, buffer) };
}

export type BeginUploadResult =
  | { ok: false; needsTerms?: boolean; tooMany?: boolean }
  /** Direct uploads are off here — send the bytes with {@link startGuestUpload} instead. */
  | { ok: true; inline: true }
  | { ok: true; inline?: false; uploadId: string; url: string; headers: Record<string, string> };

/**
 * DIRECT upload, step 1: authorise the upload, then sign a PUT-only URL for one quarantine key,
 * pinned to `byteSize`, live for 5 minutes. Same gates as {@link startGuestUpload} BEFORE anything
 * is signed: terms accepted (lawful basis), the 25MB guard, the per-device rate limit. The matching
 * ticket goes into an httpOnly cookie — only this browser can finalise the upload.
 */
export async function beginGuestUpload(input: { byteSize: number; termsAccepted: boolean }): Promise<BeginUploadResult> {
  if (input?.termsAccepted !== true) return { ok: false, needsTerms: true };
  if (!directUploadsEnabled()) return { ok: true, inline: true };
  if (!(await rateLimit(getDb(), { ...LIMITS.guestUploadPerIp, caller: await clientIp() })).ok) return { ok: false, tooMany: true };

  const minted = await mintGuestUpload({ byteSize: input.byteSize, termsVersion: TERMS_VERSION });
  if (!minted) return { ok: false }; // empty, fractional or over 25MB

  const jar = await cookies();
  await setTickets(signTickets(appendTicket(verifyTickets(jar.get(UPLOAD_TICKET_COOKIE)?.value), minted.ticket)));
  return { ok: true, uploadId: minted.uploadId, url: minted.upload.url, headers: minted.upload.headers };
}

/**
 * DIRECT upload, step 2 (after the browser's PUT): finalise with this browser's ticket. The
 * server reads the quarantined bytes and runs the same ingest as {@link startGuestUpload}; the
 * quarantine object is deleted; the claim cookie is granted exactly as before.
 */
export async function finishGuestUpload(uploadId: string): Promise<GuestUploadResult> {
  const jar = await cookies();
  const tickets = verifyTickets(jar.get(UPLOAD_TICKET_COOKIE)?.value);
  const res = await finaliseGuestUpload(getDb(), { uploadId, tickets, kind: 'DRAWING' });
  if (res.status === 'denied') return { ok: false };
  await setTickets(signTickets(withoutTicket(tickets, uploadId))); // single-use
  if (res.status === 'failed') return { ok: false };
  if (res.moderationStatus === 'BLOCKED') return { ok: false, blocked: true }; // preserved, never surfaced

  await grantClaim(res.claimId);
  return { ok: true, assetId: res.assetId, trimmed: await trimmedFor(res.assetId, res.claimId) };
}
