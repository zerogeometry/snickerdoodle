import { and, asc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import { canManageFamily } from '@/authz';
import { appAuthCodes, appCheckoutGrants, appTokens, auditRecords, children, families, memberships } from '@/db/schema';
import { resolveViewerContext } from '@/server/assets';
import { appUrl } from '@/server/mail';
import type { DbHandle } from '@/server/db';
import { CHALLENGE, hashSecret, newSecret, pkceMatches } from './secrets';

/**
 * Linking Snickerdoodle Draw (the kids' drawing app) to a family's account
 * (project-office/briefs/COMPANION-APP-api-plan.md §4 Phase 1, and the app's docs/API_CONTRACT.md):
 *
 *  1. In the app's gated grown-ups' corner the grown-up taps "link". The app opens
 *     /app/connect in the phone's browser with a PKCE challenge (S256 only) and a state.
 *  2. They sign in (or sign up) with the usual magic link and confirm "connect snickerdoodle draw?".
 *     Only the family's OWNER can link (M6). We mint a one-time code (2 minutes) and send them back
 *     to an exact, allow-listed redirect URI.
 *  3. The app swaps code + verifier for a key (`POST /api/app/v1/token`). The code burns on first
 *     use. The key is scoped to ONE family (optionally some of its children) and can do only what
 *     the app needs — it can't read the rest of the keepsake home, the members or anyone's email.
 *  4. The key stops working the moment: the grown-up unlinks (app or account page), stops being the
 *     family's owner (handover), is removed, closes their account, or leaves it unused for 90 days.
 */

export const APP_CLIENT_ID = 'snickerdoodle-draw';
/** A link code lives just long enough for the browser to hand back to the app. */
export const AUTH_CODE_TTL_MS = 2 * 60_000;
/** A key nobody has used for 90 days stops working (the grown-up links again). */
export const APP_TOKEN_IDLE_MS = 90 * 86_400_000;
/** The phone's key — recognisable if it ever turns up in a log or a paste. */
export const APP_TOKEN_PREFIX = 'sdd_';

/**
 * Where the website may send the grown-up back to — EXACT matches only (never a prefix or a pattern).
 * Android catches the verified https App Link; iOS's sign-in sheet needs the custom scheme for now.
 * The app always uses the live site's https address, even against the test site.
 */
export function allowedRedirectUris(env: Record<string, string | undefined> = process.env): Set<string> {
  return new Set(['https://snickerdoodle.co.uk/app/callback', 'snickerdoodle-draw://auth/callback', appUrl('/app/callback', env)]);
}

export interface ConnectRequest {
  codeChallenge: string;
  state: string;
  redirectUri: string;
}

export type ConnectParseResult = { ok: true; req: ConnectRequest } | { ok: false; reason: 'client' | 'response-type' | 'challenge' | 'method' | 'state' | 'redirect' };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? undefined : v);

/**
 * Check the app's /app/connect request. Nothing here is trusted: a bad redirect URI is refused
 * outright (we NEVER redirect to an address we haven't allow-listed), and only S256 is accepted.
 */
export function parseConnectRequest(params: Params, env: Record<string, string | undefined> = process.env): ConnectParseResult {
  if (one(params.client_id) !== APP_CLIENT_ID) return { ok: false, reason: 'client' };
  const redirectUri = one(params.redirect_uri);
  if (!redirectUri || !allowedRedirectUris(env).has(redirectUri)) return { ok: false, reason: 'redirect' };
  if (one(params.response_type) !== 'code') return { ok: false, reason: 'response-type' };
  if (one(params.code_challenge_method) !== 'S256') return { ok: false, reason: 'method' };
  const codeChallenge = one(params.code_challenge);
  if (!codeChallenge || !CHALLENGE.test(codeChallenge)) return { ok: false, reason: 'challenge' };
  const state = one(params.state);
  if (!state || state.length > 256 || !/^[\x21-\x7e]+$/.test(state)) return { ok: false, reason: 'state' };
  return { ok: true, req: { codeChallenge, state, redirectUri } };
}

/** The query string the app sent, rebuilt from the checked values (for "sign in, then come back"). */
export function connectPath(req: ConnectRequest): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: APP_CLIENT_ID,
    code_challenge: req.codeChallenge,
    code_challenge_method: 'S256',
    state: req.state,
    redirect_uri: req.redirectUri,
  });
  return `/app/connect?${q.toString()}`;
}

/** Back to the app: the allow-listed redirect URI plus the code (or an error) and the app's state. */
export function callbackUrl(req: ConnectRequest, result: { code: string } | { error: 'access_denied' }): string {
  const q = new URLSearchParams({ ...('code' in result ? { code: result.code } : { error: result.error }), state: req.state });
  return `${req.redirectUri}${req.redirectUri.includes('?') ? '&' : '?'}${q.toString()}`;
}

