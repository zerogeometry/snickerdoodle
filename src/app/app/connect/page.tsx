import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { connectChoices, connectPath, parseConnectRequest } from '@/server/app/link';
import { getCurrentAccount } from '@/server/session';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { AppLinkProblem } from '../AppLinkProblem';
import { ConnectCard } from './ConnectCard';

export const metadata: Metadata = { title: 'connect snickerdoodle draw', robots: { index: false, follow: false } };

/**
 * "connect snickerdoodle draw?" — opened by the app's grown-ups' corner in the phone's browser
 * (PKCE; src/server/app/link.ts). Signed out → the usual magic-link sign-in, then straight back here.
 * A request that doesn't check out (wrong app, unknown return address, no S256) is refused on the
 * page and never redirected anywhere.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = parseConnectRequest(await searchParams);
  if (!parsed.ok) return <AppLinkProblem title="that link doesn’t look quite right" body="pop back to snickerdoodle draw, open the grown-ups’ corner and tap “link to snickerdoodle” again." />;

  const account = await getCurrentAccount();
  if (!account) redirect(`/login?next=${encodeURIComponent(connectPath(parsed.req))}`);

  const { owned, joinedElsewhere } = await connectChoices(getDb(), account.id);
  const { codeChallenge, state, redirectUri } = parsed.req;
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader />
      <main id="main" className="flex flex-1 justify-center px-4 pb-40 pt-6 md:items-center md:pb-12">
        <ConnectCard
          params={{ response_type: 'code', client_id: 'snickerdoodle-draw', code_challenge: codeChallenge, code_challenge_method: 'S256', state, redirect_uri: redirectUri }}
          email={account.email}
          families={owned}
          notOwner={owned.length === 0 && joinedElsewhere}
        />
      </main>
    </div>
  );
}
