import { listAppProducts } from '@/server/app/api';
import { appJson, withoutKey } from '@/server/app/http';

/** GET /api/app/v1/products — no key needed (unlinked phones show previews too). Names + blurbs, no prices. */
export const GET = withoutKey(async ({ db }) => appJson(await listAppProducts(db)));
