/**
 * The pure, testable half of scripts/test-site/seed.ts: read `.env.test-site`, decide whether
 * it's safe to seed, and scrub settings out of any text before it's printed.
 */

/** Parse a dotenv file: KEY=VALUE lines, `#` comments, optional quotes, trailing ` # comment`. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2]!;
    const q = value[0];
    if ((q === '"' || q === "'") && value.lastIndexOf(q) > 0) {
      value = value.slice(1, value.lastIndexOf(q));
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]!] = value;
  }
  return out;
}

/** Why seeding must NOT go ahead, or null when it's safe. Never includes a setting's value. */
export function refusalReason(settings: Record<string, string>): string | null {
  if (settings.SITE_MODE !== 'test') return '.env.test-site must say SITE_MODE=test — this script only ever seeds the test site';
  if (!settings.DATABASE_URL) return 'DATABASE_URL is empty in .env.test-site';
  const missingS3 = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'].filter((k) => !settings[k]);
  if (missingS3.length) return `missing in .env.test-site: ${missingS3.join(', ')}`;
  return null;
}

/** A function that replaces every setting value (and any URL credentials) in a message with •••. */
export function redactor(settings: Record<string, string>): (text: string) => string {
  // longest first, so a value that contains another is scrubbed whole
  const secrets = Object.values(settings)
    .filter((v) => v.length >= 6 && v !== 'test' && v !== 'true' && v !== 'false')
    .sort((a, b) => b.length - a.length);
  return (text: string) => {
    let out = text;
    for (const s of secrets) out = out.split(s).join('•••');
    // belt and braces: user:password@ in any URL-ish string
    return out.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1•••@');
  };
}
