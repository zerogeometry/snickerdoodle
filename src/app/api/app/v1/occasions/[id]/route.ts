import { deleteAppOccasion, updateAppOccasion } from '@/server/app/occasions';
import { appJson, appNoContent, jsonBody, withAppViewer } from '@/server/app/http';

/** PATCH /api/app/v1/occasions/{id} — any subset of { name, relation, kind, month, day } → the item. DELETE → 204. 403 sync-off when `birthdays` is off; 404 not-found outside the key's family. */
export const PATCH = withAppViewer<{ id: string }>(async ({ req, db, av, params }) => appJson(await updateAppOccasion(db, av, params.id, await jsonBody(req))));
export const DELETE = withAppViewer<{ id: string }>(async ({ db, av, params }) => {
  await deleteAppOccasion(db, av, params.id);
  return appNoContent();
});
