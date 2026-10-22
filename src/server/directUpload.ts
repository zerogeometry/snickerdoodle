import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ImageTooLargeError,
  MAX_UPLOAD_BYTES,
  deleteQuarantineObject,
  getObjectBytes,
  headObject,
  isAcceptableUploadSize,
  listQuarantine,
  presignQuarantineUpload,
  quarantineKey,
  type PresignedUpload,
} from '@/storage';
import type { DbHandle } from './db';
import { ingestEphemeralUpload, type AssetKind, type EphemeralIngestResult } from './ingest';
import { claimSecret } from './uploadClaims';

/**
 * Direct browser → bucket uploads for the no-account-wall flow (HOSTING-speed brief).
 *
 *   1. MINT    — the upload is authorised server-side (terms accepted, per-device rate limit), then
 *                a PUT-only URL is signed for ONE quarantine key, pinned to the declared size,
 *                live for 5 minutes. A matching TICKET goes into a signed httpOnly cookie, so only
 *                THIS browser can finalise it (the URL alone is not enough — it names the key).
 *   2. PUT     — the browser sends the bytes straight to the private bucket; the instant local
 *                preview is already on screen.
 *   3. FINALISE — the server re-reads the quarantine object and runs the SAME ingest as the old
 *                path: EXIF/GPS strip, CSAM hash-check on the bytes exactly as uploaded,
 *                moderation, retention clock, terms recorded. The clean original is written under
 *                the asset key and the quarantine object is deleted (whatever the outcome).
 *   4. SWEEP   — anything left in quarantine (abandoned, never finalised) is deleted by the daily
 *                retention job, with a bucket lifecycle rule as the backstop.
 *
 * A quarantine object has no asset row, so authz, signed downloads, renders and orders cannot
 * reach it: an un-finalised upload never gets near a print order.
 */

/** The httpOnly cookie that holds this browser's pending upload tickets. */
export const UPLOAD_TICKET_COOKIE = 'sd_upload_tickets';
/** How long a ticket can be finalised after minting (a 25MB upload on a slow line has time). */
export const TICKET_TTL_SECONDS = 30 * 60;
/** The sweep only deletes quarantine objects older than this — well past any live ticket. */
export const QUARANTINE_SWEEP_AGE_MS = 2 * TICKET_TTL_SECONDS * 1000;
/** Pending uploads one browser can hold at once (the UI does one at a time). */
export const MAX_PENDING_TICKETS = 5;

/** On when the bucket's CORS allows the site to PUT (see project-office/ops/DIRECT-UPLOADS.md). */
export function directUploadsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.S3_DIRECT_UPLOADS === 'true';
}

