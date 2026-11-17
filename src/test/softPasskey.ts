import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON } from 'simplewebauthn-server';
import { isoBase64URL, isoCBOR } from 'simplewebauthn-server/helpers';

/**
 * TEST ONLY — a pretend phone that makes and uses a passkey (ES256, "none" attestation) exactly as a real one would
 * on the wire, so the server's real WebAuthn checks run in tests. `uv: false` = the device didn't check it's them.
 */
const sha256 = (b: Uint8Array | string) => new Uint8Array(createHash('sha256').update(b).digest());
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const text = (s: string) => new TextEncoder().encode(s);

export function softPasskey(opts: { rpID: string; origin: string; aaguid?: string }) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = new Uint8Array(randomBytes(16));
  const id = isoBase64URL.fromBuffer(credentialId);
  const aaguid = new Uint8Array(Buffer.from((opts.aaguid ?? '00000000-0000-0000-0000-000000000000').replace(/-/g, ''), 'hex'));
  let counter = 0;
  let userHandle: string | null = null;

  const cose = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, isoBase64URL.toBuffer(jwk.x!)],
      [-3, isoBase64URL.toBuffer(jwk.y!)],
    ]),
  );
  const flags = (uv: boolean, attested: boolean) => 0x01 | (uv ? 0x04 : 0) | 0x08 | 0x10 | (attested ? 0x40 : 0);
  const clientData = (type: string, challenge: string, origin: string) => text(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    id,
    register(options: PublicKeyCredentialCreationOptionsJSON, o: { uv?: boolean; origin?: string } = {}): RegistrationResponseJSON {
      userHandle = options.user.id;
      const authData = cat(sha256(opts.rpID), new Uint8Array([flags(o.uv ?? true, true)]), u32(counter), aaguid, new Uint8Array([0, credentialId.length]), credentialId, cose);
      const attestationObject = isoCBOR.encode(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]) as never);
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientData('webauthn.create', options.challenge, o.origin ?? opts.origin)),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ['internal', 'hybrid'],
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
    authenticate(options: PublicKeyCredentialRequestOptionsJSON, o: { uv?: boolean; origin?: string; challenge?: string; userHandle?: string | null; tamper?: boolean } = {}): AuthenticationResponseJSON {
      counter += 1;
      const authData = cat(sha256(opts.rpID), new Uint8Array([flags(o.uv ?? true, false)]), u32(counter));
      const cd = clientData('webauthn.get', o.challenge ?? options.challenge, o.origin ?? opts.origin);
      const signature = new Uint8Array(sign('sha256', cat(authData, sha256(cd)), privateKey));
      if (o.tamper) signature[signature.length - 1] = signature[signature.length - 1]! ^ 0xff;
      const handle = o.userHandle === undefined ? userHandle : o.userHandle;
      return {
        id,
        rawId: id,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(cd),
          authenticatorData: isoBase64URL.fromBuffer(authData),
          signature: isoBase64URL.fromBuffer(signature),
          ...(handle ? { userHandle: handle } : {}),
        },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      };
    },
  };
}
