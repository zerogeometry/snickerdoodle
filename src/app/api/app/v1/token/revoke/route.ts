import { revokeAppTokens } from '@/server/app/link';
import { appNoContent, withAppViewer } from '@/server/app/http';

/** POST /api/app/v1/token/revoke — unlink this phone. Everything on the phone stays; the key stops. */
export const POST = withAppViewer(async ({ db, av }) => {
  await revokeAppTokens(db, { tokenId: av.tokenId }, 'unlinked-in-app', { accountId: av.accountId, actorType: 'MEMBER' });
  return appNoContent();
});
