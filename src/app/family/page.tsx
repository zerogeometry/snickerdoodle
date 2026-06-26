import { redirect } from 'next/navigation';
import { getCurrentAccount } from '@/server/session';
import { FamilyView } from './FamilyView';

// The family circle is a logged-in, children's-data surface — gate it. (The member
// list itself is still demo data; wiring it to real DB members + invites is next.)
export default async function FamilyPage() {
  const account = await getCurrentAccount();
  if (!account) redirect('/login?next=/family');
  return <FamilyView />;
}
