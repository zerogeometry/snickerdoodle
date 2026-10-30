/**
 * "a mug", "an adult tee", "placemats", "wrapping paper" — a product label as it reads after "add"
 * (09-B12: screen readers heard "add a adult tee", "add a placemats"). Plurals and the roll of paper
 * take no article. Client-safe.
 */
const NO_ARTICLE = new Set(['wrapping paper']);

export function withArticle(label: string): string {
  if (NO_ARTICLE.has(label) || /s$/.test(label)) return label;
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}
