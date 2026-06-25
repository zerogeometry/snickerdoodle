/** Tiny class-name joiner (filters falsy). Keeps the design system dependency-free. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
