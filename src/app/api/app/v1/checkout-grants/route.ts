import { mintAppCheckoutGrant } from '@/server/app/api';
import { appJson, jsonBody, withAppViewer } from '@/server/app/http';

/** POST /api/app/v1/checkout-grants — { assetId, productKey } → { url, expiresAt }: opens the website's maker in the phone's browser. */
export const POST = withAppViewer(async ({ req, db, av }) => appJson(await mintAppCheckoutGrant(db, av, await jsonBody(req)), 201));
