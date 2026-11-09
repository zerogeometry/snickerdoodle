import { deleteAppAsset } from '@/server/app/api';
import { appNoContent, withAppViewer } from '@/server/app/http';

/** DELETE /api/app/v1/assets/{id} — really deletes a keepsake this app sent (cascading). 409 { reason: 'in-order' } while an order still needs it. */
export const DELETE = withAppViewer<{ id: string }>(async ({ db, av, params }) => {
  await deleteAppAsset(db, av, params.id);
  return appNoContent();
});
