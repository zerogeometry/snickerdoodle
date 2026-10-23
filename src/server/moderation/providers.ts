import type { RekognitionClient } from '@aws-sdk/client-rekognition';
import { iwfHashProvider, isIwfConfigured, resolveIwfAdapter, type IwfImageInterceptAdapter } from './iwf';
import { assertRekognitionRegion, createRekognitionClient, rekognitionClassifier, rekognitionTextReader, type RekognitionPort } from './rekognition';

/**
 * Content-safety providers (decision D8). Two automated checks gate every
 * upload before it can reach a print order:
 *   1. a CSAM hash-check (IWF Image Intercept) — a match is reported, never viewed;
 *   2. a moderation classifier (AWS Rekognition Content Moderation, eu-west-2) —
 *      it FLAGS into a review queue, it never auto-rejects a child's drawing.
 *
 * MODERATION_PROVIDER picks them:
 *   - unset / "stub" (the DEFAULT): pass-everything stubs so local dev is walkable. The stub must
 *     NEVER run in production — `isModerationConfigured()` is the go-live guard, and production
 *     with it false holds every upload for review.
 *   - "real": IWF (./iwf.ts) + Rekognition (./rekognition.ts). OFF until LG3 + LG6 are green,
 *     the AWS DPA covers Rekognition and the AWS Organizations AI-services opt-out is applied
 *     (DPIA A-08). Bad config is a startup error (src/instrumentation.ts), never a quiet stub.
 *     IWF isn't onboarded yet, so in "real" mode the hash gate is CLOSED: every upload is held
 *     for review, and `isModerationConfigured()` stays false.
 */

export interface HashMatchProvider {
  /** True if the image matches a known-illegal (CSAM) hash. */
  isKnownIllegal(input: { sha256: string; buffer: Buffer }): Promise<boolean>;
}

export interface ClassifierProvider {
  /** Automated moderation classifier. `flagged` routes to the human review queue. */
  classify(buffer: Buffer): Promise<{ flagged: boolean; labels: string[] }>;
}

/**
 * Reads words written IN an image (OCR — AWS Rekognition DetectText, eu-west-2, when real), so
 * words drawn by hand in the Studio get the same abuse screen as typed words.
 */
export interface TextReaderProvider {
  read(buffer: Buffer): Promise<string[]>;
}

export interface ModerationProviders {
  hash: HashMatchProvider;
  classifier: ClassifierProvider;
  /** Optional until the real providers land; designs fall back to the classifier alone. */
  textReader?: TextReaderProvider;
}

// ── STUB (dev only — NOT FOR PRODUCTION) ─────────────────────────────────────
const stubHash: HashMatchProvider = {
  async isKnownIllegal() {
    return false; // no real hash database in dev
  },
};
const stubClassifier: ClassifierProvider = {
  async classify() {
    return { flagged: false, labels: [] }; // passes everything in dev
  },
};

const stubTextReader: TextReaderProvider = {
  async read() {
    return []; // no OCR in dev
  },
};

// ── REAL ─────────────────────────────────────────────────────────────────────

export class ModerationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModerationConfigError';
  }
}

type Env = Record<string, string | undefined>;

/** Config that makes "real" unsafe to build. Each one is a startup error. */
export function realProviderConfigErrors(env: Env = process.env): string[] {
  const errors: string[] = [];
  // The client pins its own endpoint, so this would be ignored — but someone meant to send
  // children's pictures somewhere else. Say no, loudly.
  if (env.AWS_ENDPOINT_URL_REKOGNITION) errors.push('AWS_ENDPOINT_URL_REKOGNITION is set — Rekognition is pinned to eu-west-2 and cannot be redirected');
  return errors;
}

let sharedRekognition: RekognitionClient | null = null;
const rekognitionClient = (): RekognitionClient => (sharedRekognition ??= createRekognitionClient());

/** Test seams: a mocked Rekognition client and/or IWF adapter. Production passes nothing. */
export interface RealProviderDeps {
  rekognition?: RekognitionPort;
  iwf?: IwfImageInterceptAdapter | null;
}

/** Build the real providers. Bad config throws — it never falls back to the stub. */
export function realProviders(env: Env = process.env, deps: RealProviderDeps = {}): ModerationProviders {
  const errors = realProviderConfigErrors(env);
  if (errors.length) throw new ModerationConfigError(`MODERATION_PROVIDER=real is misconfigured: ${errors.join('; ')}`);
  const client = deps.rekognition ?? rekognitionClient();
  return {
    // no IWF adapter → the hash gate is CLOSED (throws on every check → held for review)
    hash: iwfHashProvider(deps.iwf !== undefined ? deps.iwf : resolveIwfAdapter(env)),
    classifier: rekognitionClassifier(client),
    textReader: rekognitionTextReader(client),
  };
}

/**
 * Resolve the configured providers: the stub by default, the real ones when
 * MODERATION_PROVIDER=real. Any other value is an error, not a quiet stub.
 */
export function defaultProviders(env: Env = process.env, deps: RealProviderDeps = {}): ModerationProviders {
  const mode = env.MODERATION_PROVIDER;
  if (mode === 'real') return realProviders(env, deps);
  if (mode === undefined || mode === '' || mode === 'stub') return { hash: stubHash, classifier: stubClassifier, textReader: stubTextReader };
  throw new ModerationConfigError(`MODERATION_PROVIDER must be "stub" or "real", not "${mode}"`);
}

/**
 * Go-live guard: true only when the REAL providers are configured — Rekognition AND the IWF
 * hash check. Until IWF is onboarded this is false even with MODERATION_PROVIDER=real, so
 * production keeps holding every upload for review (and sends nothing to Rekognition).
 */
export function isModerationConfigured(env: Env = process.env): boolean {
  return env.MODERATION_PROVIDER === 'real' && realProviderConfigErrors(env).length === 0 && isIwfConfigured(env);
}

/**
 * Startup check (src/instrumentation.ts). With MODERATION_PROVIDER=real it refuses to start on
 * bad config, a client outside eu-west-2, or no AWS credentials in the provider chain. The
 * credentials are resolved to prove they exist, then dropped — never logged. No image is sent.
 */
export async function assertModerationReady(env: Env = process.env, deps: RealProviderDeps = {}): Promise<{ mode: 'stub' | 'real'; hashGate: 'stub' | 'configured' | 'closed' }> {
  defaultProviders(env, deps); // throws on an unknown mode or bad real config
  if (env.MODERATION_PROVIDER !== 'real') return { mode: 'stub', hashGate: 'stub' };
  const client = deps.rekognition ?? rekognitionClient();
  await assertRekognitionRegion(client);
  const creds = (client.config as { credentials?: unknown }).credentials;
  if (typeof creds === 'function') {
    try {
      await (creds as () => Promise<unknown>)();
    } catch {
      throw new ModerationConfigError('MODERATION_PROVIDER=real but no AWS credentials were found for Rekognition (standard AWS provider chain)');
    }
  }
  const iwf = deps.iwf !== undefined ? deps.iwf !== null : isIwfConfigured(env);
  if (!iwf) {
    console.warn('[moderation] IWF Image Intercept is not configured — the CSAM hash gate is CLOSED: every upload is held for review and none can be printed. See project-office/ops/IWF-ONBOARDING.md');
  }
  return { mode: 'real', hashGate: iwf ? 'configured' : 'closed' };
}
