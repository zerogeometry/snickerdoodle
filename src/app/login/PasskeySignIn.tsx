'use client';

import { IconFaceId } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { signInWithPasskey, type PasskeyOutcome } from '@/ui/passkeyClient';

const problemFor = (word: string): Partial<Record<PasskeyOutcome, string>> => ({
  cancelled: 'no problem — tap it again when you’re ready, or use your email.',
  unknown: `that one isn’t set up for snickerdoodle any more. pop your email in instead — you can add ${word} again after.`,
  expired: 'that took a little while, so it timed out. give it another tap.',
  busy: 'lots of tries in a row, so we’ve paused this for a few minutes. your email works any time.',
  unsupported: 'this browser can’t do that — your email works just the same.',
});

/**
 * "sign in with Face ID" on /login (founder, 17 Nov 2026) — next to the email form, never instead of it. `first`: this
 * device has used one before, so it's the big button at the top; otherwise a quieter one under the email form.
 */
export function PasskeySignIn({ word, first, keepId, next }: { word: string; first: boolean; keepId: string | null; next: () => string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const res = await signInWithPasskey(keepId);
    if (res.ok) {
      // a full page load, as after the email link: the new sign-in cookie is read fresh everywhere
      window.location.assign(next());
      return;
    }
    setBusy(false);
    setProblem(problemFor(word)[res.reason] ?? 'something went wonky there. try again, or use your email.');
  };

  return (
    <div className={first ? 'mt-5' : 'mt-4'}>
      {!first ? (
        <p className="mb-3 flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint" aria-hidden>
          <span className="h-0.5 flex-1 rounded bg-line" /> or <span className="h-0.5 flex-1 rounded bg-line" />
        </p>
      ) : null}
      <Button type="button" variant={first ? 'primary' : 'secondary'} size="lg" className="w-full" onClick={go} disabled={busy} aria-describedby={problem ? 'passkey-problem' : undefined}>
        <Icon icon={IconFaceId} size={18} /> {busy ? 'checking it’s you…' : `sign in with ${word}`}
      </Button>
      {problem ? (
        <p id="passkey-problem" role="alert" className="mt-2 text-center text-xs font-semibold text-cinnamon">
          {problem}
        </p>
      ) : null}
      {first ? (
        <p className="mb-1 mt-4 flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-wide text-ink-faint" aria-hidden>
          <span className="h-0.5 flex-1 rounded bg-line" /> or use your email <span className="h-0.5 flex-1 rounded bg-line" />
        </p>
      ) : null}
    </div>
  );
}
