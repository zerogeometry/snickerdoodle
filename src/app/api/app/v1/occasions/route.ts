import { addAppOccasion, listAppOccasions } from '@/server/app/occasions';
import { appJson, jsonBody, withAppViewer } from '@/server/app/http';

/**
 * The family calendar's birthdays & special days, as one list with Snickerdoodle Draw's — only while
 * the link's `birthdays` choice is on (else 403 { reason: 'sync-off' }).
 * GET → [{ id, name, relation?, kind: 'birthday'|'other', month, day, updatedAt }] (never a year).
 * POST { name, relation?, kind, month, day } → 201 the item. 422 { reason: 'name'|'relation'|'kind'|'date' }.
 */
export const GET = withAppViewer(async ({ db, av }) => appJson(await listAppOccasions(db, av)));
export const POST = withAppViewer(async ({ req, db, av }) => appJson(await addAppOccasion(db, av, await jsonBody(req)), 201));
