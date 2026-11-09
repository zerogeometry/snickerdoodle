import { APP_UPLOAD_MAX_BYTES, AppApiError, keepAppDrawing } from '@/server/app/api';
import { appJson, withAppViewer } from '@/server/app/http';

/**
 * POST /api/app/v1/assets — multipart: image (PNG/JPEG, ≤ 20 MB), childId, madeOn (YYYY-MM-DD),
 * source (app-screen | app-paper), title? (not stored). Only after a grown-up taps keep it / make it
 * real. Off until DRAW_APP_UPLOADS=on (the Children's Code sign-off) — 403 { reason: 'not-yet' }.
 */
export const POST = withAppViewer(async ({ req, db, av }) => {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > APP_UPLOAD_MAX_BYTES + 64 * 1024) throw new AppApiError(413, 'too-big');
  const form = await req.formData().catch(() => null);
  if (!form) throw new AppApiError(422, 'image');
  const image = form.get('image');
  const res = await keepAppDrawing(db, av, {
    image: image instanceof Blob ? image : null,
    childId: form.get('childId'),
    madeOn: form.get('madeOn'),
    source: form.get('source'),
  });
  return appJson(res, 201);
});
