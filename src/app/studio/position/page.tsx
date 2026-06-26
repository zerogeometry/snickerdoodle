import { redirect } from 'next/navigation';
import { loadStudioData } from '@/server/studio';
import { Positioner } from './Positioner';

// The real positioning editor: a kept keepsake placed on a product's true print
// template (bleed + safe area + DPI), with a server-rendered print-file preview.
export default async function PositionPage() {
  const data = await loadStudioData();
  if (!data) redirect('/login');
  return <Positioner data={data} />;
}
