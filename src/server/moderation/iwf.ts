import type { HashMatchProvider } from './providers';

/**
 * The known-CSAM hash check (D8, M1): IWF Image Intercept.
 *
 * IWF onboarding is NOT done, so there is no API spec and no credentials. This file defines
 * only the seam the real client will plug into — it deliberately does NOT guess at IWF's
 * API, hash types, transport or auth. What we need from IWF is listed in
 * project-office/ops/IWF-ONBOARDING.md.
 *
 * Until an adapter exists, the hash gate is CLOSED: every check throws
 * {@link HashGateUnavailableError}, which the moderation gate turns into "held for review,
 * hash-check-unavailable" — never CLEAR. And review can neither show nor clear such an item
 * (src/authz/review.ts): only a passed hash check lets a picture through.
 */

/** What the moderation gate hands the IWF adapter for ONE upload. */
export interface IwfHashCheckInput {
  /** The bytes EXACTLY as uploaded (before EXIF strip / re-encode) — known-image lists match original files. */
  originalBytes: Buffer;
  /** SHA-256 (hex) of `originalBytes`. Other hash types IWF needs are computed by the adapter. */
  sha256: string;
}

/**
 * The adapter the real IWF Image Intercept client must implement. Its result is a strict
 * either/or; anything else — a throw, a timeout, an unexpected shape — keeps the gate CLOSED.
 */
export interface IwfImageInterceptAdapter {
  check(input: IwfHashCheckInput): Promise<{ match: true } | { match: false }>;
}

export class HashGateUnavailableError extends Error {
  constructor(message = 'the known-CSAM hash check (IWF Image Intercept) is not configured') {
    super(message);
    this.name = 'HashGateUnavailableError';
  }
}

/**
 * The IWF adapter for this environment, or null when it isn't configured. Today it is ALWAYS
 * null: onboarding isn't done, so there is nothing real to build. When IWF supplies the spec,
 * the real adapter is built here from secret-store config, and missing config becomes a
 * startup error like Rekognition's.
 */
export function resolveIwfAdapter(_env: Record<string, string | undefined> = process.env): IwfImageInterceptAdapter | null {
  void _env;
  return null;
}

/** Whether a real IWF hash check is available. Part of the go-live guard (isModerationConfigured). */
export function isIwfConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return resolveIwfAdapter(env) !== null;
}

/**
 * HashMatchProvider over an IWF adapter. With no adapter it FAILS CLOSED: it throws on every
 * check, so no upload can pass the hash gate.
 */
export function iwfHashProvider(adapter: IwfImageInterceptAdapter | null): HashMatchProvider {
  return {
    async isKnownIllegal({ sha256, buffer }) {
      if (!adapter) throw new HashGateUnavailableError();
      const r = (await adapter.check({ originalBytes: buffer, sha256 })) as { match?: unknown } | null;
      if (r?.match === true) return true;
      if (r?.match === false) return false;
      throw new HashGateUnavailableError('the IWF hash check returned an unreadable result');
    },
  };
}
