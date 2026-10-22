/**
 * Small, bounded, in-process caches for the mockup compositor — so a thumb, its zoom and a colour
 * flip reuse work instead of repeating it. No dependencies, no I/O: just memory, with a byte budget
 * (least-recently-used out first) and an optional idle lifetime.
 *
 * Two kinds of thing live here, and they are treated differently:
 *  - TEMPLATE layers (product photo, mask, overlay — brand-safe, NON-child, immutable per key):
 *    kept until the byte budget pushes them out.
 *  - PRINTED FACES (the repeat pattern / the height chart, made from a child's drawing): kept only
 *    briefly (an idle lifetime of minutes), only reached AFTER the caller's authz check, keyed by
 *    the exact source object + its content hash, and dropped the moment the asset is erased
 *    (eraseAsset → forgetAssetPreviews). Never sent anywhere; never written to disk.
 */
export class ByteLru<T> {
  private readonly entries = new Map<string, { value: Promise<T>; bytes: number; at: number }>();
  private total = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly sizeOf: (v: T) => number,
    /** Drop an entry not used for this long (ms). 0 = no idle lifetime. */
    private readonly idleMs = 0,
    private readonly now: () => number = Date.now,
  ) {}

  /** The cached value for `key`, or make it (once — concurrent callers share the same promise). */
  get(key: string, make: () => Promise<T>): Promise<T> {
    this.expire();
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key); // re-insert as newest
      hit.at = this.now();
      this.entries.set(key, hit);
      return hit.value;
    }
    const entry = { value: make(), bytes: 0, at: this.now() };
    this.entries.set(key, entry);
    entry.value.then(
      (v) => {
        if (this.entries.get(key) !== entry) return; // dropped (or replaced) while it was being made
        entry.bytes = this.sizeOf(v);
        this.total += entry.bytes;
        this.evict(entry);
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key); // never cache a failure
      },
    );
    return entry.value;
  }

  /** Drop every entry whose key starts with `prefix`. */
  forget(prefix: string): void {
    for (const [k, e] of this.entries) if (k.startsWith(prefix)) this.drop(k, e);
  }

  clear(): void {
    this.entries.clear();
    this.total = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.total;
  }

  private drop(key: string, e: { bytes: number }): void {
    this.entries.delete(key);
    this.total -= e.bytes;
  }

  private evict(keep: unknown): void {
    for (const [k, e] of this.entries) {
      if (this.total <= this.maxBytes) break;
      if (e === keep) continue;
      this.drop(k, e);
    }
    // a single value bigger than the whole budget isn't kept either
    if (this.total > this.maxBytes) for (const [k, e] of this.entries) if (e === keep) this.drop(k, e);
  }

  private expire(): void {
    if (!this.idleMs) return;
    const cutoff = this.now() - this.idleMs;
    for (const [k, e] of this.entries) if (e.at < cutoff) this.drop(k, e);
  }
}

/** A printed face (raw pixels) per source object + product geometry + placement + base colour. */
export const FACE_IDLE_MS = 10 * 60 * 1000;
export const faceCache = new ByteLru<{ data: Buffer; width: number; height: number; channels: 1 | 2 | 3 | 4 }>(96 * 1024 * 1024, (f) => f.data.byteLength, FACE_IDLE_MS);

/** Erasing an asset drops anything made from it here at once (the idle lifetime is the backstop). */
export function forgetAssetPreviews(assetId: string): void {
  faceCache.forget(`${assetId}|`);
}
