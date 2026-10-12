/** Loading state for your orders — the order cards' own shapes, gently pulsing (never a spinner). */
export default function OrdersLoading() {
  return (
    <div role="status" aria-label="loading your orders" className="flex min-h-dvh flex-col bg-oat">
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-6">
        <div className="h-9 w-48 animate-pulse rounded-full bg-paper-2" />
        <div className="mt-5 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} aria-hidden className="animate-pulse overflow-hidden rounded-[18px] border-2 border-cocoa/15 bg-paper">
              <div className="h-11 bg-honey-band" />
              <div className="space-y-2 p-3">
                <div className="h-16 rounded-[14px] bg-paper-2" />
                <div className="h-16 rounded-[14px] bg-paper-2" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">loading your orders…</span>
    </div>
  );
}
