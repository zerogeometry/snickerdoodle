import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { POST } from '../route';

const DIR = path.join(process.cwd(), '.dev-captures');

describe('dev capture: writes only into .dev-captures/, whatever path it is given', () => {
  it('a path that tries to climb out lands as a plain .png in the capture folder', async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } }).png().toBuffer();
    const req = new NextRequest('http://localhost/api/dev/capture', {
      method: 'POST',
      body: JSON.stringify({ path: '../../../../tmp/evil.sh', dataUrl: `data:image/png;base64,${png.toString('base64')}` }),
    });
    const res = (await (await POST(req)).json()) as { ok: boolean; path: string };
    expect(res.ok).toBe(true);
    expect(path.dirname(res.path)).toBe(DIR);
    expect(path.basename(res.path)).toBe('evil.sh.png');
    expect(existsSync('/tmp/evil.sh')).toBe(false);
    rmSync(res.path, { force: true });
  });
});
