import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { baseURL: process.env.PATCHCRAFT_TEST_URL || 'http://127.0.0.1:5173', browserName: 'chromium', channel: 'chromium', headless: true, launchOptions: { args: ['--use-fake-device-for-media-stream'] } },
  webServer: process.env.PATCHCRAFT_TEST_URL ? undefined : [{command:'npm run server',url:'http://127.0.0.1:3001/api/health',reuseExistingServer:false},{
    command: 'npm exec -- vite preview --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  }],
});
