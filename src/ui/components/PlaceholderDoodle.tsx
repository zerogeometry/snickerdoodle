/**
 * Placeholder child's-drawing doodle, "framed in gold" — reproduces the mockup
 * hero. Swapped for real (consented) children's artwork later; this is the design
 * placeholder so every image surface is built to make real art the hero.
 */
export function PlaceholderDoodle({
  className,
  size = 170,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-block',
        background: '#FFFDF8',
        border: '8px solid #F2A640',
        borderRadius: 6,
        padding: 14,
      }}
    >
      <svg
        viewBox="0 0 160 150"
        width={size}
        height={size * (150 / 160)}
        role="img"
        aria-label="A child's crayon drawing of a house with a sun"
      >
        <rect x="32" y="56" width="74" height="58" fill="none" stroke="#C8623A" strokeWidth="4" />
        <path
          d="M24 58 L69 28 L114 58"
          fill="none"
          stroke="#E8786E"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="58" y="80" width="22" height="34" fill="none" stroke="#84BBD0" strokeWidth="3.5" />
        <circle cx="134" cy="28" r="12" fill="#F2A640" />
        <g stroke="#F2A640" strokeWidth="3" strokeLinecap="round">
          <line x1="134" y1="8" x2="134" y2="14" />
          <line x1="156" y1="28" x2="162" y2="28" />
        </g>
        <path
          d="M12 126 q16 -9 32 0 t32 0 t32 0 t30 0"
          fill="none"
          stroke="#93B97C"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
