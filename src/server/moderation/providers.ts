/**
 * Content-safety providers (decision D8). Two automated checks gate every
 * upload before it can reach a print order:
 *   1. a CSAM hash-check (IWF Image Intercept) — a match is reported, never viewed;
 *   2. a moderation classifier (AWS Rekognition Content Moderation, eu-west-2) —
 *      it FLAGS into a review queue, it never auto-rejects a child's drawing.
 *
 * These are the swap points. The real providers need signed contracts +
 * credentials and are a hard launch gate (LG6); until they're wired the STUB
 * passes everything as CLEAR so local dev is walkable. The stub must NEVER run in
 * production — `isModerationConfigured()` is the go-live guard.
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
    return false; // no real hash database wired yet
  },
};
const stubClassifier: ClassifierProvider = {
  async classify() {
    return { flagged: false, labels: [] }; // passes everything until the real model is wired
  },
};

const stubTextReader: TextReaderProvider = {
  async read() {
    return []; // no OCR wired yet
  },
};

/**
 * Resolve the configured providers. Real providers slot in here (read creds from
 * the secret store) once LG6 is closed; until then, the stub.
 */
export function defaultProviders(env: Record<string, string | undefined> = process.env): ModerationProviders {
  // TODO(LG6): when MODERATION_PROVIDER === 'real', return the IWF + Rekognition
  // providers built from credentials in the secret store.
  if (env.MODERATION_PROVIDER === 'real') {
    // Never let "real" quietly mean the pass-everything stub.
    throw new Error('MODERATION_PROVIDER=real but the real providers are not wired yet (LG6)');
  }
  return { hash: stubHash, classifier: stubClassifier, textReader: stubTextReader };
}

/** Go-live guard: true only when the REAL providers are configured. */
export function isModerationConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.MODERATION_PROVIDER === 'real';
}
