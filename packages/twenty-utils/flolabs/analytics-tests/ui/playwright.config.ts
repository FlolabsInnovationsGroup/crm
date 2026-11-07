import { chromium, defineConfig, devices } from '@playwright/test';
import path from 'node:path';

import { getFrontUrl } from '../blackbox/lib/api-client.cjs';
import { findChromium } from '../lib/find-chromium.cjs';

import {
  ADMIN_SESSION_PATH,
  LOCAL_ONLY_BROWSER_ARGUMENT,
  RESULTS_ROOT,
} from './lib/paths';

export default defineConfig({
  testDir: __dirname,
  outputDir: path.join(RESULTS_ROOT, 'ui-output'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A dev front compiles on first load, and the runner stops the whole layer at 8.5 minutes.
  timeout: 90_000,
  globalTimeout: 8 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['json'], ['line']],
  use: {
    // getFrontUrl refuses any host but localhost or 127.0.0.1.
    baseURL: getFrontUrl(),
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    launchOptions: {
      executablePath: findChromium(chromium) ?? undefined,
      args: [LOCAL_ONLY_BROWSER_ARGUMENT],
    },
  },
  projects: [
    { name: 'setup', testMatch: /login\.setup\.ts$/ },
    {
      name: 'chromium',
      testMatch: /\.pw\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: ADMIN_SESSION_PATH,
      },
      dependencies: ['setup'],
    },
  ],
});
