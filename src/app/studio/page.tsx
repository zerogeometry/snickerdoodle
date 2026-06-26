import { redirect } from 'next/navigation';

// A bare /studio opens a fresh creation. (Real id minted server-side once auth + assets land.)
export default function StudioIndex() {
  redirect('/studio/new');
}
