import { readOnlyTest } from './acceptance.js';
import { STAGING_ORIGIN, installStagingNetworkGuard } from './stagingNetworkGuard.js';

// The context fixture is established before page/auto observer fixtures. It
// remains guarded until Playwright closes the context, including popup traffic.
export const test = readOnlyTest.extend({
  readOnlySupabaseUrl: STAGING_ORIGIN,
  context: async ({ context }, use) => {
    const network = await installStagingNetworkGuard(context);
    await use(context);
    await network.settle();
    network.assertHealthy();
  },
});
