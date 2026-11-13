import { APP_UPLOAD_MAX_BYTES, AppApiError, keepAppDrawing } from '@/server/app/api';
import { appJson, withAppViewer } from '@/server/app/http';

/**
 * POST /api/app/v1/assets — multipart: image (PNG/JPEG, ≤ 20 MB), childId, madeOn (YYYY-MM-DD),
 * source (app-screen | app-paper), title? (not stored), trigger? ('manual' — a grown-up's one-off
 * keep it / make it real / ready-to-buy link, the default — or 'auto', the app's sync queue: allowed
 * only while the link's keepsakes choice is proud or all, else 403 { reason: 'sync-off' }).
 * clientRef? (the app's drawing id, ≤64 [A-Za-z0-9_-]; a repeat from the same family → 200 with the
 * existing { assetId, kept }, never a duplicate; 422 { reason: 'clientRef' } if malformed).
 * Off until DRAW_APP_UPLOADS=on (the Children's Code sign-off) — 403 { reason: 'not-yet' }.
 * 422 { reason: 'body' } when the form itself can't be read; 422/415 'image' when the picture can't;
 * 413 'too-big' over 20 MB. Our own trouble (storage, database) is a 500 'server', never 'image'.
 */
export const POST = withAppViewer(async ({ req, db, av }) => {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > APP_UPLOAD_MAX_BYTES + 64 * 1024) throw new AppApiError(413, 'too-big', `content-length ${length}`);
  const form = await req.formData().catch(() => null);
  // the body isn't a multipart form we can read (cut short on the way, or the wrong shape): its own
  // reason, so it's never mistaken for a bad picture
  if (!form) throw new AppApiError(422, 'body', `unreadable form: content-length ${length}, ${(req.headers.get('content-type') ?? 'no content-type').split(';')[0]}`);
  const image = form.get('image');
  const res = await keepAppDrawing(db, av, {
    image: image instanceof Blob ? image : null,
    childId: form.get('childId'),
    madeOn: form.get('madeOn'),
    source: form.get('source'),
    trigger: form.get('trigger') ?? undefined,
    clientRef: form.get('clientRef') ?? undefined,
  });
  // a repeat of a clientRef this family already sent: 200 with the same keepsake (nothing new made)
  return appJson({ assetId: res.assetId, kept: res.kept }, res.created ? 201 : 200);
});
