/**
 * A tiny fixed-window rate limiter, in memory, per server instance. A light first line against a
 * bot hammering a public form (it resets on a cold start, and each instance counts on its own) —
 * the durable limits live next to the data (e.g. the waitlist's per-inbox re-send throttle).
 * Keys are kept only for the length of the window; nothing is written anywhere.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = opts.maxKeys ?? 10_000;
  return {
    /** true = allowed (and counted); false = over the limit for this window. */
    take(key: string, now = Date.now()): boolean {
      const cur = hits.get(key);
      if (!cur || cur.resetAt <= now) {
        if (hits.size >= maxKeys) {
          for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
          if (hits.size >= maxKeys) hits.clear(); // never grow without bound
        }
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }
      if (cur.count >= opts.limit) return false;
      cur.count += 1;
      return true;
    },
  };
}
