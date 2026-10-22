import { describe, expect, it } from 'vitest';
import { parseEnvFile, redactor, refusalReason } from '../../../scripts/test-site/seed-env';

const FILE = `# TEST SITE settings — never commit
SITE_MODE=test
DATABASE_URL=postgres://postgres.abc:hunter2-very-secret@db.example.invalid:6543/postgres
S3_ENDPOINT=https://abc.supabase.co/storage/v1/s3   # the S3 connection
S3_BUCKET="snickerdoodle-test"
S3_ACCESS_KEY='AKIAEXAMPLEKEY'
S3_SECRET_KEY=s3cr3t/with+chars=
RESEND_API_KEY=
`;

describe('test-site seed script — settings, refusal, redaction', () => {
  it('parses the dotenv file (comments, quotes, trailing comments, empties)', () => {
    const s = parseEnvFile(FILE);
    expect(s.SITE_MODE).toBe('test');
    expect(s.S3_ENDPOINT).toBe('https://abc.supabase.co/storage/v1/s3');
    expect(s.S3_BUCKET).toBe('snickerdoodle-test');
    expect(s.S3_ACCESS_KEY).toBe('AKIAEXAMPLEKEY');
    expect(s.S3_SECRET_KEY).toBe('s3cr3t/with+chars=');
    expect(s.RESEND_API_KEY).toBe('');
  });

  it('refuses unless SITE_MODE=test — and the reason never carries a value', () => {
    const s = parseEnvFile(FILE);
    expect(refusalReason(s)).toBeNull();
    for (const mode of [undefined, '', 'production', 'TEST', 'live']) {
      const r = refusalReason({ ...s, SITE_MODE: mode as string });
      expect(r).toMatch(/SITE_MODE=test/);
    }
    const noDb = refusalReason({ ...s, DATABASE_URL: '' });
    expect(noDb).toMatch(/DATABASE_URL/);
    const noS3 = refusalReason({ ...s, S3_SECRET_KEY: '' });
    expect(noS3).toMatch(/S3_SECRET_KEY/);
    expect(noS3).not.toContain('AKIAEXAMPLEKEY');
  });

  it('scrubs every setting out of an error message before it is printed', () => {
    const s = parseEnvFile(FILE);
    const scrub = redactor(s);
    const msg = `connect failed for ${s.DATABASE_URL} (key ${s.S3_ACCESS_KEY}, secret ${s.S3_SECRET_KEY})`;
    const out = scrub(msg);
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('AKIAEXAMPLEKEY');
    expect(out).not.toContain('s3cr3t');
    // a connection string we didn't know about still loses its credentials
    expect(scrub('postgres://someone:pa55word@db.example:5432/x')).toBe('postgres://•••@db.example:5432/x');
  });
});
