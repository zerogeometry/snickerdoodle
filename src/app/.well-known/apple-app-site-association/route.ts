import { NextResponse } from 'next/server';
import { drawAppleAssociation } from '@/server/app/wellKnown';

/** iOS Universal Links for Snickerdoodle Draw (/app/callback, /app/link). Served as JSON with no file extension, as Apple expects. */
export const GET = () => {
  const body = drawAppleAssociation();
  if (!body) return new NextResponse('not set up yet', { status: 404 });
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
};
