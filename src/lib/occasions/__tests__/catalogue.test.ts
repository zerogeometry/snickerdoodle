import { describe, expect, it } from 'vitest';
import { cleanCelebrate, DEFAULT_CELEBRATE, FESTIVAL_GROUPS } from '../catalogue';

describe('the days we celebrate — the options', () => {
  it('shows "Everyday family days" first, then the rest A–Z', () => {
    const names = FESTIVAL_GROUPS.map((g) => g.name);
    expect(names[0]).toBe('Everyday family days');
    const rest = names.slice(1);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en')));
    expect(rest[0]).toBe('Baby milestones');
  });

  it('Christmas and Easter are one option: "Christian holidays", with all three dates', () => {
    expect(FESTIVAL_GROUPS.some((g) => g.id === 'christmas' || g.id === 'easter')).toBe(false);
    const christian = FESTIVAL_GROUPS.find((g) => g.id === 'christian');
    expect(christian?.name).toBe('Christian holidays');
    expect(christian?.festivals).toEqual(expect.arrayContaining(['christmas', 'easter', 'shrove-tuesday']));
  });

  it('a new family starts with the everyday days and the Christian holidays', () => {
    expect(DEFAULT_CELEBRATE).toEqual(['everyday', 'christian']);
    expect(cleanCelebrate(null)).toEqual(['everyday', 'christian']);
  });
});

describe('cleanCelebrate — old stored choices still map', () => {
  it('the old column default (everyday + christmas) → everyday + christian', () => {
    expect(cleanCelebrate(['everyday', 'christmas'])).toEqual(['everyday', 'christian']);
  });
  it('Easter alone → Christian holidays on', () => {
    expect(cleanCelebrate(['easter'])).toEqual(['christian']);
  });
  it('both Christmas and Easter → one Christian holidays, no duplicate', () => {
    expect(cleanCelebrate(['christmas', 'easter', 'jewish'])).toEqual(['christian', 'jewish']);
  });
  it('neither ticked → Christian holidays stays off', () => {
    expect(cleanCelebrate(['everyday', 'hindu'])).toEqual(['everyday', 'hindu']);
    expect(cleanCelebrate([])).toEqual([]);
  });
  it('drops unknown ids and non-strings', () => {
    expect(cleanCelebrate(['christian', 'not-a-group', 7, null])).toEqual(['christian']);
  });
});
