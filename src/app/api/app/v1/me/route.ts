import { getAppMe } from '@/server/app/api';
import { appJson, withAppViewer } from '@/server/app/http';

/** GET /api/app/v1/me — { family: { name }, children: [{ id, firstName, birthday? }], sync: { keepsakes, children, progress } }. */
export const GET = withAppViewer(async ({ db, av }) => appJson(await getAppMe(db, av)));
