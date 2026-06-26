import { redirect } from 'next/navigation';
import { loadDraftStudioData, loadStudioData } from '@/server/studio';
import { Positioner } from './Positioner';

// The real positioning editor. With ?draft=<id> it edits a single pre-account
// ephemeral draft (the guest buy flow, gated by the upload claim); otherwise it
// loads the signed-in family's kept keepsakes.
export default async function PositionPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft } = await searchParams;

  if (draft) {
    const data = await loadDraftStudioData(draft);
    if (!data) redirect('/start-creating'); // no/expired claim, blocked, or gone
    return <Positioner data={data} draft />;
  }

  const data = await loadStudioData();
  if (!data) redirect('/login');
  return <Positioner data={data} />;
}
