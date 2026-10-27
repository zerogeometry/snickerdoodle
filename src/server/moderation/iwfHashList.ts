/**
 * Known-CSAM check against a LOCALLY HELD copy of the IWF hash list (D8), matched in-process:
 * the picture never leaves the box for this check, and no one views it.
 *
 * Why local: IWF's integration details (Image Intercept / Hash List) are only shared with
 * members/eligible platforms at onboarding, so we don't guess at an API. This is the most
 * defensible design that works with any delivery method — IWF (or their tool) drops the
 * list on the box, a small sync step writes it in the format below, and we match against it.
 *
 * File format (one entry per line; blank lines and `#` comments ignored):
 *   md5:<32 hex>   sha1:<40 hex>   sha256:<64 hex>    (a bare hex hash is typed by its length)
 *
 * Limits (confirm with IWF at onboarding): cryptographic hashes only match the EXACT file
 * bytes, which is why we hash the bytes as uploaded (never our re-encoded copy). Perceptual
 * matching (PhotoDNA, licensed by Microsoft) is not included here.
 *
 * Fail-safe: a missing, unreadable, empty, malformed, stale or world-readable list THROWS,
 * and the gate turns that into FLAGGED (review) — never CLEAR, never BLOCKED.
 * The list is sensitive: nothing here ever logs or echoes an entry.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { HashMatchProvider } from './providers';

export type HashAlgo = 'md5' | 'sha1' | 'sha256';
const BYTES: Record<HashAlgo, number> = { md5: 16, sha1: 20, sha256: 32 };
const BY_HEX_LENGTH: Record<number, HashAlgo> = { 32: 'md5', 40: 'sha1', 64: 'sha256' };

/** IWF refreshes its list often; an old copy is treated as a failed check. */
export const DEFAULT_MAX_AGE_HOURS = 48;

export class HashListError extends Error {
  override name = 'HashListError';
}

/** Hashes of one type, sorted and packed end to end, for a binary search. */
type Packed = { width: number; count: number; data: Buffer };
type Loaded = { mtimeMs: number; size: number; lists: Partial<Record<HashAlgo, Packed>> };

/** Growable byte buffer — keeps ~3M hashes compact (no per-entry objects). */
class Bytes {
  data = Buffer.alloc(1 << 16);
  length = 0;
  push(b: Buffer) {
    if (this.length + b.length > this.data.length) {
      const next = Buffer.alloc(Math.max(this.data.length * 2, this.length + b.length));
      this.data.copy(next, 0, 0, this.length);
      this.data = next;
    }
    b.copy(this.data, this.length);
    this.length += b.length;
  }
}

function pack(raw: Bytes, width: number): Packed {
  const n = raw.length / width;
  const src = raw.data;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => src.compare(src, b * width, b * width + width, a * width, a * width + width)); // ascending
  const data = Buffer.alloc(n * width);
  let count = 0;
  for (let i = 0; i < n; i++) {
    const at = idx[i]! * width;
    if (count && src.compare(data, (count - 1) * width, count * width, at, at + width) === 0) continue; // dedupe
    src.copy(data, count * width, at, at + width);
    count++;
  }
  return { width, count, data };
}

function contains(p: Packed, digest: Buffer): boolean {
  let lo = 0;
  let hi = p.count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = p.data.compare(digest, 0, p.width, mid * p.width, mid * p.width + p.width);
    if (c === 0) return true;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

async function loadList(path: string, mtimeMs: number, size: number): Promise<Loaded> {
  const raw: Partial<Record<HashAlgo, Bytes>> = {};
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const colon = s.indexOf(':');
    const hex = (colon === -1 ? s : s.slice(colon + 1)).toLowerCase();
    const algo: HashAlgo | undefined = colon === -1 ? BY_HEX_LENGTH[hex.length] : (s.slice(0, colon).toLowerCase() as HashAlgo);
    // line number only — never the entry itself
    if (!algo || !(algo in BYTES) || hex.length !== BYTES[algo] * 2 || !/^[0-9a-f]+$/.test(hex)) {
      throw new HashListError(`hash list line ${lineNo} is not a recognised hash`);
    }
    (raw[algo] ??= new Bytes()).push(Buffer.from(hex, 'hex'));
  }
  const lists: Loaded['lists'] = {};
  for (const algo of Object.keys(raw) as HashAlgo[]) lists[algo] = pack(raw[algo]!, BYTES[algo]);
  if (!Object.values(lists).some((p) => p.count > 0)) throw new HashListError('hash list is empty');
  return { mtimeMs, size, lists };
}

export function localHashListProvider(opts: { path: string; maxAgeHours?: number; now?: () => Date }): HashMatchProvider & { entryCount(): Promise<number> } {
  const maxAgeMs = (opts.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS) * 3_600_000;
  const now = opts.now ?? (() => new Date());
  let current: Loaded | null = null;
  let loading: Promise<Loaded> | null = null;

  async function ensure(): Promise<Loaded> {
    let st;
    try {
      st = await stat(opts.path);
    } catch {
      throw new HashListError('hash list file is missing or unreadable');
    }
    if (!st.isFile()) throw new HashListError('hash list path is not a file');
    if (process.platform !== 'win32' && st.mode & 0o007) throw new HashListError('hash list must not be readable by other users (chmod 600)');
    if (now().getTime() - st.mtimeMs > maxAgeMs) throw new HashListError('hash list is out of date');
    if (current && current.mtimeMs === st.mtimeMs && current.size === st.size) return current;
    loading ??= loadList(opts.path, st.mtimeMs, st.size).finally(() => (loading = null));
    current = await loading;
    return current;
  }

  return {
    async isKnownIllegal({ buffer }) {
      const loaded = await ensure();
      for (const algo of Object.keys(loaded.lists) as HashAlgo[]) {
        if (contains(loaded.lists[algo]!, createHash(algo).update(buffer).digest())) return true;
      }
      return false;
    },
    /** For a health check: how many entries are loaded (never the entries). */
    async entryCount() {
      const loaded = await ensure();
      return Object.values(loaded.lists).reduce((n, p) => n + p.count, 0);
    },
  };
}