export interface ConnectFamily {
  id: string;
  name: string;
  children: { id: string; firstName: string }[];
}

/** What the "connect snickerdoodle draw?" page offers: the families this grown-up RUNS (owner), and
 * whether they're only a member of someone else's (then: "ask the grown-up who runs it"). */
export async function connectChoices(db: DbHandle, accountId: string): Promise<{ owned: ConnectFamily[]; joinedElsewhere: boolean }> {
  const rows = await db
    .select({ familyId: memberships.familyId, isOwner: memberships.isOwner, name: families.displayName })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(and(eq(memberships.accountId, accountId), eq(memberships.status, 'ACTIVE')))
    .orderBy(asc(memberships.createdAt));
  const owned = rows.filter((r) => r.isOwner);
  const kids = owned.length
    ? await db
        .select({ id: children.id, firstName: children.firstName, familyId: children.familyId })
        .from(children)
        .where(inArray(children.familyId, owned.map((r) => r.familyId)))
        .orderBy(asc(children.createdAt))
    : [];
  return {
    owned: owned.map((r) => ({ id: r.familyId, name: r.name, children: kids.filter((k) => k.familyId === r.familyId).map(({ id, firstName }) => ({ id, firstName })) })),
    joinedElsewhere: rows.some((r) => !r.isOwner),
  };
}

/**
 * The grown-up said yes. Mint the one-time code. `familyId: null` is the "you don't run a family"
 * case: the app still gets a code, and the swap answers 403 not-owner so the app can say so kindly.
 * The family and children are re-checked here, never taken from the form on trust.
 */
export async function createAuthCode(
  db: DbHandle,
  input: { accountId: string; familyId: string | null; childIds: string[] | null; req: ConnectRequest },
  now = new Date(),
): Promise<string> {
  let familyId: string | null = null;
  let childIds: string[] | null = null;
  if (input.familyId) {
    const viewer = await resolveViewerContext(db, input.accountId, input.familyId);
    if (!canManageFamily(viewer.membership)) throw new Error('only the family’s owner can link the app');
    familyId = input.familyId;
    if (input.childIds) {
      const real = await db.select({ id: children.id }).from(children).where(eq(children.familyId, familyId));
      const inFamily = new Set(real.map((r) => r.id));
      // every child ticked → no list at all (so little ones added later are included too)
      const picked = [...new Set(input.childIds)].filter((id) => inFamily.has(id));
      childIds = picked.length === inFamily.size ? null : picked;
    }
  }
  const code = newSecret('sdc_');
  await db.insert(appAuthCodes).values({
    codeHash: hashSecret(code),
    accountId: input.accountId,
    familyId,
    childIds,
    codeChallenge: input.req.codeChallenge,
    redirectUri: input.req.redirectUri,
    expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_MS),
  });
  return code;
}

export type ExchangeResult = { ok: true; token: string } | { ok: false; status: 400 | 403; reason: 'invalid-request' | 'invalid-grant' | 'not-owner' };

/**
 * POST /api/app/v1/token. The code is burned FIRST (atomically), so a second try with the same code
 * fails whatever else is wrong; then expiry, the exact redirect URI and the PKCE verifier are checked,
 * and the family's ownership is checked again (it may have changed in the last two minutes).
 */
export async function exchangeAuthCode(
  db: DbHandle,
  input: { grantType?: unknown; code?: unknown; codeVerifier?: unknown; redirectUri?: unknown; clientId?: unknown; userAgent?: string | null },
  now = new Date(),
): Promise<ExchangeResult> {
  const { grantType, code, codeVerifier, redirectUri, clientId } = input;
  if (grantType !== 'authorization_code' || clientId !== APP_CLIENT_ID || typeof code !== 'string' || typeof codeVerifier !== 'string' || typeof redirectUri !== 'string') {
    return { ok: false, status: 400, reason: 'invalid-request' };
  }
  const [row] = await db
    .update(appAuthCodes)
    .set({ usedAt: now })
    .where(and(eq(appAuthCodes.codeHash, hashSecret(code)), isNull(appAuthCodes.usedAt)))
    .returning();
  if (!row) return { ok: false, status: 400, reason: 'invalid-grant' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, status: 400, reason: 'invalid-grant' };
  if (row.redirectUri !== redirectUri) return { ok: false, status: 400, reason: 'invalid-grant' };
  if (!pkceMatches(codeVerifier, row.codeChallenge)) return { ok: false, status: 400, reason: 'invalid-grant' };
  if (!row.familyId) return { ok: false, status: 403, reason: 'not-owner' };
  const viewer = await resolveViewerContext(db, row.accountId, row.familyId);
  if (!canManageFamily(viewer.membership)) return { ok: false, status: 403, reason: 'not-owner' };

  const token = newSecret(APP_TOKEN_PREFIX);
  const deviceLabel = deviceLabelFrom(input.userAgent);
  const [t] = await db
    .insert(appTokens)
    .values({ tokenHash: hashSecret(token), accountId: row.accountId, familyId: row.familyId, childIds: row.childIds ?? null, deviceLabel, lastUsedAt: now })
    .returning({ id: appTokens.id });
  await db.insert(auditRecords).values({
    familyId: row.familyId,
    actorAccountId: row.accountId,
    actorType: 'MEMBER',
    event: 'APP_LINKED',
    targetType: 'app_token',
    targetId: t!.id,
    metadata: { device: deviceLabel, scoped: row.childIds ? row.childIds.length : 'all' },
  });
  return { ok: true, token };
}

