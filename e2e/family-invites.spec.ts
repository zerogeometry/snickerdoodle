import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import { clearForTest, hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * Test sweep 2026-10-29, tester 04 — FAMILY, INVITES AND NOTIFICATIONS, through the real pages with
 * one browser context per person: the controlling parent, a second parent (Family circle · can add),
 * a grandparent (Extended · view only), an aunt (Extended · view & buy), a stranger from another
 * family, and a signed-out guest.
 *
 * Emails: the e2e server runs MAIL_PROVIDER=console, so every email is printed to the server's log.
 * Point SWEEP_SERVER_LOG at that log (the server's stdout) to have the test read the real invite and
 * sign-in emails — who each went to, what it says, and the link inside it. Without it the test reads
 * tokens from the database and skips the email checks.
 *
 * Report: reports/test-sweep-2026-10-29/04-family-invites.md (bug ids 04-Bn).
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the local test database) to sign people in');

const SHOTS = 'reports/test-sweep-2026-10-29/shots/04';
const LOG = process.env.SWEEP_SERVER_LOG ?? '';
const haveLog = !!LOG && existsSync(LOG);

type Mail = { kind: string; to: string; subject: string; body: string };
/** Every email the console mailer has printed so far. */
function mails(): Mail[] {
  if (!haveLog) return [];
  const out: Mail[] = [];
  const text = readFileSync(LOG, 'utf8');
  const re = /│ ✉️ {2}\[([a-z-]+)\] to (\S+) — (.*)\n((?:│.*\n)*?)└/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ kind: m[1]!, to: m[2]!, subject: m[3]!.replace(/ \(reply to .*\)$/, ''), body: m[4]!.split('\n').map((l) => l.replace(/^│ ?/, '')).join('\n') });
  }
  return out;
}
const mailsTo = (email: string, kind?: string) => mails().filter((m) => m.to === email.toLowerCase() && (!kind || m.kind === kind));
const linkIn = (m: Mail, re: RegExp) => re.exec(m.body)?.[0] ?? null;

