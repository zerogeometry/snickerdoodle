/** A family-member/child avatar — coloured initial circle with name + sublabel. */
export function MemberAvatar({
  initial,
  name,
  sub,
  color,
  textColor = 'var(--color-cta-text)',
  size = 46,
  imageUrl,
}: {
  initial: string;
  name: string;
  sub?: string;
  color: string;
  textColor?: string;
  size?: number;
  /** Their profile picture (served through the authz-gated image route) — else the initial. */
  imageUrl?: string | null;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="wiggle flex items-center justify-center overflow-hidden rounded-full border-[3px] border-paper font-display font-extrabold shadow-[0_2px_0_color-mix(in_srgb,var(--color-cocoa)_25%,transparent)]"
        style={{ width: size, height: size, background: color, color: textColor, fontSize: Math.round(size * 0.4) }}
        aria-hidden
      >
        {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full rounded-full object-cover" /> : initial}
      </div>
      <div className="mt-1.5 text-xs font-bold text-cocoa">{name}</div>
      {sub ? <div className="text-[11px] text-ink-faint">{sub}</div> : null}
    </div>
  );
}
