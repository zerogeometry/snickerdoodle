/**
 * An email shown to someone who may not own it — `granny@example.com` → `gr•••@example.com`.
 * Used where a link can be forwarded (06-B1: a gift link's "join the family" lands on /join, which
 * anyone holding the forwarded link can open). Enough for the real invitee to recognise their
 * address; not enough for a stranger to learn it.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  const local = email.slice(0, at);
  const keep = local.length <= 3 ? 1 : 2;
  return `${local.slice(0, keep)}•••${email.slice(at)}`;
}
