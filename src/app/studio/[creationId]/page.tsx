import { redirect } from 'next/navigation';

// Retired: this was a client-only mockup of the free-form decorating studio
// (brush / eraser / text / stickers / "magic filters") with no backend — its
// tools didn't actually do anything (e.g. "Remove bg" was a no-op CSS filter).
// The real, working editor is /studio/position. The full decorating studio is a
// future focused project; the mockup lives in git history as its starting point.
export default function RetiredDecoratingStudio() {
  redirect('/start-creating');
}
