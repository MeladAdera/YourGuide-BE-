import { defineConfig } from 'vitest/config';

// Loaded here, before anything else runs, so both the global setup and the
// test workers see the test database URL.
process.loadEnvFile(new URL('./.env.test', import.meta.url));

// E2E tests: the real app against the real your_guide_test database.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    setupFiles: ['test/setup/clean-database.ts'],
    // All files share one database, so they must not run at the same time.
    fileParallelism: false,
  },
});