async function drawing(fill: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000"><rect x="300" y="300" width="1400" height="1400" rx="200" fill="${fill}"/><circle cx="1000" cy="900" r="300" fill="#F6C445"/></svg>`;
  return sharp({ create: { width: 2000, height: 2000, channels: 4, background: { r: 251, g: 245, b: 233, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

async function person(browser: Browser, viewport = { width: 1280, height: 800 }): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await quietCookies(page);
  return { ctx, page };
}

/** The asset ids that appear anywhere in this page's HTML (signed image links carry the asset id). */
async function assetIdsOn(page: Page, ids: string[]): Promise<string[]> {
  const html = await page.content();
  return ids.filter((id) => html.includes(id));
}

/** Open a sheet from a button, retrying until the page has hydrated. */
async function openSheet(page: Page, button: ReturnType<Page['getByRole']>) {
  await expect(async () => {
    await button.click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

test('family: invites → verify → join at the chosen circle/access; who sees what; change, remove, re-invite; emails + audit', async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(SHOTS, { recursive: true });

  const E = {
    parent: testEmail('parent'),
    co: testEmail('coparent'),
    granny: testEmail('granny'),
    aunt: testEmail('aunt'),
    friend: testEmail('friend'),
    resend: testEmail('resend'),
    expired: testEmail('expired'),
    stranger: testEmail('stranger'),
  };

  // ── the controlling parent keeps three drawings, names the family, adds a little one ──────────────
  const P = await person(browser);
  await signInByEmailLink(P.page, E.parent, '/start-creating');
  for (const fill of ['#C8402A', '#2F5DA8', '#7FA65E']) {
    await uploadAndOpenRange(P.page, await drawing(fill));
    await expect(P.page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 90_000 });
    await P.page.getByRole('button', { name: /\+ keepsake/ }).click();
    await expect(P.page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
    await P.page.getByRole('button', { name: 'create another' }).click();
  }
  await clearForTest(E.parent);
  const { family_id: familyId } = (await sql()`select m.family_id from memberships m join accounts a on a.id = m.account_id where a.email = ${E.parent} and m.is_owner`)[0]!;
  const kept = await sql()`select id, visibility from assets where family_id = ${familyId} and kept_in_home order by created_at desc`;
  expect(kept).toHaveLength(3);
  expect(kept.every((k) => k.visibility === 'FAMILY')).toBe(true); // privacy by default
  const [onlyMeId, extendedId, familyOnlyId] = kept.map((k) => k.id as string) as [string, string, string];
  const allIds = [onlyMeId, extendedId, familyOnlyId];

  await test.step('the parent sets visibility through the keepsake sheet (newest → only me, next → extended)', async () => {
    await P.page.goto('/home');
    const tiles = P.page.getByRole('button', { name: 'choose who can see this keepsake' });
    await expect(tiles).toHaveCount(3);
    await openSheet(P.page, tiles.nth(0));
    const sheet = P.page.getByRole('dialog');
    await expect(sheet.getByText('Who can see this keepsake?')).toBeVisible();
    await sheet.getByRole('button', { name: /^Only me/ }).click();
    await sheet.getByRole('button', { name: 'done' }).click();
    await expect(P.page.getByText('visibility set to only me')).toBeVisible();
    await tiles.nth(1).click();
    await P.page.getByRole('dialog').getByRole('button', { name: /^Extended family/ }).click();
    await P.page.getByRole('dialog').getByRole('button', { name: 'done' }).click();
    await expect(P.page.getByText('visibility set to extended')).toBeVisible();
    const vis = await sql()`select id, visibility from assets where id in ${sql()(allIds)}`;
    expect(Object.fromEntries(vis.map((v) => [v.id, v.visibility]))).toEqual({ [onlyMeId]: 'ONLY_ME', [extendedId]: 'EXTENDED', [familyOnlyId]: 'FAMILY' });
    const audits = await sql()`select metadata from audit_records where event = 'ASSET_VISIBILITY_CHANGED' and target_id in ${sql()(allIds)}`;
    expect(audits).toHaveLength(2);

    await P.page.getByRole('button', { name: 'rename your family' }).click();
    await P.page.getByLabel('family name').fill('The Sweepers');
    await P.page.getByLabel('family name').press('Enter');
    await expect(P.page.getByText('family name updated')).toBeVisible();
  });

  await test.step('a little one: first name only — a surname is refused', async () => {
    await P.page.goto('/family');
    await openSheet(P.page, P.page.getByRole('button', { name: 'add a little one' }));
    const sheet = P.page.getByRole('dialog');
    await sheet.getByPlaceholder('First name').fill('Olivia Sweeper');
    await sheet.getByRole('button', { name: 'add to family' }).click();
    await expect(sheet.getByRole('alert')).toContainText('just their first name');
    await sheet.getByPlaceholder('First name').fill('Olivia');
    await sheet.getByRole('button', { name: 'add to family' }).click();
    await expect(P.page.getByText('Olivia is in the family ✦')).toBeVisible();
    const kids = await sql()`select first_name from children where family_id = ${familyId}`;
    expect(kids.map((k) => k.first_name)).toEqual(['Olivia']);
  });

  async function invite(rowIndex: 0 | 1, email: string, opts: { rel?: string; access: 'view only' | 'view & buy' | 'view, buy & add'; calendar?: boolean }) {
    await P.page.goto('/family');
    const sheet = P.page.getByRole('dialog');
    // 0 = family-circle row (opens on Parent), 1 = extended row (opens on Grandparent); retried until hydrated
    await expect(async () => {
      await P.page.getByRole('button', { name: 'invite', exact: true }).nth(rowIndex).click();
      await expect(sheet).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await sheet.getByPlaceholder('First name').fill(email.split('@')[0]!);
    if (opts.rel) await sheet.getByRole('button', { name: opts.rel, exact: true }).click();
    await sheet.getByPlaceholder('their email').fill(email);
    await sheet.getByRole('combobox').selectOption({ label: opts.access });
    if (opts.calendar === false) await sheet.getByRole('checkbox').uncheck();
    await sheet.getByRole('button', { name: 'send invite' }).click();
    await expect(P.page.getByText(/invite sent to/)).toBeVisible();
    const [inv] = await sql()`select id, token, circle, access_level, share_occasions from invites where email = ${email} and family_id = ${familyId} order by created_at desc limit 1`;
    return inv!;
  }

  const inv = {
    co: await invite(0, E.co, { access: 'view, buy & add' }),
    granny: await invite(1, E.granny, { access: 'view only' }),
    aunt: await invite(1, E.aunt, { rel: 'Aunt / uncle', access: 'view & buy', calendar: false }),
    friend: await invite(1, E.friend, { rel: 'Close friend', access: 'view only' }),
    resend: await invite(1, E.resend, { access: 'view only' }),
    expired: await invite(1, E.expired, { access: 'view only' }),
  };

  await test.step('the invite rows hold exactly what the parent chose (circle from the relationship)', async () => {
    expect(inv.co).toMatchObject({ circle: 'FAMILY', access_level: 'CONTRIBUTE', share_occasions: true });
    expect(inv.granny).toMatchObject({ circle: 'EXTENDED', access_level: 'VIEW', share_occasions: true });
    expect(inv.aunt).toMatchObject({ circle: 'EXTENDED', access_level: 'VIEW_BUY', share_occasions: false });
    await P.page.goto('/family');
    await expect(P.page.getByText('invited · 14d left').first()).toBeVisible();
    await shot(P.page, 'family-owner-desktop-pending-invites');
  });

  await test.step('invite emails: one each, to the invitee only, a private 14-day link, no child data', async () => {
    test.skip(!haveLog, 'SWEEP_SERVER_LOG not set');
    for (const [who, email] of Object.entries({ co: E.co, granny: E.granny, aunt: E.aunt })) {
      const m = mailsTo(email, 'family-invite');
      expect(m, who).toHaveLength(1);
      expect(m[0]!.subject).toBe('you’re invited to a family keepsake box');
      expect(linkIn(m[0]!, /http:\/\/localhost:\d+\/join\/[A-Za-z0-9_-]+/)).toBe(`${new URL(P.page.url()).origin}/join/${inv[who as 'co'].token}`);
      expect(m[0]!.body).toContain('lasts 14 days');
      expect(m[0]!.body).not.toMatch(/Olivia|Sweeper/); // no child name, no surname
    }
    expect(mailsTo(E.parent, 'family-invite')).toHaveLength(0);
  });

  await test.step('cancel one invite, resend another (the old link stops working)', async () => {
    await P.page.goto('/family');
    await P.page.getByRole('button', { name: `cancel the invite to ${E.friend}` }).click();
    await expect(P.page.getByText(/cancelled — the link no longer works/)).toBeVisible();
    await P.page.getByRole('button', { name: `send the invite to ${E.resend} again` }).click();
    await expect(P.page.getByText(/sent again to .* a fresh link, good for 14 days/)).toBeVisible();
    await sql()`update invites set expires_at = now() - interval '1 minute' where id = ${inv.expired.id}`;
  });

  // ── the bad links: every one lands on a calm dead end, nobody joins ─────────────────────────────
  const G = await person(browser, { width: 390, height: 844 });
  await test.step('tampered / revoked / resent-old / expired links', async () => {
    await G.page.goto(`/join/${inv.co.token}x`);
    await expect(G.page.getByRole('heading', { level: 1 })).toHaveText(/This invite link isn.t valid/);
    await shot(G.page, 'join-tampered-mobile');
    await G.page.goto(`/join/${inv.resend.token}`); // the pre-resend token
    await expect(G.page.getByRole('heading', { level: 1 })).toHaveText(/This invite link isn.t valid/);
    await G.page.goto(`/join/${inv.friend.token}`); // revoked
    await expect(G.page.getByRole('heading', { level: 1 })).toHaveText('This invite has already been used');
    await expect(G.page.getByText(/It.s already been accepted./)).toBeVisible(); // 04-B5: says "accepted" for a CANCELLED invite
    await shot(G.page, 'join-revoked-mobile');
    await G.page.goto(`/join/${inv.expired.token}`);
    await expect(G.page.getByRole('heading', { level: 1 })).toHaveText('This invite has already been used'); // 04-B5: an expired one says "already been used"
    await expect(G.page.getByText('It expired.')).toBeVisible();
    await shot(G.page, 'join-expired-mobile');
    const { n } = (await sql()`select count(*)::int n from memberships m join accounts a on a.id = m.account_id where a.email in ${sql()([E.friend, E.resend, E.expired])}`)[0]!;
    expect(n).toBe(0);
    if (haveLog) {
      const fresh = mailsTo(E.resend, 'family-invite');
      expect(fresh).toHaveLength(2);
      expect(fresh[1]!.subject).toBe('a little reminder: you’re invited to a family keepsake box');
      const { token } = (await sql()`select token from invites where id = ${inv.resend.id}`)[0]!;
      expect(fresh[1]!.body).toContain(`/join/${token}`);
    }
  });

  // ── joining: the invitee proves the address by the one-tap email link ───────────────────────────
  async function join(page: Page, email: string, token: string) {
    await page.goto(`/join/${token}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join The Sweepers');
    if (haveLog) {
      const before = mailsTo(email, 'magic-link').length;
      await page.getByRole('button', { name: `email ${email}` }).click();
      await expect(page.getByRole('status')).toContainText(`Check ${email} for a link`);
      await expect.poll(() => mailsTo(email, 'magic-link').length).toBe(before + 1);
      const m = mailsTo(email, 'magic-link').at(-1)!;
      expect(m.subject).toBe('your one-tap link to snickerdoodle');
      expect(m.body).toContain('it works once, for the next hour');
      const url = linkIn(m, /http:\/\/localhost:\d+\/api\/auth\/callback\/email\?\S+/)!;
      expect(decodeURIComponent(url)).toContain(`/join/${token}`);
      await page.goto(url); // the real link from the real email
    } else {
      await signInByEmailLink(page, email, `/join/${token}`);
    }
    await expect(page).toHaveURL(/\/home\?joined=1/);
  }

  const S = await person(browser);
  await test.step('a stranger signed in elsewhere can’t take someone else’s invite', async () => {
    await signInByEmailLink(S.page, E.stranger, '/home');
    await S.page.goto(`/join/${inv.aunt.token}`);
    await expect(S.page.getByRole('heading', { level: 1 })).toHaveText('This invite is for someone else');
    await expect(S.page.getByRole('button', { name: `sign in as ${E.aunt}` })).toBeVisible();
    await shot(S.page, 'join-wrong-account-desktop');
    const { status } = (await sql()`select status from invites where id = ${inv.aunt.id}`)[0]!;
    expect(status).toBe('PENDING');
  });

  const C = await person(browser, { width: 390, height: 844 });
  const Gr = await person(browser);
  const A = await person(browser, { width: 390, height: 844 });
  await test.step('three people join, each at exactly the circle + access chosen', async () => {
    await C.page.goto(`/join/${inv.co.token}`);
    await shot(C.page, 'join-invited-mobile');
    await join(C.page, E.co, inv.co.token);
    await join(Gr.page, E.granny, inv.granny.token);
    await join(A.page, E.aunt, inv.aunt.token);
    const rows = await sql()`select a.email, m.circle, m.access_level, m.status, m.is_owner, m.sees_occasions from memberships m join accounts a on a.id = m.account_id where m.family_id = ${familyId} and not m.is_owner`;
    const by = Object.fromEntries(rows.map((r) => [r.email, r]));
    expect(by[E.co]).toMatchObject({ circle: 'FAMILY', access_level: 'CONTRIBUTE', status: 'ACTIVE', sees_occasions: true });
    expect(by[E.granny]).toMatchObject({ circle: 'EXTENDED', access_level: 'VIEW', status: 'ACTIVE', sees_occasions: true });
    expect(by[E.aunt]).toMatchObject({ circle: 'EXTENDED', access_level: 'VIEW_BUY', status: 'ACTIVE', sees_occasions: false });
    // single use: the co-parent's link, opened again, is spent
    await C.page.goto(`/join/${inv.co.token}`);
    await expect(C.page.getByRole('heading', { level: 1 })).toHaveText('This invite has already been used');
  });

  await test.step('who sees what in the keepsake home (only me < family < extended; strangers nothing)', async () => {
    const seen: Record<string, string[]> = {};
    for (const [who, page] of Object.entries({ parent: P.page, co: C.page, granny: Gr.page, aunt: A.page, stranger: S.page })) {
      await page.goto(`/home?family=${familyId}`);
      await expect(page.locator('main')).toBeVisible();
      seen[who] = await assetIdsOn(page, allIds);
    }
    expect(seen.parent!.sort()).toEqual([...allIds].sort());
    expect(seen.co!.sort()).toEqual([extendedId, familyOnlyId].sort());
    expect(seen.granny).toEqual([extendedId]);
    expect(seen.aunt).toEqual([extendedId]);
    expect(seen.stranger).toEqual([]);
    await shot(C.page, 'home-coparent-mobile');
    await shot(Gr.page, 'home-granny-desktop');
    // a signed-out guest is sent to sign in
    await G.page.goto(`/home?family=${familyId}`);
    await expect(G.page).toHaveURL(/\/login/);
    // a relative never gets the parent's controls on a keepsake
    await expect(C.page.getByRole('button', { name: 'choose who can see this keepsake' })).toHaveCount(0);
  });

  await test.step('product previews (/api/mockup) render a keepsake only for people who may see it', async () => {
    const { variant_id: variantId } = (await sql()`select pt.variant_id from print_templates pt join product_variants pv on pv.id = pt.variant_id join products p on p.id = pv.product_id where p.key = 'mug' and pv.is_default limit 1`)[0]!;
    const preview = async (page: Page, assetId: string) =>
      (await (await page.request.post('/api/mockup', { data: { assetId, variantId, transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } })).json()).ok === true;
    const grid: Record<string, boolean[]> = {};
    for (const [who, page] of Object.entries({ parent: P.page, co: C.page, granny: Gr.page, stranger: S.page, guest: G.page })) {
      grid[who] = [];
      for (const id of [onlyMeId, familyOnlyId, extendedId]) grid[who]!.push(await preview(page, id));
    }
    //                  only me, family, extended
    expect(grid.parent).toEqual([true, true, true]);
    expect(grid.co).toEqual([false, true, true]);
    expect(grid.granny).toEqual([false, false, true]);
    expect(grid.stranger).toEqual([false, false, false]);
    expect(grid.guest).toEqual([false, false, false]);
  });

  await test.step('the "start from a keepsake" picker shows each person only what they may see', async () => {
    const pick = async (page: Page) => {
      await page.goto('/start-creating');
      const section = page.getByRole('region', { name: /or start from a keepsake/ });
      await expect(section.or(page.getByRole('button', { name: /upload a drawing/i }))).toBeVisible();
      await page.waitForTimeout(1500);
      return assetIdsOn(page, allIds);
    };
    expect((await pick(P.page)).sort()).toEqual([...allIds].sort());
    expect((await pick(C.page)).sort()).toEqual([extendedId, familyOnlyId].sort());
    expect(await pick(Gr.page)).toEqual([extendedId]);
    expect(await pick(S.page)).toEqual([]);
  });

  await test.step('birthdays: shared with the granny (calendar ticked), not with the aunt (unticked)', async () => {
    await sql()`update children set birthday = '2021-03-14' where family_id = ${familyId}`;
    await Gr.page.goto(`/home?family=${familyId}`);
    const grannyHtml = await Gr.page.content();
    await A.page.goto(`/home?family=${familyId}`);
    const auntHtml = await A.page.content();
    expect(grannyHtml).toContain('2021-03-14');
    expect(auntHtml).not.toContain('2021-03-14');
    expect(auntHtml).toContain('Olivia'); // first names only
  });

  await test.step('the parent changes the granny’s circle + access; it bites on her next page', async () => {
    await P.page.goto('/family');
    const grannyName = E.granny.split('@')[0]!;
    await openSheet(P.page, P.page.getByRole('button', { name: `${grannyName}: what they can see and do` }));
    const sheet = P.page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'Family', exact: true }).click();
    await expect.poll(async () => (await sql()`select m.circle from memberships m join accounts a on a.id = m.account_id where a.email = ${E.granny} and m.family_id = ${familyId}`)[0]!.circle).toBe('FAMILY');
    await sheet.getByRole('button', { name: 'view & buy', exact: true }).click();
    await expect.poll(async () => (await sql()`select m.access_level from memberships m join accounts a on a.id = m.account_id where a.email = ${E.granny} and m.family_id = ${familyId}`)[0]!.access_level).toBe('VIEW_BUY');
    await shot(P.page, 'manage-member-desktop');
    await Gr.page.goto(`/home?family=${familyId}`);
    expect((await assetIdsOn(Gr.page, allIds)).sort()).toEqual([extendedId, familyOnlyId].sort());
    // back down to Extended · view
    await sheet.getByRole('button', { name: 'Extended', exact: true }).click();
    await sheet.getByRole('button', { name: 'view', exact: true }).click();
    await expect.poll(async () => (await sql()`select m.circle, m.access_level from memberships m join accounts a on a.id = m.account_id where a.email = ${E.granny} and m.family_id = ${familyId}`)[0]).toMatchObject({ circle: 'EXTENDED', access_level: 'VIEW' });
    await Gr.page.goto(`/home?family=${familyId}`);
    expect(await assetIdsOn(Gr.page, allIds)).toEqual([extendedId]);
  });

  await test.step('removing the aunt: her open session gets nothing on the very next request', async () => {
    await P.page.goto('/family');
    await openSheet(P.page, P.page.getByRole('button', { name: `${E.aunt.split('@')[0]}: what they can see and do` }));
    await P.page.getByRole('dialog').getByRole('button', { name: 'remove from family' }).click();
    await P.page.getByRole('dialog').getByRole('button', { name: 'yes, remove' }).click();
    await expect.poll(async () => (await sql()`select m.status from memberships m join accounts a on a.id = m.account_id where a.email = ${E.aunt} and m.family_id = ${familyId}`)[0]!.status).toBe('REMOVED');
    await A.page.goto(`/home?family=${familyId}`);
    await expect(A.page).toHaveURL(/\/login/); // signed out everywhere
    const { n } = (await sql()`select count(*)::int n from sessions s join accounts a on a.id = s.user_id where a.email = ${E.aunt}`)[0]!;
    expect(n).toBe(0);
  });

  await test.step('re-inviting after removal: a fresh invite, a fresh join', async () => {
    const again = await invite(1, E.aunt, { rel: 'Aunt / uncle', access: 'view only' });
    await join(A.page, E.aunt, again.token);
    const rows = await sql()`select m.status, m.circle, m.access_level from memberships m join accounts a on a.id = m.account_id where a.email = ${E.aunt} and m.family_id = ${familyId} order by m.created_at`;
    expect(rows.map((r) => r.status)).toEqual(['REMOVED', 'ACTIVE']);
    expect(rows[1]).toMatchObject({ circle: 'EXTENDED', access_level: 'VIEW' });
    await A.page.goto(`/home?family=${familyId}`);
    expect(await assetIdsOn(A.page, allIds)).toEqual([extendedId]);
  });

  await test.step('the audit log holds every family event', async () => {
    const rows = await sql()`select event, count(*)::int n from audit_records where family_id = ${familyId} group by event`;
    const n = Object.fromEntries(rows.map((r) => [r.event, r.n]));
    expect(n.INVITE_SENT).toBe(8); // 6 invites + 1 resend + the re-invite
    expect(n.INVITE_REVOKED).toBe(1);
    expect(n.INVITE_ACCEPTED).toBe(4);
    expect(n.MEMBERSHIP_CREATED).toBe(4);
    expect(n.MEMBERSHIP_CIRCLE_CHANGED).toBe(2);
    expect(n.MEMBERSHIP_ACCESS_CHANGED).toBe(2);
    expect(n.MEMBER_REMOVED).toBe(1);
    expect(n.ASSET_VISIBILITY_CHANGED).toBe(2);
    expect(n.CHILD_ADDED).toBe(1);
    expect(n.FAMILY_RENAMED).toBe(1);
    // nothing about this family was emailed to the stranger, ever
    if (haveLog) expect(mailsTo(E.stranger).filter((m) => m.kind !== 'magic-link')).toHaveLength(0);
  });

  for (const p of [P, G, S, C, Gr, A]) await p.ctx.close();
});

/**
 * 04-B2 (P1) — "view only" is not enforced. Observed 2026-10-29 (probe run): a grandparent joined at
 * Extended · VIEW picked the parent's Extended keepsake under "or start from a keepsake", made socks,
 * checked out — the server created order SNK-377806 (PENDING, £19, the parent's asset) and sent them to
 * Stripe's test checkout. canBuyFromGiftList() (src/authz/actions.ts) is never called outside tests;
 * placeOrder (src/server/orders.ts ~L171) only checked canViewAsset. Fixed: canBuyAsset (src/authz).
 */
test('04-B2: a VIEW-only relative cannot order a family keepsake', async ({ browser }) => {
  test.setTimeout(400_000);
  const parent = testEmail('vb-parent');
  const granny = testEmail('vb-granny');
  const P = await person(browser);
  await signInByEmailLink(P.page, parent, '/start-creating');
  await uploadAndOpenRange(P.page);
  await expect(P.page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 90_000 });
  await P.page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(P.page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  await clearForTest(parent);
  const { family_id: familyId, id: parentId } = (await sql()`select m.family_id, a.id from memberships m join accounts a on a.id = m.account_id where a.email = ${parent} and m.is_owner`)[0]!;
  await sql()`update assets set visibility = 'EXTENDED' where family_id = ${familyId}`;
  const token = `vb${Date.now().toString(36)}`;
  await sql()`insert into invites (family_id, created_by_account_id, email, relationship, circle, access_level, token, status, expires_at) values (${familyId}, ${parentId}, ${granny}, 'GRANDPARENT', 'EXTENDED', 'VIEW', ${token}, 'PENDING', now() + interval '1 day')`;

  const G = await person(browser);
  await G.page.route(/checkout\.stripe\.com/, (r) => r.abort());
  await signInByEmailLink(G.page, granny, `/join/${token}`);
  await G.page.goto('/start-creating');
  await G.page.getByRole('button', { name: /real$/ }).first().click();
  await expect(G.page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible({ timeout: 60_000 });
  await G.page.getByRole('button', { name: 'customize socks', exact: true }).click();
  await G.page.getByRole('button', { name: /add to basket/i }).click();
  await G.page.goto('/checkout');
  await G.page.locator('aside').getByRole('button', { name: /^checkout$/i }).first().click();
  await G.page.waitForTimeout(8000);
  const orders = await sql()`select o.id from orders o join accounts a on a.id = o.account_id where a.email = ${granny}`;
  expect(orders).toHaveLength(0); // refused: VIEW is look-only
});

/**
 * 04-B3 (P2) — "view, buy & add" doesn't add to the family. Observed 2026-10-29 (probe run): a second
 * parent joined at Family · CONTRIBUTE uploaded a drawing and tapped "+ keepsake"; it was filed into a
 * NEW family they own (ensureHomeFamily in keepAndFileCreations / keepCreation), not the family they
 * joined — the controlling parent never sees it. Un-fixme when fixed.
 */
test.fixme('04-B3: a CONTRIBUTE member’s kept drawing lands in the family they joined', async ({ browser }) => {
  test.setTimeout(400_000);
  const parent = testEmail('cb-parent');
  const co = testEmail('cb-co');
  const P = await person(browser);
  await signInByEmailLink(P.page, parent, '/family');
  const { family_id: familyId, id: parentId } = (await sql()`select m.family_id, a.id from memberships m join accounts a on a.id = m.account_id where a.email = ${parent} and m.is_owner`)[0]!;
  const token = `cb${Date.now().toString(36)}`;
  await sql()`insert into invites (family_id, created_by_account_id, email, relationship, circle, access_level, token, status, expires_at) values (${familyId}, ${parentId}, ${co}, 'PARENT', 'FAMILY', 'CONTRIBUTE', ${token}, 'PENDING', now() + interval '1 day')`;
  const C = await person(browser);
  await signInByEmailLink(C.page, co, `/join/${token}`);
  await uploadAndOpenRange(C.page);
  await expect(C.page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 90_000 });
  await C.page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(C.page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  const rows = await sql()`select a.family_id from assets a join accounts acc on acc.id = a.uploader_account_id where acc.email = ${co} and a.kept_in_home`;
  expect(rows.map((r) => r.family_id)).toEqual([familyId]); // FAILS today: it's in the co-parent's own new family
});

test('profile pictures + the family banner: family members only — a stranger, a signed-out visitor and a removed member get a plain 404', async ({ browser }) => {
  test.setTimeout(300_000);
  mkdirSync(SHOTS, { recursive: true });
  const parent = testEmail('pi-parent');
  const granny = testEmail('pi-granny');
  const stranger = testEmail('pi-stranger');
  const P = await person(browser);
  await signInByEmailLink(P.page, parent, '/family');
  const { family_id: familyId, id: parentId } = (await sql()`select m.family_id, a.id from memberships m join accounts a on a.id = m.account_id where a.email = ${parent} and m.is_owner`)[0]!;
  await sql()`update families set display_name = 'The Bannermans' where id = ${familyId}`;

  // the parent adds a banner through the real control
  await P.page.goto('/family');
  const [chooser] = await Promise.all([
    P.page.waitForEvent('filechooser'),
    expect(async () => {
      await P.page.getByRole('button', { name: 'add a family banner' }).click();
    }).toPass({ timeout: 30_000 }),
  ]);
  await chooser.setFiles({ name: 'banner.png', mimeType: 'image/png', buffer: await drawing('#2F5DA8') });
  await expect.poll(async () => (await sql()`select count(*)::int n from profile_images where family_id = ${familyId} and kind = 'FAMILY_BANNER'`)[0]!.n, { timeout: 30_000 }).toBe(1);
  await sql()`update profile_images set moderation_status = 'CLEAR' where family_id = ${familyId}`; // stand in for the reviewer (the e2e server holds every upload)
  await P.page.goto('/family');
  const banner = P.page.getByRole('img', { name: 'The Bannermans banner' });
  await expect(banner).toBeVisible();
  const src = new URL((await banner.getAttribute('src'))!, P.page.url()).pathname;
  expect(src).toMatch(/^\/api\/profile-image\/[0-9a-f-]{36}$/);

  // a member sees it
  const token = `pi${Date.now().toString(36)}`;
  await sql()`insert into invites (family_id, created_by_account_id, email, relationship, circle, access_level, token, status, expires_at) values (${familyId}, ${parentId}, ${granny}, 'GRANDPARENT', 'EXTENDED', 'VIEW', ${token}, 'PENDING', now() + interval '1 day')`;
  const G = await person(browser);
  await signInByEmailLink(G.page, granny, `/join/${token}`);
  await G.page.goto(`/home?family=${familyId}`);
  await expect(G.page.getByRole('img', { name: /banner$/ })).toBeVisible();
  expect((await G.page.request.get(src)).status()).toBe(200);
  await shot(G.page, 'home-granny-banner-desktop');

  // a stranger and a signed-out visitor get nothing (404, no hint it exists); the response is private + noindex
  const S = await person(browser);
  await signInByEmailLink(S.page, stranger, '/home');
  const strangerRes = await S.page.request.get(src);
  expect(strangerRes.status()).toBe(404);
  expect(strangerRes.headers()['x-robots-tag']).toContain('noindex');
  const anon = await browser.newContext();
  expect((await anon.request.get(`http://localhost:${new URL(P.page.url()).port}${src}`)).status()).toBe(404);
  await anon.close();

  // removed: the very next request is refused
  const { id: grannyId } = (await sql()`select id from accounts where email = ${granny}`)[0]!;
  await P.page.goto('/family');
  await openSheet(P.page, P.page.getByRole('button', { name: `${granny.split('@')[0]}: what they can see and do` }));
  await P.page.getByRole('dialog').getByRole('button', { name: 'remove from family' }).click();
  await P.page.getByRole('dialog').getByRole('button', { name: 'yes, remove' }).click();
  await expect.poll(async () => (await sql()`select status from memberships where account_id = ${grannyId} and family_id = ${familyId}`)[0]!.status).toBe('REMOVED');
  expect((await G.page.request.get(src)).status()).toBe(404);
  for (const p of [P, G, S]) await p.ctx.close();
});

test('a relative leaves a family: gone from it at once, logged; the owner has no leave control', async ({ browser }) => {
  test.setTimeout(300_000);
  const parent = testEmail('lv-parent');
  const aunt = testEmail('lv-aunt');
  const P = await person(browser);
  await signInByEmailLink(P.page, parent, '/start-creating');
  await uploadAndOpenRange(P.page);
  await expect(P.page.getByRole('status').filter({ hasText: 'making your range' })).toHaveCount(0, { timeout: 90_000 });
  await P.page.getByRole('button', { name: /\+ keepsake/ }).click();
  await expect(P.page.getByRole('button', { name: /kept ♥/ })).toBeVisible({ timeout: 30_000 });
  const { family_id: familyId, id: parentId } = (await sql()`select m.family_id, a.id from memberships m join accounts a on a.id = m.account_id where a.email = ${parent} and m.is_owner`)[0]!;
  const { id: assetId } = (await sql()`select id from assets where family_id = ${familyId}`)[0]!;
  await sql()`update assets set visibility = 'EXTENDED' where id = ${assetId}`;
  await sql()`update families set display_name = 'The Leavers' where id = ${familyId}`;
  const token = `lv${Date.now().toString(36)}`;
  await sql()`insert into invites (family_id, created_by_account_id, email, relationship, circle, access_level, token, status, expires_at) values (${familyId}, ${parentId}, ${aunt}, 'AUNT_UNCLE', 'EXTENDED', 'VIEW_BUY', ${token}, 'PENDING', now() + interval '1 day')`;

  const A = await person(browser, { width: 390, height: 844 });
  await signInByEmailLink(A.page, aunt, `/join/${token}`);
  await A.page.goto(`/home?family=${familyId}`);
  expect(await assetIdsOn(A.page, [assetId])).toEqual([assetId]);
  await expect(async () => {
    await A.page.getByRole('button', { name: 'leave this family' }).click();
    await expect(A.page.getByText('leave The Leavers?')).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await A.page.getByRole('button', { name: 'yes, leave' }).click();
  await expect(A.page.getByText('you’ve left The Leavers')).toBeVisible();
  await expect.poll(async () => (await sql()`select m.status from memberships m join accounts a on a.id = m.account_id where a.email = ${aunt} and m.family_id = ${familyId}`)[0]!.status).toBe('LEFT');
  await A.page.goto(`/home?family=${familyId}`);
  expect(await assetIdsOn(A.page, [assetId])).toEqual([]);
  const { n } = (await sql()`select count(*)::int n from audit_records where family_id = ${familyId} and event = 'MEMBER_LEFT'`)[0]!;
  expect(n).toBe(1);
  // the owner can't leave their own family (no control is offered)
  await P.page.goto('/home');
  await expect(P.page.getByRole('button', { name: 'leave this family' })).toHaveCount(0);
  for (const p of [P, A]) await p.ctx.close();
});
