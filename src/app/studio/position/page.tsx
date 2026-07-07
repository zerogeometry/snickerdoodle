import { redirect } from 'next/navigation';
import { loadDraftStudioData, loadStudioData } from '@/server/studio';
import { Positioner } from './Positioner';

// The real positioning editor. With ?draft=<id> it edits a single pre-account
// ephemeral draft (the guest buy flow, gated by the upload claim); otherwise it
// loads the signed-in family's kept keepsakes.
export default async function PositionPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; return?: string; variant?: string }>;
}) {
  const { draft, return: returnTo, variant } = await searchParams;
  const safeReturn = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : undefined;

  if (draft) {
    const data = await loadDraftStudioData(draft, variant);
    if (!data) redirect('/start-creating'); // no/expired claim, blocked, or gone
    return <Positioner data={data} draft returnTo={safeReturn} focusVariantId={variant} />;
  }

  const data = await loadStudioData(variant);
  if (!data) redirect('/login');
  return <Positioner data={data} returnTo={safeReturn} focusVariantId={variant} />;
}
