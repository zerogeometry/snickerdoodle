'use client';

import type { ReactNode } from 'react';
import { clearUploadSession } from '@/lib/uploadSession';
import { useUpload } from '@/lib/store';

/**
 * A sign-out form (its server action does the signing out). On the way, it forgets the drawing this
 * tab was keeping (src/lib/uploadSession.ts) — the next person at this browser never sees it.
 */
export function SignOutForm({ action, children }: { action: () => Promise<void>; children: ReactNode }) {
  return (
    <form
      action={action}
      onSubmit={() => {
        useUpload.getState().resetUpload();
        clearUploadSession();
      }}
    >
      {children}
    </form>
  );
}
