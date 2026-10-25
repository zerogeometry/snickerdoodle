import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { solveHumanCheck } from '@/lib/humanCheck';
import { createHumanChallenge } from '@/server/humanCheck';

const DB = process.env.DATABASE_URL;

// The action reads the visitor's address and session from the request; give it a fresh one each run.
const ip = `198.51.${randomInt(0, 255)}.${randomInt(1, 254)}`;
vi.mock('@/server/session', () => ({ getCurrentAccount: async () => null }));
vi.mock('@/server/rateLimit', async (orig) => ({ ...(await orig<typeof import('@/server/rateLimit')>()), clientIp: async () => ip }));

/** The data-protection complaint form has the help form's "are you a person?" check (founder, 24 Oct). */
describe.skipIf(!DB)('data-complaint form — the "are you a person?" check (integration)', async () => {
  const { submitComplaintAction } = await import('@/app/actions/complaint');
  const { getDb } = await import('@/db/client');
  const { rightsRequests } = await import('@/db/schema');
  const db = getDb();
  const email = `complaint-${randomUUID().slice(0, 8)}@example.test`;
  const base = { name: 'Alex Parent', email, message: 'You kept my drawing longer than you said you would.' };
  const recorded = () => db.select().from(rightsRequests).where(eq(rightsRequests.subjectEmail, email));
  const solved = () => solveHumanCheck(createHumanChallenge(Date.now(), 2000));

  afterAll(async () => {
    await db.delete(rightsRequests).where(eq(rightsRequests.subjectEmail, email));
  });

  it('no proof, junk, or a forged one: refused, and nothing is recorded', async () => {
    expect(await submitComplaintAction({ ...base })).toEqual({ ok: false, reason: 'check' });
    expect(await submitComplaintAction({ ...base, proof: null })).toEqual({ ok: false, reason: 'check' });
    const real = (await solved())!;
    expect(await submitComplaintAction({ ...base, proof: { ...real, signature: 'a'.repeat(64) } })).toEqual({ ok: false, reason: 'check' });
    expect(await submitComplaintAction({ ...base, proof: { ...real, number: real.number + 1 } })).toEqual({ ok: false, reason: 'check' });
    expect(await recorded()).toHaveLength(0);
  });

  it('a solved check goes through — once; replaying the same solve is refused', async () => {
    const proof = await solved();
    const res = await submitComplaintAction({ ...base, proof });
    expect(res.ok).toBe(true);
    expect(res.ref).toBeTruthy();
    expect(await submitComplaintAction({ ...base, proof })).toEqual({ ok: false, reason: 'check' });
    expect(await recorded()).toHaveLength(1);
  });

  it('the honeypot still drops a bot silently (it learns nothing, nothing is recorded)', async () => {
    const before = (await recorded()).length;
    expect(await submitComplaintAction({ ...base, website: 'spam.example', proof: await solved() })).toEqual({ ok: true });
    expect(await recorded()).toHaveLength(before);
  });
});
