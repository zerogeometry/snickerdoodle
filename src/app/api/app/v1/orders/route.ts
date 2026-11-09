import { listAppOrders } from '@/server/app/api';
import { appJson, withAppViewer } from '@/server/app/http';

/** GET /api/app/v1/orders — the grown-up's own orders: [{ id, placedOn, status }]. */
export const GET = withAppViewer(async ({ db, av }) => appJson(await listAppOrders(db, av)));
