import { updateAppSync } from '@/server/app/api';
import { appJson, jsonBody, withAppViewer } from '@/server/app/http';

/**
 * PATCH /api/app/v1/me/sync — any subset of { keepsakes: 'none'|'proud'|'all', children: boolean,
 * progress: boolean, birthdays: boolean } (the app's grown-ups' corner, behind its gate) → the full
 * { keepsakes, children, progress, birthdays }. 422 { reason: 'invalid' } for any bad value. The app may
 * only NARROW or stop (keepsakes all → proud → none; a box on → off): widening is done on the website's
 * account page — 403 { reason: 'widen-on-website' }. Audited as a consent change.
 */
export const PATCH = withAppViewer(async ({ req, db, av }) => appJson(await updateAppSync(db, av, await jsonBody(req))));
