import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CARD_BACK_BADGE_FILE, renderCardBackBadge } from '@/server/print/cardBranding';

// Regression (19 Nov 2026): the logo was loaded with createRequire(import.meta.url).resolve('./assets/…'),
// which the Next.js server bundle rewrites into a static-image module id — readFileSync then got a
// NUMBER and every card print render (and the mockup seeder) threw in production, while vitest passed.
describe('card-back logo loads the way the production server can', () => {
  it('is read from the app folder on disk (the image ships src/), and the file is there', () => {
    expect(CARD_BACK_BADGE_FILE).toBe(path.join(process.cwd(), 'src', 'server', 'print', 'assets', 'card-back-badge.png'));
    expect(existsSync(CARD_BACK_BADGE_FILE)).toBe(true);
    expect(renderCardBackBadge().subarray(1, 4).toString('latin1')).toBe('PNG');
  });

  it('never goes through a module-relative resolve the bundler can rewrite', () => {
    const raw = readFileSync(path.join(process.cwd(), 'src', 'server', 'print', 'cardBranding.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, ''); // ignore comments (the explanation names the old call)
    expect(code).not.toMatch(/createRequire|\.resolve\(|import\.meta\.url/);
    expect(raw).toContain('/* turbopackIgnore: true */ process.cwd()');
  });
});
