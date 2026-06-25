/** A family-member/child avatar — coloured initial circle with name + sublabel. */
export function MemberAvatar({
  initial,
  name,
  sub,
  color,
  textColor = '#FFF6E9',
  size = 46,
}: {
  initial: string;
  name: string;
  sub?: string;
  color: string;
  textColor?: string;
  size?: number;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="flex items-center justify-center rounded-full font-display font-bold"
        style={{ width: size, height: size, background: color, color: textColor, fontSize: Math.round(size * 0.4) }}
        aria-hidden
      >
        {initial}
      </div>
      <div className="mt-1.5 text-xs font-bold text-cocoa">{name}</div>
      {sub ? <div className="text-[11px] text-[#9C8E7E]">{sub}</div> : null}
    </div>
  );
}
