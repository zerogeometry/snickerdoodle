import { after } from 'next/server';

/** Something to run once the response has gone (never awaited by the request). */
export type BackgroundTask = () => Promise<void>;
export type Scheduler = (task: BackgroundTask) => void;

/**
 * Run work AFTER the response is sent (Next's `after`), so the parent isn't kept waiting — e.g. the
 * upload safety checks (founder, 9 Nov 2026: "run the checks after the catalogue has loaded").
 * Outside a request (scripts, jobs, tests) `after` isn't available, so the task simply starts now
 * without being awaited. A task must catch its own errors; anything that slips through is logged
 * by name only. Durability doesn't rest on this: anything left undone is picked up by a sweep job.
 */
export const runAfterResponse: Scheduler = (task) => {
  const safe = () =>
    task().catch((e: unknown) => {
      console.warn(`[background] a task failed (${e instanceof Error ? e.name : typeof e})`);
    });
  try {
    after(safe);
  } catch {
    void safe();
  }
};
