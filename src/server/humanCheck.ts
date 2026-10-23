import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { HumanChallenge, HumanProof } from '@/lib/humanCheck';
import type { DbHandle } from './db';
import { rateLimit } from './rateLimit';
import { claimSecret } from './uploadClaims';

/** The secret number is in 0..HUMAN_CHECK_MAX — about a second or two of work on a phone. */
export const HUMAN_CHECK_MAX = 100_000;
/** Long enough to write a message; a lapsed one is quietly re-done by the form. */
export const HUMAN_CHECK_TTL_SEC = 2 * 3600;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const sign = (challenge: string) => createHmac('sha256', `human-check:${claimSecret()}`).update(challenge).digest('hex');

export function createHumanChallenge(now = Date.now(), max = HUMAN_CHECK_MAX): HumanChallenge {
  const salt = `${randomBytes(12).toString('hex')}.${now + HUMAN_CHECK_TTL_SEC * 1000}`;
  const challenge = sha256(salt + randomInt(0, max + 1));
  return { salt, challenge, max, signature: sign(challenge) };
}

/** Ours, unexpired, and really solved. (One-time use is checkHumanProof's job.) */
export function verifyHumanProof(p: unknown, now = Date.now()): boolean {
  const proof = p as Partial<HumanProof> | null;
  if (!proof || typeof proof.salt !== 'string' || typeof proof.challenge !== 'string' || typeof proof.signature !== 'string') return false;
  if (!Number.isInteger(proof.number) || proof.number! < 0) return false;
  if (proof.salt.length > 100 || !/^[0-9a-f]{64}$/.test(proof.challenge) || !/^[0-9a-f]{64}$/.test(proof.signature)) return false;
  const expires = Number(proof.salt.split('.')[1]);
  if (!Number.isFinite(expires) || expires < now) return false;
  const want = Buffer.from(sign(proof.challenge), 'hex');
  const got = Buffer.from(proof.signature, 'hex');
  if (want.length !== got.length || !timingSafeEqual(want, got)) return false;
  return sha256(proof.salt + proof.number) === proof.challenge;
}

/** Verify, and spend it: a solved check works once (so one solve can't be replayed for a flood). */
export async function checkHumanProof(db: DbHandle, p: unknown, now = Date.now()): Promise<boolean> {
  if (!verifyHumanProof(p, now)) return false;
  const used = await rateLimit(db, { bucket: 'human-check:used', limit: 1, windowSec: HUMAN_CHECK_TTL_SEC, caller: (p as HumanProof).signature });
  return used.ok;
}
