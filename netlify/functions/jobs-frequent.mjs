// TEST SITE: the order pipeline tick. Schedule in netlify.toml.
import { runOnTestSite } from '../test-site-jobs.mjs';

export default async function jobsFrequent() {
  return runOnTestSite(['fulfilment']);
}
