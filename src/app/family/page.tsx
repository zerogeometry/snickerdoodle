import { redirect } from 'next/navigation';
import { loadFamily } from '@/server/family';
import { FamilyView } from './FamilyView';

// The family circle is a logged-in, children's-data surface — gate it, then render
// the REAL members + keepsake subjects from the DB.
export default async function FamilyPage() {
  const data = await loadFamily();
  if (!data) redirect('/login?next=/family');
  return <FamilyView data={data} />;
}
