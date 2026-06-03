/**
 * Playwright config for BDD (Gherkin) tests.
 *
 * Uses playwright-bdd's defineBddConfig to map .feature files to step definitions.
 * Generated test files go to .features-gen/ and are run by the standard Playwright runner.
 */
import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import dotenv from 'dotenv';

dotenv.config();

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['steps/**/*.ts', 'src/fixtures/index.ts'],
  outputDir: '.features-gen',
});

export default defineConfig({
  testDir,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
    },
  },
  snapshotDir: 'visual-baselines',
  snapshotPathTemplate: '{snapshotDir}/{testFileName}/{arg}{ext}',
  outputDir: 'reports/artifacts',
  reporter: [
    ['html', { outputFolder: 'reports/playwright' }],
    [
      'allure-playwright',
      {
        resultsDir: 'reports/allure/results',
        environmentInfo: {
          Browser: 'Chromium',
          OS: process.platform,
          NodeVersion: process.version,
          BaseURL: process.env.BASE_URL || 'https://github.com',
          TestMode: process.env.TEST_MODE || 'full',
          CI: process.env.CI ? 'true' : 'false',
        },
      },
    ],
    ['line'],
    ['./src/utils/reporting/cleanup-reporter.ts'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://github.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  globalSetup: './src/config/global-setup.ts',
});
