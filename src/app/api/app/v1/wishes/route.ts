import { mintAppWish } from '@/server/app/api';
import { appJson, jsonBody, withAppViewer } from '@/server/app/http';

/** POST /api/app/v1/wishes — { assetId, productKey } → { url }: "share a ready-to-buy link" (a website gift link). */
export const POST = withAppViewer(async ({ req, db, av }) => appJson(await mintAppWish(db, av, await jsonBody(req)), 201));
