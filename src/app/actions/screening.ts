'use server';

import { getDb } from '@/db/client';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { uploadScreeningStatus, type ScreeningStatus } from '@/server/screeningStatus';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Has the background safety check on this picture finished, and did it pass? Asked by the page
 * every few seconds after an upload (src/ui/components/ScreeningNotice.tsx). Answers only someone
 * who may see the picture; for anyone else (or a malformed id) it's null.
 */
export async function screeningStatusAction(assetId: string): Promise<ScreeningStatus | null> {
  if (typeof assetId !== 'string' || !UUID.test(assetId)) return null;
  const account = await getCurrentAccount();
  return uploadScreeningStatus(getDb(), assetId, account?.id ?? null, await getUploadClaims());
}
