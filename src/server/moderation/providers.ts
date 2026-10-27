/**
 * Content-safety providers (decision D8). Two automated checks gate every
 * upload before it can reach a print order:
 *   1. a CSAM hash-check (IWF hash list) — a match is reported, never viewed;
 *   2. a moderation classifier (AWS Rekognition Content Moderation, eu-west-2) —
 *      it FLAGS into a review queue, it never auto-rejects a child's drawing.
 *
 * These are the swap points. MODERATION_PROVIDER=real selects the real ones
 * (iwfHashList.ts + rekognition.ts; config + paperwork in
 * project-office/briefs/MODERATION-providers.md). Otherwise the STUB passes everything
 * CLEAR so local dev is walkable. The stub must NEVER run in production —
 * `defaultProviders()` refuses it there and `isModerationConfigured()` is the go-live guard.
 */
import { DEFAULT_MAX_AGE_HOURS, localHashListProvider } from './iwfHashList';
import {
  DEFAULT_MIN_CONFIDENCE,
  MODERATION_REGION,
  createRekognitionClient,
  rekognitionClassifier,
  rekognitionTextReader,
  type RekognitionLike,
} from './rekognition';

export interface HashMatchProvider {
  /** True if the image matches a known-illegal (CSAM) hash. Throws if the check can't run. */
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
  /** Optional; without one, designs fall back to the classifier alone. */
  textReader?: TextReaderProvider;
}

// ── STUB (dev only — NOT FOR PRODUCTION) ─────────────────────────────────────
const stubHash: HashMatchProvider = {
  async isKnownIllegal() {
    return false;
  },
};
const stubClassifier: ClassifierProvider = {
  async classify() {
    return { flagged: false, labels: [] }; // passes everything
  },
};

const stubTextReader: TextReaderProvider = {
  async read() {
    return [];
  },
};

// ── REAL ─────────────────────────────────────────────────────────────────────
export interface RealModerationConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  minConfidence: number;
  hashListPath: string;
  hashListMaxAgeHours: number;
}

type Env = Record<string, string | undefined>;

/**
 * Read + check the real-provider settings. Throws a clear error naming what's missing or
 * wrong — never echoing a secret. Credentials come from env (set from the secret store).
 */
export function readRealModerationConfig(env: Env = process.env): RealModerationConfig {
  const problems: string[] = [];
  const val = (k: string) => env[k]?.trim() || undefined;
  const region = val('MODERATION_AWS_REGION') ?? MODERATION_REGION;
  if (region !== MODERATION_REGION) problems.push(`MODERATION_AWS_REGION must be ${MODERATION_REGION} (got "${region}")`);
  const accessKeyId = val('MODERATION_AWS_ACCESS_KEY_ID');
  const secretAccessKey = val('MODERATION_AWS_SECRET_ACCESS_KEY');
  if (!accessKeyId) problems.push('MODERATION_AWS_ACCESS_KEY_ID is not set');
  if (!secretAccessKey) problems.push('MODERATION_AWS_SECRET_ACCESS_KEY is not set');
  const minConfidence = Number(val('REKOGNITION_MIN_CONFIDENCE') ?? DEFAULT_MIN_CONFIDENCE);
  if (!Number.isFinite(minConfidence) || minConfidence < 1 || minConfidence > 100) problems.push('REKOGNITION_MIN_CONFIDENCE must be a number from 1 to 100');
  const hashListPath = val('IWF_HASH_LIST_PATH');
  if (!hashListPath) problems.push('IWF_HASH_LIST_PATH is not set');
  const hashListMaxAgeHours = Number(val('IWF_HASH_LIST_MAX_AGE_HOURS') ?? DEFAULT_MAX_AGE_HOURS);
  if (!Number.isFinite(hashListMaxAgeHours) || hashListMaxAgeHours <= 0) problems.push('IWF_HASH_LIST_MAX_AGE_HOURS must be a positive number');
  if (problems.length) throw new Error(`MODERATION_PROVIDER=real is not fully configured: ${problems.join('; ')}`);
  return { region, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey!, minConfidence, hashListPath: hashListPath!, hashListMaxAgeHours };
}

/** Build the real providers: IWF hash list (held locally) + Rekognition classifier + text reader. */
export function realProviders(cfg: RealModerationConfig, deps: { rekognition?: RekognitionLike } = {}): ModerationProviders {
  const client = deps.rekognition ?? createRekognitionClient(cfg);
  return {
    hash: localHashListProvider({ path: cfg.hashListPath, maxAgeHours: cfg.hashListMaxAgeHours }),
    classifier: rekognitionClassifier({ client, minConfidence: cfg.minConfidence }),
    textReader: rekognitionTextReader({ client }),
  };
}

let cached: { key: string; providers: ModerationProviders } | null = null;

/**
 * Resolve the configured providers. MODERATION_PROVIDER=real → the real ones (or a clear
 * error if misconfigured). Otherwise the stub — dev/test only; production refuses it.
 */
export function defaultProviders(env: Env = process.env, deps: { rekognition?: RekognitionLike } = {}): ModerationProviders {
  const mode = env.MODERATION_PROVIDER?.trim() || 'stub';
  if (mode === 'real') {
    const cfg = readRealModerationConfig(env);
    if (deps.rekognition) return realProviders(cfg, deps);
    // one client + one loaded hash list per process
    const key = JSON.stringify(cfg);
    if (cached?.key !== key) cached = { key, providers: realProviders(cfg) };
    return cached.providers;
  }
  if (mode !== 'stub') throw new Error(`MODERATION_PROVIDER must be "real" or "stub" (got "${mode}")`);
  // Never let the pass-everything stub screen a real upload.
  if (env.NODE_ENV === 'production') throw new Error('the moderation stub cannot run in production — set MODERATION_PROVIDER=real');
  return { hash: stubHash, classifier: stubClassifier, textReader: stubTextReader };
}

/** Go-live guard: true only when the REAL providers are selected AND fully configured. */
export function isModerationConfigured(env: Env = process.env): boolean {
  if (env.MODERATION_PROVIDER?.trim() !== 'real') return false;
  try {
    readRealModerationConfig(env);
    return true;
  } catch {
    return false;
  }
}
