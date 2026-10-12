import { writeFileSync } from 'node:fs';
import { NextResponse, type NextRequest } from 'next/server';
import sharp from 'sharp';

// DEV-ONLY canvas capture: the preview harness can't screenshot a WebGL canvas, so the page POSTs
// its toDataURL here and we flatten + write it to a path for eyeballing. 404 in production.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ ok: false }, { status: 404 });
  const { path, dataUrl } = (await req.json()) as { path?: string; dataUrl?: string };
  if (typeof path !== 'string' || typeof dataUrl !== 'string') return NextResponse.json({ ok: false }, { status: 400 });
  const b64 = dataUrl.split(',')[1] ?? '';
  const flat = await sharp(Buffer.from(b64, 'base64')).flatten({ background: '#f6efe0' }).png().toBuffer();
  writeFileSync(path, flat);
  return NextResponse.json({ ok: true, bytes: flat.length });
}
