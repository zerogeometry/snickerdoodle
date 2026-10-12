/**
 * Placeholder child's-drawing doodle (crayon house + sun) — reproduces the mockup hero. Swapped
 * for real (consented) children's artwork later; this is the design placeholder so every image
 * surface is built to make real art the hero. Scrapbook (D12): a plain paper sheet — callers
 * mount it in a taped .polaroid — with crayon strokes drawn from the brand tokens.
 */
export function PlaceholderDoodle({
  className,
  size = 170,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <div className={`inline-block bg-paper p-3.5 ${className ?? ''}`}>
      <svg
        viewBox="0 0 160 150"
        width={size}
        height={size * (150 / 160)}
        role="img"
        aria-label="A child's crayon drawing of a house with a sun"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="32" y="56" width="74" height="58" className="stroke-tomato" strokeWidth="4" />
        <path d="M24 58 L69 28 L114 58" className="stroke-berry" strokeWidth="4" />
        <rect x="58" y="80" width="22" height="34" className="stroke-cobalt" strokeWidth="3.5" />
        <circle cx="134" cy="28" r="12" className="fill-sunshine" />
        <g className="stroke-sunshine" strokeWidth="3">
          <line x1="134" y1="8" x2="134" y2="14" />
          <line x1="156" y1="28" x2="162" y2="28" />
        </g>
        <path d="M12 126 q16 -9 32 0 t32 0 t32 0 t30 0" className="stroke-leaf" strokeWidth="3.5" />
      </svg>
    </div>
  );
}
