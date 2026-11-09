import { addAppChild } from '@/server/app/api';
import { appJson, jsonBody, withAppViewer } from '@/server/app/http';

/** POST /api/app/v1/children — { firstName, birthday? } → the child. 422 { reason: 'name' } for a surname / unusable name. */
export const POST = withAppViewer(async ({ req, db, av }) => appJson(await addAppChild(db, av, await jsonBody(req)), 201));
