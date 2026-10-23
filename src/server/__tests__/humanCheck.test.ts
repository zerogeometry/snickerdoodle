import { describe, expect, it } from 'vitest';
import { solveHumanCheck } from '@/lib/humanCheck';
import { HUMAN_CHECK_TTL_SEC, createHumanChallenge, verifyHumanProof } from '@/server/humanCheck';

/** The help form's "are you a person?" proof of work: ours, unexpired, really solved — or refused. */
describe('human check', () => {
  const small = () => createHumanChallenge(Date.now(), 2000); // quick to solve in a test

  it('the browser-side solver finds the number and the server accepts it', async () => {
    const proof = await solveHumanCheck(small());
    expect(proof).not.toBeNull();
    expect(verifyHumanProof(proof)).toBe(true);
  });

  it('refuses a wrong answer, a forged challenge, a tampered salt and junk', async () => {
    const c = small();
    const proof = (await solveHumanCheck(c))!;
    expect(verifyHumanProof({ ...proof, number: proof.number + 1 })).toBe(false);
    expect(verifyHumanProof({ ...proof, signature: 'a'.repeat(64) })).toBe(false); // not issued by us
    expect(verifyHumanProof({ ...proof, salt: proof.salt.replace(/\.\d+$/, `.${Date.now() + 9e12}`) })).toBe(false); // can't extend its life
    for (const junk of [null, undefined, {}, 'x', { ...proof, number: -1 }, { ...proof, number: 1.5 }, { ...proof, challenge: 'zz' }]) expect(verifyHumanProof(junk)).toBe(false);
  });

  it('a challenge expires', async () => {
    const now = Date.now();
    const proof = (await solveHumanCheck(createHumanChallenge(now, 2000)))!;
    expect(verifyHumanProof(proof, now + (HUMAN_CHECK_TTL_SEC - 1) * 1000)).toBe(true);
    expect(verifyHumanProof(proof, now + (HUMAN_CHECK_TTL_SEC + 1) * 1000)).toBe(false);
  });

  it('a real-size challenge is solvable in a reasonable time', async () => {
    const t = Date.now();
    const proof = await solveHumanCheck(createHumanChallenge());
    expect(verifyHumanProof(proof)).toBe(true);
    expect(Date.now() - t).toBeLessThan(15_000);
  }, 20_000);
});
