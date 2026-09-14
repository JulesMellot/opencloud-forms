import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against a real OpenCloud with the extension installed and
 * forms-server routed at /forms-api (see README, "Development").
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: process.env.OPENCLOUD_URL || 'https://localhost:9200',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
