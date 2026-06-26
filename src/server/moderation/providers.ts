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

export interface ModerationProviders {
  hash: HashMatchProvider;
  classifier: ClassifierProvider;
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

/**
 * Resolve the configured providers. Real providers slot in here (read creds from
 * the secret store) once LG6 is closed; until then, the stub.
 */
export function defaultProviders(): ModerationProviders {
  // TODO(LG6): when MODERATION_PROVIDER === 'real', return the IWF + Rekognition
  // providers built from credentials in the secret store.
  return { hash: stubHash, classifier: stubClassifier };
}

/** Go-live guard: true only when the REAL providers are configured. */
export function isModerationConfigured(): boolean {
  return process.env.MODERATION_PROVIDER === 'real';
}
