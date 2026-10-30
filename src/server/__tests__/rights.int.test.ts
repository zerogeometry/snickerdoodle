import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import * as schema from '@/db/schema';
import { auditRecords, rightsRequests } from '@/db/schema';
import { SUPPORT_EMAIL } from '@/lib/support';
import { COMPLAINT_ACK_DAYS, COMPLAINTS_PER_EMAIL_PER_DAY, submitComplaint } from '@/server/rights';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/** The s.164A complaints channel: recorded with a due date, acknowledged on receipt, audited
 * without content, and not usable to spam someone else's inbox. */
describe.skipIf(!DB)('submitComplaint — data-protection complaints intake', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const email = `complainer-${randomUUID().slice(0, 8)}@example.test`;
  const made: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});

  beforeAll(() => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
  });
  afterEach(() => log.mockClear());
  afterAll(async () => {
    if (made.length) await db.delete(rightsRequests).where(inArray(rightsRequests.id, made));
    log.mockRestore();
    await client.end();
  });

  const send = (over: Partial<{ name: string; email: string; message: string }> = {}, env: Record<string, string> = {}) =>
    submitComplaint(db, { name: 'Alex Parent', email, message: 'You kept my drawing longer than you said you would.', ...over }, new Date(), env);

  it('records the complaint with a 30-day due date and acknowledges it by email straight away', async () => {
    const now = Date.now();
    const res = await send();
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ref).toMatch(/^C-[0-9A-F]{8}$/);

    const [row] = await db.select().from(rightsRequests).where(eq(rightsRequests.subjectEmail, email));
    made.push(row!.id);
    expect(row).toMatchObject({ type: 'COMPLAINT', status: 'RECEIVED', requesterName: 'Alex Parent' });
    expect(row!.details).toContain('longer than you said');
    expect(row!.dueAt!.getTime() - row!.receivedAt.getTime()).toBe(COMPLAINT_ACK_DAYS * 86_400_000);
    expect(row!.complaintAckAt!.getTime()).toBeGreaterThanOrEqual(now - 1000);

    const mailed = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(mailed).toContain('[complaint-ack]');
    expect(mailed).toContain(email);
    expect(mailed).toContain(res.ref);

    // audited, but the complaint's words never enter the audit trail
    const [audit] = await db.select().from(auditRecords).where(eq(auditRecords.targetId, row!.id));
    expect(audit!.event).toBe('RIGHTS_REQUEST_RECEIVED');
    expect(JSON.stringify(audit!.metadata)).not.toContain('drawing');
  });

  it('tells the privacy inbox there is a new one — reference only, not the content', async () => {
    const res = await send({}, { PRIVACY_INBOX: 'privacy@example.test' });
    expect(res.ok).toBe(true);
    const rows = await db.select({ id: rightsRequests.id }).from(rightsRequests).where(eq(rightsRequests.subjectEmail, email));
    made.push(...rows.map((r) => r.id).filter((id) => !made.includes(id)));
    const internal = log.mock.calls.map((c) => String(c[0])).find((t) => t.includes('[rights-request]'));
    expect(internal).toBeDefined();
    expect(internal).toContain('privacy@example.test');
    expect(internal).not.toContain('longer than you said');
  });

  it('08-B12: with no privacy inbox set, the team is still told — at support@', async () => {
    const other = `complainer-${randomUUID().slice(0, 8)}@example.test`;
    log.mockClear();
    const res = await send({ email: other }, {});
    expect(res.ok).toBe(true);
    const rows = await db.select({ id: rightsRequests.id }).from(rightsRequests).where(eq(rightsRequests.subjectEmail, other));
    made.push(...rows.map((r) => r.id));
    const internal = log.mock.calls.map((c) => String(c[0])).find((t) => t.includes('[rights-request]'));
    expect(internal).toBeDefined();
    expect(internal).toContain(SUPPORT_EMAIL);
    expect(internal).not.toContain('longer than you said');
  });

  it('refuses an unusable submission', async () => {
    expect(await send({ email: 'not-an-email' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await send({ name: '   ' })).toEqual({ ok: false, reason: 'invalid' });
    expect(await send({ message: 'short' })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('caps complaints per email per day (the ack can’t be used to spam an inbox)', async () => {
    // two already recorded above; fill up to the cap, then the next is refused
    for (let i = 2; i < COMPLAINTS_PER_EMAIL_PER_DAY; i++) expect((await send()).ok).toBe(true);
    expect(await send()).toEqual({ ok: false, reason: 'too-many' });
    const rows = await db.select({ id: rightsRequests.id }).from(rightsRequests).where(eq(rightsRequests.subjectEmail, email));
    made.push(...rows.map((r) => r.id).filter((id) => !made.includes(id)));
    expect(rows).toHaveLength(COMPLAINTS_PER_EMAIL_PER_DAY);
  });
});
