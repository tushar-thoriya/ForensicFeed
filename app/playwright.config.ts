import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Compile every dev route once, serially, before the parallel workers start —
  // prevents the Next.js dev cold-start race that aborts first navigations.
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // One local retry absorbs the Next.js dev cold-start race (ERR_ABORTED on
  // the first navigation while a route is still compiling); the retry runs
  // against the now-warm server.
  retries: process.env.CI ? 2 : 1,
  // Cap local parallelism. The default (~half the CPU cores) runs many workers
  // across 3 browser projects against a single local server + DB pool, which
  // starves connections and times out navigations under load. 3 keeps the run
  // fast while staying within the pool.
  workers: process.env.CI ? 1 : 3,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Run E2E against a production build by default. Pre-compiled routes remove
    // the `next dev` cold-compile races (waitForURL timeouts), and notFound()/
    // error paths render through the real RootLayout — so <html lang> is present
    // instead of Next's dev-only `__next_error__` shell. Set E2E_DEV=1 to test
    // against `next dev` for fast local iteration.
    command: process.env.E2E_DEV ? 'pnpm dev' : 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
  ],
})
