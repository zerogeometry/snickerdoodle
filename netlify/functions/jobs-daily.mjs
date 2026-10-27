// TEST SITE: the daily jobs (the retention purge too: test uploads expire on schedule as well).
// Schedule in netlify.toml.
import { runOnTestSite } from '../test-site-jobs.mjs';

export default async function jobsDaily() {
  return runOnTestSite(['retention', 'popularity', 'prodigi-sync', 'reminders']);
}
