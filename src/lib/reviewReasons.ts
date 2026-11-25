/** Labels meaning "no check gave an answer" — kept in step with NEVER_CHECKED_LABELS in src/server/moderation. */
const NOT_CHECKED_YET = new Set(['screening-not-configured', 'classifier-error', 'text-unreadable']);

/** Why a remove-only review item is remove-only, in plain words — the real reason, not one blanket line (founder, 25 Nov 2026). */
export function removeOnlyReason(labels: string[]): string {
  if (labels.length > 0 && labels.every((l) => NOT_CHECKED_YET.has(l))) {
    const when = labels.includes('screening-not-configured') ? 'it was uploaded before the safety checks were switched on' : 'the checker couldn’t read it at the time';
    return `nothing has flagged this picture — ${when}. it’s being checked again automatically, and if it passes it leaves this list by itself. until then it can only be removed, not looked at.`;
  }
  if (labels.includes('hash-check-unavailable')) return 'for safety this one can’t be looked at or cleared, only removed: the check for known abuse images couldn’t run.';
  return 'for safety this one can’t be looked at or cleared, only removed: the checker flagged it for the reason above, and the check for known abuse images isn’t connected yet.';
}
