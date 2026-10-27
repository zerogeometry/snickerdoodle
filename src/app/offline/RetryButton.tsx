'use client';

import { Button } from '@/ui/primitives/Button';

/** "try again": reload whatever page they were heading for (the URL is still theirs). */
export function RetryButton() {
  return (
    <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => window.location.reload()}>
      try again
    </Button>
  );
}
