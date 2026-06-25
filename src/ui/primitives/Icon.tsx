import type { ComponentType, SVGProps } from 'react';

/**
 * The icon set is Tabler Icons (the exact set the mockups use), bundled via
 * @tabler/icons-react — never a CDN. Use this wrapper so size/stroke/colour stay
 * consistent. Pass `title` for a meaningful label; otherwise the icon is aria-hidden.
 */
// Mirrors @tabler/icons-react's IconProps: SVG props but with `stroke` redefined
// as a number (its types don't export IconProps, so we restate it structurally).
export type TablerIconComponent = ComponentType<
  Omit<SVGProps<SVGSVGElement>, 'stroke'> & {
    size?: number | string;
    stroke?: number | string;
    title?: string;
  }
>;

export function Icon({
  icon: IconComponent,
  size = 20,
  stroke = 2,
  className,
  title,
}: {
  icon: TablerIconComponent;
  size?: number;
  stroke?: number;
  className?: string;
  title?: string;
}) {
  return (
    <IconComponent
      size={size}
      stroke={stroke}
      className={className}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  );
}
