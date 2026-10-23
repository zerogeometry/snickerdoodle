/**
 * The "are you a person?" check on our public forms (founder, 23 Oct) — a proof of work, the ALTCHA
 * scheme, run entirely by us: no third party, no cookies, no picture puzzles. The server picks a
 * secret number and sends only its hash; the visitor's browser finds the number by trying them in
 * turn (a second or two, quietly, while they type). Cheap for one honest message, costly for a bot
 * sending thousands. The server half lives in src/server/humanCheck.ts.
 */
export interface HumanChallenge {
  /** random + the expiry, e.g. "9f2c…41.1792765238527" */
  salt: string;
  /** sha256(salt + secret number), hex */
  challenge: string;
  /** the secret number is somewhere in 0..max */
  max: number;
  /** our HMAC of the challenge — proves we issued it */
  signature: string;
}

export interface HumanProof {
  salt: string;
  challenge: string;
  number: number;
  signature: string;
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Find the number (browser or Node — both have crypto.subtle). Batches keep the page responsive. */
export async function solveHumanCheck(c: HumanChallenge, batch = 400): Promise<HumanProof | null> {
  const enc = new TextEncoder();
  for (let start = 0; start <= c.max; start += batch) {
    const end = Math.min(start + batch - 1, c.max);
    const tries: Promise<string>[] = [];
    for (let n = start; n <= end; n++) tries.push(crypto.subtle.digest('SHA-256', enc.encode(c.salt + n)).then(hex));
    const hashes = await Promise.all(tries);
    const i = hashes.indexOf(c.challenge);
    if (i >= 0) return { salt: c.salt, challenge: c.challenge, number: start + i, signature: c.signature };
  }
  return null;
}
