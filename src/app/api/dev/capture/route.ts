import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';

// DEV-ONLY canvas capture: the preview harness can't screenshot a WebGL canvas, so the page POSTs
// its toDataURL here and we flatten + write it for eyeballing. 404 in production.
//
// It writes ONLY into .dev-captures/ in the repo, under the BASENAME it's given (a .png): it used to
// write to any path the caller named, so a dev server opened to the home network (e.g. to try the
// app on an iPad) let anyone on that Wi-Fi write files anywhere on the machine.
const DIR = path.join(process.cwd(), '.dev-captures');
const MAX_PIXELS = 25_000_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ ok: false }, { status: 404 });
  const { path: wanted, dataUrl } = (await req.json()) as { path?: string; dataUrl?: string };
  if (typeof wanted !== 'string' || typeof dataUrl !== 'string') return NextResponse.json({ ok: false }, { status: 400 });
  const name = path.basename(wanted).replace(/[^\w.-]/g, '_').replace(/\.png$/i, '');
  if (!name) return NextResponse.json({ ok: false }, { status: 400 });
  const b64 = dataUrl.split(',')[1] ?? '';
  const flat = await sharp(Buffer.from(b64, 'base64'), { limitInputPixels: MAX_PIXELS }).flatten({ background: '#f6efe0' }).png().toBuffer();
  mkdirSync(DIR, { recursive: true });
  const out = path.join(DIR, `${name}.png`);
  writeFileSync(out, flat);
  return NextResponse.json({ ok: true, bytes: flat.length, path: out });
}
