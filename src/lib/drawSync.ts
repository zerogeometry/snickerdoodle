import type { AppProgressData } from '@/db/schema';

/**
 * Snickerdoodle Draw sync choices — the pure checks, safe for the browser (the connect page uses
 * them) and the server (its action and the app API). The database side is src/server/app/sync.ts.
 * Contract: project-office/briefs/DRAW-APP-sync-choices.md.
 */

export const SYNC_KEEPSAKES = ['none', 'proud', 'all'] as const;
export type SyncKeepsakes = (typeof SYNC_KEEPSAKES)[number];

/** Exactly what `GET /me` returns as `sync`, and what `PATCH /me/sync` answers. */
export interface SyncChoices {
  keepsakes: SyncKeepsakes;
  children: boolean;
  progress: boolean;
  /** family birthdays & special days — the app's list and the website's family calendar, as one */
  birthdays: boolean;
}

/** The three yes/no choices (in the slate's order). */
export const SYNC_FLAGS = ['children', 'progress', 'birthdays'] as const;
export type SyncFlag = (typeof SYNC_FLAGS)[number];

/** The connect page's starting point: no keepsakes option picked, every box unticked. */
export interface ConnectSyncDraft {
  keepsakes: SyncKeepsakes | null;
  children: boolean;
  progress: boolean;
  birthdays: boolean;
}
export const EMPTY_CONNECT_SYNC: Readonly<ConnectSyncDraft> = Object.freeze({ keepsakes: null, children: false, progress: false, birthdays: false });

export const isSyncKeepsakes = (v: unknown): v is SyncKeepsakes => typeof v === 'string' && (SYNC_KEEPSAKES as readonly string[]).includes(v);

/** "connect" stays disabled until a keepsakes option is picked (the boxes are optional). */
export function canConnectWith(draft: ConnectSyncDraft): boolean {
  return isSyncKeepsakes(draft.keepsakes);
}

/**
 * The connect page's choices as the server action receives them (never trusted): keepsakes MUST be
 * one of the three — there is no default — and each box is on only if it's literally `true`.
 */
export function parseConnectSync(raw: unknown): SyncChoices | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isSyncKeepsakes(r.keepsakes)) return null;
  return { keepsakes: r.keepsakes, children: r.children === true, progress: r.progress === true, birthdays: r.birthdays === true };
}

export type SyncPatchResult = { ok: true; patch: Partial<SyncChoices> } | { ok: false; reason: 'keepsakes' | SyncFlag };

/** `PATCH /me/sync` (and the account page): any subset; each present field must be a valid value (others ignored). */
export function parseSyncPatch(body: Record<string, unknown>): SyncPatchResult {
  const patch: Partial<SyncChoices> = {};
  if (body.keepsakes !== undefined) {
    if (!isSyncKeepsakes(body.keepsakes)) return { ok: false, reason: 'keepsakes' };
    patch.keepsakes = body.keepsakes;
  }
  for (const f of SYNC_FLAGS) {
    const v = body[f];
    if (v === undefined) continue;
    if (typeof v !== 'boolean') return { ok: false, reason: f };
    patch[f] = v;
  }
  return { ok: true, patch };
}

const KEEPSAKES_RANK: Record<SyncKeepsakes, number> = { none: 0, proud: 1, all: 2 };

/**
 * Would this change WIDEN what syncs? (keepsakes none → proud → all, or a box off → on.) The app may
 * only narrow or stop (founder, 10 Nov: widening is website-only — 403 `widen-on-website`).
 */
export function widens(from: SyncChoices, patch: Partial<SyncChoices>): boolean {
  if (patch.keepsakes !== undefined && KEEPSAKES_RANK[patch.keepsakes] > KEEPSAKES_RANK[from.keepsakes]) return true;
  return SYNC_FLAGS.some((f) => patch[f] === true && !from[f]);
}

/** Does this keepsakes choice let the app send drawings by itself (`trigger: 'auto'`)? */
export const autoKeepsakesOn = (k: SyncKeepsakes): boolean => k === 'proud' || k === 'all';

// ── the drawing-days backup ───────────────────────────────────────────────────────────────────────

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const LESSON_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
/** Generous caps (decades of daily drawing) so a bad client can't park megabytes against a child. */
export const PROGRESS_LIMITS = { days: 6000, weeks: 1200, lessons: 1000, bestRun: 100_000 } as const;

const realDay = (s: unknown): s is string => {
  if (typeof s !== 'string' || !DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 2000;
};

/**
 * The app's ProgressBackup, checked and trimmed to exactly its five fields (anything else it sends is
 * dropped, not stored — minimisation). Missing lists count as empty; a wrong type is refused.
 */
export function parseProgress(body: Record<string, unknown>): { ok: true; data: AppProgressData } | { ok: false } {
  const list = (v: unknown, max: number): unknown[] | null => (v === undefined ? [] : Array.isArray(v) && v.length <= max ? v : null);
  const days = list(body.drawingDays, PROGRESS_LIMITS.days);
  const weeks = list(body.restWeeks, PROGRESS_LIMITS.weeks);
  const lessons = list(body.lessons, PROGRESS_LIMITS.lessons);
  if (!days || !weeks || !lessons) return { ok: false };
  if (!days.every(realDay)) return { ok: false };
  if (!weeks.every((w) => typeof w === 'string' && ISO_WEEK.test(w))) return { ok: false };
  const lessonRows: { id: string; doneOn: string }[] = [];
  for (const l of lessons) {
    if (!l || typeof l !== 'object') return { ok: false };
    const { id, doneOn } = l as Record<string, unknown>;
    if (typeof id !== 'string' || !LESSON_ID.test(id) || !realDay(doneOn)) return { ok: false };
    lessonRows.push({ id, doneOn });
  }
  const bestRun = body.bestRun === undefined ? 0 : body.bestRun;
  if (typeof bestRun !== 'number' || !Number.isInteger(bestRun) || bestRun < 0 || bestRun > PROGRESS_LIMITS.bestRun) return { ok: false };
  const streaksOn = body.streaksOn === undefined ? true : body.streaksOn;
  if (typeof streaksOn !== 'boolean') return { ok: false };
  return {
    ok: true,
    data: { drawingDays: [...new Set(days as string[])].sort(), restWeeks: [...new Set(weeks as string[])].sort(), bestRun, lessons: lessonRows, streaksOn },
  };
}
