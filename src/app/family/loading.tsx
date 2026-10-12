/** Loading state for the family circle — the page's own shapes, gently pulsing (never a spinner). */
export default function FamilyLoading() {
  return (
    <div role="status" aria-label="loading your family circle" className="flex min-h-dvh flex-col bg-oat">
      <div className="bg-honey-band px-6 py-8">
        <div className="mx-auto h-5 w-32 animate-pulse rounded-full bg-paper/70" />
        <div className="mx-auto mt-3 h-8 w-56 animate-pulse rounded-full bg-paper/70" />
      </div>
      <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 px-6 py-6 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} aria-hidden className="flex h-[78px] animate-pulse items-center gap-3 rounded-[18px] border-2 border-cocoa/10 bg-paper p-3">
            <div className="h-[46px] w-[46px] shrink-0 rounded-full bg-paper-2" />
            <div className="h-3 flex-1 rounded-full bg-paper-2" />
          </div>
        ))}
      </div>
      <span className="sr-only">loading your family circle…</span>
    </div>
  );
}
