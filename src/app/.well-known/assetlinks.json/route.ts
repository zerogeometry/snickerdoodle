import { NextResponse } from 'next/server';
import { drawAndroidStatements } from '@/server/app/wellKnown';

/** Android App Links: lets Snickerdoodle Draw open https://snickerdoodle.co.uk/app/callback and /app/link. */
export const GET = () => NextResponse.json(drawAndroidStatements(), { headers: { 'Cache-Control': 'public, max-age=3600' } });
