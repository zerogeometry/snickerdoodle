'use client';

import { useEffect, useState } from 'react';
import { seasonClock } from '@/lib/season';

/**
 * The current time for date-dependent UI (the Christmas season). With a server-supplied instant
 * it renders that on first paint (server and browser agree, so no hydration mismatch); otherwise it
 * is null until the page is live, then the browser's clock.
 */
export function useNow(serverNowIso?: string): Date | null {
  const [now, setNow] = useState<Date | null>(serverNowIso ? seasonClock(new Date(serverNowIso)) : null);
  useEffect(() => {
    if (!serverNowIso) setNow(seasonClock(new Date()));
  }, [serverNowIso]);
  return now;
}
