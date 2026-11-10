import { updateAppChild } from '@/server/app/api';
import { appJson, jsonBody, withAppViewer } from '@/server/app/http';

/** PATCH /api/app/v1/children/{id} — { firstName?, birthday? } → the child. Only while the link’s “first names and birthdays” is on (else 403 { reason: 'sync-off' }). */
export const PATCH = withAppViewer<{ id: string }>(async ({ req, db, av, params }) => appJson(await updateAppChild(db, av, params.id, await jsonBody(req))));
