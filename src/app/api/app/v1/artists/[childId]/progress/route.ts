import { appJson, withAppViewer } from '@/server/app/http';

/**
 * The app's opt-in progress backup (drawing days, lessons). NOT built yet on purpose: it's behavioural
 * data about a child that the DPIA doesn't cover (COMPANION-APP-api-plan.md M4, Phase 3 — parked until
 * the Children's Code paperwork decides). GET answers "no backup" (what the app expects when there's
 * none); PUT says "not yet" so nothing is stored.
 */
export const GET = withAppViewer(async () => appJson({ reason: 'none' }, 404));
export const PUT = withAppViewer(async () => appJson({ reason: 'not-yet' }, 403));
