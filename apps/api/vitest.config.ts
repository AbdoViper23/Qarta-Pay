import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/helpers/global-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Integration files each start their own anvil; run files one at a time to keep ports and CPU calm.
    fileParallelism: false,
  },
});
