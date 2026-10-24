import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './metric-specs',
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: './metric-test-results',
  reporter: [['list'], ['json', { outputFile: './metric-results.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:37100',
    viewport: { width: 1280, height: 900 },
    screenshot: 'on',
    trace: 'on'
  }
});