export interface UploadTicket {
  /** The upload id — also the quarantine key's last segment. */
  id: string;
  /** The exact size the URL was signed for. */
  bytes: number;
  /** Expiry, epoch seconds. */
  exp: number;
  /** The terms version the guest accepted when the upload was authorised. */
  terms: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Domain-separated from the upload-claim MAC, so one cookie can never be replayed as the other.
const mac = (payload: string) => createHmac('sha256', claimSecret()).update(`upload-ticket:${payload}`).digest('base64url');

export function signTickets(tickets: UploadTicket[]): string {
  const payload = Buffer.from(JSON.stringify(tickets)).toString('base64url');
  return `${payload}.${mac(payload)}`;
}

/** Verify + decode the ticket cookie → the LIVE tickets, or [] if absent/tampered. */
export function verifyTickets(cookieValue: string | undefined | null, now = new Date()): UploadTicket[] {
  if (!cookieValue) return [];
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return [];
  const payload = cookieValue.slice(0, dot);
  const a = Buffer.from(cookieValue.slice(dot + 1));
  const b = Buffer.from(mac(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return [];
  try {
    const raw: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Array.isArray(raw)) return [];
    const nowS = Math.floor(now.getTime() / 1000);
    return raw.filter(
      (t): t is UploadTicket =>
        !!t &&
        typeof t.id === 'string' &&
        UUID.test(t.id) &&
        isAcceptableUploadSize(t.bytes) &&
        typeof t.exp === 'number' &&
        t.exp > nowS &&
        typeof t.terms === 'string',
    );
  } catch {
    return [];
  }
}

/** Add a ticket (newest MAX_PENDING_TICKETS kept). */
export function appendTicket(tickets: UploadTicket[], ticket: UploadTicket): UploadTicket[] {
  return [...tickets.filter((t) => t.id !== ticket.id), ticket].slice(-MAX_PENDING_TICKETS);
}

/** Drop a ticket — it's single-use, whatever the finalise outcome. */
export function withoutTicket(tickets: UploadTicket[], id: string): UploadTicket[] {
  return tickets.filter((t) => t.id !== id);
}

/**
 * Sign a direct upload. The CALLER has already authorised it (terms + rate limit — see the
 * beginGuestUpload action); this refuses anything outside the size guard and returns the URL,
 * the headers to send, and the ticket for the browser's cookie.
 */
export async function mintGuestUpload(input: {
  byteSize: unknown;
  termsVersion: string;
  now?: Date;
}): Promise<{ uploadId: string; upload: PresignedUpload; ticket: UploadTicket } | null> {
  if (!isAcceptableUploadSize(input.byteSize)) return null;
  const now = input.now ?? new Date();
  const uploadId = randomUUID();
  const upload = await presignQuarantineUpload(uploadId, input.byteSize, { now });
  const ticket: UploadTicket = {
    id: uploadId,
    bytes: input.byteSize,
    exp: Math.floor(now.getTime() / 1000) + TICKET_TTL_SECONDS,
    terms: input.termsVersion,
  };
  return { uploadId, upload, ticket };
}

export type FinaliseResult =
  /** No live ticket for this upload in this browser — nothing was read or touched. */
  | { status: 'denied' }
  /** Missing, wrong-sized or unreadable upload (not an image / a decompression bomb). */
  | { status: 'failed' }
  | ({ status: 'ingested' } & EphemeralIngestResult);

/**
 * Finalise a direct upload: ONLY with this browser's live ticket for it. Reads the quarantined
 * bytes server-side and runs the normal ephemeral ingest (EXIF strip → store original →
 * CSAM hash-check + moderation → retention + terms). The quarantine object is deleted on every
 * path that read it; if that delete fails, the sweep removes it later.
 */
export async function finaliseGuestUpload(
  db: DbHandle,
  input: { uploadId: unknown; tickets: UploadTicket[]; kind?: AssetKind; now?: Date },
): Promise<FinaliseResult> {
  const now = input.now ?? new Date();
  const nowS = Math.floor(now.getTime() / 1000);
  const ticket = input.tickets.find((t) => t.id === input.uploadId && t.exp > nowS);
  if (!ticket) return { status: 'denied' };

  const key = quarantineKey(ticket.id);
  try {
    const head = await headObject(key);
    // The URL pinned the size; check again here so a bucket that ignored it can't feed us more.
    if (!head || head.byteSize !== ticket.bytes || head.byteSize > MAX_UPLOAD_BYTES) return { status: 'failed' };
    const buffer = await getObjectBytes(key);
    if (buffer.byteLength !== ticket.bytes) return { status: 'failed' };
    const ingested = await ingestEphemeralUpload(db, { buffer, kind: input.kind ?? 'DRAWING', termsVersion: ticket.terms, now });
    return { status: 'ingested', ...ingested };
  } catch (e) {
    if (e instanceof ImageTooLargeError) return { status: 'failed' }; // a decompression bomb, or not an image
    throw e;
  } finally {
    // Raw bytes (EXIF/GPS and all) never outlive the finalise — every version of them. A failed
    // delete is left to the sweep.
    await deleteQuarantineObject(key).catch(() => {});
  }
}

/**
 * Delete abandoned quarantine uploads (minted + PUT, never finalised). Run from the daily
 * retention job; the bucket lifecycle rule on quarantine/ is the backstop if this ever stops.
 */
export async function sweepQuarantine(
  opts: { now?: Date; olderThanMs?: number } = {},
): Promise<{ scanned: number; deleted: number; failed: number }> {
  const cutoff = (opts.now ?? new Date()).getTime() - (opts.olderThanMs ?? QUARANTINE_SWEEP_AGE_MS);
  const objects = await listQuarantine();
  let deleted = 0;
  let failed = 0;
  for (const o of objects) {
    // no timestamp ⇒ can't prove it's abandoned; leave it to the lifecycle rule
    if (!o.lastModified || o.lastModified.getTime() > cutoff) continue;
    try {
      await deleteQuarantineObject(o.key);
      deleted++;
    } catch {
      failed++;
    }
  }
  return { scanned: objects.length, deleted, failed };
}