/**
 * A plain name for the account page's "linked phones" list, from the app's HTTP client. Never a
 * device id or model — just enough for a parent to recognise it.
 */
export function deviceLabelFrom(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (/android|okhttp/i.test(ua)) return 'an android phone or tablet';
  if (/iphone|ipad|ios|darwin|cfnetwork/i.test(ua)) return 'an iphone or ipad';
  return 'a phone or tablet';
}

/** Why a key stopped — kept in the audit trail (never shown to a child). */
export type UnlinkReason = 'unlinked-in-app' | 'unlinked-on-website' | 'member-removed' | 'account-closed' | 'family-handed-over' | 'no-longer-owner' | 'idle';

/**
 * Stop keys working, now. By account (all its keys), or by account × family. Used by unlinking, member
 * removal, account closure and family handover (next to where those already sign sessions out).
 */
export async function revokeAppTokens(
  db: DbHandle,
  where: { tokenId?: string; accountId?: string; familyId?: string },
  reason: UnlinkReason,
  actor: { accountId: string | null; actorType: 'MEMBER' | 'SYSTEM' | 'ADMIN' },
  now = new Date(),
): Promise<number> {
  const conds = [isNull(appTokens.revokedAt)];
  if (where.tokenId) conds.push(eq(appTokens.id, where.tokenId));
  if (where.accountId) conds.push(eq(appTokens.accountId, where.accountId));
  if (where.familyId) conds.push(eq(appTokens.familyId, where.familyId));
  if (conds.length === 1) throw new Error('revokeAppTokens needs a token, an account or a family');
  const gone = await db.update(appTokens).set({ revokedAt: now }).where(and(...conds)).returning({ id: appTokens.id, familyId: appTokens.familyId });
  if (gone.length) {
    await db.insert(auditRecords).values(
      gone.map((g) => ({
        familyId: g.familyId,
        actorAccountId: actor.accountId,
        actorType: actor.actorType,
        event: 'APP_UNLINKED' as const,
        targetType: 'app_token',
        targetId: g.id,
        metadata: { reason },
      })),
    );
  }
  return gone.length;
}

export interface LinkedDevice {
  id: string;
  label: string;
  familyName: string;
  linkedOn: string;
  lastUsedOn: string;
}

/** The account page's "linked phones": this account's working keys (never anyone else's). */
export async function listLinkedDevices(db: DbHandle, accountId: string, now = new Date()): Promise<LinkedDevice[]> {
  const rows = await db
    .select({ id: appTokens.id, label: appTokens.deviceLabel, familyName: families.displayName, createdAt: appTokens.createdAt, lastUsedAt: appTokens.lastUsedAt })
    .from(appTokens)
    .innerJoin(families, eq(families.id, appTokens.familyId))
    .where(and(eq(appTokens.accountId, accountId), isNull(appTokens.revokedAt), gt(appTokens.lastUsedAt, new Date(now.getTime() - APP_TOKEN_IDLE_MS))))
    .orderBy(asc(appTokens.createdAt));
  return rows.map((r) => ({ id: r.id, label: r.label, familyName: r.familyName, linkedOn: r.createdAt.toISOString().slice(0, 10), lastUsedOn: r.lastUsedAt.toISOString().slice(0, 10) }));
}

/** The retention job: used/expired link codes and checkout passes, and keys revoked or idle a while. */
export async function purgeAppLinkLeftovers(db: DbHandle, now = new Date()): Promise<number> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const codes = await db.delete(appAuthCodes).where(lt(appAuthCodes.expiresAt, dayAgo)).returning({ id: appAuthCodes.id });
  const grants = await db.delete(appCheckoutGrants).where(lt(appCheckoutGrants.expiresAt, dayAgo)).returning({ id: appCheckoutGrants.id });
  // a key revoked (or idle past its 90 days) 30+ days ago: the audit trail keeps the history
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const keys = await db
    .delete(appTokens)
    .where(or(lt(appTokens.revokedAt, monthAgo), lt(appTokens.lastUsedAt, new Date(monthAgo.getTime() - APP_TOKEN_IDLE_MS))))
    .returning({ id: appTokens.id });
  return codes.length + grants.length + keys.length;
}
