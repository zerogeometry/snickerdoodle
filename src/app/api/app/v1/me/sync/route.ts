import { updateAppSync } from '@/server/app/api';
import { appJson, jsonBody, withAppViewer } from '@/server/app/http';

/**
 * PATCH /api/app/v1/me/sync — any subset of { keepsakes: 'none'|'proud'|'all', children: boolean,
 * progress: boolean } (the app's grown-ups' corner, behind its gate) → the full { keepsakes, children,
 * progress }. 422 { reason: 'keepsakes' | 'children' | 'progress' } for a bad value. Audited.
 */
export const PATCH = withAppViewer(async ({ req, db, av }) => appJson(await updateAppSync(db, av, await jsonBody(req))));
