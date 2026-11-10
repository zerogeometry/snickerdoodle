import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { canConnectWith, EMPTY_CONNECT_SYNC, parseConnectSync, parseProgress, parseSyncPatch, widens, type SyncChoices } from '@/lib/drawSync';
import { parseTrigger } from '@/server/app/api';

// The connect card's buttons call server actions; here we only render it.
vi.mock('@/app/actions/appLink', () => ({
  approveAppLinkAction: vi.fn(),
  declineAppLinkAction: vi.fn(),
  notOwnerAppLinkAction: vi.fn(),
  updateAppSyncAction: vi.fn(),
  unlinkAppDeviceAction: vi.fn(),
  deleteDrawingDaysAction: vi.fn(),
  removeEverythingDrawSentAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { ConnectCard, CAN, CANT, familyCant } = await import('@/app/app/connect/ConnectCard');
const { DrawAppCard, syncSummary } = await import('@/app/account/DrawAppCard');

/**
 * Snickerdoodle Draw sync choices — the pure checks and the connect page's starting state
 * (DRAW-APP-sync-choices.md: privacy by default, nothing picked, "connect" disabled until a keepsakes
 * option is chosen). The database side is in src/server/__tests__/drawAppLink.int.test.ts.
 */
const ALL: SyncChoices = { keepsakes: 'all', children: true, progress: true, birthdays: true };
const NONE: SyncChoices = { keepsakes: 'none', children: false, progress: false, birthdays: false };

describe('the connect page’s choices', () => {
  it('start empty: no keepsakes option, every box unticked — and connect needs a keepsakes option', () => {
    expect(EMPTY_CONNECT_SYNC).toEqual({ keepsakes: null, children: false, progress: false, birthdays: false });
    expect(canConnectWith(EMPTY_CONNECT_SYNC)).toBe(false);
    expect(canConnectWith({ ...EMPTY_CONNECT_SYNC, children: true, progress: true, birthdays: true })).toBe(false);
    for (const k of ['none', 'proud', 'all'] as const) expect(canConnectWith({ ...EMPTY_CONNECT_SYNC, keepsakes: k })).toBe(true);
  });

  it('the server action trusts nothing: keepsakes must be one of three; a box is on only if literally true', () => {
    expect(parseConnectSync(null)).toBeNull();
    expect(parseConnectSync({})).toBeNull();
    expect(parseConnectSync({ keepsakes: 'everything' })).toBeNull();
    expect(parseConnectSync({ keepsakes: null, children: true })).toBeNull();
    expect(parseConnectSync({ keepsakes: 'proud', children: 'true', progress: 1, birthdays: 'yes' })).toEqual({ keepsakes: 'proud', children: false, progress: false, birthdays: false });
    expect(parseConnectSync({ keepsakes: 'all', children: true, progress: true, birthdays: true, extra: 1 })).toEqual(ALL);
  });

  it('renders with nothing chosen and the connect button disabled', () => {
    const html = renderToStaticMarkup(
      createElement(ConnectCard, {
        params: { response_type: 'code', client_id: 'snickerdoodle-draw', code_challenge: 'x', code_challenge_method: 'S256', state: 's', redirect_uri: 'https://snickerdoodle.co.uk/app/callback' },
        email: 'sam@example.test',
        families: [{ id: 'f1', name: 'the hartleys', children: [{ id: 'c1', firstName: 'Olivia' }] }],
        notOwner: false,
      }),
    );
    const radios = html.match(/<input[^>]*type="radio"[^>]*name="connect-keepsakes"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(3);
    for (const r of radios) expect(r).not.toMatch(/checked/);
    for (const box of ['children', 'progress', 'birthdays']) {
      const tag = html.match(new RegExp(`<input[^>]*name="connect-${box}"[^>]*>`))?.[0];
      expect(tag).toBeDefined();
      expect(tag).not.toMatch(/checked/);
    }
    const connect = html.match(/<button[^>]*>connect<\/button>/)?.[0];
    expect(connect).toMatch(/disabled/);
    expect(html).toContain('pick what goes to your keepsake box to connect');
  });

  it('says honestly what the app can do once linked (sign-off G5) and what it can’t', () => {
    const can = CAN.join(' | ');
    for (const want of ['first names', 'birthdays', 'change a little one’s name or birthday', 'ready-to-buy link for a drawing it sent', 'delete drawings it sent', 'drawing days', 'birthdays and special days', 'proud pile or every drawing'])
      expect(can).toContain(want);
    expect(CANT.join(' | ')).toContain('bring pictures from here back into the app');
  });

  it('is honest about the family: no "can’t see your family" while family birthdays would show its names (B10)', () => {
    expect(CANT.join(' | ')).not.toMatch(/or your family/);
    expect(familyCant(false)).toMatch(/if you tick “family birthdays”, it sees the names and dates on your family calendar/);
    expect(familyCant(true)).toMatch(/only the names and dates on your family calendar/);
    const html = renderToStaticMarkup(
      createElement(ConnectCard, {
        params: { response_type: 'code', client_id: 'snickerdoodle-draw', code_challenge: 'x', code_challenge_method: 'S256', state: 's', redirect_uri: 'https://snickerdoodle.co.uk/app/callback' },
        email: 'sam@example.test',
        families: [],
        notOwner: false,
      }),
    );
    expect(html).toContain('family members’ details');
  });
});

describe('changing the choices', () => {
  it('PATCH body: any subset, every present value checked', () => {
    expect(parseSyncPatch({})).toEqual({ ok: true, patch: {} });
    expect(parseSyncPatch({ keepsakes: 'none', birthdays: false, junk: 1 })).toEqual({ ok: true, patch: { keepsakes: 'none', birthdays: false } });
    expect(parseSyncPatch({ keepsakes: 'some' })).toEqual({ ok: false, reason: 'keepsakes' });
    expect(parseSyncPatch({ children: 'no' })).toEqual({ ok: false, reason: 'children' });
    expect(parseSyncPatch({ progress: null })).toEqual({ ok: false, reason: 'progress' });
    expect(parseSyncPatch({ birthdays: 0 })).toEqual({ ok: false, reason: 'birthdays' });
  });

  it('the app may only narrow: widening is spotted (keepsakes none → proud → all, a box off → on)', () => {
    expect(widens(ALL, { keepsakes: 'proud', children: false, progress: false, birthdays: false })).toBe(false);
    expect(widens(ALL, { keepsakes: 'all', children: true })).toBe(false); // same isn't wider
    expect(widens(NONE, { keepsakes: 'proud' })).toBe(true);
    expect(widens({ ...NONE, keepsakes: 'proud' }, { keepsakes: 'all' })).toBe(true);
    expect(widens({ ...NONE, keepsakes: 'proud' }, { keepsakes: 'none' })).toBe(false);
    for (const f of ['children', 'progress', 'birthdays'] as const) {
      expect(widens(NONE, { [f]: true })).toBe(true);
      expect(widens(NONE, { [f]: false })).toBe(false);
    }
    expect(widens(NONE, {})).toBe(false);
  });

  it('upload trigger: manual by default (older apps), auto, or refused', () => {
    expect(parseTrigger(undefined)).toBe('manual');
    expect(parseTrigger(null)).toBe('manual');
    expect(parseTrigger('manual')).toBe('manual');
    expect(parseTrigger('auto')).toBe('auto');
    expect(parseTrigger('AUTO')).toBeNull();
    expect(parseTrigger(1)).toBeNull();
  });
});

describe('the drawing-days backup shape', () => {
  it('keeps exactly the five fields, sorted and de-duplicated', () => {
    expect(parseProgress({ drawingDays: ['2026-11-02', '2026-11-01', '2026-11-02'], name: 'Olivia' })).toEqual({
      ok: true,
      data: { drawingDays: ['2026-11-01', '2026-11-02'], restWeeks: [], bestRun: 0, lessons: [], streaksOn: true },
    });
  });
  it('refuses wrong types and impossible dates', () => {
    for (const bad of [{ drawingDays: '2026-11-01' }, { drawingDays: ['1999-01-01'] }, { restWeeks: ['2026-W00'] }, { bestRun: 1.5 }, { lessons: [{ id: 'a' }] }, { streaksOn: 'on' }])
      expect(parseProgress(bad as Record<string, unknown>).ok).toBe(false);
  });
});

describe('the account page’s Draw section', () => {
  const device = { id: 'd1', label: 'an iphone or ipad', familyName: 'the hartleys', linkedOn: '2026-11-01', lastUsedOn: '2026-11-09', sync: { ...NONE, keepsakes: 'proud' as const, birthdays: true }, syncChosen: true };

  it('shows what syncs in a line, and "nothing yet" for a phone linked before the choices', () => {
    expect(syncSummary(device.sync, true)).toBe('the proud pile only · family birthdays');
    expect(syncSummary(NONE, false)).toMatch(/nothing yet/);
  });

  it('offers disconnect, and "remove everything draw sent" only behind a confirm step', () => {
    const html = renderToStaticMarkup(createElement(DrawAppCard, { devices: [device], backups: [], sentCount: 12 }));
    expect(html).toContain('disconnect');
    expect(html).toContain('12 drawings from snickerdoodle draw');
    expect(html).toContain('remove everything draw sent');
    expect(html).not.toContain('yes, remove them'); // the confirm only appears after the first tap
    expect(renderToStaticMarkup(createElement(DrawAppCard, { devices: [device], backups: [], sentCount: 0 }))).not.toContain('remove everything');
  });
});
