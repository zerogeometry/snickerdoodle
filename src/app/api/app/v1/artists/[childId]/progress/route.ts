import { getAppProgress, putAppProgress } from '@/server/app/api';
import { appJson, appNoContent, jsonBody, withAppViewer } from '@/server/app/http';

/**
 * The drawing-days backup (DRAW-APP-sync-choices.md), so a new phone can pick a child's days up.
 * Only while the link's "drawing days" choice is on — otherwise 403 { reason: 'sync-off' }.
 * GET → { drawingDays, restWeeks, bestRun, lessons, streaksOn }, or 404 { reason: 'none' }.
 * PUT the same shape → 204 (checked and trimmed to those five fields; 422 { reason: 'progress' }).
 * A child outside this phone's key → 404 { reason: 'not-found' }.
 */
export const GET = withAppViewer<{ childId: string }>(async ({ db, av, params }) => appJson(await getAppProgress(db, av, params.childId)));
export const PUT = withAppViewer<{ childId: string }>(async ({ req, db, av, params }) => {
  await putAppProgress(db, av, params.childId, await jsonBody(req));
  return appNoContent();
});
