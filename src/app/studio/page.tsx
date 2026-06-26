import { redirect } from 'next/navigation';

// The free-form decorating studio (brush / stickers / text / creative filters) is
// a future, focused project — the old client-only mockup has been retired so it
// can't masquerade as working. The live editor is /studio/position (place a
// keepsake on a product, with the DPI gate + real magic edits). A bare /studio
// sends you into the create flow.
export default function StudioIndex() {
  redirect('/start-creating');
}
