import { existsSync, readFileSync } from 'node:fs';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { expect, type Page } from '@playwright/test';
import { sql } from './harness';

/**
 * Test-sweep 08 helpers (accounts, data rights, content safety, jobs). Test-only reach into the
 * LOCAL database + MinIO bucket the e2e server uses (from .env), and into the e2e server's log,
 * where the console mailer prints every email (E2E_SERVER_LOG = the path that server logs to).
 */

/** The e2e server's log, if the run says where it is (the console mailer prints emails there). */
export const serverLog = process.env.E2E_SERVER_LOG ?? '';
export const hasServerLog = Boolean(serverLog && existsSync(serverLog));

/** The newest email of `kind` to `to` that the console mailer printed (its text), polled until it shows up. */
export async function mailTo(to: string, kind: string, timeout = 20_000): Promise<string> {
  const head = `[${kind}] to ${to} `;
  let found = '';
  await expect
    .poll(
      () => {
        const log = readFileSync(serverLog, 'utf8');
        const i = log.lastIndexOf(head);
        if (i < 0) return '';
        const end = log.indexOf('└', i);
        found = log.slice(i, end < 0 ? undefined : end);
        return found;
      },
      { timeout },
    )
    .not.toBe('');
  return found;
}

/** The first link in an email's text. */
export const firstLink = (text: string) => /https?:\/\/\S+/.exec(text)?.[0] ?? '';

export const jobsSecret = () => process.env.JOBS_SECRET ?? '';

let _s3: S3Client | null = null;
const s3 = () =>
  (_s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'eu-west-2',
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
  }));

/** Every object key in the e2e bucket under a prefix (e.g. `assets/<id>/`). */
export async function objectKeys(prefix: string): Promise<string[]> {
  const out = await s3().send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix }));
  return (out.Contents ?? []).map((o) => o.Key!).filter(Boolean);
}

export async function accountId(email: string): Promise<string | null> {
  const [r] = await sql()`select id from accounts where email = ${email.toLowerCase()}`;
  return (r?.id as string) ?? null;
}

/** The asset id a guest's "+ keepsake" sent to /login?keep=… */
export function keepIdFrom(page: Page): string {
  return new URL(page.url()).searchParams.get('keep') ?? '';
}

export function readDotEnvLine(name: string): string {
  if (!existsSync('.env')) return '';
  const m = new RegExp(`^${name}=(.*)$`, 'm').exec(readFileSync('.env', 'utf8'));
  return m ? m[1]!.trim() : '';
}
