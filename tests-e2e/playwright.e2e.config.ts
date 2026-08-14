import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end config, deliberately separate from playwright.unit.config.ts.
 *
 * These specs drive the REAL dashboard against a REAL backend, so they cannot
 * run in CI: they need a dev server, a minted user JWT, and an account whose
 * bots they may create and delete. `npm run test:unit` must not pick them up —
 * hence the separate directory and the `.e2e.test.ts` suffix.
 *
 * See README.md in this directory for how to run them.
 */
export default defineConfig({
  testDir: './specs',
  testMatch: '**/*.e2e.test.ts',
  // One at a time. Every spec creates and deletes bots on a single shared
  // account; running them concurrently makes list queries and teardown racy,
  // and a leaked bot on a real account is worse than a slow suite.
  fullyParallel: false,
  workers: 1,
  // A save round-trips to a production API; the default 5s expect timeout is
  // not enough for a form to hydrate off a cold query.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${process.env['E2E_PORT'] ?? '7500'}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
