import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', headless: true, launchOptions: { args: ['--use-fake-device-for-media-stream'] } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  },
});
