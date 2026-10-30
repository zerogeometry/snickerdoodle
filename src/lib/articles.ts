/**
 * "a mug", "an apron", "coasters", "wrapping paper" — a product or shape name as it reads after "add"
 * (sweep 09-B12: "add a adult tee", "add a placemats"). Plural names (they end in -s) and the stuff
 * you buy by the roll take no article; vowel sounds take "an".
 */
const NO_ARTICLE = new Set(['wrapping paper', 'gift wrap', 'washi tape']);

export function withArticle(noun: string): string {
  const n = noun.trim();
  const lower = n.toLowerCase();
  if (NO_ARTICLE.has(lower) || (/s$/.test(lower) && !/ss$/.test(lower))) return n;
  // "a unicorn", "a uniform", "a european…" sound like "you"; everything else starting a/e/i/o/u is "an"
  const an = /^[aeiou]/.test(lower) && !/^(uni|use|eu|one)/.test(lower);
  return `${an ? 'an' : 'a'} ${n}`;
}
