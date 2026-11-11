import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEWER_TOOLS, readToolSet, shownTools, storeToolSet, TOOL_SET_KEY, TOOLS, toolsInUse } from '../tools';

describe('fewer tools / all tools', () => {
  it('fewer tools: the everyday edits plus the safety actions — nothing else', () => {
    expect([...shownTools('fewer', { scratch: false })].sort()).toEqual(['background', 'christmas', 'compare', 'erase', 'removeBg', 'removeColour', 'startAgain', 'text']);
  });

  it('all tools: every tool', () => {
    expect(shownTools('all', { scratch: false }).size).toBe(TOOLS.length);
  });

  it('a blank canvas: drawing and shapes are its everyday tools', () => {
    const s = shownTools('fewer', { scratch: true });
    for (const id of ['draw', 'shapes', 'text', 'background', 'christmas'] as const) expect(s.has(id)).toBe(true);
    expect(s.has('rotate')).toBe(false);
  });

  it('compare and start again are never hidden by the choice', () => {
    for (const set of ['fewer', 'all'] as const) for (const scratch of [false, true]) {
      const s = shownTools(set, { scratch });
      expect(s.has('compare') && s.has('startAgain')).toBe(true);
    }
  });

  it('a tool in reach (in use, opened by a key or a "switch to") is shown with fewer tools', () => {
    const s = shownTools('fewer', { scratch: false, reach: ['restore', 'rotate', null, undefined] });
    expect(s.has('restore')).toBe(true);
    expect(s.has('rotate')).toBe(true);
    expect(s.has('flip')).toBe(false);
  });

  it('a design with drawing, shapes or stickers keeps those tools reachable; words alone need nothing more', () => {
    expect(toolsInUse([{ type: 'text' }])).toEqual([]);
    expect(toolsInUse([{ type: 'stroke' }]).sort()).toEqual(['draw', 'select']);
    expect(toolsInUse([{ type: 'shape' }]).sort()).toEqual(['select', 'shapes']);
    expect(toolsInUse([{ type: 'sticker' }])).toEqual(['select']);
  });

  it('every fewer tool is a real tool', () => {
    for (const id of FEWER_TOOLS) expect(TOOLS.some((t) => t.id === id)).toBe(true);
  });
});

describe('remembered per device', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to fewer, remembers all', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    expect(readToolSet()).toBe('fewer');
    storeToolSet('all');
    expect(store.get(TOOL_SET_KEY)).toBe('all');
    expect(readToolSet()).toBe('all');
  });

  it('storage blocked (private mode): fewer, and saving never throws', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(readToolSet()).toBe('fewer');
    expect(() => storeToolSet('all')).not.toThrow();
  });
});
