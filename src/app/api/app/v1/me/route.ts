import { getAppMe } from '@/server/app/api';
import { appJson, withAppViewer } from '@/server/app/http';

/** GET /api/app/v1/me — the family's name and the little ones this phone is for. */
export const GET = withAppViewer(async ({ db, av }) => appJson(await getAppMe(db, av)));
